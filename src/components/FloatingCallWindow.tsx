import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  Monitor,
  Maximize2,
  Clock,
  Radio,
  SlidersHorizontal,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useRealtimeMedia } from '../context/MediaContext';
import { getServerMemberAvatarUrl, pbService } from '../pocketbase';
import Avatar from './Avatar';
import AudioMixerModal from './AudioMixerModal';
import { Channel } from '../types';

interface FloatingCallWindowProps {
  onExpand?: () => void;
  lang?: 'en' | 'ar';
  t?: (key: string) => string;
  currentChannel?: Channel | null;
}

export const FloatingCallWindow: React.FC<FloatingCallWindowProps> = ({
  onExpand = () => {},
  lang = 'en',
  t = (k) => k,
}) => {
  const [isAudioMixerOpen, setIsAudioMixerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const {
    activeRoom,
    participants,
    connectionState,
    isMuted,
    isDeafened,
    isCameraEnabled,
    isScreenSharing,
    incomingCall,
    outgoingCall,
    isRingMuted,
    formattedDuration,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    toggleMuteRing,
    acceptCall,
    declineCall,
    cancelOutgoingCall,
    leaveRoomOrCall,
  } = useRealtimeMedia();

  const isRtl = lang === 'ar';

  // Helper to extract caller / target avatar URL
  const incomingAvatarUrl = useMemo(() => {
    if (!incomingCall) return '';
    if (incomingCall.callerAvatar) {
      if (
        incomingCall.callerAvatar.startsWith('http') ||
        incomingCall.callerAvatar.startsWith('blob:') ||
        incomingCall.callerAvatar.startsWith('data:')
      ) {
        return incomingCall.callerAvatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${incomingCall.callerId}/${incomingCall.callerAvatar}`;
    }
    if (incomingCall.callerUser) {
      return getServerMemberAvatarUrl(null, incomingCall.callerUser, undefined);
    }
    return '';
  }, [incomingCall]);

  const outgoingTarget = outgoingCall?.targetUser;
  const outgoingAvatarUrl = useMemo(() => {
    if (!outgoingTarget) return '';
    if (outgoingTarget.avatar) {
      if (
        outgoingTarget.avatar.startsWith('http') ||
        outgoingTarget.avatar.startsWith('blob:') ||
        outgoingTarget.avatar.startsWith('data:')
      ) {
        return outgoingTarget.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${outgoingTarget.id}/${outgoingTarget.avatar}`;
    }
    return getServerMemberAvatarUrl(null, outgoingTarget, undefined);
  }, [outgoingTarget]);

  const isVideo = incomingCall?.callType === 'video' || outgoingCall?.callType === 'video';
  const targetName = outgoingTarget?.display_name || outgoingTarget?.username || 'User';

  return (
    <AnimatePresence>
      {/* 1. INCOMING CALL FLOATING WINDOW (Ringing) */}
      {incomingCall && incomingCall.state === 'ringing' && (
        <motion.div
          key="incoming-call-floating"
          initial={{ opacity: 0, y: -40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.92 }}
          transition={{ type: 'spring', damping: 24, stiffness: 320 }}
          className="fixed top-4 right-4 md:right-8 z-[99999] w-[calc(100vw-2rem)] max-w-sm p-4 rounded-2xl shadow-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] select-none backdrop-blur-none"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Top ringing header */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--theme-border)]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1">
                {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                {isRtl ? (isVideo ? 'مكالمة فيديو واردة...' : 'مكالمة صوتية واردة...') : (isVideo ? 'Incoming Video Call...' : 'Incoming Voice Call...')}
              </span>
            </div>

            {/* Mute ringtone toggle */}
            <button
              type="button"
              onClick={() => toggleMuteRing()}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer text-xs flex items-center gap-1 ${
                isRingMuted
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-500 hover:bg-amber-500/25'
                  : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
              }`}
              title={isRtl ? (isRingMuted ? 'إلغاء كتم الرنين' : 'كتم صوت الرنين') : (isRingMuted ? 'Unmute Ringtone' : 'Mute Ringtone')}
            >
              {isRingMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-medium hidden sm:inline">
                {isRingMuted ? (isRtl ? 'صامت' : 'Muted') : (isRtl ? 'كتم' : 'Mute')}
              </span>
            </button>
          </div>

          {/* Caller info */}
          <div className="flex items-center gap-3 py-3">
            <div className="relative shrink-0">
              <div className="absolute -inset-1 rounded-full bg-emerald-500/30 animate-ping opacity-60" />
              <Avatar
                src={incomingAvatarUrl}
                username={incomingCall.callerName}
                size="lg"
                className="relative border-2 border-emerald-500 shadow-md"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-black truncate text-[var(--theme-text-primary)]">
                {incomingCall.callerName}
              </h4>
              <p className="text-xs text-[var(--theme-text-muted)] truncate">
                @{incomingCall.callerUser?.username || incomingCall.callerName}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-medium text-emerald-500 animate-pulse">
                  {isRingMuted ? (isRtl ? 'جارٍ الرنين (صامت)...' : 'Ringing (Silenced)...') : (isRtl ? 'يرن الآن...' : 'Ringing now...')}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons (Answer, Reject, Mute) */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--theme-border)]">
            <button
              type="button"
              onClick={declineCall}
              className="py-2.5 px-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
              title={isRtl ? 'رفض المكالمة' : 'Reject Call'}
            >
              <PhoneOff className="w-4 h-4" />
              <span>{isRtl ? 'رفض' : 'Reject'}</span>
            </button>

            <button
              type="button"
              onClick={() => toggleMuteRing()}
              className={`py-2.5 px-2 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs ${
                isRingMuted
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-500'
                  : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)]'
              }`}
              title={isRtl ? (isRingMuted ? 'إلغاء كتم الرنين' : 'كتم صوت الرنين') : (isRingMuted ? 'Unmute Ring' : 'Mute Ring')}
            >
              {isRingMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              <span>{isRingMuted ? (isRtl ? 'صامت' : 'Muted') : (isRtl ? 'كتم' : 'Mute')}</span>
            </button>

            <button
              type="button"
              onClick={acceptCall}
              className="py-2.5 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/30 animate-pulse"
              title={isRtl ? 'الرد وبدء المكالمة' : 'Answer Call'}
            >
              <Phone className="w-4 h-4" />
              <span>{isRtl ? 'رد' : 'Answer'}</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* 2. OUTGOING CALL FLOATING WINDOW (Ringing / Calling) */}
      {!incomingCall && outgoingCall && (
        <motion.div
          key="outgoing-call-floating"
          initial={{ opacity: 0, y: -40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.92 }}
          transition={{ type: 'spring', damping: 24, stiffness: 320 }}
          className="fixed top-4 right-4 md:right-8 z-[99999] w-[calc(100vw-2rem)] max-w-sm p-4 rounded-2xl shadow-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] select-none backdrop-blur-none"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Top calling header */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--theme-border)]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-accent flex items-center gap-1">
                {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                {isRtl ? 'جارٍ الاتصال...' : 'Calling...'}
              </span>
            </div>

            {/* Mute outgoing ringtone toggle */}
            <button
              type="button"
              onClick={() => toggleMuteRing()}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer text-xs flex items-center gap-1 ${
                isRingMuted
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-500 hover:bg-amber-500/25'
                  : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
              }`}
              title={isRtl ? (isRingMuted ? 'إلغاء كتم الرنين' : 'كتم صوت الرنين') : (isRingMuted ? 'Unmute Ringing Chime' : 'Mute Ringing Chime')}
            >
              {isRingMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-medium hidden sm:inline">
                {isRingMuted ? (isRtl ? 'صامت' : 'Muted') : (isRtl ? 'كتم' : 'Mute')}
              </span>
            </button>
          </div>

          {/* Callee info */}
          <div className="flex items-center gap-3 py-3">
            <div className="relative shrink-0">
              {outgoingCall.state === 'ringing' && <div className="absolute -inset-1 rounded-full bg-accent/30 animate-ping opacity-60" />}
              <Avatar
                src={outgoingAvatarUrl}
                username={targetName}
                size="lg"
                className="relative border-2 border-accent shadow-md"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-black truncate text-[var(--theme-text-primary)]">
                {targetName}
              </h4>
              <p className="text-xs text-[var(--theme-text-muted)] truncate">
                @{outgoingTarget?.username || targetName}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[11px] font-medium text-accent animate-pulse">
                  {outgoingCall.state === 'declined'
                    ? isRtl ? 'تم رفض المكالمة' : 'Call Declined'
                    : outgoingCall.state === 'busy'
                    ? isRtl ? 'المستخدم مشغول' : 'User Busy'
                    : outgoingCall.state === 'timeout'
                    ? isRtl ? 'لا يوجد رد' : 'No Answer'
                    : isRingMuted
                    ? isRtl ? 'رنين (صوت صامت)...' : 'Ringing (Muted sound)...'
                    : isRtl ? 'رنين...' : 'Ringing...'}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--theme-border)]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-red-500/15 border-red-500/30 text-red-500'
                    : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                }`}
                title={isMuted ? (isRtl ? 'إلغاء كتم المايك' : 'Unmute Mic') : (isRtl ? 'كتم المايك' : 'Mute Mic')}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  !isCameraEnabled
                    ? 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-muted)]'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/25'
                }`}
                title={isCameraEnabled ? (isRtl ? 'إيقاف الكاميرا' : 'Stop Camera') : (isRtl ? 'تشغيل الكاميرا' : 'Start Camera')}
              >
                {isCameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={cancelOutgoingCall}
              className="py-2 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md shadow-red-500/25"
            >
              <PhoneOff className="w-4 h-4" />
              <span>{isRtl ? 'إنهاء' : 'End Call'}</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* 3. ACTIVE CONNECTED CALL / ROOM FLOATING WINDOW */}
      {!incomingCall && !outgoingCall && activeRoom && (
        <motion.div
          key="active-room-floating"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="fixed top-4 right-4 md:right-8 z-[99999] w-[calc(100vw-2rem)] max-w-sm rounded-2xl shadow-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] select-none overflow-hidden"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Header Bar */}
          <div className="p-3 bg-[var(--theme-bg-secondary)] flex items-center justify-between gap-2 border-b border-[var(--theme-border)]">
            <div
              onClick={onExpand}
              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
              title={isRtl ? 'تكبير لوحة المكالمة' : 'Expand Call View'}
            >
              <div className="relative shrink-0 flex items-center justify-center">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    connectionState === 'connected'
                      ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                      : connectionState === 'reconnecting' || connectionState === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-red-500'
                  }`}
                />
                {participants.some((p) => p.isSpeaking && !p.isMuted) && (
                  <span className="absolute -inset-1 rounded-full border border-emerald-400 animate-ping opacity-75" />
                )}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black truncate text-accent group-hover:underline">
                    {activeRoom.roomName}
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-accent/15 text-accent shrink-0">
                    {participants.length || 1}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--theme-text-muted)] font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-500" />
                    <span>{formattedDuration}</span>
                  </span>
                  <span>•</span>
                  <span className="text-emerald-500 font-semibold">
                    {isRtl ? 'متصل' : 'Connected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onExpand}
                className="p-1.5 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                title={isRtl ? 'تكبير' : 'Expand'}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1.5 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
                title={isCollapsed ? (isRtl ? 'إظهار عناصر التحكم' : 'Show Controls') : (isRtl ? 'تصغير' : 'Collapse')}
              >
                {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Controls Body (collapsible) */}
          {!isCollapsed && (
            <div className="p-3 bg-[var(--theme-bg-card)] space-y-2.5">
              {/* Participant Avatars Strip */}
              {participants.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {participants.slice(0, 6).map((p) => {
                    const isSpeaking = p.isSpeaking && !p.isMuted;
                    const name = p.displayName || p.username;
                    const avatarUrl = p.avatar?.startsWith('http') || p.avatar?.startsWith('blob:')
                      ? p.avatar
                      : getServerMemberAvatarUrl(null, p.userRef, p.avatar);

                    return (
                      <div
                        key={p.userId}
                        className="relative flex flex-col items-center shrink-0 group"
                        title={`${name} ${p.isMuted ? '(Muted)' : ''}`}
                      >
                        <div
                          className={`relative rounded-full transition-all ${
                            isSpeaking
                              ? 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-[var(--theme-bg-card)] scale-105'
                              : 'ring-1 ring-[var(--theme-border)]'
                          }`}
                        >
                          <Avatar
                            src={avatarUrl}
                            username={name}
                            size="sm"
                            className="w-7 h-7 text-[10px]"
                          />
                          {p.isMuted && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border border-[var(--theme-bg-card)] flex items-center justify-center text-white">
                              <MicOff className="w-2 h-2" />
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] text-[var(--theme-text-muted)] truncate max-w-[48px] mt-0.5">
                          {name.split(' ')[0]}
                        </span>
                      </div>
                    );
                  })}
                  {participants.length > 6 && (
                    <span className="text-[10px] text-[var(--theme-text-muted)] font-mono shrink-0 px-1">
                      +{participants.length - 6}
                    </span>
                  )}
                </div>
              )}

              {/* Default Call Controls Grid */}
              <div className="grid grid-cols-6 gap-1.5">
                {/* Mute Mic */}
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all cursor-pointer border ${
                    isMuted
                      ? 'bg-red-500/15 border-red-500/30 text-red-500 hover:bg-red-500/25'
                      : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                  title={isMuted ? (isRtl ? 'إلغاء كتم المايك' : 'Unmute Mic') : (isRtl ? 'كتم المايك' : 'Mute Mic')}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* Deafen Audio */}
                <button
                  type="button"
                  onClick={toggleDeafen}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all cursor-pointer border ${
                    isDeafened
                      ? 'bg-red-500/15 border-red-500/30 text-red-500 hover:bg-red-500/25'
                      : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                  title={isDeafened ? (isRtl ? 'إلغاء كتم الصوت' : 'Undeafen') : (isRtl ? 'كتم الصوت' : 'Deafen')}
                >
                  {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Camera */}
                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all cursor-pointer border ${
                    isCameraEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/25'
                      : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                  title={isCameraEnabled ? (isRtl ? 'إيقاف الكاميرا' : 'Turn Off Camera') : (isRtl ? 'تشغيل الكاميرا' : 'Turn On Camera')}
                >
                  {isCameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>

                {/* Screen Share */}
                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all cursor-pointer border ${
                    isScreenSharing
                      ? 'bg-accent/20 border-accent/40 text-accent hover:bg-accent/30'
                      : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                  title={isScreenSharing ? (isRtl ? 'إيقاف مشاركة الشاشة' : 'Stop Screen Share') : (isRtl ? 'مشاركة الشاشة' : 'Share Screen')}
                >
                  <Monitor className="w-4 h-4" />
                </button>

                {/* Audio Mixer */}
                <button
                  type="button"
                  onClick={() => setIsAudioMixerOpen(true)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-all cursor-pointer"
                  title={isRtl ? 'ميكسر الصوت' : 'Audio Mixer'}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>

                {/* Leave / Disconnect */}
                <button
                  type="button"
                  onClick={leaveRoomOrCall}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/25 transition-all active:scale-95 cursor-pointer"
                  title={isRtl ? 'قطع الاتصال' : 'Disconnect'}
                >
                  <PhoneOff className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Audio Mixer Submodal */}
          {isAudioMixerOpen && (
            <AudioMixerModal
              isOpen={isAudioMixerOpen}
              onClose={() => setIsAudioMixerOpen(false)}
              lang={lang}
              t={t}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FloatingCallWindow;
