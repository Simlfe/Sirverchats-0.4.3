import { useState, useEffect } from 'react';
import { pbService } from '../pocketbase';
import { DownloadedFileRecord } from '../types';
import {
  getDownloadDirectory,
  ensureDownloadDirectoryExists,
  openDownloadDirectory,
  openFileExternally,
  openPathExternally,
  isTauriEnvironment,
  saveFileToTauriDisk,
  removeFileFromTauriDisk,
  checkFileExistsOnDisk
} from '../lib/tauriDesktopService';

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'missing';

export interface DownloadItem {
  id: string; // unique download id (usually same as attachmentId or timestamped)
  attachmentId: string;
  originalFilename: string;
  savedFilename: string;
  localPath: string; // e.g. "Documents/SirverData/Downloads/file.png"
  fileSize: number; // bytes
  fileSizeFormatted: string;
  mimeType: string;
  downloadUrl: string;
  thumbnailUrl?: string;
  createdAt: string; // ISO date
  status: DownloadStatus;
  progress: number; // 0 - 100
  downloadedBytes: number;
  speed: number; // bytes / sec
  speedFormatted: string; // e.g. "1.5 MB/s"
  remainingSeconds: number;
  errorMessage?: string;
}

// IndexedDB Helper for blob persistence
const DB_NAME = 'SirverDownloadsDB';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBlobToDB(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(blob, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('Failed to save blob to IndexedDB:', e);
  }
}

export async function getBlobFromDB(id: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('Failed to get blob from IndexedDB:', e);
    return null;
  }
}

export async function deleteBlobFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch (e) {
    console.warn('Failed to delete blob from IndexedDB:', e);
  }
}

// Active XHR requests map for cancellation
const activeXHRs: Map<string, XMLHttpRequest> = new Map();
const activeSpeedTrackers: Map<
  string,
  { lastLoaded: number; lastTime: number }
> = new Map();

// Helper to format bytes
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

// Local Storage Key
const STORAGE_KEY = 'sirver_download_history_v1';

class DownloadManagerService {
  private downloads: DownloadItem[] = [];
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  constructor() {
    this.loadHistory();
  }

