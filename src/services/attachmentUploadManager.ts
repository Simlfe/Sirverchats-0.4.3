import { pbService } from '../pocketbase';
import { Attachment } from '../types';

export type UploadStatus = 'queued' | 'uploading' | 'completed' | 'failed' | 'cancelled';

export interface UploadItem {
  id: string; // unique local attachment ID
  file: File; // File object to upload
  originalFilename: string;
  mimeType: string;
  size: number;
  progress: number; // 0 - 100
  status: UploadStatus;
  attachment?: Attachment; // Returned by PocketBase upon completion
  error?: string;
  abortController?: AbortController;
  isPrivate?: boolean;
  isRemoved?: boolean;
}

type UploadListener = (uploads: Map<string, UploadItem>) => void;

class AttachmentUploadManagerClass {
  private uploads: Map<string, UploadItem> = new Map();
  private maxConcurrent = 3;
  private activeUploadsCount = 0;
  private listeners: Set<UploadListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.cleanupUnlinkedOnUnload();
      });
    }
  }

  /**
   * Subscribe to upload state changes
   */
  subscribe(listener: UploadListener): () => void {
    this.listeners.add(listener);
    // Notify immediately with current state
    listener(new Map(this.uploads));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const snapshot = new Map(this.uploads);
    this.listeners.forEach((fn) => fn(snapshot));
  }

  /**
   * Enqueue a new file for immediate background upload
   */
  enqueue(id: string, file: File, isPrivate: boolean = false): UploadItem {
    const existing = this.uploads.get(id);
    if (existing && !existing.isRemoved && (existing.status === 'uploading' || existing.status === 'completed')) {
      return existing;
    }

    const item: UploadItem = {
      id,
      file,
      originalFilename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      progress: 0,
      status: 'queued',
      isPrivate,
      isRemoved: false
    };

    this.uploads.set(id, item);
    this.notify();
    this.processQueue();
    return item;
  }

  /**
   * Retry a failed or cancelled upload
   */
  retry(id: string) {
    const item = this.uploads.get(id);
    if (!item) return;

    item.isRemoved = false;
    item.status = 'queued';
    item.progress = 0;
    item.error = undefined;
    item.abortController = undefined;
    this.notify();
    this.processQueue();
  }

  /**
   * Cancel an active or queued upload and delete any created server record
   */
  cancel(id: string) {
    const item = this.uploads.get(id);
    if (!item) return;

    item.isRemoved = true;
    if (item.status === 'uploading' && item.abortController) {
      item.abortController.abort();
    }
    if (item.attachment?.id) {
      pbService.deleteAttachmentRecord(item.attachment.id, item.isPrivate);
      item.attachment = undefined;
    }
    item.status = 'cancelled';
    item.progress = 0;
    item.error = 'Upload cancelled';
    this.notify();
    this.processQueue();
  }

  /**
   * Remove upload item completely and delete server record if uploaded
   */
  remove(id: string) {
    const item = this.uploads.get(id);
    if (item) {
      item.isRemoved = true;
      if (item.status === 'uploading' && item.abortController) {
        item.abortController.abort();
      }
      if (item.attachment?.id) {
        pbService.deleteAttachmentRecord(item.attachment.id, item.isPrivate);
      }
    }
    this.uploads.delete(id);
    this.notify();
    this.processQueue();
  }

  /**
   * Clean up all current uploads (e.g. when draft is discarded or composer is reset)
   */
  cleanupAll(ids?: string[]) {
    const targetIds = ids || Array.from(this.uploads.keys());
    for (const id of targetIds) {
      this.remove(id);
    }
  }

  /**
   * Get specific upload item by ID
   */
  getUpload(id: string): UploadItem | undefined {
    return this.uploads.get(id);
  }

  /**
   * Emergency cleanup on window unload using keepalive fetch
   */
  private cleanupUnlinkedOnUnload() {
    try {
      const serverUrl = pbService.getServerUrl();
      const pb = pbService.getPbInstance();
      const token = pb?.authStore?.token;
      if (!serverUrl || !token) return;

      for (const item of this.uploads.values()) {
        if (item.attachment?.id && !item.attachment.message) {
          const collection = item.isPrivate ? 'private_attachments' : 'attachments';
          const url = `${serverUrl}/api/collections/${collection}/records/${item.attachment.id}`;
          fetch(url, {
            method: 'DELETE',
            headers: { Authorization: token },
            keepalive: true
          }).catch(() => {});
        }
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Process upload queue respecting maxConcurrent limit (3)
   */
  private processQueue() {
    let active = 0;
    for (const item of this.uploads.values()) {
      if (item.status === 'uploading') {
        active++;
      }
    }
    this.activeUploadsCount = active;

    if (this.activeUploadsCount >= this.maxConcurrent) {
      return;
    }

    for (const item of this.uploads.values()) {
      if (item.status === 'queued' && !item.isRemoved) {
        this.startUpload(item);
        if (++this.activeUploadsCount >= this.maxConcurrent) {
          break;
        }
      }
    }
  }

  private async startUpload(item: UploadItem) {
    if (item.isRemoved) return;

    item.status = 'uploading';
    item.progress = 0;
    const abortController = new AbortController();
    item.abortController = abortController;
    this.notify();

    try {
      const attachment = await pbService.uploadAttachmentWithProgress(
        '', // Empty messageId: will be linked once message is sent
        item.file,
        (pct) => {
          if (item.status === 'uploading' && !item.isRemoved) {
            item.progress = pct;
            this.notify();
          }
        },
        abortController.signal,
        item.isPrivate || false
      );

      // Handle race condition: if cancelled/removed while upload was in flight
      if (item.isRemoved || abortController.signal.aborted) {
        if (attachment?.id) {
          pbService.deleteAttachmentRecord(attachment.id, item.isPrivate);
        }
        return;
      }

      item.status = 'completed';
      item.progress = 100;
      item.attachment = attachment;
      item.error = undefined;
      this.notify();
    } catch (err: any) {
      if (item.isRemoved || abortController.signal.aborted) {
        item.status = 'cancelled';
        item.error = 'Upload cancelled';
      } else {
        item.status = 'failed';
        item.error = err?.message || 'Upload failed';
      }
      this.notify();
    } finally {
      this.processQueue();
    }
  }
}

export const AttachmentUploadManager = new AttachmentUploadManagerClass();
