import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Folder,
  FolderOpen,
  File,
  Search,
  Copy,
  ExternalLink,
  Play,
  Check,
  RotateCcw,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  X,
  Trash2,
  HardDrive,
  Clock,
  CheckCircle,
  Eye,
  Filter,
  Settings,
  FolderPlus
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
  getCustomDownloadDirSetting,
  setCustomDownloadDirSetting,
  ensureDownloadDirectoryExists,
  selectFolderWithNativeDialog
} from '../lib/tauriDesktopService';

interface DownloadsTabContentProps {
  lang: 'en' | 'ar';
  isLight: boolean;
}

export default function DownloadsTabContent({
  lang,
  isLight
}: DownloadsTabContentProps) {
  const {
    downloads,
    cancelDownload,
    retryDownload,
    deleteDownloadedFile,
    removeFromHistory,
    openFile,
    openNativeFile,
    openContainingFolder,
    copyFilePath
  } = useDownloadManager();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'media' | 'docs'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; item: DownloadItem } | null>(null);

  const [resolvedDownloadDir, setResolvedDownloadDir] = useState<string>('');
  const [isChangingFolder, setIsChangingFolder] = useState<boolean>(false);
  const [customFolderPathInput, setCustomFolderPathInput] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    getDownloadDirectory().then((dir) => {
      if (mounted) setResolvedDownloadDir(dir);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshDownloadDir = async () => {
    const dir = await getDownloadDirectory();
    setResolvedDownloadDir(dir);
  };

  const handleOpenFolderChangeModal = () => {
    const currentCustom = getCustomDownloadDirSetting() || '';
    setCustomFolderPathInput(currentCustom || resolvedDownloadDir);
    setIsChangingFolder(true);
  };

  const handleSaveCustomFolder = async () => {
    const trimmed = customFolderPathInput.trim();
    if (!trimmed) {
      setCustomDownloadDirSetting(null);
    } else {
      setCustomDownloadDirSetting(trimmed);
    }
    await ensureDownloadDirectoryExists();
    const newDir = await getDownloadDirectory();
    setResolvedDownloadDir(newDir);
    setIsChangingFolder(false);
    showToast(
      lang === 'ar'
        ? `تم تحديث مجلد التنزيلات: ${newDir}`
        : `Download directory updated: ${newDir}`
    );
  };

  const handleResetFolderToDefault = async () => {
    setCustomDownloadDirSetting(null);
    setCustomFolderPathInput('');
    await ensureDownloadDirectoryExists();
    const newDir = await getDownloadDirectory();
    setResolvedDownloadDir(newDir);
    setIsChangingFolder(false);
    showToast(
      lang === 'ar'
        ? 'تمت إعادة الضبط لمجلد التنزيلات الافتراضي للنظام'
        : 'Reset to OS default download location'
    );
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyPath = (item: DownloadItem) => {
    const path = copyFilePath(item.id);
    if (path) {
      showToast(
        lang === 'ar' ? `تم نسخ المسار: ${path}` : `Path copied: ${path}`
      );
    }
  };

  const handleLocateFolder = async (item: DownloadItem) => {
    const opened = await openContainingFolder(item.id);
    if (opened) {
      showToast(
        lang === 'ar'
          ? 'تم فتح مجلد التنزيلات المحلي'
          : 'Opened local downloads folder'
      );
    } else {
      showToast(
        lang === 'ar'
          ? `تم حفظ الملف بمجلد تنزيلات النظام (${item.savedFilename})`
          : `Saved to OS Downloads folder (${item.savedFilename})`
      );
    }
  };

  const handleOpenFile = async (item: DownloadItem) => {
    if (item.status === 'missing' || item.status === 'failed') {
      retryDownload(item.id);
      showToast(
        lang === 'ar'
          ? 'جاري إعاده تنزيل الملف...'
          : 'Retrying file download...'
      );
      return;
    }

    const openedNative = await openNativeFile(item.id);
    if (!openedNative) {
      const objectUrl = await openFile(item.id);
      if (objectUrl) {
        if (
          item.mimeType.startsWith('image/') ||
          item.mimeType.startsWith('video/') ||
          item.mimeType.startsWith('audio/')
        ) {
          setPreviewFile({ url: objectUrl, item });
        } else {
          // Trigger direct browser save / open
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = item.savedFilename;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => document.body.removeChild(link), 500);

          showToast(
            lang === 'ar'
              ? `تم فتح/حفظ الملف: ${item.savedFilename}`
              : `Opened/Saved file: ${item.savedFilename}`
          );
        }
      } else if (item.downloadUrl && !item.attachmentId?.startsWith('app_update_')) {
        window.open(item.downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        showToast(
          lang === 'ar'
            ? 'عذراً، لم نتمكن من فتح الملف'
            : 'Failed to open file locally'
        );
      }
    }
  };

  // Grouping items by Today, Yesterday, Earlier
  const isToday = (d: Date) => {
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const isYesterday = (d: Date) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    );
  };

  const filteredDownloads = downloads.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !query ||
      item.savedFilename.toLowerCase().includes(query) ||
      item.originalFilename.toLowerCase().includes(query) ||
      item.localPath.toLowerCase().includes(query);

    if (!matchesQuery) return false;

    if (filterType === 'media') {
      return item.mimeType.startsWith('image/') || item.mimeType.startsWith('video/') || item.mimeType.startsWith('audio/');
    }
    if (filterType === 'docs') {
      return !item.mimeType.startsWith('image/') && !item.mimeType.startsWith('video/') && !item.mimeType.startsWith('audio/');
    }
    return true;
  });

  const todayItems: DownloadItem[] = [];
  const yesterdayItems: DownloadItem[] = [];
  const earlierItems: DownloadItem[] = [];

  filteredDownloads.forEach((item) => {
    const d = new Date(item.createdAt);
    if (isToday(d)) {
      todayItems.push(item);
    } else if (isYesterday(d)) {
      yesterdayItems.push(item);
    } else {
      earlierItems.push(item);
    }
  });

  // Calculate statistics
  const completedItems = downloads.filter((d) => d.status === 'completed');
  const activeItems = downloads.filter((d) => d.status === 'downloading');
  const totalCompletedBytes = completedItems.reduce((acc, curr) => acc + curr.fileSize, 0);

  const getFileIcon = (item: DownloadItem) => {
    if (item.mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-emerald-400" />;
    if (item.mimeType.startsWith('video/')) return <Video className="w-5 h-5 text-purple-400" />;
    if (item.mimeType.startsWith('audio/')) return <Music className="w-5 h-5 text-amber-400" />;
    return <FileText className="w-5 h-5 text-blue-400" />;
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Storage Info */}
      <div className="p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shrink-0">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-[var(--theme-text-primary)]">
              {lang === 'ar' ? 'إدارة التنزيلات المحلية' : 'In-App Downloads Manager'}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-[var(--theme-text-muted)] flex-wrap">
              <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate max-w-xs sm:max-w-md font-bold text-[var(--theme-text-primary)]" title={resolvedDownloadDir}>
                {resolvedDownloadDir || 'SirverData/Downloads'}
              </span>
              <div className="flex items-center gap-1.5 ms-2">
                <button
                  type="button"
                  onClick={async () => {
                    const opened = await openDownloadDirectory();
                    if (!opened) {
                      showToast(lang === 'ar' ? `مجلد التنزيلات: ${resolvedDownloadDir}` : `Download Folder: ${resolvedDownloadDir}`);
                    }
                  }}
                  className="px-2 py-0.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)] text-[10px] font-bold text-[var(--theme-text-primary)] transition-colors cursor-pointer flex items-center gap-1"
                  title={lang === 'ar' ? 'فتح مجلد التنزيلات' : 'Open Download Folder'}
                >
                  <FolderOpen className="w-3 h-3 text-accent" />
                  <span>{lang === 'ar' ? 'فتح' : 'Open'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenFolderChangeModal}
                  className="px-2 py-0.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)] text-[10px] font-bold text-[var(--theme-text-primary)] transition-colors cursor-pointer flex items-center gap-1"
                  title={lang === 'ar' ? 'تغيير مجلد التنزيلات' : 'Change Download Directory'}
                >
                  <Settings className="w-3 h-3 text-blue-400" />
                  <span>{lang === 'ar' ? 'تغيير' : 'Change'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
            <HardDrive className="w-3.5 h-3.5 text-accent" />
            <span>{formatBytes(totalCompletedBytes)}</span>
          </div>

          <div className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
            <File className="w-3.5 h-3.5 text-blue-400" />
            <span>{completedItems.length} {lang === 'ar' ? 'ملفات' : 'Files'}</span>
          </div>

          {activeItems.length > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-accent/20 border border-accent/40 text-accent text-xs font-bold flex items-center gap-2 animate-pulse">
              <Download className="w-3.5 h-3.5" />
              <span>{activeItems.length} {lang === 'ar' ? 'نشط الآن' : 'Downloading'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls Bar: Search & Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full flex items-center rounded-xl border px-3 py-2 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
          <Search className="w-4 h-4 text-[var(--theme-text-muted)] me-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'ar' ? 'البحث في التنزيلات...' : 'Search downloads...'}
            className="w-full bg-transparent border-none text-xs outline-none text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer border-0">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto">
          {[
            { id: 'all', label: lang === 'ar' ? 'الكل' : 'All' },
            { id: 'media', label: lang === 'ar' ? 'الوسائط' : 'Media' },
            { id: 'docs', label: lang === 'ar' ? 'المستندات' : 'Docs' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                filterType === f.id
                  ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-md'
                  : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-channel-hover-bg)] hover:text-[var(--theme-text-primary)] border border-[var(--theme-border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toast Banner */}
      {toastMessage && (
        <div className="p-3 rounded-xl bg-accent/20 border border-accent/40 text-accent text-xs font-bold flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Download Groups */}
      {downloads.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border flex flex-col items-center justify-center gap-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]">
          <Download className="w-12 h-12 text-slate-500 opacity-50" />
          <p className="text-sm font-extrabold text-slate-400">
            {lang === 'ar' ? 'لا توجد تنزيلات في القائمة حتى الآن' : 'No downloads in manager yet'}
          </p>
          <p className="text-xs text-slate-500 max-w-sm">
            {lang === 'ar'
              ? 'عند تنزيل أي مرفق من الدردشة، سيظهر هنا وسيتم حفظه تلقائياً في مجلد المستندات المحلي.'
              : 'When you download any attachment from chat, it will appear here and be stored natively.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {todayItems.length > 0 && (
            <DownloadGroupSection
              title={lang === 'ar' ? 'اليوم' : 'Today'}
              items={todayItems}
              isLight={isLight}
              lang={lang}
              getFileIcon={getFileIcon}
              onCancel={cancelDownload}
              onRetry={retryDownload}
              onDelete={deleteDownloadedFile}
              onRemove={removeFromHistory}
              onOpen={handleOpenFile}
              onCopyPath={handleCopyPath}
              onLocateFolder={handleLocateFolder}
            />
          )}

          {yesterdayItems.length > 0 && (
            <DownloadGroupSection
              title={lang === 'ar' ? 'الأمس' : 'Yesterday'}
              items={yesterdayItems}
              isLight={isLight}
              lang={lang}
              getFileIcon={getFileIcon}
              onCancel={cancelDownload}
              onRetry={retryDownload}
              onDelete={deleteDownloadedFile}
              onRemove={removeFromHistory}
              onOpen={handleOpenFile}
              onCopyPath={handleCopyPath}
              onLocateFolder={handleLocateFolder}
            />
          )}

          {earlierItems.length > 0 && (
            <DownloadGroupSection
              title={lang === 'ar' ? 'سابقاً' : 'Earlier'}
              items={earlierItems}
              isLight={isLight}
              lang={lang}
              getFileIcon={getFileIcon}
              onCancel={cancelDownload}
              onRetry={retryDownload}
              onDelete={deleteDownloadedFile}
              onRemove={removeFromHistory}
              onOpen={handleOpenFile}
              onCopyPath={handleCopyPath}
              onLocateFolder={handleLocateFolder}
            />
          )}
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 w-screen h-screen w-[100vw] h-[100vh] bg-slate-950/95 z-[99999] flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-2xl max-h-[85vh] rounded-2xl border p-5 flex flex-col gap-4 shadow-2xl ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2 font-black text-sm truncate">
                {getFileIcon(previewFile.item)}
                <span className="truncate max-w-md">{previewFile.item.savedFilename}</span>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2">
              {previewFile.item.mimeType.startsWith('image/') ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.item.savedFilename}
                  className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg"
                />
              ) : previewFile.item.mimeType.startsWith('video/') ? (
                <video
                  src={previewFile.url}
                  controls
                  autoPlay
                  className="max-h-[60vh] max-w-full rounded-xl shadow-lg"
                />
              ) : previewFile.item.mimeType.startsWith('audio/') ? (
                <audio src={previewFile.url} controls autoPlay className="w-full max-w-md" />
              ) : (
                <div className="p-8 text-center flex flex-col items-center gap-3">
                  <FileText className="w-16 h-16 text-accent" />
                  <span className="font-extrabold text-sm">{previewFile.item.savedFilename}</span>
                  <span className="text-xs text-slate-400 font-mono">{previewFile.item.fileSizeFormatted}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-3 border-white/10 text-xs font-mono text-slate-400">
              <span className="truncate">{previewFile.item.localPath}</span>
              <button
                onClick={() => handleCopyPath(previewFile.item)}
                className="px-3 py-1.5 rounded-lg bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold cursor-pointer border-0 shrink-0"
              >
                {lang === 'ar' ? 'نسخ المسار' : 'Copy Path'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Change Download Directory Modal */}
      {isChangingFolder && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100000] bg-black/75 flex items-center justify-center p-4 select-none animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsChangingFolder(false);
          }}
        >
          <div className="w-full max-w-md bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl shadow-2xl p-5 space-y-4 text-[var(--theme-text-primary)] relative z-[100001]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-border)]">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-accent" />
                <h3 className="font-extrabold text-sm">
                  {lang === 'ar' ? 'تحديد مجلد التنزيلات' : 'Custom Download Directory'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsChangingFolder(false)}
                className="p-1 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--theme-text-muted)] leading-relaxed">
              {lang === 'ar'
                ? 'حدد المسار المحلي لتخزين التنزيلات والملفات المحفوظة. إذا تم حذف المجلد أو أصبح غير متاح، سيتم الرجوع تلقائياً لمجلد النظام الافتراضي.'
                : 'Set a custom directory path for saving downloaded files. If the directory is deleted or unavailable, it automatically falls back to the default OS download location.'}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold block text-[var(--theme-text-primary)]">
                {lang === 'ar' ? 'مسار مجلد التنزيلات:' : 'Directory Path:'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customFolderPathInput}
                  onChange={(e) => setCustomFolderPathInput(e.target.value)}
                  placeholder={resolvedDownloadDir || (lang === 'ar' ? 'مجلد التنزيلات الافتراضي للنظام' : 'OS Default Downloads Folder')}
                  className="flex-1 px-3 py-2.5 rounded-xl border text-xs font-mono bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const selected = await selectFolderWithNativeDialog();
                    if (selected) {
                      setCustomFolderPathInput(selected);
                    }
                  }}
                  className="px-3.5 py-2.5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-secondary)] font-bold text-xs text-[var(--theme-text-primary)] transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                  title={lang === 'ar' ? 'استعراض المجلدات' : 'Browse Folders'}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-accent" />
                  <span>{lang === 'ar' ? 'استعراض...' : 'Browse...'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleResetFolderToDefault}
                className="px-3 py-2 rounded-xl border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة الضبط للافتراضي' : 'Reset to OS Default'}</span>
              </button>

              <div className="flex items-center gap-2 ms-auto">
                <button
                  type="button"
                  onClick={() => setIsChangingFolder(false)}
                  className="px-3.5 py-2 rounded-xl border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomFolder}
                  className="px-4 py-2 rounded-xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer border-0 shadow-md"
                >
                  {lang === 'ar' ? 'حفظ المجلد' : 'Save Directory'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

interface DownloadGroupSectionProps {
  title: string;
  items: DownloadItem[];
  isLight: boolean;
  lang: 'en' | 'ar';
  getFileIcon: (item: DownloadItem) => React.ReactNode;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (item: DownloadItem) => void;
  onCopyPath: (item: DownloadItem) => void;
  onLocateFolder: (item: DownloadItem) => void;
}

function DownloadGroupSection({
  title,
  items,
  isLight,
  lang,
  getFileIcon,
  onCancel,
  onRetry,
  onDelete,
  onRemove,
  onOpen,
  onCopyPath,
  onLocateFolder
}: DownloadGroupSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-accent" />
        <h4 className="font-black text-xs uppercase tracking-wider text-[var(--theme-text-secondary)]">
          {title} ({items.length})
        </h4>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const isCompleted = item.status === 'completed';
          const isDownloading = item.status === 'downloading';
          const isFailed = item.status === 'failed';
          const isCancelled = item.status === 'cancelled';
          const isMissing = item.status === 'missing';

          const progressPercent = isCompleted ? 100 : item.progress || 0;

          return (
            <div
              key={item.id}
              className="p-4 rounded-2xl border transition-all flex flex-col gap-3 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-accent/40 shadow-xs"
            >
              {/* TOP ROW: Icon, File name, Status Badge, Action Buttons */}
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                    {getFileIcon(item)}
                  </div>

                  <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                    <span className="font-extrabold text-xs sm:text-sm truncate text-[var(--theme-text-primary)]">
                      {item.savedFilename}
                    </span>

                    {/* Status Badge */}
                    {isCompleted && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[9px] uppercase shrink-0">
                        {lang === 'ar' ? 'مكتمل' : 'Completed'}
                      </span>
                    )}
                    {isDownloading && (
                      <span className="px-2 py-0.5 rounded-md bg-accent/20 border border-accent/30 text-accent font-bold text-[9px] uppercase shrink-0 animate-pulse">
                        {lang === 'ar' ? `جاري التنزيل (${item.progress}%)` : `Downloading (${item.progress}%)`}
                      </span>
                    )}
                    {isFailed && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-[9px] uppercase shrink-0">
                        {lang === 'ar' ? 'فشل التنزيل' : 'Failed'}
                      </span>
                    )}
                    {isCancelled && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-[9px] uppercase shrink-0">
                        {lang === 'ar' ? 'ملغى' : 'Cancelled'}
                      </span>
                    )}
                    {isMissing && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-[9px] uppercase shrink-0">
                        {lang === 'ar' ? 'مفقود محلياً' : 'Missing File'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isCompleted && (
                    <>
                      <button
                        onClick={() => onOpen(item)}
                        className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs flex items-center gap-1 transition-all cursor-pointer border-0 shadow-xs"
                        title={lang === 'ar' ? 'فتح الملف' : 'Open File'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{lang === 'ar' ? 'فتح' : 'Open'}</span>
                      </button>

                      <button
                        onClick={() => onLocateFolder(item)}
                        className="p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] border-[var(--theme-border)]"
                        title={lang === 'ar' ? 'فتح المجلد المحلي' : 'Open Containing Folder'}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onCopyPath(item)}
                        className="p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] border-[var(--theme-border)]"
                        title={lang === 'ar' ? 'نسخ المسار' : 'Copy File Path'}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-all cursor-pointer"
                        title={lang === 'ar' ? 'حذف الملف' : 'Delete File'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {isDownloading && (
                    <button
                      onClick={() => onCancel(item.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1 transition-all cursor-pointer border-0"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</span>
                    </button>
                  )}

                  {(isFailed || isCancelled || isMissing) && (
                    <button
                      onClick={() => onRetry(item.id)}
                      className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs flex items-center gap-1 transition-all cursor-pointer border-0 shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] border-[var(--theme-border)]"
                    title={lang === 'ar' ? 'إزالة من السجل' : 'Remove from List'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* SECOND ROW: Always-Visible Progress Bar & Percentage */}
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                  <span className={isCompleted ? 'text-emerald-400' : isDownloading ? 'text-accent' : isFailed ? 'text-rose-400' : 'text-slate-400'}>
                    {isCompleted ? (lang === 'ar' ? 'اكتمل التنزيل بنجاح 100%' : 'Download Complete 100%') :
                     isDownloading ? `${lang === 'ar' ? 'جاري التقدم:' : 'Progress:'} ${progressPercent}%` :
                     isFailed ? (lang === 'ar' ? 'فشل التنزيل' : 'Download Failed') :
                     isCancelled ? (lang === 'ar' ? 'تم إلغاء التنزيل' : 'Download Cancelled') :
                     (lang === 'ar' ? 'الملف مفقود محلياً' : 'File Missing Locally')}
                  </span>
                  <span className="font-extrabold">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden p-0.5 border bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isCompleted ? 'bg-emerald-500' :
                      isDownloading ? 'bg-accent animate-pulse' :
                      isFailed ? 'bg-rose-500' :
                      isCancelled ? 'bg-amber-500' : 'bg-slate-600'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* BOTTOM ROW: Downloaded / Total Size, Speed / Time, Local Path */}
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono flex-wrap pt-1 border-t border-[var(--theme-border)] text-[var(--theme-text-muted)]">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Size info */}
                  <span className="font-bold">
                    {formatBytes(item.downloadedBytes || (isCompleted ? item.fileSize : 0))} / {formatBytes(item.fileSize)}
                  </span>

                  <span>•</span>

                  {/* Speed / Time / Date */}
                  {isDownloading ? (
                    <span className="text-accent font-bold">
                      {item.speedFormatted}
                      {item.remainingSeconds > 0 && ` • ${item.remainingSeconds}s ${lang === 'ar' ? 'متبقي' : 'remaining'}`}
                    </span>
                  ) : (
                    <span>
                      {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} {' '}
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Local path location */}
                <div className="flex items-center gap-1 text-slate-400 truncate max-w-xs sm:max-w-md">
                  <Folder className="w-3 h-3 text-accent shrink-0" />
                  <span className="truncate">{item.localPath}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
