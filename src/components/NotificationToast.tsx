import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AtSign, MessageSquare, X, ArrowRight, UserPlus, Mail } from 'lucide-react';

export interface ToastNotice {
  id: string;
  title: string;
  body: string;
  avatar?: string;
  senderName?: string;
  type?: 'ping' | 'reply' | 'dm' | 'friend_request';
  channelId?: string;
  serverId?: string;
  onClick?: () => void;
}

interface NotificationToastProps {
  toast: ToastNotice | null;
  onDismiss: () => void;
  onOpenToast: (toast: ToastNotice) => void;
  lang?: 'en' | 'ar';
}

export default function NotificationToast({
  toast,
  onDismiss,
  onOpenToast,
  lang = 'ar'
}: NotificationToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 6500); // auto dismiss after 6.5s
    return () => clearTimeout(timer);
  }, [toast?.id, onDismiss]);

  if (!toast) return null;

  const isReply = toast.type === 'reply';
  const isDm = toast.type === 'dm';
  const isFriendReq = toast.type === 'friend_request';
  const isAr = lang === 'ar';

  return (
    <AnimatePresence>
      <div className={`fixed top-4 ${isAr ? 'left-4' : 'right-4'} z-[200] max-w-sm w-full px-2 pointer-events-none select-none`}>
        <motion.div
          dir={isAr ? 'rtl' : 'ltr'}
          initial={{ opacity: 0, y: -25, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="pointer-events-auto bg-[var(--theme-bg-card)] border border-[var(--theme-border)] rounded-2xl p-3.5 shadow-2xl text-[var(--theme-text-primary)] flex items-center justify-between gap-3 backdrop-blur-md"
        >
          {/* Avatar or Icon */}
          <div className="relative shrink-0">
            {toast.avatar ? (
              <img
                src={toast.avatar}
                alt={toast.senderName || 'Sender'}
                className="w-10 h-10 rounded-xl object-cover border border-[var(--theme-border)]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold bg-[var(--theme-bg-tertiary)] text-accent border border-[var(--theme-border)]">
                {isFriendReq ? <UserPlus className="w-5 h-5" /> : isDm ? <Mail className="w-5 h-5" /> : isReply ? <MessageSquare className="w-5 h-5" /> : <AtSign className="w-5 h-5" />}
              </div>
            )}
            <span className={`absolute -bottom-1 ${isAr ? '-left-1' : '-right-1'} w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-[var(--theme-accent-contrast,#ffffff)] bg-accent shadow-sm`}>
              {isFriendReq ? '+' : isDm ? '✉' : isReply ? '↩' : '@'}
            </span>
          </div>

          {/* Content */}
          <div className={`flex-1 min-w-0 flex flex-col gap-0.5 ${isAr ? 'text-right' : 'text-left'}`}>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-[var(--theme-text-primary)] truncate">
                {toast.title}
              </span>
            </div>
            <p className="text-[11px] text-[var(--theme-text-secondary)] truncate font-medium leading-tight break-words">
              {toast.body}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                if (toast.onClick) {
                  toast.onClick();
                } else {
                  onOpenToast(toast);
                }
                onDismiss();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1 shadow-sm"
              title={isAr ? 'الانتقال إلى المحادثة' : 'Open Chat'}
            >
              <span>{isAr ? 'فتح' : 'View'}</span>
              <ArrowRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] hover:opacity-80 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-all cursor-pointer border-0"
              title={isAr ? 'إغلاق' : 'Dismiss'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
