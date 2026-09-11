import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MicOff, Headphones, Volume2, ScreenShare, RotateCw, Activity, Wifi } from 'lucide-react';
import { MediaParticipant } from '../types/media';
import { User } from '../types';
import Avatar from './Avatar';
import { getServerMemberAvatarUrl, pbService } from '../pocketbase';
import useRealtimeMedia from '../context/MediaContextBridge';
import VideoPlayer from './video/VideoPlayer';
import ParticipantDiagnosticsOverlay from './ParticipantDiagnosticsOverlay';
import VolumeSliderPortal from './VolumeSliderPortal';

interface ParticipantTileProps {
  participant: MediaParticipant;
  isSelf?: boolean;
  onSelectUser?: (user: User, anchor?: any) => void;
  onVolumeChange?: (userId: string, volume: number) => void;
  onToggleFullscreen?: (userId: string, streamType: 'screen' | 'video') => void;
  lang?: 'en' | 'ar';
}

export const ParticipantTile: React.FC<ParticipantTileProps> = React.memo(({
  participant,
  isSelf = false,
  onSelectUser,
  onVolumeChange,
  onToggleFullscreen,
  lang = 'en',
}) => {
  const isAr = lang === 'ar';
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showStreamEndedToast, setShowStreamEndedToast] = useState(false);

  const { activeRoom, switchCamera } = useRealtimeMedia();
  const serverId = activeRoom?.serverId;

  const volumeBtnRef = useRef<HTMLButtonElement | null>(null);

  const activeVideoStream = (participant.isScreenSharing && participant.screenStream)
    ? participant.screenStream
    : (participant.isCameraEnabled && participant.videoStream)
    ? participant.videoStream
    : null;

  // Stream tracking & grace period for transient disconnects
  const lastValidStreamRef = useRef<MediaStream | null>(activeVideoStream);
  const [isReconnectingStream, setIsReconnectingStream] = useState(false);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeVideoStream) {
      lastValidStreamRef.current = activeVideoStream;
      setIsReconnectingStream(false);
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    } else {
      // If camera or screen sharing is disabled intentionally by participant state, clear without reconnect overlay
      if (!participant.isCameraEnabled && !participant.isScreenSharing) {
        lastValidStreamRef.current = null;
        setIsReconnectingStream(false);
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
      } else if (lastValidStreamRef.current) {
        // Transient loss while camera or screen share is marked enabled
        setIsReconnectingStream(true);
        if (!disconnectTimerRef.current) {
          disconnectTimerRef.current = setTimeout(() => {
            setIsReconnectingStream(false);
            setShowStreamEndedToast(true);
            setTimeout(() => setShowStreamEndedToast(false), 4000);
            lastValidStreamRef.current = null;
            disconnectTimerRef.current = null;
          }, 4000);
        }
      }
    }

    return () => {
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
      }
    };
  }, [activeVideoStream, participant.isCameraEnabled, participant.isScreenSharing]);

  // Resolve participant avatar URL
  const resolvedAvatarUrl = useMemo(() => {
    const user = participant.userRef || pbService.getCachedUser(participant.userId) || { id: participant.userId };
    const member = serverId && participant.userId ? pbService.getCachedServerMember(serverId, participant.userId) : null;
    const urlFromMemberOrUser = getServerMemberAvatarUrl(member, user, serverId);
    if (urlFromMemberOrUser) {
      return urlFromMemberOrUser;
    }

    if (participant.avatar) {
      if (participant.avatar.startsWith('http') || participant.avatar.startsWith('blob:') || participant.avatar.startsWith('data:')) {
        return participant.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${participant.userId}/${participant.avatar}`;
    }

    return '';
  }, [participant.userId, participant.avatar, participant.userRef, serverId]);

  const resolvedDisplayName = useMemo(() => {
    const user = participant.userRef || pbService.getCachedUser(participant.userId);
    const member = serverId && participant.userId ? pbService.getCachedServerMember(serverId, participant.userId) : null;
    return (member && member.member_name) || user?.display_name || participant.displayName || user?.username || participant.username || 'User';
  }, [participant.userId, participant.displayName, participant.username, participant.userRef, serverId]);

  const isReconnecting = isReconnectingStream || participant.connectionState === 'reconnecting' || participant.isPendingDisconnect;
  const currentStream = activeVideoStream || lastValidStreamRef.current;
  const isScreenShareStream = !!(participant.isScreenSharing || (lastValidStreamRef.current && participant.screenStream === lastValidStreamRef.current));

  return (
    <>
      <div
        className={`relative flex flex-col items-center justify-center p-2 rounded-2xl border transition-all duration-200 overflow-hidden select-none bg-[var(--theme-bg-secondary)] w-full h-full min-h-[180px] aspect-video sm:min-h-[220px] ${
          participant.isSpeaking
            ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/50'
            : 'border-[var(--theme-border)] hover:border-[var(--theme-border-hover)]'
        }`}
      >
        {/* Stream View Container using unified VideoPlayer */}
        {currentStream ? (
          <div className="absolute inset-0 bg-black flex items-center justify-center group overflow-hidden w-full h-full">
            <VideoPlayer
              stream={currentStream}
              participantName={resolvedDisplayName}
              participantAvatar={resolvedAvatarUrl}
              isSelf={isSelf}
              isScreenShare={isScreenShareStream}
              facingMode={participant.facingMode || 'user'}
              fit={isScreenShareStream ? 'contain' : 'cover'}
              isReconnecting={isReconnecting}
              lang={lang}
              onSwitchCamera={isSelf && !isScreenShareStream ? switchCamera : undefined}
              onToggleDiagnostics={() => setShowDiagnostics(true)}
              showInlineControls={true}
            />

            {/* Badge for Screen Sharing */}
            {isScreenShareStream && (
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-accent text-[var(--theme-accent-contrast,#ffffff)] text-[10px] font-bold flex items-center gap-1 shadow z-10 pointer-events-none">
                <ScreenShare className="w-3 h-3" />
                <span>{isAr ? 'مشاركة الشاشة' : 'Screen Share'}</span>
              </div>
            )}
          </div>
        ) : participant.isScreenSharing && !participant.screenStream ? (
          <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center gap-2 group overflow-hidden p-4 text-center z-10">
            <div className="p-3 rounded-full bg-accent/20 border border-accent/40 text-accent animate-pulse">
              <RotateCw className="w-6 h-6 animate-spin" />
            </div>
            <div className="text-xs font-bold text-slate-200">{isAr ? 'جاري تحميل مشاركة الشاشة...' : 'Loading Screen Share...'}</div>
          </div>
        ) : (
          /* Avatar View */
          <div
            onClick={(e) => onSelectUser && onSelectUser(participant.userRef, e.currentTarget)}
            className="relative cursor-pointer transition-transform hover:scale-105 active:scale-95 flex flex-col items-center"
          >
            {showStreamEndedToast && (
              <div className="absolute -top-7 px-2.5 py-1 rounded-full bg-slate-900/90 border border-amber-500/50 text-amber-400 text-[10px] font-bold shadow-lg animate-bounce z-20">
                {isAr ? 'انتهى البث' : 'Stream Ended'}
              </div>
            )}
            {participant.isSpeaking && (
              <div className="absolute -inset-3 rounded-full border-2 border-emerald-500 animate-ping opacity-60 pointer-events-none" />
            )}
            <Avatar
              src={resolvedAvatarUrl}
              username={resolvedDisplayName}
              size="xl"
              className={`relative shadow-lg ${
                participant.isSpeaking ? 'ring-4 ring-emerald-500' : ''
              }`}
            />
          </div>
        )}

        {/* Participant Name & Status Badges */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1 px-2.5 py-1 rounded-xl bg-black/85 text-white text-xs border border-white/10 shadow-sm z-10 pointer-events-auto">
          <span
            onClick={(e) => onSelectUser && onSelectUser(participant.userRef, e.currentTarget)}
            className="truncate font-medium cursor-pointer hover:underline text-[11px]"
          >
            {resolvedDisplayName} {isSelf && (isAr ? '(أنت)' : '(You)')}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Ping Indicator Badge */}
            <span
              title={isAr ? `سرعة الاستجابة: ${participant.pingMs || 22} مللي ثانية` : `Ping / Latency: ${participant.pingMs || 22} ms`}
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 border shrink-0 ${
                (participant.pingMs || 22) < 50
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : (participant.pingMs || 22) < 120
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-red-500/20 text-red-400 border-red-500/40'
              }`}
            >
              <Wifi className="w-2.5 h-2.5" />
              <span>{participant.pingMs || 22}ms</span>
            </span>

            {/* Microphone Muted Badge */}
            {participant.isMuted && (
              <span title={isAr ? 'المايك مكتوم' : 'Microphone Muted'} className="p-1 rounded-md bg-red-500/80 text-white">
                <MicOff className="w-3 h-3" />
              </span>
            )}

            {/* Deafened Badge */}
            {participant.isDeafened && (
              <span title={isAr ? 'الصوت معطل' : 'Deafened'} className="p-1 rounded-md bg-red-500/80 text-white">
                <Headphones className="w-3 h-3" />
              </span>
            )}

            {/* Per-user local volume trigger */}
            {!isSelf && onVolumeChange && (
              <>
                <button
                  ref={volumeBtnRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowVolumeSlider(!showVolumeSlider);
                  }}
                  className="p-1 rounded-md hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
                  title={`${isAr ? 'مستوى الصوت: ' : 'Volume: '}${participant.volume}%`}
                >
                  <Volume2 className="w-3 h-3" />
                </button>

                <VolumeSliderPortal
                  isOpen={showVolumeSlider}
                  triggerRef={volumeBtnRef}
                  volume={participant.volume ?? 100}
                  displayName={resolvedDisplayName}
                  isAr={isAr}
                  onChange={(newVol) => onVolumeChange(participant.userId, newVol)}
                  onClose={() => setShowVolumeSlider(false)}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Diagnostics Overlay */}
      {showDiagnostics && (
        <ParticipantDiagnosticsOverlay
          userId={participant.userId}
          displayName={resolvedDisplayName}
          lang={lang}
          onClose={() => setShowDiagnostics(false)}
        />
      )}
    </>
  );
});

export default ParticipantTile;
