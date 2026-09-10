import React from 'react';
import UploadedImagePreview from './UploadedImagePreview';
import { Message, Attachment } from '../types';
import { Pin, PinOff, X, Aperture, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioAttachmentPlayer } from './MusicPlayer';
import { MessageDeletionService } from '../services/messageDeletionService';
import {
  isAttachmentImage,
  isAttachmentVideo,
  isAttachmentAudio,
  isAttachmentUnrenderable,
  inferMimeType
} from '../services/attachmentProcessor';

interface PinnedMessagesPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedIds: string[];
  sortedMessages: Message[];
  scrollToMessage: (msgId: string) => void;
  handleTogglePin: (msgId: string) => void;
  getAttachmentUrl: (recordIdOrAttach: any, filename?: string, collectionName?: string) => string;
  isUnrenderableImageFile: (filename: string, type?: string) => boolean;
  failedImageIds: Set<string>;
  setFailedImageIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setGridGalleryList: (attachments: Attachment[]) => void;
  setGalleryState: (state: { list: any[]; initialIndex: number } | null) => void;
  onPlayGlobalTrack?: (track: any) => void;
  lang: 'en' | 'ar';
  isLight?: boolean;
}

export default function PinnedMessagesPopover({
  isOpen,
  onClose,
  pinnedIds,
  sortedMessages,
  scrollToMessage,
  handleTogglePin,
  getAttachmentUrl,
  isUnrenderableImageFile,
  failedImageIds,
  setFailedImageIds,
  setGridGalleryList,
  setGalleryState,
  onPlayGlobalTrack,
  lang,
  isLight = false
}: PinnedMessagesPopoverProps) {
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 20);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen, onClose]);

  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const pinnedMessages = sortedMessages.filter(
    (m) =>
      pinnedIds.includes(m.id) &&
      !m.deleted &&
      !m.deleted_at &&
      !MessageDeletionService.isMessageDeleted(m.id)
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
          {/* Backdrop for click outside */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-transparent cursor-default pointer-events-auto"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center md:justify-end p-3 sm:p-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-16 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none select-none">
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, scale: 0.92, y: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm sm:max-w-md rounded-2xl border shadow-2xl overflow-hidden pointer-events-auto flex flex-col max-h-[80vh] max-h-[calc(100vh-32px)] z-50 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] pinned-messages-popover popover-menu-solid"
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
            >
              {/* Header */}
              <div className="p-4 border-b border-[var(--theme-border)] flex items-center justify-between shrink-0 bg-[var(--theme-bg-secondary)]">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center border border-accent/30">
                    <Pin className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-[var(--theme-text-primary)]">
                      {lang === 'ar' ? 'الرسائل المثبتة' : 'Pinned Messages'}
                    </h3>
                    <span className="text-[10px] font-mono text-accent">
                      {pinnedMessages.length} {lang === 'ar' ? 'رسائل مثبتة' : 'pinned'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg transition-all border-0 cursor-pointer hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]"
                  title={lang === 'ar' ? 'إغلاق' : 'Close'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content List */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                {pinnedMessages.length === 0 ? (
                  <div className="flex-1 min-h-[160px] flex flex-col items-center justify-center text-xs text-center gap-2 text-[var(--theme-text-muted)]">
                    <Pin className="w-8 h-8 opacity-40 text-accent" />
                    <span>
                      {lang === 'ar'
                        ? 'لا توجد رسائل مثبتة في هذه القناة بعد.'
                        : 'No pinned messages in this channel yet.'}
                    </span>
                  </div>
                ) : (
                  pinnedMessages.map((msg) => {
                    const sender = msg.expand?.sender;
                    const rawList: Attachment[] = [
                      ...(msg.expand?.['attachments(message)'] || []),
                      ...(msg.expand?.['private_attachments(message)'] || []),
                      ...(msg.expand?.attachments || []),
                      ...(msg.expand?.private_attachments || [])
                    ];
                    const attachmentsList: Attachment[] = rawList.map((a) => ({
                      ...a,
                      collectionName:
                        a.collectionName ||
                        a['@collectionName'] ||
                        (a.isPrivate ? 'private_attachments' : 'attachments'),
                      type: inferMimeType(a.file, a.type)
                    }));

                    return (
                      <div
                        key={msg.id}
                        onClick={() => {
                          scrollToMessage(msg.id);
                          onClose();
                        }}
                        className="p-3.5 rounded-xl border flex flex-col gap-2 relative cursor-pointer transition-all bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] hover:bg-[var(--theme-channel-hover-bg)] hover:border-accent shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs truncate text-accent">
                            {sender?.display_name || sender?.username || 'User'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {msg.content && msg.content.trim() && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(msg.content);
                                  setCopiedId(msg.id);
                                  setTimeout(
                                    () => setCopiedId((prev) => (prev === msg.id ? null : prev)),
                                    2000
                                  );
                                }}
                                className="p-1 rounded cursor-pointer border-0 shrink-0 text-[var(--theme-text-muted)] hover:text-accent hover:bg-[var(--theme-channel-hover-bg)]"
                                title={
                                  copiedId === msg.id
                                    ? lang === 'ar'
                                      ? 'تم النسخ!'
                                      : 'Copied!'
                                    : lang === 'ar'
                                    ? 'نسخ النص'
                                    : 'Copy Text'
                                }
                              >
                                {copiedId === msg.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePin(msg.id);
                              }}
                              className="p-1 rounded cursor-pointer border-0 shrink-0 text-[var(--theme-text-muted)] hover:text-accent hover:bg-[var(--theme-channel-hover-bg)]"
                              title={lang === 'ar' ? 'إلغاء التثبيت' : 'Unpin'}
                            >
                              <PinOff className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {msg.content && (
                          <p className="text-xs whitespace-pre-wrap break-words leading-relaxed text-[var(--theme-text-primary)]">
                            {msg.content}
                          </p>
                        )}

                        {/* Attachments Preview */}
                        {attachmentsList.length > 0 &&
                          (() => {
                            const pinnedAudio = attachmentsList.filter((a) =>
                              isAttachmentAudio(a.file, a.type)
                            );
                            const pinnedNonAudio = attachmentsList.filter(
                              (a) => !isAttachmentAudio(a.file, a.type)
                            );

                            return (
                              <div
                                className="flex flex-col gap-1.5 mt-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Audio items */}
                                {pinnedAudio.map((a) => (
                                  <AudioAttachmentPlayer
                                    key={a.id}
                                    src={getAttachmentUrl(a)}
                                    title={a.file}
                                    lang={lang}
                                    isLight={isLight}
                                    onPlayGlobal={onPlayGlobalTrack}
                                  />
                                ))}

                                {/* Photo gallery */}
                                {pinnedNonAudio.length > 4 ? (
                                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                                    {pinnedNonAudio.slice(0, 3).map((a) => {
                                      const aUrl = getAttachmentUrl(a);
                                      const isFailed = failedImageIds.has(a.id);
                                      const isUnrenderable = isAttachmentUnrenderable(
                                        a.file,
                                        a.type,
                                        isFailed
                                      );
                                      const isImg = isAttachmentImage(a.file, a.type, isFailed);
                                      return (
                                        <div
                                          key={a.id}
                                          onClick={() => setGridGalleryList(pinnedNonAudio)}
                                          className={`relative rounded-lg overflow-hidden border h-20 cursor-pointer group/attach flex items-center justify-center ${
                                            isLight
                                              ? 'bg-slate-100 border-slate-200'
                                              : 'bg-[var(--theme-bg-tertiary,var(--theme-bg-secondary))] border-[var(--theme-border)]'
                                          }`}
                                        >
                                          {isImg ? (
                                            <UploadedImagePreview
                                              src={aUrl}
                                              alt="Attachment"
                                              maxPreviewWidth={300}
                                              maxPreviewHeight={300}
                                              className="w-full h-full object-cover group-hover/attach:scale-105 transition-all"
                                              onError={() =>
                                                setFailedImageIds((prev) => new Set(prev).add(a.id))
                                              }
                                            />
                                          ) : (
                                            <div className="flex flex-col items-center justify-center p-1 text-center">
                                              <Aperture
                                                className={`w-5 h-5 mb-0.5 ${
                                                  isLight
                                                    ? 'text-amber-600'
                                                    : 'text-[var(--theme-accent,#7bae37)]'
                                                }`}
                                              />
                                              <span
                                                className={`text-[9px] font-mono truncate w-full px-1 ${
                                                  isLight ? 'text-slate-500' : 'text-[var(--theme-text-muted)]'
                                                }`}
                                              >
                                                {a.file}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                    {/* +N Overlay item */}
                                    <div
                                      onClick={() => setGridGalleryList(pinnedNonAudio)}
                                      className={`relative rounded-lg overflow-hidden border h-20 cursor-pointer group/attach flex items-center justify-center ${
                                        isLight
                                          ? 'bg-slate-100 border-slate-200'
                                          : 'bg-[var(--theme-bg-tertiary,var(--theme-bg-secondary))] border-[var(--theme-border)]'
                                      }`}
                                    >
                                      {isAttachmentImage(
                                        pinnedNonAudio[3]?.file,
                                        pinnedNonAudio[3]?.type,
                                        failedImageIds.has(pinnedNonAudio[3]?.id)
                                      ) ? (
                                        <UploadedImagePreview
                                          src={getAttachmentUrl(pinnedNonAudio[3])}
                                          alt="Attachment"
                                          maxPreviewWidth={300}
                                          maxPreviewHeight={300}
                                          className="w-full h-full object-cover opacity-25"
                                        />
                                      ) : (
                                        <Aperture
                                          className={`w-6 h-6 opacity-25 ${
                                            isLight
                                              ? 'text-amber-600'
                                              : 'text-[var(--theme-accent,#7bae37)]'
                                          }`}
                                        />
                                      )}
                                      <div
                                        className={`absolute inset-0 flex flex-col items-center justify-center p-1 text-center ${
                                          isLight ? 'bg-white/80' : 'bg-[var(--theme-bg-primary)]/80'
                                        }`}
                                      >
                                        <span
                                          className={`text-sm font-extrabold ${
                                            isLight
                                              ? 'text-amber-600'
                                              : 'text-[var(--theme-accent,#7bae37)]'
                                          }`}
                                        >
                                          +{pinnedNonAudio.length - 3}
                                        </span>
                                        <span
                                          className={`text-[8px] font-bold uppercase tracking-wider ${
                                            isLight ? 'text-slate-500' : 'text-[var(--theme-text-muted)]'
                                          }`}
                                        >
                                          {lang === 'ar' ? 'المزيد' : 'More'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  pinnedNonAudio.map((a, idx) => {
                                    const aUrl = getAttachmentUrl(a);
                                    const isFailed = failedImageIds.has(a.id);
                                    const isUnrenderable = isAttachmentUnrenderable(
                                      a.file,
                                      a.type,
                                      isFailed
                                    );
                                    const isImg = isAttachmentImage(a.file, a.type, isFailed);

                                    if (isImg) {
                                      return (
                                        <UploadedImagePreview
                                          key={a.id}
                                          src={aUrl}
                                          alt="Attachment"
                                          maxPreviewWidth={480}
                                          maxPreviewHeight={360}
                                          className={`max-h-36 w-full rounded-lg object-cover border cursor-pointer hover:opacity-90 transition-all ${
                                            isLight ? 'border-slate-200' : 'border-[var(--theme-border)]'
                                          }`}
                                          onError={() =>
                                            setFailedImageIds((prev) => new Set(prev).add(a.id))
                                          }
                                          onClick={() =>
                                            setGalleryState({
                                              list: pinnedNonAudio,
                                              initialIndex: idx
                                            })
                                          }
                                        />
                                      );
                                    }
                                    if (isUnrenderable) {
                                      return (
                                        <div
                                          key={a.id}
                                          onClick={() =>
                                            setGalleryState({
                                              list: pinnedNonAudio,
                                              initialIndex: idx
                                            })
                                          }
                                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                                            isLight
                                              ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-800'
                                              : 'bg-[var(--theme-accent,#7bae37)]/10 border-[var(--theme-accent,#7bae37)]/20 hover:bg-[var(--theme-accent,#7bae37)]/20 text-[var(--theme-accent,#7bae37)]'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <Aperture
                                              className={`w-4 h-4 shrink-0 ${
                                                isLight
                                                  ? 'text-amber-600'
                                                  : 'text-[var(--theme-accent,#7bae37)]'
                                              }`}
                                            />
                                            <span
                                              className={`text-xs font-bold truncate ${
                                                isLight
                                                  ? 'text-amber-700'
                                                  : 'text-[var(--theme-accent,#7bae37)]'
                                              }`}
                                            >
                                              {a.file}
                                            </span>
                                          </div>
                                          <span
                                            className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                              isLight
                                                ? 'text-amber-700 bg-amber-200/50'
                                                : 'text-[var(--theme-accent,#7bae37)] bg-[var(--theme-accent,#7bae37)]/20'
                                            }`}
                                          >
                                            IMG
                                          </span>
                                        </div>
                                      );
                                    }
                                    return (
                                      <a
                                        key={a.id}
                                        href={aUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-all ${
                                          isLight
                                            ? 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                                            : 'bg-[var(--theme-bg-tertiary,var(--theme-bg-secondary))] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                                        }`}
                                      >
                                        <span className="text-xs font-mono truncate">{a.file}</span>
                                        <span
                                          className={`text-[10px] font-mono ${
                                            isLight ? 'text-slate-400' : 'text-[var(--theme-text-muted)]'
                                          }`}
                                        >
                                          {a.size && !isNaN(Number(a.size))
                                            ? `${Math.round(Number(a.size) / 1024)}KB`
                                            : 'FILE'}
                                        </span>
                                      </a>
                                    );
                                  })
                                )}
                              </div>
                            );
                          })()}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

