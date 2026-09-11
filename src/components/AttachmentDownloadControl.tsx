import React, { useState, useEffect } from 'react';
import {
  Download,
  Eye,
  X,
  RotateCcw,
  CheckCircle,
  Loader2,
  FolderOpen
} from 'lucide-react';
import {
  useDownloadManager,
  DownloadItem,
  formatBytes,
  formatSpeed
} from '../services/downloadManager';
import {
  getDownloadDirectory,
  openDownloadDirectory,
  openFileExternally,
  openPathExternally,
  isTauriEnvironment
} from '../lib/nativePlatform';
import { DownloadedFileRecord } from '../types';

interface AttachmentDownloadControlProps {
  attachmentId: string;
  filename: string;
  downloadUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  thumbnailUrl?: string;
  downloadedFiles?: DownloadedFileRecord[] | string;
  lang: 'en' | 'ar';
  isLight?: boolean;
  variant?: 'button' | 'icon' | 'hover' | 'compact';
  className?: string;
  onOpenFile?: (objectUrl: string) => void;
}

export default function AttachmentDownloadControl({
  attachmentId,
  filename,
  downloadUrl,
  mimeType,
  sizeBytes,
  thumbnailUrl,
  downloadedFiles,
  lang,
  isLight = false,
  variant = 'button',
  className = '',
  onOpenFile
}: AttachmentDownloadControlProps) {
  const {
    getDownloadByAttachmentId,
    startDownload,
    cancelDownload,
    retryDownload,
    openFile,
    openNativeFile,
    openContainingFolder,
    restoreAttachmentDownloadState
  } = useDownloadManager();

  const [loadingFile, setLoadingFile] = useState(false);
  const downloadItem = getDownloadByAttachmentId(attachmentId);

  useEffect(() => {
    if (attachmentId && downloadedFiles) {
      restoreAttachmentDownloadState({
        attachmentId,
        downloadedFiles,
        filename,
        downloadUrl,
        mimeType,
        sizeBytes,
        thumbnailUrl
      });
    }
  }, [attachmentId, downloadedFiles, filename, downloadUrl, mimeType, sizeBytes, thumbnailUrl]);

  const triggerDirectBrowserSave = (url: string, name: string) => {
    try {
      if (!url) return;
      const link = document.createElement('a');
      link.href = url;
      link.download = name || 'file';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 300);
    } catch (err) {
      console.warn('Direct browser download error, falling back to window.open:', err);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleStartDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (downloadUrl && !isTauriEnvironment()) {
      triggerDirectBrowserSave(downloadUrl, filename);
    }
    startDownload({
      attachmentId,
      filename,
      downloadUrl,
      mimeType,
      sizeBytes,
      thumbnailUrl,
    });
  };

  const handleCancelDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (downloadItem) {
      cancelDownload(downloadItem.id);
    }
  };

  const handleRetryDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (downloadUrl && !isTauriEnvironment()) {
      triggerDirectBrowserSave(downloadUrl, filename);
    }
    if (downloadItem) {
      retryDownload(downloadItem.id);
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (downloadItem) {
      openContainingFolder(downloadItem.id);
    } else if (downloadUrl) {
      triggerDirectBrowserSave(downloadUrl, filename);
    }
  };

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!downloadItem) {
      if (downloadUrl) triggerDirectBrowserSave(downloadUrl, filename);
      return;
    }

    setLoadingFile(true);
    try {
      // First try native OS file open
      const openedNative = await openNativeFile(downloadItem.id);
      if (!openedNative) {
        const objectUrl = await openFile(downloadItem.id);
        if (objectUrl) {
          if (onOpenFile) {
            onOpenFile(objectUrl);
          } else {
            triggerDirectBrowserSave(objectUrl, downloadItem.savedFilename || filename);
          }
        } else if (downloadUrl) {
          triggerDirectBrowserSave(downloadUrl, filename);
        }
      }
    } catch (err) {
      console.warn('Failed to open downloaded file:', err);
      if (downloadUrl) triggerDirectBrowserSave(downloadUrl, filename);
    } finally {
      setLoadingFile(false);
    }
  };

  // State 1: Downloading
  if (downloadItem && downloadItem.status === 'downloading') {
    if (variant === 'icon' || variant === 'compact') {
      return (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-accent border text-[10px] font-bold shadow-xs ${
            isLight
              ? 'bg-white/95 border-accent/40 text-accent shadow-xs'
              : 'bg-slate-900/90 border-accent/30 text-accent'
          } ${className}`}
        >
          <div className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
          <span>{downloadItem.progress}%</span>
          <button
            onClick={handleCancelDownload}
            className={`ms-1 cursor-pointer border-0 p-0 transition-colors ${
              isLight ? 'text-slate-500 hover:text-rose-600' : 'text-slate-400 hover:text-rose-400'
            }`}
            title={lang === 'ar' ? 'إلغاء التنزيل' : 'Cancel'}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center gap-2 p-1.5 px-2.5 rounded-xl border text-xs font-bold shadow-md ${
          isLight
            ? 'bg-white/95 border-accent/40 text-accent shadow-xs'
            : 'bg-slate-950/90 border-accent/40 text-accent'
        } ${className}`}
      >
        <div className="flex flex-col items-start min-w-[70px]">
          <div className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>{downloadItem.progress}%</span>
          </div>
          {downloadItem.speedFormatted && (
            <span className={`text-[8px] font-mono ${isLight ? 'text-slate-600' : 'opacity-80'}`}>
              {downloadItem.speedFormatted}
            </span>
          )}
        </div>

        <button
          onClick={handleCancelDownload}
          className={`p-1 rounded-lg cursor-pointer transition-all border ${
            isLight
              ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200'
              : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border-rose-500/30'
          }`}
          title={lang === 'ar' ? 'إلغاء التنزيل' : 'Cancel Download'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // State 2: Completed -> Open & Folder Buttons
  if (downloadItem && downloadItem.status === 'completed') {
    if (variant === 'icon') {
      return (
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpen}
            className={`p-1.5 rounded-xl bg-emerald-500 text-white shadow-md hover:opacity-90 transition-all cursor-pointer border-0 ${className}`}
            title={lang === 'ar' ? 'فتح الملف المحمل' : 'Open Downloaded File'}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleOpenFolder}
            className={`p-1.5 rounded-xl bg-slate-800 text-slate-200 border border-white/10 shadow-md hover:bg-slate-700 transition-all cursor-pointer ${className}`}
            title={lang === 'ar' ? 'فتح المجلد المحمل' : 'Open Containing Folder'}
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleOpen}
          disabled={loadingFile}
          className={`px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border-0 shadow-md ${className}`}
          title={lang === 'ar' ? 'فتح الملف المحمل محلياً' : 'Open Downloaded File'}
        >
          {loadingFile ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          <span>{lang === 'ar' ? 'فتح' : 'Open'}</span>
        </button>
        <button
          onClick={handleOpenFolder}
          className={`p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 shadow-md transition-all cursor-pointer ${className}`}
          title={lang === 'ar' ? 'فتح المجلد الحاوي للملف' : 'Open Containing Folder'}
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // State 3: Failed or Cancelled -> Retry Button
  if (downloadItem && (downloadItem.status === 'failed' || downloadItem.status === 'cancelled')) {
    return (
      <button
        onClick={handleRetryDownload}
        className={`px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1 transition-all cursor-pointer border-0 shadow-md ${className}`}
        title={lang === 'ar' ? 'إعادة محاولة التنزيل' : 'Retry Download'}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>{lang === 'ar' ? 'إعادة' : 'Retry'}</span>
      </button>
    );
  }

  // State 4: Default -> Download Button
  if (variant === 'icon') {
    return (
      <button
        onClick={handleStartDownload}
        className={`p-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] shadow-md transition-all cursor-pointer border-0 ${className}`}
        title={lang === 'ar' ? 'تحميل الملف محلياً' : 'Download File Natively'}
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <button
      onClick={handleStartDownload}
      className={`px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border-0 shadow-md ${className}`}
      title={lang === 'ar' ? 'تحميل الملف محلياً' : 'Download File'}
    >
      <Download className="w-3.5 h-3.5" />
      <span>{lang === 'ar' ? 'تحميل' : 'Download'}</span>
    </button>
  );
}