  private loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.downloads = JSON.parse(raw);
        // Verify missing files in IndexedDB asynchronously
        this.verifyIndexedDBFiles();
      }
    } catch (e) {
      console.warn('Failed to load download history:', e);
      this.downloads = [];
    }
  }

  private saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.downloads));
    } catch (e) {
      console.warn('Failed to save download history:', e);
    }
    this.notify();
  }

  private async syncAttachmentDownloadedFile(item: DownloadItem) {
    if (!item.attachmentId) return;
    try {
      const currentUserId = pbService.getCurrentUser()?.id || 'local_user';
      const record: DownloadedFileRecord = {
        user_id: currentUserId,
        original_filename: item.originalFilename,
        saved_filename: item.savedFilename,
        local_path: item.localPath,
        download_status: item.status,
        downloaded_at: item.createdAt || new Date().toISOString(),
        file_size: item.fileSize,
      };
      await pbService.updateAttachmentDownloadedFiles(item.attachmentId, record);
    } catch (e) {
      console.warn('Failed to sync attachment downloaded file record:', e);
    }
  }

  public async restoreAttachmentDownloadState(params: {
    attachmentId: string;
    downloadedFiles?: DownloadedFileRecord[] | string;
    filename: string;
    downloadUrl: string;
    mimeType?: string;
    sizeBytes?: number;
    thumbnailUrl?: string;
  }): Promise<DownloadItem | undefined> {
    if (!params.attachmentId) return undefined;

    const existing = this.getDownloadByAttachmentId(params.attachmentId);
    if (existing) {
      if (existing.status === 'completed') {
        const blob = await getBlobFromDB(existing.id);
        if (!blob) {
          existing.status = 'missing';
          this.saveHistory();
          this.syncAttachmentDownloadedFile(existing);
        }
      }
      return existing;
    }

    // Check remote downloaded_files JSON metadata
    let records: DownloadedFileRecord[] = [];
    if (params.downloadedFiles) {
      if (typeof params.downloadedFiles === 'string') {
        try {
          records = JSON.parse(params.downloadedFiles);
        } catch {
          records = [];
        }
      } else if (Array.isArray(params.downloadedFiles)) {
        records = params.downloadedFiles;
      }
    }

    const currentUserId = pbService.getCurrentUser()?.id;
    if (!currentUserId) return undefined;

    const userRecord = records.find((r) => r.user_id === currentUserId);
    if (userRecord && userRecord.download_status === 'completed') {
      const blob = await getBlobFromDB(params.attachmentId);
      if (blob) {
        // Local file blob exists in IndexedDB! Restore item as completed
        const restoredItem: DownloadItem = {
          id: params.attachmentId,
          attachmentId: params.attachmentId,
          originalFilename: userRecord.original_filename || params.filename,
          savedFilename: userRecord.saved_filename || params.filename,
          localPath: userRecord.local_path || userRecord.saved_filename || params.filename,
          fileSize: userRecord.file_size || params.sizeBytes || blob.size || 0,
          fileSizeFormatted: formatBytes(userRecord.file_size || params.sizeBytes || blob.size || 0),
          mimeType: params.mimeType || 'application/octet-stream',
          downloadUrl: params.downloadUrl,
          thumbnailUrl: params.thumbnailUrl,
          createdAt: userRecord.downloaded_at || new Date().toISOString(),
          status: 'completed',
          progress: 100,
          downloadedBytes: userRecord.file_size || params.sizeBytes || blob.size || 0,
          speed: 0,
          speedFormatted: '0 KB/s',
          remainingSeconds: 0,
        };

        this.downloads.unshift(restoredItem);
        this.saveHistory();
        this.syncAttachmentDownloadedFile(restoredItem);
        return restoredItem;
      } else {
        // Record says completed but local blob is missing -> update record to missing
        const updatedRecord: DownloadedFileRecord = {
          ...userRecord,
          download_status: 'missing',
        };
        pbService.updateAttachmentDownloadedFiles(params.attachmentId, updatedRecord);
      }
    }

    return undefined;
  }

  private async verifyIndexedDBFiles() {
    let changed = false;
    for (const item of this.downloads) {
      if (item.status === 'completed') {
        if (isTauriEnvironment()) {
          const fileOnDisk = await checkFileExistsOnDisk(item.localPath);
          const blob = await getBlobFromDB(item.id);
          if (!fileOnDisk && !blob) {
            item.status = 'missing';
            changed = true;
            this.syncAttachmentDownloadedFile(item);
          }
        } else {
          const blob = await getBlobFromDB(item.id);
          if (!blob) {
            item.status = 'missing';
            changed = true;
            this.syncAttachmentDownloadedFile(item);
          }
        }
      } else if (item.status === 'downloading') {
        item.status = 'failed';
        item.errorMessage = 'Interrupted';
        changed = true;
        this.syncAttachmentDownloadedFile(item);
      }
    }
    if (changed) {
      this.saveHistory();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public getDownloads(): DownloadItem[] {
    return [...this.downloads];
  }

  public getDownloadByAttachmentId(attachmentId: string): DownloadItem | undefined {
    return this.downloads.find(
      (d) => d.attachmentId === attachmentId || d.id === attachmentId
    );
  }

  public getDownloadById(id: string): DownloadItem | undefined {
    return this.downloads.find((d) => d.id === id);
  }

  // Deduplicate saved filename with dynamic platform-specific path
  private async generateUniqueFilename(originalName: string): Promise<{ filename: string; path: string }> {
    const extIdx = originalName.lastIndexOf('.');
    const namePart = extIdx !== -1 ? originalName.slice(0, extIdx) : originalName;
    const extPart = extIdx !== -1 ? originalName.slice(extIdx) : '';

    let candidate = originalName;
    let counter = 1;

    const existingNames = new Set(
      this.downloads
        .filter((d) => d.status === 'completed' || d.status === 'downloading')
        .map((d) => d.savedFilename)
    );

    while (existingNames.has(candidate)) {
      candidate = `${namePart} (${counter})${extPart}`;
      counter++;
    }

    const baseDir = await getDownloadDirectory();
    const sep = baseDir.includes('\\') ? '\\' : '/';
    const fullPath = baseDir.endsWith(sep) ? `${baseDir}${candidate}` : `${baseDir}${sep}${candidate}`;

    return {
      filename: candidate,
      path: fullPath,
    };
  }

  public startDownload(params: {
    attachmentId: string;
    filename: string;
    downloadUrl: string;
    mimeType?: string;
    sizeBytes?: number;
    thumbnailUrl?: string;
  }): DownloadItem {
    const existing = this.getDownloadByAttachmentId(params.attachmentId);

    if (existing) {
      if (existing.status === 'downloading' || existing.status === 'queued') {
        return existing;
      }
      if (existing.status === 'completed') {
        // Verify blob still exists
        getBlobFromDB(existing.id).then((blob) => {
          if (!blob) {
            existing.status = 'missing';
            this.saveHistory();
            this.executeDownload(existing);
          }
        });
        return existing;
      }
      // Retry failed, cancelled, or missing
      existing.status = 'queued';
      existing.progress = 0;
      existing.downloadedBytes = 0;
      existing.speed = 0;
      existing.speedFormatted = '0 KB/s';
      existing.remainingSeconds = 0;
      existing.errorMessage = undefined;
      this.saveHistory();
      this.executeDownload(existing);
      return existing;
    }

    // New Download item
    const id = params.attachmentId || `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newItem: DownloadItem = {
      id,
      attachmentId: params.attachmentId,
      originalFilename: params.filename,
      savedFilename: params.filename,
      localPath: `Downloads/${params.filename}`,
      fileSize: params.sizeBytes || 0,
      fileSizeFormatted: formatBytes(params.sizeBytes || 0),
      mimeType: params.mimeType || 'application/octet-stream',
      downloadUrl: params.downloadUrl,
      thumbnailUrl: params.thumbnailUrl,
      createdAt: new Date().toISOString(),
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      speed: 0,
      speedFormatted: '0 KB/s',
      remainingSeconds: 0,
    };

    // Asynchronously resolve OS-specific unique path
    this.generateUniqueFilename(params.filename).then(({ filename, path }) => {
      newItem.savedFilename = filename;
      newItem.localPath = path;
      this.saveHistory();
    });

    this.downloads.unshift(newItem);
    this.saveHistory();
    this.executeDownload(newItem);
    return newItem;
  }

  private executeDownload(item: DownloadItem) {
    item.status = 'downloading';
    item.progress = 0;
    this.notify();

    const xhr = new XMLHttpRequest();
    xhr.open('GET', item.downloadUrl, true);
    xhr.responseType = 'blob';

    activeXHRs.set(item.id, xhr);
    activeSpeedTrackers.set(item.id, { lastLoaded: 0, lastTime: Date.now() });

    xhr.onprogress = (e) => {
      if (item.status !== 'downloading') return;

      const now = Date.now();
      const tracker = activeSpeedTrackers.get(item.id);

      if (e.lengthComputable && e.total > 0) {
        item.fileSize = e.total;
        item.fileSizeFormatted = formatBytes(e.total);
        item.progress = Math.min(99, Math.round((e.loaded / e.total) * 100));
      } else {
        item.progress = Math.min(95, item.progress + 5);
      }

      item.downloadedBytes = e.loaded;

      if (tracker) {
        const timeDiff = (now - tracker.lastTime) / 1000;
        if (timeDiff >= 0.5) {
          const loadedDiff = e.loaded - tracker.lastLoaded;
          const speed = loadedDiff / timeDiff; // bytes/sec
          item.speed = speed;
          item.speedFormatted = formatSpeed(speed);

          if (e.lengthComputable && e.total > e.loaded && speed > 0) {
            item.remainingSeconds = Math.ceil((e.total - e.loaded) / speed);
          }

          tracker.lastLoaded = e.loaded;
          tracker.lastTime = now;
        }
      }

      this.notify();
    };

    xhr.onload = async () => {
      activeXHRs.delete(item.id);
      activeSpeedTrackers.delete(item.id);

      if (xhr.status >= 200 && xhr.status < 300) {
        const blob: Blob = xhr.response;
        item.fileSize = blob.size || item.fileSize;
        item.fileSizeFormatted = formatBytes(item.fileSize);
        item.progress = 100;
        item.downloadedBytes = item.fileSize;
        item.speed = 0;
        item.speedFormatted = '0 KB/s';
        item.remainingSeconds = 0;

        // 1. Save blob to IndexedDB for quick in-app objectUrl preview
        await saveBlobToDB(item.id, blob);

        // 2. Write file to disk in Tauri environment or fallback for web
        if (isTauriEnvironment()) {
          const diskResult = await saveFileToTauriDisk(item.localPath, blob);
          if (diskResult.success) {
            item.status = 'completed';
            item.errorMessage = undefined;
            console.log(`[DownloadManager] Download completed & verified on disk: ${item.localPath}`);
          } else {
            item.status = 'failed';
            item.errorMessage = diskResult.error || `Failed to write file to ${item.localPath}`;
            console.error(`[DownloadManager] Download failed writing to disk: ${item.errorMessage}`);
          }
        } else {
          // Auto trigger browser download to physical OS Downloads folder in web mode
          // Only trigger for normal user files, NEVER for background app updates!
          if (!item.attachmentId?.startsWith('app_update_')) {
            try {
              const objectUrl = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = objectUrl;
              link.download = item.savedFilename;
              link.style.display = 'none';
              document.body.appendChild(link);
              link.click();
              setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(objectUrl);
              }, 1000);
            } catch (e) {
              console.warn('Auto browser download trigger error:', e);
            }
          }
          item.status = 'completed';
          item.errorMessage = undefined;
        }

        this.saveHistory();
        this.syncAttachmentDownloadedFile(item);
      } else {
        if (isTauriEnvironment() || item.attachmentId?.startsWith('app_update_')) {
          item.status = 'failed';
          item.errorMessage = `HTTP Error ${xhr.status} when fetching download file`;
          console.error(`[DownloadManager] ${item.errorMessage}`);
          this.saveHistory();
          this.syncAttachmentDownloadedFile(item);
        } else {
          // Fallback for non-2xx status in web: trigger direct link download
          this.fallbackDirectBrowserDownload(item, `HTTP Error ${xhr.status}`);
        }
      }
    };

    xhr.onerror = () => {
      activeXHRs.delete(item.id);
      activeSpeedTrackers.delete(item.id);
      if (isTauriEnvironment() || item.attachmentId?.startsWith('app_update_')) {
        item.status = 'failed';
        item.errorMessage = 'Network or connection error while downloading update';
        console.error(`[DownloadManager] ${item.errorMessage}`);
        this.saveHistory();
        this.syncAttachmentDownloadedFile(item);
      } else {
        // CORS or network error fallback
        this.fallbackDirectBrowserDownload(item, 'Network or CORS Connection Error');
      }
    };

    xhr.onabort = () => {
      activeXHRs.delete(item.id);
      activeSpeedTrackers.delete(item.id);
      item.status = 'cancelled';
      this.saveHistory();
      this.syncAttachmentDownloadedFile(item);
    };

    xhr.send();
  }

  private fallbackDirectBrowserDownload(item: DownloadItem, errorContext: string) {
    // App updates MUST NEVER open an external browser window or trigger direct browser navigation
    if (item.attachmentId?.startsWith('app_update_')) {
      item.status = 'failed';
      item.errorMessage = errorContext;
      this.saveHistory();
      this.syncAttachmentDownloadedFile(item);
      return;
    }

    try {
      if (item.downloadUrl) {
        const link = document.createElement('a');
        link.href = item.downloadUrl;
        link.download = item.savedFilename;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => document.body.removeChild(link), 1000);

        item.status = 'completed';
        item.progress = 100;
        item.errorMessage = undefined;
        this.saveHistory();
        this.syncAttachmentDownloadedFile(item);
        return;
      }
    } catch (err) {
      console.warn('Fallback direct download failed:', err);
    }

    item.status = 'failed';
    item.errorMessage = errorContext;
    this.saveHistory();
    this.syncAttachmentDownloadedFile(item);
  }

  public cancelDownload(id: string) {
    const xhr = activeXHRs.get(id);
    if (xhr) {
      xhr.abort();
    } else {
      const item = this.getDownloadById(id);
      if (item && item.status === 'downloading') {
        item.status = 'cancelled';
        this.saveHistory();
        this.syncAttachmentDownloadedFile(item);
      }
    }
  }

  public retryDownload(id: string) {
    const item = this.getDownloadById(id);
    if (item) {
      item.status = 'queued';
      item.progress = 0;
      item.downloadedBytes = 0;
      item.errorMessage = undefined;
      this.saveHistory();
      this.syncAttachmentDownloadedFile(item);
      this.executeDownload(item);
    }
  }

  public async deleteDownloadedFile(id: string) {
    const item = this.getDownloadById(id);
    if (item) {
      if (isTauriEnvironment()) {
        await removeFileFromTauriDisk(item.localPath);
      }
      await deleteBlobFromDB(id);
      item.status = 'missing';
      this.saveHistory();
      this.syncAttachmentDownloadedFile(item);
    }
  }

  public async removeFromHistory(id: string) {
    const item = this.getDownloadById(id);
    if (item) {
      this.syncAttachmentDownloadedFile({ ...item, status: 'missing' });
      if (isTauriEnvironment()) {
        await removeFileFromTauriDisk(item.localPath);
      }
    }
    await deleteBlobFromDB(id);
    this.downloads = this.downloads.filter((d) => d.id !== id);
    this.saveHistory();
  }

  public async openContainingFolder(id: string): Promise<boolean> {
    const item = this.getDownloadById(id);
    if (isTauriEnvironment()) {
      if (!item) {
        return await openDownloadDirectory();
      }
      const lastSep = Math.max(item.localPath.lastIndexOf('/'), item.localPath.lastIndexOf('\\'));
      const dir = lastSep !== -1 ? item.localPath.substring(0, lastSep) : await getDownloadDirectory();
      
      try {
        const dirExists = await checkFileExistsOnDisk(dir);
        if (!dirExists) {
          await ensureDownloadDirectoryExists();
        }
      } catch (e) {}

      const success = await openPathExternally(dir);
      if (!success) {
        console.warn(`[DownloadManager] Could not open folder ${dir}, opening default download directory`);
        return await openDownloadDirectory();
      }
      return success;
    } else {
      // Web browser environment: trigger browser download of the saved blob / file
      if (item) {
        // App updates are handled internally in the application, NEVER open browser!
        if (item.attachmentId?.startsWith('app_update_')) {
          return false;
        }
        const blob = await getBlobFromDB(item.id);
        if (blob) {
          try {
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = item.savedFilename;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(objectUrl);
            }, 1000);
          } catch (e) {}
        } else if (item.downloadUrl) {
          window.open(item.downloadUrl, '_blank', 'noopener,noreferrer');
        }
      }
      return false;
    }
  }

  public async openNativeFile(id: string): Promise<boolean> {
    const item = this.getDownloadById(id);
    if (!item) return false;
    if (isTauriEnvironment()) {
      const fileExists = await checkFileExistsOnDisk(item.localPath);
      if (fileExists) {
        const opened = await openPathExternally(item.localPath);
        if (opened) return true;
      } else {
        console.warn(`[DownloadManager] File missing on disk at ${item.localPath}`);
        // Check if blob in IndexedDB exists
        const blob = await getBlobFromDB(item.id);
        if (!blob) {
          item.status = 'missing';
          this.saveHistory();
          return false;
        }
      }
    }
    const objectUrl = await this.openFile(id);
    return await openFileExternally(item.localPath, objectUrl || undefined);
  }

  public async openFile(id: string): Promise<string | null> {
    const item = this.getDownloadById(id);
    if (!item) return null;

    const blob = await getBlobFromDB(id);
    if (!blob) {
      item.status = 'missing';
      this.saveHistory();
      return null;
    }

    // Create a local blob URL
    const objectUrl = URL.createObjectURL(blob);
    return objectUrl;
  }

  public copyFilePath(id: string): string | null {
    const item = this.getDownloadById(id);
    if (!item) return null;
    try {
      navigator.clipboard.writeText(item.localPath);
    } catch (e) {
      console.warn('Copy path error:', e);
    }
    return item.localPath;
  }
}

// Standalone helper functions for SirverData Downloads directory
export async function get_download_directory(): Promise<string> {
  return await getDownloadDirectory();
}

export async function ensure_download_directory_exists(): Promise<string> {
  return await ensureDownloadDirectoryExists();
}

export async function open_download_directory(): Promise<boolean> {
  return await openDownloadDirectory();
}

export const downloadManager = new DownloadManagerService();

export function useDownloadManager() {
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => downloadManager.getDownloads());

  useEffect(() => {
    const unsubscribe = downloadManager.subscribe(() => {
      setDownloads(downloadManager.getDownloads());
    });
    return unsubscribe;
  }, []);

  return {
    downloads,
    getDownloadByAttachmentId: (attachmentId: string) =>
      downloadManager.getDownloadByAttachmentId(attachmentId),
    startDownload: (params: Parameters<typeof downloadManager.startDownload>[0]) =>
      downloadManager.startDownload(params),
    cancelDownload: (id: string) => downloadManager.cancelDownload(id),
    retryDownload: (id: string) => downloadManager.retryDownload(id),
    deleteDownloadedFile: (id: string) => downloadManager.deleteDownloadedFile(id),
    removeFromHistory: (id: string) => downloadManager.removeFromHistory(id),
    openFile: (id: string) => downloadManager.openFile(id),
    openNativeFile: (id: string) => downloadManager.openNativeFile(id),
    openContainingFolder: (id: string) => downloadManager.openContainingFolder(id),
    copyFilePath: (id: string) => downloadManager.copyFilePath(id),
    restoreAttachmentDownloadState: (params: Parameters<typeof downloadManager.restoreAttachmentDownloadState>[0]) =>
      downloadManager.restoreAttachmentDownloadState(params),
  };
}
