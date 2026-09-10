import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Channel } from '../types';
import {
  MediaParticipant,
  MediaConnectionState,
  RoomConfig,
  IncomingCallEvent,
  MediaError,
  SFUServerConfig,
  SFUProviderAdapter,
  CameraQualityProfile,
  CameraTelemetryData,
} from '../types/media';
import realtimeMediaProvider from '../media/RealtimeMediaProvider';
import callSignalingService from '../services/callSignaling';
import { playJoinSound, playLeaveSound, setRingtoneMuted, getIsRingtoneMuted, stopAllRingtones, unlockAudioContext } from '../lib/sounds';
import { getServerMemberAvatarUrl, getServerMemberDisplayName, pbService, parseChannelOptions, mergeUserRecord } from '../pocketbase';
import { checkAndRequestMicrophonePermission, checkAndRequestCameraPermission, checkAndRequestScreenSharePermission } from '../utils/permissions';
import { voiceSessionRecovery } from '../services/voiceSessionRecovery';
import { recordCallLog } from '../services/callLogService';

interface MediaContextType {
  activeRoom: RoomConfig | null;
  participants: MediaParticipant[];
  connectionState: MediaConnectionState;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  incomingCall: IncomingCallEvent | null;
  outgoingCall: IncomingCallEvent | null;
  isRingMuted: boolean;
  activeCallDuration: number;
  formattedDuration: string;
  error: MediaError | null;
  cameraQualityProfile: CameraQualityProfile;
  cameraTelemetry: CameraTelemetryData | null;
  
  // Actions
  joinVoiceRoom: (
    channel: Channel,
    currentUser: User,
    mode?: 'voice' | 'video' | 'screen',
    options?: { listenOnly?: boolean }
  ) => Promise<void>;
  startDmCall: (targetUser: User, currentUser: User, dmChannel: Channel, mode?: 'voice' | 'video' | 'screen') => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  cancelOutgoingCall: () => void;
  toggleMuteRing: (muted?: boolean) => void;
  leaveRoomOrCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  switchCamera: () => Promise<boolean>;
  switchMicrophone: (deviceId: string) => Promise<boolean>;
  setCameraQualityProfile: (profile: CameraQualityProfile) => void;
  toggleScreenShare: () => Promise<void>;
  setParticipantVolume: (userId: string, volume: number) => void;
  clearError: () => void;
  
  // Infrastructure integration injection methods
  setSFUAdapter: (adapter: SFUProviderAdapter | null) => void;
  setSFUConfig: (config: SFUServerConfig) => void;
}

const MediaContext = createContext<MediaContextType | null>(null);

