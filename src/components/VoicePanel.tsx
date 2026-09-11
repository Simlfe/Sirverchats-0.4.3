import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Channel, User, Message } from '../types';
import { MediaParticipant } from '../types/media';
import {
  Mic,
  MicOff,
  Headphones,
  Radio,
  Video,
  VideoOff,
  ScreenShare,
  LogOut,
  Volume2,
  AlertTriangle,
  Menu,
  PhoneCall,
  PhoneOff,
  Loader2,
  Users,
  Sparkles,
  ShieldCheck,
  MessageSquare,
  X,
  Send,
  Image as ImageIcon,
  SlidersHorizontal,
  RotateCw,
} from 'lucide-react';
import useRealtimeMedia from '../context/MediaContextBridge';
import ParticipantTile from './ParticipantTile';
import VideoPlayer from './video/VideoPlayer';
import AudioMixerModal from './AudioMixerModal';
import { checkAndRequestMicrophonePermission, checkAndRequestCameraPermission } from '../utils/permissions';
import { pbService } from '../pocketbase';
import Avatar from './Avatar';
import voicePresenceStore, { VoiceParticipantInfo } from '../services/voicePresenceStore';
import { audioMixer } from '../services/audioMixer';

interface VoicePanelProps {
  channel: Channel;
  currentUser: User;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  t: (key: string) => string;
  lang?: 'en' | 'ar';
  onSelectUser?: (user: User, anchor?: any) => void;
  theme?: string;
  onToggleSidebar?: () => void;
  initialMode?: 'voice' | 'video' | 'screen';
  channelsDrawer?: React.ReactNode;
}

