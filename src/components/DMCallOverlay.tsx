import React, { useState } from 'react';
import { PhoneOff, Mic, MicOff, Headphones, Video, VideoOff, ScreenShare, Radio, Volume2, RotateCw, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import useRealtimeMedia from '../context/MediaContext';
import ParticipantTile from './ParticipantTile';
import AudioMixerModal from './AudioMixerModal';
import { User } from '../types';
import { checkAndRequestMicrophonePermission } from '../utils/permissions';

interface DMCallOverlayProps {
  onSelectUser?: (user: User, anchor?: any) => void;
  lang?: 'en' | 'ar';
}

export const DMCallOverlay: React.FC<DMCallOverlayProps> = ({ onSelectUser, lang = 'en' }) => {
  const isAr = lang === 'ar';
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
    leaveRoomOrCall,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
    setParticipantVolume,
    error,
    clearError,
  } = useRealtimeMedia();

  if (!activeRoom || activeRoom.roomType !== 'dm_call') return null;

  const hasVideoOrScreen = participants.some((p) => p.isCameraEnabled || p.isScreenSharing);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="w-full shrink-0 border-b bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] transition-all overflow-hidden select-none z-20"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="p-3 sm:p-4 max-w-5xl mx-auto flex flex-col gap-3">
          {/* Permission or Connection Error Notification */}
          {error && (
            <div className="p-2.5 px-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span className="truncate">{error.message}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {error.code === 'PERMISSION_DENIED' && (
                  <button
                    type="button"
                    onClick={async () => {
                      clearError();
                      const res = await checkAndRequestMicrophonePermission();
                      if (res.granted && isMuted) {
                        toggleMute();
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-[11px] cursor-pointer"
                  >
                    {isAr ? 'منح الإذن' : 'Grant Mic'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearError}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[var(--theme-text-secondary)] font-medium text-[11px] cursor-pointer"
                >
                  {isAr ? 'تجاهل' : 'Dismiss'}
                </button>
              </div>
            </div>
          )}

          {/* Call Header Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="font-bold text-sm truncate text-[var(--theme-text-primary)]">
                {activeRoom.roomName || (isAr ? 'مكالمة خاصة' : 'Direct Call')}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] font-mono">
                {formattedDuration}
              </span>
              {connectionState === 'reconnecting' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 font-medium">
                  {isAr ? 'جاري إعادة الاتصال...' : 'Reconnecting...'}
                </span>
              )}
            </div>

            {/* Media Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Mic toggle */}
              <button
                type="button"
                onClick={toggleMute}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  isMuted
                    ? 'bg-red-500/15 border-red-500/30 text-red-500 hover:bg-red-500/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
                title={isMuted ? (isAr ? 'إلغاء كتم المايك' : 'Unmute Microphone') : (isAr ? 'كتم المايك' : 'Mute Microphone')}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Deafen toggle */}
              <button
                type="button"
                onClick={toggleDeafen}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  isDeafened
                    ? 'bg-red-500/15 border-red-500/30 text-red-500 hover:bg-red-500/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
                title={isDeafened ? (isAr ? 'تمكين الصوت' : 'Undeafen Audio') : (isAr ? 'تعطيل الصوت' : 'Deafen Audio')}
              >
                <Headphones className="w-4 h-4" />
              </button>

              {/* Camera toggle */}
              <button
                type="button"
                onClick={toggleCamera}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  isCameraEnabled
                    ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
                title={isCameraEnabled ? (isAr ? 'إيقاف الكاميرا' : 'Turn Off Camera') : (isAr ? 'تشغيل الكاميرا' : 'Turn On Camera')}
              >
                {isCameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>

              {/* Flip Camera button */}
              {isCameraEnabled && (
                <button
                  type="button"
                  onClick={() => switchCamera()}
                  className="p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]"
                  title={isAr ? 'تبديل الكاميرا (أمامية/خلفية)' : 'Flip Camera (Front/Rear)'}
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              )}

              {/* ScreenShare toggle */}
              <button
                type="button"
                onClick={toggleScreenShare}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  isScreenSharing
                    ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
                title={isScreenSharing ? (isAr ? 'إيقاف مشاركة الشاشة' : 'Stop Screen Sharing') : (isAr ? 'مشاركة الشاشة' : 'Share Screen')}
              >
                <ScreenShare className="w-4 h-4" />
              </button>

              {/* Audio Mixer button */}
              <button
                type="button"
                onClick={() => setIsAudioMixerOpen(true)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  isAudioMixerOpen
                    ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
                title={isAr ? 'موزع الصوت' : 'Open Audio Mixer'}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={leaveRoomOrCall}
                className="p-2.5 px-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                title={isAr ? 'إنهاء المكالمة' : 'End Call'}
              >
                <PhoneOff className="w-4 h-4" />
                <span className="hidden sm:inline">{isAr ? 'إنهاء المكالمة' : 'End Call'}</span>
              </button>
            </div>
          </div>

          {/* Participant Tiles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[120px] max-h-[320px]">
            {participants.map((p) => (
              <ParticipantTile
                key={p.userId}
                participant={p}
                isSelf={p.userId === activeRoom.user.id}
                onSelectUser={onSelectUser}
                onVolumeChange={setParticipantVolume}
                lang={lang}
              />
            ))}
          </div>
        </div>

        <AudioMixerModal
          isOpen={isAudioMixerOpen}
          onClose={() => setIsAudioMixerOpen(false)}
          participants={participants}
          currentUserId={activeRoom.user.id}
          lang={lang}
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default DMCallOverlay;
