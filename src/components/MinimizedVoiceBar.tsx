import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Maximize2,
  Radio,
  Users,
  Shield,
  Clock,
  Wifi,
  WifiOff,
  SlidersHorizontal
} from 'lucide-react';
import { useRealtimeMedia } from '../context/MediaContext';
import AudioMixerModal from './AudioMixerModal';
import { Channel } from '../types';

interface MinimizedVoiceBarProps {
  onExpand: () => void;
  lang?: 'en' | 'ar';
  t?: (key: string) => string;
  theme?: string;
  currentChannel?: Channel | null;
  className?: string;
  variant?: 'sidebar' | 'floating';
}

export const MinimizedVoiceBar: React.FC<MinimizedVoiceBarProps> = ({
  onExpand,
  lang = 'en',
  t = (k) => k,
  theme,
  currentChannel,
  className = '',
  variant = 'sidebar',
}) => {
  const [isAudioMixerOpen, setIsAudioMixerOpen] = useState(false);
  const {
    activeRoom,
    participants,
    connectionState,
    isMuted,
    isDeafened,
    isCameraEnabled,
    isScreenSharing,
    formattedDuration,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    leaveRoomOrCall,
  } = useRealtimeMedia();

  if (!activeRoom) {
    return null;
  }

  const isConnected = connectionState === 'connected';
  const isReconnecting = connectionState === 'reconnecting' || connectionState === 'connecting';
  const participantCount = participants.length || 1;
  const maxParticipants = activeRoom.maxParticipants || 8;

  // Find if someone is speaking
  const isSomeoneSpeaking = participants.some((p) => p.isSpeaking && !p.isMuted);

  const isRtl = lang === 'ar';

  if (variant === 'sidebar') {
    return (
      <div
        className={`p-2.5 rounded-2xl border transition-all duration-300 shadow-md mb-2 overflow-hidden bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] ${className}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Top Info Bar: Status, Room Name, Duration & Expand Button */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div
            onClick={onExpand}
            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer group"
            title={isRtl ? 'افتح القناة الصوتية' : 'Expand Voice Panel'}
          >
            {/* Status Indicator Dot */}
            <div className="relative shrink-0 flex items-center justify-center">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isConnected
                    ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                    : isReconnecting
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-red-500'
                }`}
              />
              {isSomeoneSpeaking && (
                <span className="absolute -inset-1 rounded-full border border-emerald-400 animate-ping opacity-75" />
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-black truncate text-accent group-hover:underline">
                  {activeRoom.roomName}
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-accent/15 text-accent shrink-0">
                  {participantCount}/{maxParticipants}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-[var(--theme-text-muted)] font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-500" />
                  <span>{formattedDuration}</span>
                </span>
                <span className="truncate">
                  {activeRoom.roomType === 'dm_call'
                    ? isRtl ? 'مكالمة خاصة' : 'Direct Call'
                    : isRtl ? 'صوت السيرفر' : 'Voice Channel'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onExpand}
            className="p-1.5 rounded-xl hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-accent transition-colors cursor-pointer border-0 shrink-0"
            title={isRtl ? 'توسيع الشاشة' : 'Expand View'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Controls Toolbar */}
        <div className="flex items-center justify-between gap-1 pt-2 border-t border-[var(--theme-border)]">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex-1 py-1.5 rounded-xl flex items-center justify-center transition-all cursor-pointer border-0 ${
              isMuted
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:bg-accent/20 hover:text-accent'
            }`}
            title={isMuted ? (isRtl ? 'إلغاء الكتم' : 'Unmute') : (isRtl ? 'كتم الصوت' : 'Mute')}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleDeafen}
            className={`flex-1 py-1.5 rounded-xl flex items-center justify-center transition-all cursor-pointer border-0 ${
              isDeafened
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:bg-accent/20 hover:text-accent'
            }`}
            title={isDeafened ? (isRtl ? 'إلغاء الصمم' : 'Undeafen') : (isRtl ? 'صمم الصوت' : 'Deafen')}
          >
            {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleCamera}
            className={`flex-1 py-1.5 rounded-xl flex items-center justify-center transition-all cursor-pointer border-0 ${
              isCameraEnabled
                ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] hover:opacity-90'
                : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:bg-accent/20 hover:text-accent'
            }`}
            title={isCameraEnabled ? (isRtl ? 'إيقاف الكاميرا' : 'Turn Off Camera') : (isRtl ? 'تشغيل الكاميرا' : 'Turn On Camera')}
          >
            {isCameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={toggleScreenShare}
            className={`flex-1 py-1.5 rounded-xl flex items-center justify-center transition-all cursor-pointer border-0 ${
              isScreenSharing
                ? 'bg-emerald-500 text-white hover:opacity-90'
                : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:bg-accent/20 hover:text-accent'
            }`}
            title={isScreenSharing ? (isRtl ? 'إيقاف المشاركة' : 'Stop Share') : (isRtl ? 'مشاركة الشاشة' : 'Share Screen')}
          >
            <Monitor className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={leaveRoomOrCall}
            className="flex-1 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all cursor-pointer border-0 shadow-md shadow-red-500/20"
            title={isRtl ? 'قطع الاتصال' : 'Disconnect'}
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Floating variant for main content stage / mobile
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className={`w-full p-3 rounded-2xl border shadow-md bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          onClick={onExpand}
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
        >
          <div className="relative shrink-0 w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-[var(--theme-bg-card)]" />
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-black truncate text-[var(--theme-text-primary)] group-hover:text-accent transition-colors">
              {activeRoom.roomName}
            </span>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--theme-text-muted)] mt-0.5">
              <span className="text-emerald-400 font-bold">{formattedDuration}</span>
              <span>•</span>
              <span>
                {participantCount} {isRtl ? 'عضو' : 'connected'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleMute}
            className={`p-2 rounded-xl transition-all cursor-pointer border-0 ${
              isMuted ? 'bg-red-500/20 text-red-400' : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:text-accent'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setIsAudioMixerOpen(true)}
            className={`p-2 rounded-xl transition-all cursor-pointer border-0 ${
              isAudioMixerOpen ? 'bg-accent/20 text-accent' : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:text-accent'
            }`}
            title="Audio Mixer"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onExpand}
            className="p-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] transition-all cursor-pointer border-0 shadow-md shadow-accent/20"
            title={isRtl ? 'العودة للمكالمة' : 'Return to Call'}
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={leaveRoomOrCall}
            className="p-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all cursor-pointer border-0 shadow-md shadow-red-500/20"
            title={isRtl ? 'قطع الاتصال' : 'Disconnect'}
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AudioMixerModal
        isOpen={isAudioMixerOpen}
        onClose={() => setIsAudioMixerOpen(false)}
        participants={participants}
        currentUserId={activeRoom.user.id}
      />
    </motion.div>
  );
};

export default React.memo(MinimizedVoiceBar);