export const MediaProvider: React.FC<{
  children: React.ReactNode;
  currentUser?: User | null;
}> = ({ children, currentUser: propCurrentUser }) => {
  const [internalUser, setInternalUser] = useState<User | null>(() => propCurrentUser || pbService.getCurrentUser());
  const currentUser = propCurrentUser || internalUser || pbService.getCurrentUser();
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;

  const [activeRoom, setActiveRoom] = useState<RoomConfig | null>(null);
  const [participants, setParticipants] = useState<MediaParticipant[]>([]);
  const [connectionState, setConnectionState] = useState<MediaConnectionState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallEvent | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<IncomingCallEvent | null>(null);
  const [isRingMuted, setIsRingMuted] = useState(false);
  const [activeCallDuration, setActiveCallDuration] = useState(0);
  const [error, setError] = useState<MediaError | null>(null);
  const [cameraQualityProfile, setCameraQualityProfileState] = useState<CameraQualityProfile>(() => {
    return realtimeMediaProvider.getCameraQualityProfile();
  });
  const [cameraTelemetry, setCameraTelemetry] = useState<CameraTelemetryData | null>(null);

  const toggleMuteRing = useCallback((override?: boolean) => {
    setIsRingMuted((prev) => {
      const next = typeof override === 'boolean' ? override : !prev;
      setRingtoneMuted(next);
      return next;
    });
  }, []);

  // Listen to PocketBase auth updates and update currentUser state
  useEffect(() => {
    if (propCurrentUser) {
      setInternalUser(propCurrentUser);
      callSignalingService.setCurrentUser(propCurrentUser);
    } else {
      const current = pbService.getCurrentUser();
      if (current) {
        setInternalUser(current);
        callSignalingService.setCurrentUser(current);
      }
    }

    try {
      const unsub = pbService.getPbInstance().authStore.onChange((token, model) => {
        const user = model ? (model as unknown as User) : pbService.getCurrentUser();
        queueMicrotask(() => {
          setInternalUser(user);
          callSignalingService.setCurrentUser(user);
        });
      });
      return () => {
        if (typeof unsub === 'function') {
          unsub();
        }
      };
    } catch (e) {
      // Fallback
    }
  }, [propCurrentUser]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCameraTelemetry(realtimeMediaProvider.getActiveCameraTelemetry());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const setCameraQualityProfile = useCallback((profile: CameraQualityProfile) => {
    realtimeMediaProvider.setCameraQualityProfile(profile);
    setCameraQualityProfileState(profile);
    setCameraTelemetry(realtimeMediaProvider.getActiveCameraTelemetry());
  }, []);

  const durationTimerRef = useRef<any>(null);
  const activeCallDurationRef = useRef<number>(0);
  const activeCallTargetRef = useRef<{
    callerId: string;
    callerName: string;
    targetUserId: string;
    conversationId: string;
    callType: 'voice' | 'video';
  } | null>(null);
  const joiningRoomIdRef = useRef<string | null>(null);
  const outgoingCallRef = useRef<IncomingCallEvent | null>(outgoingCall);
  outgoingCallRef.current = outgoingCall;
  const incomingCallRef = useRef<IncomingCallEvent | null>(incomingCall);
  incomingCallRef.current = incomingCall;
  const activeRoomRef = useRef<RoomConfig | null>(activeRoom);
  activeRoomRef.current = activeRoom;

  // Sync current user with call signaling & self participant state
  useEffect(() => {
    callSignalingService.setCurrentUser(currentUser);
    if (currentUser && activeRoom) {
      const member = activeRoom.serverId ? pbService.getCachedServerMember(activeRoom.serverId, currentUser.id) : null;
      const avatarUrl =
        getServerMemberAvatarUrl(member, currentUser, activeRoom.serverId) ||
        (currentUser.avatar
          ? currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('blob:') || currentUser.avatar.startsWith('data:')
            ? currentUser.avatar
            : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`
          : '');
      const displayName =
        getServerMemberDisplayName(member, currentUser, activeRoom.serverId) ||
        currentUser.display_name ||
        currentUser.username;

      realtimeMediaProvider.updateSelfParticipant({
        userRef: currentUser,
        avatar: avatarUrl,
        displayName: displayName,
      });
    }
  }, [currentUser, activeRoom]);

  // Subscribe to Media Provider events
  useEffect(() => {
    const unsub = realtimeMediaProvider.subscribe((evt) => {
      queueMicrotask(() => {
        if (evt.type === 'participants_changed' && evt.participants) {
          setParticipants([...evt.participants]);
        } else if (evt.type === 'connection_changed' && evt.connectionState) {
          setConnectionState(evt.connectionState);
        } else if (evt.type === 'error' && evt.error) {
          setError(evt.error);
        } else if (evt.type === 'room_left') {
          setActiveRoom(null);
          setParticipants([]);
          setConnectionState('idle');
          setIsCameraEnabled(false);
          setIsScreenSharing(false);
          setOutgoingCall(null);
          stopDurationTimer();
        }
      });
    });

    return () => unsub();
  }, []);

  // Cleanup media session on page unload
  useEffect(() => {
    const handleUnload = () => {
      stopAllRingtones();
      realtimeMediaProvider.disconnect().catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  // Subscribe to Call Signaling events
  useEffect(() => {
    const unsubSignal = callSignalingService.subscribe(async (event) => {
      queueMicrotask(async () => {
        const activeUser = currentUserRef.current || pbService.getCurrentUser();
        const activeUserId = activeUser?.id;
        const myId = String(activeUserId || '').trim();
        const callerId = String(event.callerId || event.callerUser?.id || '').trim();
        const targetUserId = String(event.targetUserId || event.targetUser?.id || '').trim();

        if (event.state === 'ringing') {
          // If current user is the caller, set outgoingCall
          if (myId && callerId === myId) {
            setOutgoingCall(event);
            setIncomingCall(null);
          } else if (myId && targetUserId === myId && callerId !== myId) {
            setIncomingCall(event);
            setOutgoingCall(null);
          }
        } else if (['declined', 'cancelled', 'ended', 'missed', 'busy', 'timeout'].includes(event.state)) {
          // Log call to chat if not already logged
          const callTarget = activeCallTargetRef.current;
          const dur = activeCallDurationRef.current;
          if (callTarget && (myId === callTarget.callerId || myId === callTarget.targetUserId)) {
            const logStatus =
              event.state === 'declined'
                ? 'declined'
                : event.state === 'cancelled'
                ? 'cancelled'
                : event.state === 'timeout' || event.state === 'missed'
                ? 'missed'
                : dur > 0
                ? 'ended'
                : 'cancelled';

            recordCallLog({
              callId: event.callId,
              conversationId: callTarget.conversationId,
              targetUserId: callTarget.targetUserId,
              callerId: callTarget.callerId,
              callerName: callTarget.callerName,
              callType: callTarget.callType,
              status: logStatus,
              duration: dur,
            }).catch(() => {});
          }

          setIncomingCall((curr) => (curr?.callId === event.callId ? null : curr));
          setOutgoingCall((curr) => {
            if (curr && curr.callId === event.callId) {
              return { ...curr, state: event.state };
            }
            return curr;
          });

          setTimeout(() => {
            setOutgoingCall((curr) => (curr?.callId === event.callId ? null : curr));
          }, 1200);

          const currentRoom = activeRoomRef.current;
          if (currentRoom && (currentRoom.callId === event.callId || currentRoom.roomType === 'dm_call') && ['ended', 'cancelled', 'declined', 'busy'].includes(event.state)) {
            realtimeMediaProvider.leaveRoom().catch(() => {});
            setActiveRoom(null);
            setParticipants([]);
            stopDurationTimer();
          }
        } else if (event.state === 'accepted') {
          // When recipient accepted, if current user is the caller, now connect caller into media room!
          const activeOutgoing = outgoingCallRef.current;
          const isCaller = (myId && callerId === myId) || (activeOutgoing && activeOutgoing.callId === event.callId);

          if (isCaller && activeUser) {
            setOutgoingCall(null);
            const targetUser = activeOutgoing?.targetUser || event.targetUser;
            const config: RoomConfig = {
              roomId: event.conversationId,
              roomName: targetUser ? (targetUser.display_name || targetUser.username) : `@${event.callerName}`,
              roomType: 'dm_call',
              maxParticipants: 2,
              user: activeUser,
              initialMode: event.callType === 'video' ? 'video' : 'voice',
              callId: event.callId,
              channelId: event.conversationId,
            };

            setActiveRoom(config);
            try {
              await realtimeMediaProvider.joinRoom(config);
              if (targetUser) {
                const targetAvatarUrl =
                  getServerMemberAvatarUrl(null, targetUser, undefined) ||
                  (targetUser.avatar
                    ? targetUser.avatar.startsWith('http') || targetUser.avatar.startsWith('blob:') || targetUser.avatar.startsWith('data:')
                      ? targetUser.avatar
                      : `${pbService.getServerUrl()}/api/files/users/${targetUser.id}/${targetUser.avatar}`
                    : '');

                realtimeMediaProvider.addOrUpdateParticipant({
                  userId: targetUser.id,
                  username: targetUser.username,
                  displayName: targetUser.display_name || targetUser.username,
                  avatar: targetAvatarUrl,
                  isMuted: false,
                  isDeafened: false,
                  isSpeaking: false,
                  isCameraEnabled: false,
                  isScreenSharing: false,
                  connectionState: 'connected',
                  volume: 100,
                  roomId: event.conversationId,
                  callId: event.callId,
                  userRef: targetUser,
                  joinedAt: Date.now(),
                });
                setParticipants(realtimeMediaProvider.getParticipants());
              }
              playJoinSound();
              startDurationTimer();
            } catch (joinErr: any) {
              console.warn('[MediaContext] Join room error upon call accept:', joinErr);
              setActiveRoom(null);
              setParticipants([]);
              stopDurationTimer();
              setError({
                code: 'CONNECTION_FAILED',
                message: joinErr?.message || 'Call media session failed to initialize. Please check your network and audio setup.',
              });
            }
          }

          if (incomingCallRef.current && incomingCallRef.current.callId === event.callId) {
            setIncomingCall(null);
          }
        }
      });
    });

    return () => unsubSignal();
  }, []);

  // Call duration counter
  const startDurationTimer = () => {
    stopDurationTimer();
    activeCallDurationRef.current = 0;
    setActiveCallDuration(0);
    durationTimerRef.current = setInterval(() => {
      setActiveCallDuration((prev) => {
        const next = prev + 1;
        activeCallDurationRef.current = next;
        return next;
      });
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    setActiveCallDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  // Join Voice Room (max 8 participants)
  const joinVoiceRoom = useCallback(
    async (
      channel: Channel,
      user: User,
      mode: 'voice' | 'video' | 'screen' = 'voice',
      options?: { listenOnly?: boolean }
    ) => {
      if (joiningRoomIdRef.current === channel.id || (activeRoom && activeRoom.roomId === channel.id)) {
        return;
      }
      joiningRoomIdRef.current = channel.id;
      setConnectionState('connecting');
      try {
        setError(null);

        // Verify microphone runtime permission before joining
        const micPerm = await checkAndRequestMicrophonePermission();
        if (!micPerm.granted && !options?.listenOnly) {
          setError({
            code: 'PERMISSION_DENIED',
            message: micPerm.error || 'Microphone permission was not granted.',
          });
          setConnectionState('disconnected');
          joiningRoomIdRef.current = null;
          return;
        }

        if (!micPerm.granted && options?.listenOnly) {
          realtimeMediaProvider.disableMicrophone();
          setIsMuted(true);
          setError({
            code: 'PERMISSION_DENIED',
            message: 'Joined in listen-only mode. Microphone permission was not granted.',
          });
        }

        // Check channel max user limit
        const opts = parseChannelOptions(channel);
        const userLimit = opts.user_limit || channel.user_limit || 8;
        const currentCount = realtimeMediaProvider.getParticipants().length;
        if (currentCount >= userLimit && activeRoom?.roomId !== channel.id) {
          setError({
            code: 'ROOM_FULL',
            message: `Channel is full (Max limit is ${userLimit} users)`,
          });
          setConnectionState('disconnected');
          joiningRoomIdRef.current = null;
          return;
        }

        if (activeRoom && activeRoom.roomId !== channel.id) {
          if (activeRoom.callId) {
            callSignalingService.endCall(activeRoom.callId);
          }
          await realtimeMediaProvider.leaveRoom();
        }

        const config: RoomConfig = {
          roomId: channel.id,
          roomName: channel.name,
          roomType: 'voice_room',
          maxParticipants: userLimit,
          user,
          initialMode: mode,
          channelId: channel.id,
          serverId: channel.server,
        };

        setActiveRoom(config);
        const parts = await realtimeMediaProvider.joinRoom(config);
        setParticipants(parts);

        // Save session locally for 2-minute recovery window
        voiceSessionRecovery.saveSession({
          channelId: channel.id,
          serverId: channel.server,
          channelName: channel.name,
          userId: user.id,
          joinTimestamp: Date.now(),
          isMuted,
          isDeafened,
          isCameraEnabled,
          isScreenSharing,
          mode,
        });

        playJoinSound();
        startDurationTimer();
      } catch (err: any) {
        console.error('Failed to join voice room:', err);
        setActiveRoom(null);
        setError({
          code: 'SFU_UNAVAILABLE',
          message: err?.message || 'Failed to connect to voice server',
        });
      } finally {
        joiningRoomIdRef.current = null;
      }
    },
    [activeRoom, isMuted, isDeafened, isCameraEnabled, isScreenSharing]
  );

  // Voice Session Recovery Check (within 2-minute window)
  useEffect(() => {
    if (!currentUser) return;
    const session = voiceSessionRecovery.getValidSession();
    if (session && session.userId === currentUser.id && !activeRoom && !joiningRoomIdRef.current) {
      console.log(
        `[VoiceRecovery] Restoring active voice session for channel "${session.channelId}" (joined ${Math.round(
          (Date.now() - session.joinTimestamp) / 1000
        )}s ago)`
      );
      const mockChannel: any = {
        id: session.channelId,
        name: session.channelName || 'Voice Channel',
        server: session.serverId,
      };
      joinVoiceRoom(mockChannel, currentUser, session.mode);
    }
  }, [currentUser, activeRoom, joinVoiceRoom]);

  // Start DM Call (1-to-1)
  const startDmCall = useCallback(
    async (
      targetUser: User,
      currentUserObj: User,
      dmChannel: Channel,
      mode: 'voice' | 'video' | 'screen' = 'voice'
    ) => {
      if (joiningRoomIdRef.current === dmChannel.id || (activeRoom && activeRoom.roomId === dmChannel.id)) {
        return;
      }
      joiningRoomIdRef.current = dmChannel.id;
      try {
        setError(null);
        if (activeRoom && activeRoom.roomId !== dmChannel.id) {
          if (activeRoom.callId) {
            callSignalingService.endCall(activeRoom.callId);
          }
          realtimeMediaProvider.leaveRoom().catch(() => {});
        }

        activeCallDurationRef.current = 0;
        activeCallTargetRef.current = {
          callerId: currentUserObj.id,
          callerName: currentUserObj.display_name || currentUserObj.username,
          targetUserId: targetUser.id,
          conversationId: dmChannel.id,
          callType: mode === 'video' ? 'video' : 'voice',
        };

        const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const callerAvatarUrl =
          getServerMemberAvatarUrl(null, currentUserObj, undefined) ||
          (currentUserObj.avatar
            ? currentUserObj.avatar.startsWith('http') || currentUserObj.avatar.startsWith('blob:') || currentUserObj.avatar.startsWith('data:')
              ? currentUserObj.avatar
              : `${pbService.getServerUrl()}/api/files/users/${currentUserObj.id}/${currentUserObj.avatar}`
            : '');

        const signalEvent: IncomingCallEvent = {
          callId,
          callerId: currentUserObj.id,
          callerName: currentUserObj.display_name || currentUserObj.username,
          callerAvatar: callerAvatarUrl,
          callerUser: currentUserObj,
          targetUser,
          targetUserId: targetUser.id,
          callType: mode === 'video' ? 'video' : 'voice',
          conversationId: dmChannel.id,
          state: 'ringing',
          timestamp: Date.now(),
        };

        // 1. Set outgoingCall synchronously in React state (Screen appears instantly FIRST at 0ms)
        setOutgoingCall(signalEvent);

        // 2. Dispatch signaling & start outgoing ringback chime
        callSignalingService.sendCallInvite({
          caller: currentUserObj,
          targetUser,
          conversationId: dmChannel.id,
          callType: mode === 'video' ? 'video' : 'voice',
          existingEvent: signalEvent,
        });
      } catch (err: any) {
        console.error('Failed to start DM call:', err);
        setOutgoingCall(null);
        setError({
          code: 'SFU_UNAVAILABLE',
          message: err?.message || 'Failed to start DM call',
        });
      } finally {
        joiningRoomIdRef.current = null;
      }
    },
    [activeRoom]
  );

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    unlockAudioContext();
    const activeUser = currentUserRef.current || currentUser || pbService.getCurrentUser();
    const event = incomingCallRef.current || incomingCall;
    if (!event || !activeUser) return;

    try {
      setError(null);
      activeCallDurationRef.current = 0;
      activeCallTargetRef.current = {
        callerId: event.callerId,
        callerName: event.callerName,
        targetUserId: activeUser.id,
        conversationId: event.conversationId,
        callType: event.callType || 'voice',
      };

      callSignalingService.acceptCall(event.callId, event);
      setIncomingCall(null);

      // Verify microphone permission gracefully before accepting call
      const micPerm = await checkAndRequestMicrophonePermission();
      if (!micPerm.granted) {
        console.warn('[MediaContext] Mic permission not granted on acceptCall, falling back to listen-only mode:', micPerm.error);
        realtimeMediaProvider.disableMicrophone();
        setIsMuted(true);
      }

      const config: RoomConfig = {
        roomId: event.conversationId,
        roomName: event.callerName,
        roomType: 'dm_call',
        maxParticipants: 2,
        user: activeUser,
        initialMode: event.callType === 'video' ? 'video' : 'voice',
        callId: event.callId,
        channelId: event.conversationId,
      };

      setActiveRoom(config);
      await realtimeMediaProvider.joinRoom(config);

      if (event.callerUser) {
        const callerAvatarUrl =
          getServerMemberAvatarUrl(null, event.callerUser, undefined) ||
          (event.callerUser.avatar
            ? event.callerUser.avatar.startsWith('http') || event.callerUser.avatar.startsWith('blob:') || event.callerUser.avatar.startsWith('data:')
              ? event.callerUser.avatar
              : `${pbService.getServerUrl()}/api/files/users/${event.callerUser.id}/${event.callerUser.avatar}`
            : '');

        realtimeMediaProvider.addOrUpdateParticipant({
          userId: event.callerUser.id,
          username: event.callerUser.username,
          displayName: event.callerName || event.callerUser.username,
          avatar: callerAvatarUrl,
          isMuted: false,
          isDeafened: false,
          isSpeaking: false,
          isCameraEnabled: false,
          isScreenSharing: false,
          connectionState: 'connected',
          volume: 100,
          roomId: event.conversationId,
          callId: event.callId,
          userRef: event.callerUser,
          joinedAt: Date.now(),
        });
      }

      setParticipants(realtimeMediaProvider.getParticipants());
      playJoinSound();
      startDurationTimer();
    } catch (err: any) {
      console.error('Error accepting call:', err);
      setActiveRoom(null);
      setParticipants([]);
      stopDurationTimer();
      setError({
        code: 'CONNECTION_FAILED',
        message: err?.message || 'Failed to accept call. Please check your audio devices.',
      });
    }
  }, [incomingCall, currentUser]);

  // Decline incoming call
  const declineCall = useCallback(() => {
    const callToDecline = incomingCallRef.current || incomingCall;
    if (!callToDecline) return;
    stopAllRingtones();
    recordCallLog({
      callId: callToDecline.callId,
      conversationId: callToDecline.conversationId,
      targetUserId: callToDecline.targetUserId,
      callerId: callToDecline.callerId,
      callerName: callToDecline.callerName,
      callType: callToDecline.callType,
      status: 'declined',
      duration: 0,
    }).catch(() => {});

    callSignalingService.declineCall(callToDecline.callId, 'declined', callToDecline);
    setIncomingCall(null);
  }, [incomingCall]);

  // Cancel outgoing ringing call (Instant 0ms cancellation)
  const cancelOutgoingCall = useCallback(async () => {
    stopAllRingtones();
    const callToCancel = outgoingCallRef.current || outgoingCall;
    if (callToCancel) {
      recordCallLog({
        callId: callToCancel.callId,
        conversationId: callToCancel.conversationId,
        targetUserId: callToCancel.targetUserId,
        callerId: callToCancel.callerId,
        callerName: callToCancel.callerName,
        callType: callToCancel.callType,
        status: 'cancelled',
        duration: 0,
      }).catch(() => {});

      callSignalingService.cancelCall(callToCancel.callId, 'cancelled', callToCancel);
      setOutgoingCall(null);
    }
    const currentRoom = activeRoomRef.current || activeRoom;
    if (currentRoom && currentRoom.roomType === 'dm_call') {
      await realtimeMediaProvider.leaveRoom().catch(() => {});
      setActiveRoom(null);
    }
  }, [outgoingCall, activeRoom]);

  // Leave active call or room
  const leaveRoomOrCall = useCallback(async () => {
    stopAllRingtones();
    const currentDur = activeCallDurationRef.current;
    const callTarget = activeCallTargetRef.current;
    const currentRoom = activeRoomRef.current || activeRoom;
    if (currentRoom?.callId && callTarget) {
      recordCallLog({
        callId: currentRoom.callId,
        conversationId: callTarget.conversationId,
        targetUserId: callTarget.targetUserId,
        callerId: callTarget.callerId,
        callerName: callTarget.callerName,
        callType: callTarget.callType,
        status: 'ended',
        duration: currentDur,
      }).catch(() => {});
    }

    setOutgoingCall(null);
    voiceSessionRecovery.clearSession();
    if (currentRoom?.callId) {
      const activeCall = callSignalingService.getActiveCall();
      if (activeCall && activeCall.callId === currentRoom.callId && activeCall.state === 'ringing') {
        callSignalingService.cancelCall(currentRoom.callId);
      } else {
        callSignalingService.endCall(currentRoom.callId);
      }
    }
    await realtimeMediaProvider.leaveRoom();
    playLeaveSound();
  }, [activeRoom]);

  // Audio & Video controls
  const toggleMute = useCallback(() => {
    if (isMuted) {
      realtimeMediaProvider.enableMicrophone().then(() => {
        setIsMuted(false);
        voiceSessionRecovery.updateState({ isMuted: false });
      });
    } else {
      realtimeMediaProvider.disableMicrophone();
      setIsMuted(true);
      voiceSessionRecovery.updateState({ isMuted: true });
    }
  }, [isMuted]);

  const toggleDeafen = useCallback(() => {
    const nextState = !isDeafened;
    setIsDeafened(nextState);
    realtimeMediaProvider.setDeafened(nextState);
    voiceSessionRecovery.updateState({ isDeafened: nextState });
  }, [isDeafened]);

  const toggleCamera = useCallback(async () => {
    if (isCameraEnabled) {
      realtimeMediaProvider.disableCamera();
      setIsCameraEnabled(false);
      voiceSessionRecovery.updateState({ isCameraEnabled: false });
    } else {
      const perm = await checkAndRequestCameraPermission();
      if (!perm.granted) {
        setError({
          code: 'PERMISSION_DENIED',
          message: perm.error || 'Camera permission was not granted.',
        });
        return;
      }
      const track = await realtimeMediaProvider.enableCamera();
      if (track) {
        setIsCameraEnabled(true);
        voiceSessionRecovery.updateState({ isCameraEnabled: true });
      }
    }
  }, [isCameraEnabled]);

  const switchCamera = useCallback(async () => {
    return await realtimeMediaProvider.switchCamera();
  }, []);

  const switchMicrophone = useCallback(async (deviceId: string) => {
    return await realtimeMediaProvider.switchMicrophone(deviceId);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      realtimeMediaProvider.stopScreenShare();
      setIsScreenSharing(false);
      voiceSessionRecovery.updateState({ isScreenSharing: false });
    } else {
      const perm = await checkAndRequestScreenSharePermission();
      if (!perm.granted) {
        setError({
          code: 'PERMISSION_DENIED',
          message: perm.error || 'Screen sharing is unavailable on this device.',
        });
        return;
      }
      const track = await realtimeMediaProvider.startScreenShare();
      if (track) {
        setIsScreenSharing(true);
        voiceSessionRecovery.updateState({ isScreenSharing: true });
      }
    }
  }, [isScreenSharing]);

  const setParticipantVolume = useCallback((userId: string, volume: number) => {
    realtimeMediaProvider.setParticipantVolume(userId, volume);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setSFUAdapter = useCallback((adapter: SFUProviderAdapter | null) => {
    realtimeMediaProvider.setSFUAdapter(adapter);
  }, []);

  const setSFUConfig = useCallback((config: SFUServerConfig) => {
    realtimeMediaProvider.setSFUConfig(config);
  }, []);

  const formattedDuration = React.useMemo(() => formatDuration(activeCallDuration), [activeCallDuration]);

  const value = React.useMemo(
    () => ({
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
      activeCallDuration,
      formattedDuration,
      error,
      cameraQualityProfile,
      cameraTelemetry,

      joinVoiceRoom,
      startDmCall,
      acceptCall,
      declineCall,
      cancelOutgoingCall,
      toggleMuteRing,
      leaveRoomOrCall,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      switchCamera,
      switchMicrophone,
      setCameraQualityProfile,
      toggleScreenShare,
      setParticipantVolume,
      clearError,
      setSFUAdapter,
      setSFUConfig,
    }),
    [
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
      activeCallDuration,
      formattedDuration,
      error,
      cameraQualityProfile,
      cameraTelemetry,
      joinVoiceRoom,
      startDmCall,
      acceptCall,
      declineCall,
      cancelOutgoingCall,
      toggleMuteRing,
      leaveRoomOrCall,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      switchCamera,
      switchMicrophone,
      setCameraQualityProfile,
      toggleScreenShare,
      setParticipantVolume,
      clearError,
      setSFUAdapter,
      setSFUConfig,
    ]
  );

  return (
    <MediaContext.Provider value={value}>
      {children}
    </MediaContext.Provider>
  );
};

export const useRealtimeMedia = (): MediaContextType => {
  const ctx = useContext(MediaContext);
  if (!ctx) {
    throw new Error('useRealtimeMedia must be used within a MediaProvider');
  }
  return ctx;
};

export default useRealtimeMedia;