function VoicePanel({
  channel,
  currentUser,
  onLeave,
  t,
  lang = 'en',
  onSelectUser,
  theme,
  onToggleSidebar,
  initialMode = 'voice',
  channelsDrawer,
}: VoicePanelProps) {
  const isAr = lang === 'ar';
  const {
    activeRoom,
    participants,
    connectionState,
    isMuted,
    isDeafened,
    isCameraEnabled,
    isScreenSharing,
    formattedDuration,
    error,
    joinVoiceRoom,
    leaveRoomOrCall,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    switchCamera,
    toggleScreenShare,
    setParticipantVolume,
    clearError,
  } = useRealtimeMedia();

  const [selectedMode, setSelectedMode] = useState<'voice' | 'video' | 'screen'>('voice');
  const [isAttemptingJoin, setIsAttemptingJoin] = useState(false);
  const [isAudioMixerOpen, setIsAudioMixerOpen] = useState(false);
  const [fullscreenTarget, setFullscreenTarget] = useState<{ userId: string; streamType?: 'screen' | 'video' } | null>(null);
  const [, setVoicePresenceTick] = useState(0);

  const isConnectedToThisChannel =
    activeRoom !== null &&
    activeRoom.roomId === channel.id &&
    connectionState === 'connected';

  const isConnectingToThisChannel =
    isAttemptingJoin ||
    (activeRoom !== null &&
      activeRoom.roomId === channel.id &&
      (connectionState === 'connecting' || connectionState === 'joining'));

  const isConnectedToOtherChannel =
    activeRoom !== null &&
    activeRoom.roomId !== channel.id &&
    connectionState === 'connected';

  const hasAutoJoinedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = voicePresenceStore.subscribe(() => {
      setVoicePresenceTick((t) => t + 1);
    });
    return () => unsub();
  }, []);

  // Auto-join on channel switch/click if not currently connected
  useEffect(() => {
    if (
      channel &&
      currentUser &&
      !isConnectedToThisChannel &&
      !isConnectingToThisChannel &&
      !hasAutoJoinedRef.current[channel.id]
    ) {
      hasAutoJoinedRef.current[channel.id] = true;
      joinVoiceRoom(channel, currentUser, 'voice').catch((err) => {
        console.error('Failed auto-joining voice channel:', err);
      });
    }
  }, [channel.id, isConnectedToThisChannel, isConnectingToThisChannel, currentUser, joinVoiceRoom]);

  const handleRetryPermissions = async () => {
    clearError();
    const micRes = await checkAndRequestMicrophonePermission();
    const camRes = await checkAndRequestCameraPermission();
    if (micRes.granted) {
      handleJoin();
    }
  };

  const handleJoinListenOnly = async () => {
    setIsAttemptingJoin(true);
    clearError();
    try {
      await joinVoiceRoom(channel, currentUser, 'voice', { listenOnly: true });
    } catch (e) {
      console.error('Failed to join voice channel in listen-only mode:', e);
    } finally {
      setIsAttemptingJoin(false);
    }
  };
  
  // Voice Text Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load and subscribe to real-time voice channel text messages
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const initChat = async () => {
      try {
        const response = await pbService.fetchMessages(channel.id);
        setMessages(response.items || []);
      } catch (err) {
        console.warn('Failed to load voice channel text messages:', err);
      }

      try {
        unsubscribe = await pbService.subscribeToMessages(channel.id, (data) => {
          if (data.action === 'create' && data.record) {
            const newMsg = data.record as Message;
            setMessages((prev) => [...prev.filter((m) => m.id !== newMsg.id), newMsg]);

            if (!isChatOpen && (newMsg.sender || (newMsg as any).sender_id) !== currentUser.id) {
              setUnreadCount((prev) => prev + 1);
            }
          }
        });
      } catch (err) {
        console.warn('Failed to subscribe to voice channel text messages:', err);
      }
    };

    initChat();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel.id, currentUser.id]);

  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isChatOpen, messages.length]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessageText.trim() || isSendingMessage) return;

    const content = newMessageText.trim();
    setNewMessageText('');
    setIsSendingMessage(true);

    try {
      await pbService.sendMessage(channel.id, content);
    } catch (err) {
      console.error('Failed to send voice chat message:', err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await pbService.sendMessage(channel.id, `[Image Attachment: ${file.name}]`, undefined, true);
    } catch (err) {
      console.error('Failed to upload image to voice chat:', err);
    }
  };

  const handleJoin = async () => {
    setIsAttemptingJoin(true);
    try {
      await joinVoiceRoom(channel, currentUser, 'voice');
    } catch (e) {
      console.error('Failed to join voice channel:', e);
    } finally {
      setIsAttemptingJoin(false);
    }
  };

  const handleLeaveRoom = async () => {
    await leaveRoomOrCall();
    onLeave();
  };

  const isLight = theme === 'light';

  const themeClasses: any = {
    panelBg: 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)]',
    titleText: 'text-[var(--theme-text-primary)]',
    buttonGroupBg: 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]',
    cardBg: 'bg-[var(--theme-bg-card)] border-[var(--theme-border)]',
  };

  // Source of truth for channel members: union of voicePresenceStore & mediaParticipants
  const displayParticipants: MediaParticipant[] = useMemo(() => {
    const presenceParticipants = voicePresenceStore.getChannelParticipants(channel.id);
    const presenceMap = new Map<string, VoiceParticipantInfo>();
    presenceParticipants.forEach((p) => presenceMap.set(p.userId, p));

    const mediaParticipantsMap = new Map<string, MediaParticipant>();
    participants.forEach((p) => mediaParticipantsMap.set(p.userId, p));

    // Active media participants (excluding those pending disconnection or marked disconnected)
    const activeMediaParticipants = participants.filter(
      (p) => !p.isPendingDisconnect && p.connectionState !== 'disconnected'
    );

    // Union of participant user IDs:
    // When a user leaves, presence removes them immediately.
    // If a user is not in presence AND their media is pending disconnect / disconnected, they should not appear in the grid.
    const allUserIds = new Set<string>([
      ...presenceParticipants.map((p) => p.userId),
      ...activeMediaParticipants.map((p) => p.userId),
    ]);

    const list: MediaParticipant[] = Array.from(allUserIds)
      .map((userId) => {
        const pres = presenceMap.get(userId);
        const mediaP = mediaParticipantsMap.get(userId);

        const displayName = pres?.displayName || mediaP?.displayName || mediaP?.username || 'User';
        const avatar = pres?.avatar || mediaP?.avatar || '';
        const joinedAt = pres?.joinedAt || mediaP?.joinedAt || 0;

        return {
          userId,
          username: displayName,
          displayName,
          avatar,
          isMuted: mediaP !== undefined ? mediaP.isMuted : (pres?.isMuted ?? false),
          isDeafened: mediaP !== undefined ? (mediaP.isDeafened || false) : (pres?.isDeafened || false),
          isSpeaking: mediaP !== undefined ? mediaP.isSpeaking : (pres?.isSpeaking ?? false),
          isCameraEnabled: mediaP?.videoStream ? true : (mediaP !== undefined ? (mediaP.isCameraEnabled || false) : (pres?.isCameraEnabled ?? false)),
          isScreenSharing: mediaP?.screenStream ? true : (mediaP !== undefined ? (mediaP.isScreenSharing || false) : (pres?.isScreenSharing ?? false)),
          connectionState: mediaP !== undefined ? mediaP.connectionState : 'connected',
          volume: audioMixer.getParticipantVolume(userId),
          roomId: channel.id,
          userRef: pres?.userRef || mediaP?.userRef || { id: userId, username: displayName },
          joinedAt,
          videoStream: mediaP?.videoStream || null,
          screenStream: mediaP?.screenStream || null,
          audioStream: mediaP?.audioStream || null,
          isPendingDisconnect: mediaP?.isPendingDisconnect || false,
        };
      })
      .filter((p) => {
        // If participant has left the channel's presence and is flagged as pending disconnect or disconnected, do not display
        if (!presenceMap.has(p.userId) && (p.isPendingDisconnect || p.connectionState === 'disconnected')) {
          return false;
        }
        return true;
      });

    // Stable ordering: sort by joinedAt ascending, then userId ascending
    return list.sort((a, b) => {
      const timeDiff = (a.joinedAt || 0) - (b.joinedAt || 0);
      if (timeDiff !== 0) return timeDiff;
      return a.userId.localeCompare(b.userId);
    });
  }, [channel.id, participants]);

  // Determine grid columns based on participant count (up to 8 max)
  const participantCount = displayParticipants.length;
  let gridColsClass = 'grid-cols-1';
  if (participantCount === 2) {
    gridColsClass = 'grid-cols-1 sm:grid-cols-2';
  } else if (participantCount >= 3 && participantCount <= 4) {
    gridColsClass = 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2';
  } else if (participantCount >= 5) {
    gridColsClass = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
  }

  // 1. CONNECTED STATE: Show Active Voice Stage + Optional Side Chat Panel
  if (isConnectedToThisChannel) {
    return (
      <div
        className={`flex-1 flex min-w-0 h-full select-none relative overflow-hidden transition-colors duration-300 ${themeClasses.panelBg}`}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Main Stage */}
        <div className="flex-1 flex flex-col min-w-0 h-full p-4 sm:p-6 relative">
          {/* Background ambience overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.04),transparent_70%)] pointer-events-none" />

          {/* Header Bar */}
          <div 
            className="flex justify-between items-center mb-4 sm:mb-6 shrink-0 z-10"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div>
              <div className="flex items-center gap-2 text-accent font-bold text-xs uppercase tracking-wider">
                <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
                <span className="text-emerald-500 font-extrabold">{t('voice_connected')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-mono font-bold">
                  {formattedDuration}
                </span>
              </div>

              <div className="flex items-center gap-2.5 mt-1">
                {onToggleSidebar && (
                  <button
                    type="button"
                    onClick={onToggleSidebar}
                    className={`md:hidden p-1.5 rounded-lg transition-all border cursor-pointer ${
                      isLight
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
                    }`}
                    title={isAr ? 'القائمة' : 'Toggle Menu'}
                  >
                    <Menu className="w-4 h-4" />
                  </button>
                )}
                <h2 className={`text-lg sm:text-xl font-bold ${themeClasses.titleText}`}>
                  {channel.name}
                </h2>
              </div>
            </div>

            {/* Status Badges & Chat Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-semibold font-mono ${themeClasses.buttonGroupBg}`}>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="uppercase text-emerald-400 font-bold">{isAr ? 'متصل' : 'Connected'}</span>
                <span className="text-[var(--theme-text-muted)]">|</span>
                <span className="text-accent font-bold">{participantCount}{isAr ? '/8 كحد أقصى' : '/8 Max'}</span>
              </div>

              {/* Voice Chat Toggle Button */}
              <button
                type="button"
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`relative p-2.5 rounded-xl border transition-all cursor-pointer font-bold flex items-center gap-1.5 text-xs ${
                  isChatOpen
                    ? 'bg-accent border-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-md'
                    : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
                title={isAr ? 'المحادثة النصية' : 'Toggle Voice Text Chat'}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden md:inline">{isAr ? 'المحادثة النصية' : 'Voice Chat'}</span>
                {unreadCount > 0 && !isChatOpen && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce shadow">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Android / Audio Permission Error Alert Banner */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 text-xs flex items-center justify-between gap-2 shrink-0 z-20">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="truncate">{error.message}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {error.code === 'PERMISSION_DENIED' && (
                  <button
                    type="button"
                    onClick={handleRetryPermissions}
                    className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 font-bold cursor-pointer text-xs transition-colors"
                  >
                    {isAr ? 'منح الإذن وإعادة المحاولة' : 'Grant & Retry'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearError}
                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 font-bold cursor-pointer text-xs transition-colors"
                >
                  {isAr ? 'تجاهل' : 'Dismiss'}
                </button>
              </div>
            </div>
          )}

          {/* Participant Grid Stage (Max 8 participants) */}
          <div className={`flex-1 min-h-0 grid ${gridColsClass} gap-3 sm:gap-4 items-stretch justify-center z-10 overflow-y-auto pr-1`}>
            {displayParticipants.map((p) => (
              <ParticipantTile
                key={p.userId}
                participant={p}
                isSelf={p.userId === currentUser.id}
                onSelectUser={onSelectUser}
                onVolumeChange={setParticipantVolume}
                onToggleFullscreen={(userId, streamType) => setFullscreenTarget({ userId, streamType })}
                lang={lang}
              />
            ))}
          </div>

          {/* Interactive Controls Bar */}
          <div className={`mt-2 sm:mt-4 md:mt-6 py-2 sm:py-3 px-2 sm:px-4 md:px-6 border rounded-2xl flex items-center justify-center md:justify-between gap-1.5 sm:gap-3 z-10 shrink-0 max-w-full overflow-x-auto scrollbar-none ${themeClasses.buttonGroupBg}`}>
            {/* Active Members Counter */}
            <div className="hidden md:flex items-center gap-2 text-xs text-[var(--theme-text-muted)] shrink-0">
              <span className="font-medium">
                {isAr
                  ? `${participantCount} ${participantCount === 1 ? 'عضو نشط' : 'أعضاء نشطون'}`
                  : `${participantCount} ${participantCount === 1 ? 'participant' : 'participants'} active`}
              </span>
            </div>

            {/* Center Operational Control Buttons */}
            <div className="flex items-center justify-center gap-1 sm:gap-2 md:gap-3 flex-nowrap shrink-0">
              {/* Mute Button */}
              <button
                type="button"
                onClick={toggleMute}
                title={isAr ? (isMuted ? 'إلغاء كتم المايك' : 'كتم المايك') : (isMuted ? 'Unmute Mic' : 'Mute Mic')}
                className={`p-2 sm:p-2.5 md:p-3 rounded-xl transition-all border cursor-pointer active:scale-95 shrink-0 ${
                  isMuted
                    ? 'bg-red-500/15 border-red-500/30 text-red-500 hover:bg-red-500/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> : <Mic className="w-4 h-4 sm:w-4.5 sm:h-4.5" />}
              </button>

              {/* Deafen Button */}
              <button
                type="button"
                onClick={toggleDeafen}
                title={isAr ? (isDeafened ? 'تمكين الصوت' : 'تعطيل الصوت') : (isDeafened ? 'Undeafen Sound' : 'Deafen Sound')}
                className={`p-2 sm:p-2.5 md:p-3 rounded-xl transition-all border cursor-pointer active:scale-95 shrink-0 ${
                  isDeafened
                    ? 'bg-red-500/15 border-red-500/30 text-red-500 hover:bg-red-500/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
              >
                <Headphones className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              {/* Camera Button */}
              <button
                type="button"
                onClick={toggleCamera}
                title={isAr ? (isCameraEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا') : (isCameraEnabled ? 'Turn Off Camera' : 'Turn On Camera')}
                className={`p-2 sm:p-2.5 md:p-3 rounded-xl transition-all border cursor-pointer active:scale-95 shrink-0 ${
                  isCameraEnabled
                    ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
              >
                {isCameraEnabled ? <Video className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> : <VideoOff className="w-4 h-4 sm:w-4.5 sm:h-4.5" />}
              </button>

              {/* Flip Camera Button (when camera is enabled) */}
              {isCameraEnabled && (
                <button
                  type="button"
                  onClick={() => switchCamera()}
                  title={isAr ? 'تبديل الكاميرا (أمامية/خلفية)' : 'Flip Camera (Front/Rear)'}
                  className="p-2 sm:p-2.5 md:p-3 rounded-xl transition-all border cursor-pointer active:scale-95 shrink-0 bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]"
                >
                  <RotateCw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
              )}

              {/* Screen Share Button */}
              <button
                type="button"
                onClick={toggleScreenShare}
                title={isAr ? (isScreenSharing ? 'إيقاف مشاركة الشاشة' : 'بدء مشاركة الشاشة') : (isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share')}
                className={`p-2 sm:p-2.5 md:p-3 rounded-xl transition-all border cursor-pointer active:scale-95 shrink-0 ${
                  isScreenSharing
                    ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
              >
                <ScreenShare className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              {/* Audio Mixer Controls Trigger */}
              <button
                type="button"
                onClick={() => setIsAudioMixerOpen(true)}
                title={isAr ? 'موزع الصوت' : 'Open Audio Mixer'}
                className={`p-2 sm:p-2.5 md:p-3 rounded-xl transition-all border cursor-pointer active:scale-95 shrink-0 ${
                  isAudioMixerOpen
                    ? 'bg-accent/15 border-accent/30 text-accent hover:bg-accent/25'
                    : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:border-[var(--theme-border-hover)]'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>
            </div>

            {/* Leave Room Button */}
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="p-2 px-2.5 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-xs text-white transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1 sm:gap-1.5 border-0 shrink-0"
            >
              <LogOut className="w-4 h-4 shrink-0 ltr:rotate-180" />
              <span className="hidden sm:inline">{t('leave_call')}</span>
            </button>
          </div>
        </div>

        {/* Voice Channel Collapsible Text Chat Panel */}
        {isChatOpen && (
          <div className="w-full md:w-80 lg:w-96 h-full bg-[var(--theme-bg-secondary)] flex flex-col z-20 shrink-0 shadow-2xl animate-fadeIn">
            {/* Chat Panel Header */}
            <div className="p-3 sm:p-4 flex items-center justify-between shrink-0 bg-[var(--theme-bg-tertiary)]/50">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-accent" />
                <span className="font-bold text-xs sm:text-sm text-[var(--theme-text-primary)]">
                  {isAr ? `المحادثة النصية - #${channel.name}` : `Voice Chat - #${channel.name}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[var(--theme-text-muted)]">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-accent" />
                  <p className="text-xs font-medium">
                    {isAr ? 'لا توجد رسائل نصية في هذه الغرفة الصوتية بعد.' : 'No text messages in this voice room yet.'}
                  </p>
                  <p className="text-[10px] opacity-70 mt-1">
                    {isAr ? 'أرسل رسالة للدردشة المباشرة أثناء المكالمة.' : 'Send a message to chat live during your call.'}
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_id === currentUser.id;
                  const senderUser = msg.expand?.sender || pbService.getCachedUser(msg.sender_id);
                  const senderName = senderUser?.display_name || senderUser?.username || msg.sender_name || 'User';
                  const avatarUrl = senderUser?.avatar
                    ? (senderUser.avatar.startsWith('http') || senderUser.avatar.startsWith('blob:') || senderUser.avatar.startsWith('data:')
                      ? senderUser.avatar
                      : `${pbService.getServerUrl()}/api/files/users/${senderUser.id}/${senderUser.avatar}`)
                    : '';

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 text-xs ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <Avatar src={avatarUrl} username={senderName} size="sm" className="shrink-0 mt-0.5" />
                      <div className={`max-w-[80%] space-y-1 ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-1.5 px-1">
                          <span className="font-bold text-[10px] text-[var(--theme-text-muted)]">
                            {senderName}
                          </span>
                        </div>
                        <div
                          className={`p-2.5 rounded-2xl break-words text-xs ${
                            isMine
                              ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] rounded-tr-xs'
                              : 'bg-[var(--theme-bg-card)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] rounded-tl-xs'
                          }`}
                        >
                          {msg.content}
                          {msg.file_url && (
                            <img
                              src={msg.file_url}
                              alt="attachment"
                              className="mt-2 max-h-40 rounded-lg object-cover border border-white/20"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] shrink-0 flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl text-[var(--theme-text-muted)] hover:text-accent hover:bg-[var(--theme-bg-secondary)] transition-colors cursor-pointer"
                title={isAr ? 'إرفاق صورة' : 'Attach Image'}
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <input
                type="text"
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                placeholder={isAr ? 'اكتب رسالة للمحادثة الصوتية...' : 'Message voice chat...'}
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent"
              />

              <button
                type="submit"
                disabled={!newMessageText.trim() || isSendingMessage}
                className="p-2 rounded-xl bg-accent hover:opacity-90 disabled:opacity-40 text-[var(--theme-accent-contrast,#ffffff)] transition-all cursor-pointer font-bold border-0"
              >
                <Send className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
              </button>
            </form>
          </div>
        )}

        {/* Audio Mixer Modal */}
        <AudioMixerModal
          isOpen={isAudioMixerOpen}
          onClose={() => setIsAudioMixerOpen(false)}
          participants={participants}
          currentUser={currentUser}
          lang={lang}
        />
      </div>
    );
  }

  // 2. CONNECTING STATE: Show Loading Stage
  if (isConnectingToThisChannel) {
    return (
      <div
        className={`flex-1 flex flex-col items-center justify-center min-w-0 h-full p-6 select-none relative overflow-hidden ${themeClasses.panelBg}`}
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <div className="flex flex-col items-center justify-center p-8 rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] max-w-sm w-full text-center shadow-2xl space-y-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center text-accent animate-pulse">
              <Radio className="w-8 h-8 text-accent animate-spin" />
            </div>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[var(--theme-text-primary)]">
              {isAr ? 'جاري الاتصال بالصوت...' : 'Connecting to Voice...'}
            </h3>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1">
              {isAr ? 'الانضمام إلى ' : 'Joining '}
              <span className="text-accent font-bold">{channel.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-accent font-mono">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{isAr ? 'جاري إنشاء جلسة الاتصال...' : 'Establishing media session...'}</span>
          </div>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="mt-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs border border-red-500/30 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>{isAr ? 'قطع الاتصال' : 'Disconnect'}</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. DISCONNECTED / PREVIEW STATE: Show "Join Voice" Gateway
  return (
    <div
      className={`flex-1 flex flex-col min-w-0 h-full p-4 sm:p-6 select-none relative overflow-hidden transition-colors duration-300 ${themeClasses.panelBg}`}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(123,174,55,0.08),transparent_60%)] pointer-events-none" />

      {/* Header Bar */}
      <div 
        className="flex justify-between items-center mb-6 shrink-0 z-10"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-2.5">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={`md:hidden p-1.5 rounded-lg transition-all border cursor-pointer ${
                isLight
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
              }`}
              title={isAr ? 'القائمة' : 'Toggle Menu'}
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2 text-[var(--theme-text-muted)] font-bold text-xs uppercase tracking-wider">
              <Radio className="w-3.5 h-3.5 text-slate-500" />
              <span>{isAr ? 'قناة صوتية' : 'Voice Channel'}</span>
            </div>
            <h2 className={`text-xl font-bold ${themeClasses.titleText}`}>
              {channel.name}
            </h2>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] text-[10px] font-mono text-[var(--theme-text-muted)]">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span>{isAr ? 'غير متصل' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Main Join Gateway Stage */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 p-4">
        <div className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border ${themeClasses.cardBg} shadow-2xl flex flex-col items-center text-center space-y-6 relative overflow-hidden`}>
          {/* Decorative Icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shadow-inner">
              <Volume2 className="w-10 h-10 text-accent" />
            </div>
            <span className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>

          {/* Title & Info */}
          <div className="space-y-1.5 max-w-xs">
            <h3 className="text-xl font-black text-[var(--theme-text-primary)]">
              {channel.name}
            </h3>
            <p className="text-xs text-[var(--theme-text-muted)] leading-relaxed">
              {channel.description || (isAr ? 'غرفة صوتية جاهزة للمكالمات الجماعية ومشاركة الشاشة والجلسات الصوتية.' : 'Voice room ready for group calls, screen sharing, and audio sessions.')}
            </p>
          </div>

          {/* Switch Warning if Connected Elsewhere */}
          {isConnectedToOtherChannel && (
            <div className="w-full p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-[11px] text-left">
                {isAr ? 'الانضمام سيؤدي لقطع الاتصال عن ' : 'Joining will disconnect you from '}
                <strong className="font-bold">{activeRoom?.roomName}</strong>.
              </span>
            </div>
          )}

          {/* Active Participants Preview */}
          {(() => {
            const activeMembers = voicePresenceStore.getChannelParticipants(channel.id);
            if (activeMembers.length === 0) return null;
            return (
              <div className="w-full space-y-2 pt-2 border-t border-[var(--theme-border)] text-left">
                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-[var(--theme-text-muted)] tracking-wider">
                  <span>{isAr ? `في الغرفة (${activeMembers.length})` : `In Room (${activeMembers.length})`}</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
                    <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
                    {isAr ? 'مباشر' : 'Live'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {activeMembers.map((m) => (
                    <div key={m.userId} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs">
                      <Avatar src={m.avatar || ''} username={m.displayName} size="xs" className="w-4 h-4 text-[8px]" />
                      <span className="font-bold text-[11px] text-[var(--theme-text-primary)]">{m.displayName}</span>
                      {m.isMuted ? <MicOff className="w-3 h-3 text-red-400 shrink-0" /> : <Mic className="w-3 h-3 text-emerald-400 shrink-0 animate-pulse" />}
                      {m.isDeafened && <Headphones className="w-3 h-3 text-red-400 shrink-0" />}
                      {m.isCameraEnabled && <Video className="w-3 h-3 text-emerald-400 shrink-0 animate-pulse" />}
                      {m.isScreenSharing && (
                        <span className="px-1 py-0.2 rounded text-[8px] bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-extrabold flex items-center gap-0.5">
                          <ScreenShare className="w-2 h-2" />
                          {isAr ? 'مباشر' : 'Live'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Permission or Connection Error Alert Banner */}
          {error && (
            <div className="w-full p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-500 text-xs flex flex-col gap-2.5">
              <div className="flex items-start gap-2 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span className="text-xs leading-relaxed">{error.message}</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-red-500/20">
                {error.code === 'PERMISSION_DENIED' && (
                  <>
                    <button
                      type="button"
                      onClick={handleRetryPermissions}
                      className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold cursor-pointer text-xs transition-all shadow"
                    >
                      {isAr ? 'منح الإذن وإعادة المحاولة' : 'Grant Permission & Retry'}
                    </button>
                    <button
                      type="button"
                      onClick={handleJoinListenOnly}
                      className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold cursor-pointer text-xs transition-all shadow flex items-center gap-1.5"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>{isAr ? 'انضمام للاستماع فقط' : 'Join Listen-Only'}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={clearError}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[var(--theme-text-secondary)] font-bold cursor-pointer text-xs transition-colors"
                >
                  {isAr ? 'تجاهل' : 'Dismiss'}
                </button>
              </div>
            </div>
          )}

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleJoin}
            disabled={isAttemptingJoin}
            className={`w-full py-3.5 px-6 rounded-2xl bg-accent hover:opacity-90 font-black text-sm text-[var(--theme-accent-contrast,#ffffff)] shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 border-0 ${
              isAttemptingJoin ? 'opacity-75 cursor-wait' : ''
            }`}
          >
            {isAttemptingJoin ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PhoneCall className="w-4 h-4" />
            )}
            <span>
              {isAttemptingJoin
                ? (isAr ? 'جاري الانضمام...' : 'Joining...')
                : isAr
                ? (isConnectedToOtherChannel ? 'الانتقال لهذه القناة' : 'انضمام للصوت')
                : (isConnectedToOtherChannel ? 'Switch to this Channel' : 'Join Voice')}
            </span>
          </button>
        </div>
      </div>

      {/* Persistent Fullscreen Video Overlay for targeted stream */}
      {fullscreenTarget && (
        <FullscreenOverlayContainer
          targetUserId={fullscreenTarget.userId}
          preferredType={fullscreenTarget.streamType || 'screen'}
          displayParticipants={displayParticipants}
          onClose={() => setFullscreenTarget(null)}
          lang={lang}
        />
      )}

      {/* Audio Mixer Modal */}
      <AudioMixerModal
        isOpen={isAudioMixerOpen}
        onClose={() => setIsAudioMixerOpen(false)}
        participants={participants}
        currentUser={currentUser}
        lang={lang}
      />
    </div>
  );
}

const FullscreenOverlayContainer: React.FC<{
  targetUserId: string;
  preferredType: 'screen' | 'video';
  displayParticipants: MediaParticipant[];
  onClose: () => void;
  lang?: 'en' | 'ar';
}> = ({ targetUserId, preferredType, displayParticipants, onClose, lang }) => {
  const participant = displayParticipants.find((p) => p.userId === targetUserId);
  const lastParticipantRef = useRef<MediaParticipant | null>(participant || null);

  if (participant) {
    lastParticipantRef.current = participant;
  }

  const activeParticipant = participant || lastParticipantRef.current;

  useEffect(() => {
    // If the participant is permanently removed (after 5s timeout or explicit leave)
    if (!participant && !lastParticipantRef.current) {
      onClose();
    }
  }, [participant, onClose]);

  if (!activeParticipant) return null;

  const stream = preferredType === 'screen'
    ? (activeParticipant.screenStream || activeParticipant.videoStream)
    : (activeParticipant.videoStream || activeParticipant.screenStream);

  const isReconnecting = activeParticipant.connectionState === 'reconnecting' || activeParticipant.isPendingDisconnect || !stream;
  const isSelf = activeParticipant.userId === pbService.getCurrentUser()?.id;

  const isScreenShare = preferredType === 'screen'
    ? true
    : !!(activeParticipant.isScreenSharing || activeParticipant.screenStream);

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      <VideoPlayer
        stream={stream}
        participantName={activeParticipant.displayName || activeParticipant.username}
        participantAvatar={activeParticipant.avatar}
        isSelf={isSelf}
        isScreenShare={isScreenShare}
        facingMode={activeParticipant.facingMode || 'user'}
        isReconnecting={isReconnecting}
        lang={lang}
        showInlineControls={true}
      />
    </div>
  );
};

export default React.memo(VoicePanel);
