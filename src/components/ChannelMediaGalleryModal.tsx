import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  Search,
  Download,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Layers,
  Eye,
  Filter
} from 'lucide-react';
import { Channel, Message, User } from '../types';
import { pbService } from '../pocketbase';
import AttachmentDownloadControl from './AttachmentDownloadControl';
import UploadedImagePreview from './UploadedImagePreview';

interface ChannelMediaGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  messages: Message[];
  lang?: 'en' | 'ar';
  isLight?: boolean;
  onJumpToMessage?: (messageId: string) => void;
  onOpenLightbox?: (attachment: any, list: any[]) => void;
}

type TabType = 'all' | 'images' | 'videos' | 'audio' | 'docs';

export default function ChannelMediaGalleryModal({
  isOpen,
  onClose,
  channel,
  messages,
  lang = 'en',
  isLight = false,
  onJumpToMessage,
  onOpenLightbox,
}: ChannelMediaGalleryModalProps) {
  const isAr = lang === 'ar';
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all attachments from messages
  const allMediaItems = useMemo(() => {
    const items: Array<{
      id: string;
      messageId: string;
      messageDate: string;
      senderId?: string;
      senderName?: string;
      file: string;
      type: string;
      size?: string | number;
      rawAttachment: any;
    }> = [];

    messages.forEach((msg) => {
      if (msg.attachments && Array.isArray(msg.attachments)) {
        msg.attachments.forEach((att: any, idx: number) => {
          const fileName = typeof att === 'string' ? att : att.file || att.name || 'file';
          const fileType = att.type || (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.webp') || fileName.endsWith('.gif') ? 'image/png' : fileName.endsWith('.mp4') || fileName.endsWith('.webm') ? 'video/mp4' : fileName.endsWith('.mp3') || fileName.endsWith('.wav') ? 'audio/mpeg' : 'application/octet-stream');

          items.push({
            id: att.id || `${msg.id}-${idx}`,
            messageId: msg.id,
            messageDate: msg.created,
            senderId: msg.sender,
            senderName: msg.expand?.sender?.username || msg.expand?.sender?.display_name,
            file: fileName,
            type: fileType,
            size: att.size,
            rawAttachment: att,
          });
        });
      }
    });

    return items;
  }, [messages]);

  // Filter items by category & search query
  const filteredItems = useMemo(() => {
    return allMediaItems.filter((item) => {
      const isImg = item.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.file);
      const isVid = item.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(item.file);
      const isAud = item.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(item.file);
      const isDoc = !isImg && !isVid && !isAud;

      if (activeTab === 'images' && !isImg) return false;
      if (activeTab === 'videos' && !isVid) return false;
      if (activeTab === 'audio' && !isAud) return false;
      if (activeTab === 'docs' && !isDoc) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.file.toLowerCase().includes(q);
        const matchSender = item.senderName?.toLowerCase().includes(q);
        if (!matchName && !matchSender) return false;
      }

      return true;
    });
  }, [allMediaItems, activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={`w-full max-w-4xl h-[82vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
          }`}
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 bg-[var(--theme-bg-secondary)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center font-bold">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-[var(--theme-text-primary)]">
                  {isAr ? 'معرض وسائط ومرفقات القناة' : 'Channel Media & Files Gallery'}
                </h3>
                <p className="text-[11px] text-[var(--theme-text-muted)] font-mono">
                  #{channel.name} • {filteredItems.length} / {allMediaItems.length} {isAr ? 'ملف' : 'items'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] cursor-pointer border border-[var(--theme-border)] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Bar & Search */}
          <div className="p-3 border-b border-[var(--theme-border)] flex flex-wrap items-center justify-between gap-2.5 shrink-0 bg-[var(--theme-bg-tertiary)]">
            {/* Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 ${
                  activeTab === 'all' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
              >
                <span>{isAr ? 'الكل' : 'All'}</span>
                <span className="text-[10px] opacity-75 font-mono">({allMediaItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('images')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 ${
                  activeTab === 'images' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{isAr ? 'الصور والمتحركة' : 'Images & GIFs'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('videos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 ${
                  activeTab === 'videos' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>{isAr ? 'الفيديوهات' : 'Videos'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audio')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 ${
                  activeTab === 'audio' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>{isAr ? 'الصوتيات' : 'Audio'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('docs')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 ${
                  activeTab === 'docs' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isAr ? 'المستندات' : 'Docs & Files'}</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] text-xs w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-[var(--theme-text-muted)] shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث بالاسم أو الراسل...' : 'Filter filename or sender...'}
                className="w-full bg-transparent border-0 outline-none text-xs text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] border-0 bg-transparent cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Grid View */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[var(--theme-text-muted)]">
                <Layers className="w-12 h-12 stroke-[1.5] text-[var(--theme-text-muted)] mb-3" />
                <h4 className="font-extrabold text-sm text-[var(--theme-text-primary)] mb-1">
                  {isAr ? 'لا توجد مرفقات مطابقة' : 'No attachments found'}
                </h4>
                <p className="text-xs text-[var(--theme-text-muted)] max-w-sm">
                  {isAr
                    ? 'لم يتم مشاركة أي صور أو ملفات في هذه القناة بعد أو لا توجد نتائج مطابقة للبحث.'
                    : 'No media or documents have been shared in this channel matching your current filter.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                {filteredItems.map((item) => {
                  const isImg = item.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.file);
                  const isVid = item.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(item.file);
                  const isAud = item.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(item.file);

                  const fileUrl = item.file.startsWith('http') || item.file.startsWith('blob:')
                    ? item.file
                    : pbService.getFileUrl({ id: item.messageId, collectionId: 'messages', collectionName: 'messages' }, item.file);

                  return (
                    <div
                      key={item.id}
                      className="group/card relative rounded-2xl overflow-hidden border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] flex flex-col shadow-sm hover:shadow-xl hover:border-accent/50 transition-all"
                    >
                      {/* Media Preview Box */}
                      <div
                        onClick={() => {
                          if (isImg && onOpenLightbox) {
                            onOpenLightbox(item.rawAttachment, allMediaItems.map((i) => i.rawAttachment));
                          }
                        }}
                        className={`w-full h-32 relative bg-black/40 flex items-center justify-center overflow-hidden ${
                          isImg ? 'cursor-pointer' : ''
                        }`}
                      >
                        {isImg ? (
                          <UploadedImagePreview
                            src={fileUrl}
                            alt={item.file}
                            className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300"
                          />
                        ) : isVid ? (
                          <div className="flex flex-col items-center gap-1.5 text-accent">
                            <Film className="w-8 h-8" />
                            <span className="text-[10px] font-bold font-mono text-white/80">Video</span>
                          </div>
                        ) : isAud ? (
                          <div className="flex flex-col items-center gap-1.5 text-purple-400">
                            <Music className="w-8 h-8" />
                            <span className="text-[10px] font-bold font-mono text-white/80">Audio Track</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-amber-400">
                            <FileText className="w-8 h-8" />
                            <span className="text-[10px] font-bold font-mono text-white/80">Document</span>
                          </div>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <AttachmentDownloadControl
                            attachmentId={item.id}
                            filename={item.file}
                            downloadUrl={fileUrl}
                            mimeType={item.type}
                            lang={lang}
                            isLight={isLight}
                            variant="button"
                          />
                          {onJumpToMessage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onJumpToMessage(item.messageId);
                                onClose();
                              }}
                              className="p-2 rounded-xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] hover:opacity-90 transition-transform cursor-pointer border-0 shadow-md"
                              title={isAr ? 'الانتقال إلى الرسالة' : 'Jump to Message'}
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Info Footer */}
                      <div className="p-2.5 flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-bold text-[var(--theme-text-primary)] truncate" title={item.file}>
                          {item.file}
                        </span>
                        <div className="flex items-center justify-between text-[10px] text-[var(--theme-text-muted)] font-mono">
                          <span className="truncate">{item.senderName || 'User'}</span>
                          <span className="opacity-70 shrink-0">
                            {new Date(item.messageDate).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
