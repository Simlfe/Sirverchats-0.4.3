import React from 'react';
import { NotificationItem } from '../types';
import {
  Bell,
  Check,
  MessageSquare,
  X,
  Trash2,
  UserPlus,
  AtSign,
  Reply,
  UserCheck,
  UserX,
  Shield,
  AlertCircle,
  Phone,
  PhoneMissed,
  PhoneOff,
  Video,
  VideoOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pbService } from '../pocketbase';
import { toLatinNumerals } from '../lib/utils';
import { parseCallLog, formatCallDuration } from '../services/callLogService';

interface NotificationsPopoverProps {
  notifications: NotificationItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelectNotification: (notification: NotificationItem) => void;
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
  onAcceptFriendRequest?: (notification: NotificationItem) => void;
  onDeclineFriendRequest?: (notification: NotificationItem) => void;
  lang: 'en' | 'ar';
  isLight?: boolean;
}

const NotificationsPopover = React.memo(function NotificationsPopover({
  notifications,
  isOpen,
  onClose,
  onSelectNotification,
  onMarkAllAsRead,
  onClearNotifications,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  lang,
  isLight = false
}: NotificationsPopoverProps) {
  // Filter out any raw ephemeral call signaling payloads that might have leaked into storage
  const filteredNotifications = React.useMemo(() => {
    return notifications.filter((n) => {
      const content = n.message_content || n.message || '';
      if (typeof content === 'string' && (content.includes('INCOMING_CALL:') || content.startsWith('INCOMING_CALL:'))) {
        return false;
      }
      if (n.id && String(n.id).startsWith('call_') && !content.includes('CALL_LOG:')) {
        return false;
      }
      return true;
    });
  }, [notifications]);

  const unreadCount = React.useMemo(() => filteredNotifications.filter((n) => !n.read).length, [filteredNotifications]);
  const displayedNotifications = React.useMemo(() => filteredNotifications.slice(0, 25), [filteredNotifications]);
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

  const formatAvatarUrl = (avatar?: string, senderId?: string) => {
    if (!avatar) return null;
    if (avatar.startsWith('blob:') || avatar.startsWith('http')) {
      return avatar;
    }
    if (senderId) {
      return `${pbService.getServerUrl()}/api/files/users/${senderId}/${avatar}`;
    }
    return avatar;
  };

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
              className="w-full max-w-sm sm:max-w-md rounded-2xl border shadow-2xl overflow-hidden pointer-events-auto flex flex-col max-h-[80vh] max-h-[calc(100vh-32px)] z-50 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] notifications-popover popover-menu-solid"
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
            >
          {/* Header */}
          <div className="p-4 border-b border-[var(--theme-border)] flex items-center justify-between shrink-0 bg-[var(--theme-bg-secondary)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center border border-accent/30">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm">
                  {lang === 'ar' ? 'الإشعارات والتنبيهات' : 'Notifications'}
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {toLatinNumerals(unreadCount)} {lang === 'ar' ? 'غير مقروء' : 'unread'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllAsRead}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer flex items-center gap-1 ${
                    isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-slate-400 hover:text-white'
                  }`}
                  title={lang === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={onClearNotifications}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer text-red-400 hover:bg-red-500/10`}
                  title={lang === 'ar' ? 'مسح الإشعارات' : 'Clear all'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg transition-all border-0 cursor-pointer ${
                  isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center p-4 gap-2 text-slate-500">
                <Bell className="w-8 h-8 opacity-40" />
                <p className="text-xs font-bold">
                  {lang === 'ar' ? 'لا توجد إشعارات حالية' : 'No notifications yet'}
                </p>
                <p className="text-[10px] opacity-70">
                  {lang === 'ar' ? 'ستظهر هنا التنبيهات والمناداة وطلبات الصداقة' : 'Pings, DMs, mentions and friend requests will show here'}
                </p>
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const contentStr = n.message_content || n.message || '';
                const callLog = parseCallLog(contentStr);
                const isCallLog = Boolean(callLog);
                const isFriendReq = n.type === 'friend_request' || n.channel_name === 'Friend Request';
                const isMention = n.type === 'mention';
                const isReply = n.type === 'reply';
                const isSystemOrAdmin =
                  !isCallLog &&
                  ((n.type as string) === 'system' ||
                    (n.type as string) === 'admin' ||
                    n.sender_name === 'System' ||
                    n.sender_name === 'Admin' ||
                    contentStr.toLowerCase().includes('deleted') ||
                    contentStr.includes('حذف'));
                const avatarSrc = formatAvatarUrl(n.sender_avatar, n.sender_id);

                // Call log UI configurations
                let CallIcon = Phone;
                let callBadgeText = '';
                let callBadgeClass = '';
                let callBodyText = '';
                let callTextColor = 'text-accent';
                let callIconBgClass = 'bg-accent/20 text-accent border-accent/30';

                if (callLog) {
                  const isVideo = callLog.type === 'video';
                  const isMissed = callLog.status === 'missed';
                  const isDeclined = callLog.status === 'declined';
                  const isCancelled = callLog.status === 'cancelled';

                  if (isMissed) {
                    CallIcon = isVideo ? VideoOff : PhoneMissed;
                    callBadgeText = lang === 'ar' ? (isVideo ? 'فيديو فائتة' : 'مكالمة فائتة') : (isVideo ? 'Missed Video' : 'Missed Call');
                    callBadgeClass = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
                    callBodyText = lang === 'ar'
                      ? (isVideo ? 'مكالمة فيديو فائتة (لم يتم الرد)' : 'مكالمة صوتية فائتة (لم يتم الرد)')
                      : (isVideo ? 'Missed video call (No answer)' : 'Missed voice call (No answer)');
                    callTextColor = 'text-rose-400';
                    callIconBgClass = 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
                  } else if (isDeclined) {
                    CallIcon = PhoneOff;
                    callBadgeText = lang === 'ar' ? 'مرفوضة' : 'Declined';
                    callBadgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                    callBodyText = lang === 'ar'
                      ? (isVideo ? 'تم رفض مكالمة الفيديو' : 'تم رفض المكالمة الصوتية')
                      : (isVideo ? 'Video call was declined' : 'Voice call was declined');
                    callTextColor = 'text-amber-400';
                    callIconBgClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
                  } else if (isCancelled) {
                    CallIcon = PhoneOff;
                    callBadgeText = lang === 'ar' ? 'ملغاة' : 'Cancelled';
                    callBadgeClass = 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
                    callBodyText = lang === 'ar'
                      ? (isVideo ? 'تم إلغاء مكالمة الفيديو' : 'تم إلغاء الاتصال')
                      : (isVideo ? 'Video call was cancelled' : 'Call was cancelled');
                    callTextColor = 'text-slate-400';
                    callIconBgClass = 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
                  } else {
                    CallIcon = isVideo ? Video : Phone;
                    callBadgeText = lang === 'ar' ? (isVideo ? 'مكالمة فيديو' : 'مكالمة صوتية') : (isVideo ? 'Video Call' : 'Voice Call');
                    callBadgeClass = 'bg-accent/20 text-accent border border-accent/30';
                    callBodyText = callLog.duration > 0
                      ? (lang === 'ar' ? `انتهت المكالمة • المدة: ${formatCallDuration(callLog.duration)}` : `Call ended • Duration: ${formatCallDuration(callLog.duration)}`)
                      : (lang === 'ar' ? 'انتهت المكالمة' : 'Call ended');
                    callTextColor = 'text-accent';
                    callIconBgClass = 'bg-accent/20 text-accent border border-accent/30';
                  }
                }

                return (
                  <div
                    key={n.id}
                    onClick={() => onSelectNotification(n)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative group ${
                      !n.read
                        ? (isLight 
                            ? 'bg-accent/10 border-accent/30 shadow-xs' 
                            : 'bg-accent/15 border-accent/40 text-[var(--theme-text-primary)] shadow-md')
                        : (isLight 
                            ? 'bg-slate-50/70 border-slate-200/80 opacity-70 hover:opacity-100 hover:bg-slate-100' 
                            : 'bg-slate-900/40 border-white/5 opacity-60 hover:opacity-90 hover:bg-white/5')
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5 animate-pulse" />
                      )}

                      <div className={`w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 border relative ${
                        isSystemOrAdmin
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : isCallLog
                          ? callIconBgClass
                          : 'bg-accent/20 text-accent border-accent/30'
                      }`}>
                        {isSystemOrAdmin ? (
                          <Shield className="w-4 h-4 text-amber-400" />
                        ) : isCallLog && !avatarSrc ? (
                          <CallIcon className="w-4 h-4" />
                        ) : avatarSrc ? (
                          <>
                            <img 
                              src={avatarSrc} 
                              alt="Avatar" 
                              className="w-full h-full rounded-lg object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }} 
                            />
                            {isCallLog && (
                              <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center border shadow-xs ${callIconBgClass}`}>
                                <CallIcon className="w-2 h-2" />
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] uppercase font-bold">
                            {(n.sender_name || 'U').substring(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`font-extrabold text-xs truncate ${
                              isSystemOrAdmin
                                ? 'text-amber-400'
                                : isCallLog
                                ? (callLog.status === 'missed' ? 'text-rose-400' : 'text-accent')
                                : (!n.read ? 'text-accent' : 'text-slate-400')
                            }`}>
                              {n.sender_name || callLog?.callerName || (isSystemOrAdmin ? (lang === 'ar' ? 'إشعار النظام / الإدارة' : 'System / Admin') : (lang === 'ar' ? 'مستخدم' : 'User'))}
                            </span>
                            {isSystemOrAdmin && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                {lang === 'ar' ? 'تنبيه إداري' : 'System'}
                              </span>
                            )}
                            {isCallLog && (
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${callBadgeClass}`}>
                                {callBadgeText}
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 shrink-0">
                            {toLatinNumerals(new Date(n.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}
                          </span>
                        </div>

                        {isCallLog ? (
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] font-semibold">
                            <CallIcon className={`w-3.5 h-3.5 shrink-0 ${callTextColor}`} />
                            <span className={callTextColor}>
                              {callBodyText}
                            </span>
                          </div>
                        ) : (
                          <p className={`text-[11px] font-medium leading-snug mt-1 ${!n.read ? (isLight ? 'text-slate-800' : 'text-slate-200') : 'text-slate-400'}`}>
                            {contentStr}
                          </p>
                        )}

                        <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono mt-1.5">
                          {isSystemOrAdmin ? (
                            <AlertCircle className="w-2.5 h-2.5 text-amber-400" />
                          ) : isCallLog ? (
                            <CallIcon className={`w-2.5 h-2.5 ${callTextColor}`} />
                          ) : isFriendReq ? (
                            <UserPlus className="w-2.5 h-2.5 text-blue-400" />
                          ) : isMention ? (
                            <AtSign className="w-2.5 h-2.5 text-amber-400" />
                          ) : isReply ? (
                            <Reply className="w-2.5 h-2.5 text-accent" />
                          ) : (
                            <MessageSquare className="w-2.5 h-2.5 text-accent" />
                          )}
                          <span>
                            {isSystemOrAdmin 
                              ? (lang === 'ar' ? 'تحديث النظام / السيرفرات' : 'System / Server Notification') 
                              : isCallLog
                              ? (lang === 'ar' ? 'محادثة خاصة • سجل المكالمات' : 'Direct Message • Call Log')
                              : `#${n.channel_name || (isFriendReq ? 'Friend Request' : 'general')}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Inline Actions for Friend Request */}
                    {isFriendReq && !n.read && (
                      <div className="flex items-center gap-2 mt-1 pt-1.5 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                        {onAcceptFriendRequest && (
                          <button
                            onClick={() => onAcceptFriendRequest(n)}
                            className="flex-1 py-1 px-2 rounded-lg bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] text-[10px] font-bold transition-all border-0 cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>{lang === 'ar' ? 'قبول' : 'Accept'}</span>
                          </button>
                        )}
                        {onDeclineFriendRequest && (
                          <button
                            onClick={() => onDeclineFriendRequest(n)}
                            className="flex-1 py-1 px-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-bold transition-all border border-red-500/30 cursor-pointer flex items-center justify-center gap-1"
                          >
                            <UserX className="w-3 h-3" />
                            <span>{lang === 'ar' ? 'رفض' : 'Decline'}</span>
                          </button>
                        )}
                      </div>
                    )}
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
});

export default NotificationsPopover;
