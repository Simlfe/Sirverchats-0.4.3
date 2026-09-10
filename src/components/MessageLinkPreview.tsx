import React, { useState, useEffect } from 'react';
import { CornerDownRight, MessageSquare, Lock, Hash, ArrowUpRight, User as UserIcon, Loader2, FileText, Image as ImageIcon } from 'lucide-react';
import { Channel, Message, Server, User } from '../types';
import { pbService } from '../pocketbase';

function getSenderAvatar(user?: User) {
  if (user?.avatar) {
    if (user.avatar.startsWith('blob:') || user.avatar.startsWith('http')) {
      return user.avatar;
    }
    return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`;
  }
  return '';
}

export interface MessageLinkData {
  serverId: string;
  channelId: string;
  messageId: string;
}

export function parseMessageLink(urlStr: string): MessageLinkData | null {
  if (!urlStr) return null;
  try {
    // Matches patterns like:
    // ...#/server/SERVER_ID/channel/CHANNEL_ID/message/MSG_ID
    // .../server/SERVER_ID/channel/CHANNEL_ID/message/MSG_ID
    // .../channel/CHANNEL_ID/message/MSG_ID
    const serverChanMsgRegex = /(?:#\/?|\/)(?:server\/([a-zA-Z0-9_-]+)\/)?channel\/([a-zA-Z0-9_-]+)\/message\/([a-zA-Z0-9_-]+)/i;
    const match = urlStr.match(serverChanMsgRegex);
    if (match && match[2] && match[3]) {
      return {
        serverId: match[1] || '',
        channelId: match[2],
        messageId: match[3]
      };
    }
  } catch (e) {}
  return null;
}

interface MessageLinkPreviewProps {
  url: string;
  currentServer?: Server;
  channels?: Channel[];
  currentChannelId?: string;
  lang?: string;
  isLight?: boolean;
  onNavigateToMessageLink?: (serverId: string, channelId: string, messageId: string) => void;
  scrollToMessage?: (msgId: string) => void;
}

export const MessageLinkPreviewCard: React.FC<MessageLinkPreviewProps> = React.memo(({
  url,
  currentServer,
  channels = [],
  currentChannelId,
  lang,
  isLight = false,
  onNavigateToMessageLink,
  scrollToMessage
}) => {
  const activeLang = lang || (typeof localStorage !== 'undefined' ? localStorage.getItem('language') : null) || 'en';
  const isAr = activeLang === 'ar';
  const linkData = parseMessageLink(url);
  const [targetMessage, setTargetMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSameServer = React.useMemo(() => {
    if (!linkData) return false;
    // If no serverId in link, check if channel exists in current server channels
    if (!linkData.serverId) {
      return channels.some((c) => c.id === linkData.channelId);
    }
    // If serverId is 'dm', allow DM channel previews
    if (linkData.serverId === 'dm') {
      return true;
    }
    // Otherwise, check if link's serverId matches current server's ID
    if (currentServer?.id) {
      return currentServer.id === linkData.serverId;
    }
    return false;
  }, [linkData, currentServer?.id, channels]);

  useEffect(() => {
    if (!linkData || !isSameServer) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    pbService
      .getMessageById(linkData.messageId)
      .then((msg) => {
        if (isMounted) {
          setTargetMessage(msg);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Failed to load target message for preview card:', err);
          setError('Message not found');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [linkData?.messageId, isSameServer]);

  if (!linkData) return null;

  // Render blocked card if NOT sharing the server
  if (!isSameServer) {
    return (
      <div className="w-full max-w-md rounded-2xl p-3 border shadow-sm my-1.5 flex items-center gap-3 transition-all select-none bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)]">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-500">
            <span>{isAr ? 'رابط رسالة من سيرفر آخر' : 'Message Link from Another Server'}</span>
          </div>
          <p className="text-[11px] opacity-80 truncate mt-0.5 text-[var(--theme-text-muted)]">
            {isAr
              ? 'معاينة المحتوى مقتصرة على الرسائل من نفس السيرفر'
              : 'Preview is restricted to messages within the same server'}
          </p>
        </div>
      </div>
    );
  }

  const targetChanObj = channels.find((c) => c.id === linkData.channelId);
  const chanName = targetChanObj?.name || 'channel';

  const handleJump = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (currentChannelId === linkData.channelId && scrollToMessage) {
      scrollToMessage(linkData.messageId);
    } else if (onNavigateToMessageLink) {
      onNavigateToMessageLink(linkData.serverId || currentServer?.id || '', linkData.channelId, linkData.messageId);
    }
  };

  return (
    <div
      onClick={handleJump}
      className="w-full max-w-lg rounded-2xl p-3.5 border shadow-md my-2 transition-all cursor-pointer group bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] hover:border-accent/40"
    >
      {/* Header Channel Badge & Jump Action */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] pb-2 mb-2">
        <div className="flex items-center gap-1.5 font-bold text-xs text-accent truncate">
          <Hash className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{chanName}</span>
          <span className="text-[10px] font-mono text-[var(--theme-text-muted)] font-normal">
            ({isAr ? 'رسالة مشاركة' : 'Shared message'})
          </span>
        </div>
        <button
          type="button"
          onClick={handleJump}
          className="flex items-center gap-1 text-[11px] font-bold text-accent hover:underline bg-accent/10 px-2 py-0.5 rounded-lg border border-accent/20 cursor-pointer shrink-0"
        >
          <span>{isAr ? 'انتقال' : 'Jump'}</span>
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-[var(--theme-text-muted)] text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          <span>{isAr ? 'جاري تحميل الرسالة...' : 'Loading message preview...'}</span>
        </div>
      ) : error || !targetMessage ? (
        <div className="text-xs text-[var(--theme-text-muted)] italic py-1">
          {isAr ? 'عذراً، تعذر العثور على الرسالة' : 'Message preview unavailable'}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* User info row */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold text-[var(--theme-text-primary)]">
              {getSenderAvatar(targetMessage.expand?.sender) ? (
                <img
                  src={getSenderAvatar(targetMessage.expand?.sender)}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-3 h-3 text-[var(--theme-text-secondary)]" />
              )}
            </div>
            <span className="font-extrabold text-xs text-[var(--theme-text-primary)] truncate">
              {targetMessage.expand?.sender?.display_name || targetMessage.expand?.sender?.username || 'User'}
            </span>
            <span className="text-[9px] font-mono text-[var(--theme-text-muted)] ms-auto shrink-0">
              {new Date(targetMessage.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {/* Truncated message content */}
          {targetMessage.content && targetMessage.content.trim().length > 0 && (
            <p className="text-xs text-[var(--theme-text-primary)] opacity-90 line-clamp-3 leading-relaxed font-normal whitespace-pre-wrap pl-8">
              {targetMessage.content}
            </p>
          )}

          {/* Attachment indicator if any */}
          {(targetMessage.attachments || targetMessage.expand?.['attachments(message)']) && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-accent pl-8 mt-0.5">
              <PaperclipIcon className="w-3 h-3" />
              <span>{isAr ? 'تحتوي على مرفقات' : 'Contains attachments'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const PaperclipIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
  </svg>
);
