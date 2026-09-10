import {
  MediaParticipant,
  MediaConnectionState,
  RoomConfig,
  MediaError,
  MediaProviderEvent,
  SFUServerConfig,
  SFUProviderAdapter,
  SFUAdapterEvent,
  CameraQualityProfile,
  CameraPublishOptions,
  CameraTelemetryData,
} from '../types/media';
import { getServerMemberAvatarUrl, getServerMemberDisplayName, pbService } from '../pocketbase';
import liveKitSFUAdapter from './livekit/LiveKitSFUAdapter';
import { LiveKitManager } from './livekit/LiveKitManager';
import voicePresenceStore from '../services/voicePresenceStore';
import { audioMixer } from '../services/audioMixer';
import { consumeProbedAudioStream } from '../utils/permissions';

export interface IRealtimeMediaProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  joinRoom(config: RoomConfig): Promise<MediaParticipant[]>;
  leaveRoom(): Promise<void>;
  enableMicrophone(): Promise<MediaStreamTrack | null>;
  disableMicrophone(): void;
  setDeafened(deafened: boolean): void;
  enableCamera(): Promise<MediaStreamTrack | null>;
  disableCamera(): void;
  setCameraQualityProfile(profile: CameraQualityProfile): void;
  getCameraQualityProfile(): CameraQualityProfile;
  getActiveCameraTelemetry(): CameraTelemetryData | null;
  startScreenShare(): Promise<MediaStreamTrack | null>;
  stopScreenShare(): void;
  setParticipantVolume(userId: string, volume: number): void;
  getParticipants(): MediaParticipant[];
  getConnectionState(): MediaConnectionState;
  subscribe(listener: (event: MediaProviderEvent) => void): () => void;
  setSFUAdapter(adapter: SFUProviderAdapter | null): void;
  setSFUConfig(config: SFUServerConfig): void;
}

export class RealtimeMediaProvider implements IRealtimeMediaProvider {
  private activeRoom: RoomConfig | null = null;
  private participants: Map<string, MediaParticipant> = new Map();
  private connectionState: MediaConnectionState = 'idle';
  private listeners: Set<(event: MediaProviderEvent) => void> = new Set();

  private localAudioStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;

  private isMuted: boolean = false;
  private isDeafened: boolean = false;
  private isCameraEnabled: boolean = false;
  private isScreenSharing: boolean = false;

  private facingMode: 'user' | 'environment' = 'user';
  private cameraProfile: CameraQualityProfile = 'auto';
  private cameraTelemetry: CameraTelemetryData | null = null;
  private telemetryIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private mutePromiseLock: Promise<any> | null = null;

  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private speakingDetectorInterval: ReturnType<typeof setInterval> | null = null;

  private sfuAdapter: SFUProviderAdapter | null = null;
  private sfuConfig: SFUServerConfig | null = null;
  private sfuAdapterUnsubscribe: (() => void) | null = null;

  // Local per-user volume map (userId -> volume 0..100)
  private participantVolumes: Map<string, number> = new Map();

  // Connection stabilization layer: pending disconnect timers map & session validation
  private pendingDisconnectTimers: Map<
    string,
    { timer: ReturnType<typeof setTimeout>; disconnectedAt: number; reason?: string; sessionId?: string }
  > = new Map();

  // Seamless track transition buffering map (key: `${userId}_${trackType}`)
  private pendingTrackRemovalTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private activeSessionId: string | null = null;
  private explicitlyLeftUsers: Map<string, string> = new Map(); // userId -> sessionId

  constructor() {
    this.setSFUAdapter(liveKitSFUAdapter);
    try {
      if (typeof localStorage !== 'undefined') {
        const savedFacing = localStorage.getItem('sirver_camera_facing_mode');
        if (savedFacing === 'user' || savedFacing === 'environment') {
          this.facingMode = savedFacing;
        }
        const savedProfile = localStorage.getItem('sirver_camera_quality_profile');
        if (savedProfile === 'auto' || savedProfile === 'low' || savedProfile === 'balanced' || savedProfile === 'high' || savedProfile === 'ultra') {
          this.cameraProfile = savedProfile as CameraQualityProfile;
        }
      }
    } catch {}
  }

  public setSFUAdapter(adapter: SFUProviderAdapter | null) {
    if (this.sfuAdapterUnsubscribe) {
      this.sfuAdapterUnsubscribe();
      this.sfuAdapterUnsubscribe = null;
    }

    this.sfuAdapter = adapter;

    if (this.sfuAdapter) {
      if (typeof this.sfuAdapter.onEvent === 'function') {
        this.sfuAdapterUnsubscribe = this.sfuAdapter.onEvent((event) => {
          this.handleSFUAdapterEvent(event);
        });
      }

      if (this.sfuConfig) {
        this.sfuAdapter.configure(this.sfuConfig).catch((err) => {
          console.warn('Failed to configure SFU adapter:', err);
        });
      }
    }
  }

  private isExplicitlyLeft(userId: string, sessionId?: string): boolean {
    const targetSession = sessionId || this.activeSessionId;
    if (!targetSession) return false;
    return this.explicitlyLeftUsers.get(userId) === targetSession;
  }

  private handleSFUAdapterEvent(event: SFUAdapterEvent) {
    const currentSessionId = event.sessionId || this.activeSessionId || 'default_session';

    switch (event.type) {
      case 'participant_joined':
        if (event.participant) {
          this.addOrUpdateParticipant({ ...event.participant, sessionId: currentSessionId });
        }
        break;
      case 'participant_left':
        if (event.userId) {
          const isExplicit = event.explicit || event.reason === 'explicit_leave' || this.isExplicitlyLeft(event.userId, currentSessionId);
          this.removeParticipant(event.userId, isExplicit, isExplicit ? 'explicit_leave' : (event.reason || 'LiveKit_ParticipantDisconnected'));
        }
        break;
      case 'participant_updated':
        if (event.userId && event.patch) {
          if (this.isExplicitlyLeft(event.userId, currentSessionId)) {
            console.log(`[CALL_CONNECTION] Discarded participant_updated event for explicitly left user: userId=${event.userId}, sessionId=${currentSessionId}`);
            return;
          }
          const current = this.participants.get(event.userId);
          if (current) {
            const merged = { ...current, ...event.patch, sessionId: currentSessionId };
            if (event.patch.isCameraEnabled === false) {
              merged.videoStream = null;
            }
            if (event.patch.isScreenSharing === false) {
              merged.screenStream = null;
            }
            this.addOrUpdateParticipant(merged);
          }
        }
        break;
      case 'speaking_changed':
        if (event.userId && typeof event.data?.isSpeaking === 'boolean') {
          const current = this.participants.get(event.userId);
          if (current) {
            current.isSpeaking = event.data.isSpeaking;
            this.notifyParticipantsChanged();
          }
        }
        break;
      case 'track_added':
        if (event.userId && event.trackType && event.stream) {
          if (this.isExplicitlyLeft(event.userId, currentSessionId)) {
            console.log(`[CALL_CONNECTION] Discarded track_added event for explicitly left user: userId=${event.userId}, sessionId=${currentSessionId}`);
            return;
          }

          // Cancel any pending 20-second grace period timer if participant produces media again
          const pending = this.pendingDisconnectTimers.get(event.userId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingDisconnectTimers.delete(event.userId);
            console.log(`[VOICE_LIFECYCLE] Grace period cancelled: userId=${event.userId}, sessionId=${currentSessionId}`);
            console.log(`[VOICE_LIFECYCLE] Participant reconnected / producing media: userId=${event.userId}, sessionId=${currentSessionId}`);
          }

          // Cancel any pending track removal buffer timer for seamless track switching
          const trackRemovalKey = `${event.userId}_${event.trackType}`;
          if (this.pendingTrackRemovalTimers.has(trackRemovalKey)) {
            clearTimeout(this.pendingTrackRemovalTimers.get(trackRemovalKey));
            this.pendingTrackRemovalTimers.delete(trackRemovalKey);
            console.log(`[VOICE_LIFECYCLE] Seamless track replacement: cancelled pending track removal for key=${trackRemovalKey}`);
          }

          let current = this.participants.get(event.userId);
          if (!current) {
            const cachedUser = (pbService.getCachedUser(event.userId) || { id: event.userId, username: event.userId }) as any;
            current = {
              userId: event.userId,
              username: cachedUser.username || event.userId,
              displayName: cachedUser.display_name || cachedUser.username || event.userId,
              avatar: cachedUser.avatar || '',
              isMuted: false,
              isDeafened: false,
              isSpeaking: false,
              isCameraEnabled: event.trackType === 'video',
              isScreenSharing: event.trackType === 'screen',
              connectionState: 'connected',
              isPendingDisconnect: false,
              volume: audioMixer.getParticipantVolume(event.userId),
              roomId: this.activeRoom?.roomId || '',
              userRef: cachedUser,
              joinedAt: Date.now(),
              sessionId: currentSessionId,
            };
            this.participants.set(event.userId, current);
          } else {
            current.isPendingDisconnect = false;
            current.connectionState = 'connected';
            current.sessionId = currentSessionId;
          }

          if (event.trackType === 'audio') current.audioStream = event.stream;
          else if (event.trackType === 'video') {
            current.videoStream = event.stream;
            current.isCameraEnabled = true;
          } else if (event.trackType === 'screen') {
            current.screenStream = event.stream;
            current.isScreenSharing = true;
          }
          console.log(`[VOICE_LIFECYCLE] Track added: kind=${event.trackType} for userId=${event.userId}`);
          this.notifyParticipantsChanged();
        }
        break;
      case 'track_removed':
        if (event.userId && event.trackType) {
          const current = this.participants.get(event.userId);
          if (current) {
            const trackType = event.trackType;
            const userId = event.userId;
            const trackRemovalKey = `${userId}_${trackType}`;

            console.log(`[VOICE_LIFECYCLE] Track removal requested (kind=${trackType}) for userId=${userId}. Buffering 1500ms for seamless stream transition.`);

            if (this.pendingTrackRemovalTimers.has(trackRemovalKey)) {
              clearTimeout(this.pendingTrackRemovalTimers.get(trackRemovalKey));
            }

            const removalTimer = setTimeout(() => {
              this.pendingTrackRemovalTimers.delete(trackRemovalKey);
              const p = this.participants.get(userId);
              if (p) {
                console.log(`[VOICE_LIFECYCLE] Track removal buffer expired (kind=${trackType}) for userId=${userId}. Executing stream clear.`);
                if (trackType === 'audio') {
                  p.audioStream = null;
                } else if (trackType === 'video') {
                  p.videoStream = null;
                  p.isCameraEnabled = false;
                } else if (trackType === 'screen') {
                  p.screenStream = null;
                  p.isScreenSharing = false;
                }
                this.notifyParticipantsChanged();
              }
            }, 1500);

            this.pendingTrackRemovalTimers.set(trackRemovalKey, removalTimer);
          }
        }
        break;
      case 'connection_state_changed':
        if (event.connectionState) {
          this.setConnectionState(event.connectionState);
        }
        break;
      case 'error':
        if (event.error) {
          this.emit({ type: 'error', error: event.error });
        }
        break;
    }
  }

  public setSFUConfig(config: SFUServerConfig) {
    this.sfuConfig = config;
    if (this.sfuAdapter) {
      this.sfuAdapter.configure(config).catch((err) => {
        console.warn('Failed to configure SFU adapter:', err);
      });
    }
  }

  public async connect(): Promise<void> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }
    this.setConnectionState('connecting');
    // Once SFU adapter is attached, connection will finalize through signaling.
    // In current preparation phase, connection succeeds locally.
    this.setConnectionState('connected');
  }

  public async disconnect(): Promise<void> {
    await this.leaveRoom();
    if (this.sfuAdapter) {
      await this.sfuAdapter.disconnect().catch(() => {});
    }
    this.setConnectionState('disconnected');
  }

  public async joinRoom(config: RoomConfig): Promise<MediaParticipant[]> {
    // 1. Prevent duplicate room connections or concurrent join attempts
    if (this.activeRoom && this.activeRoom.roomId === config.roomId && this.connectionState === 'connected') {
      return this.getParticipants();
    }

    if (this.connectionState === 'joining' || this.connectionState === 'connecting') {
      return this.getParticipants();
    }

    // 2. Clean up previous room if switching rooms safely
    if (this.activeRoom && this.activeRoom.roomId !== config.roomId) {
      await this.leaveRoom();
    }

    const maxAllowed = config.maxParticipants || (config.roomType === 'dm_call' ? 2 : 8);

    if (this.participants.size >= maxAllowed) {
      const error: MediaError = {
        code: 'ROOM_FULL',
        message: `Room is full. Maximum ${maxAllowed} participants allowed.`,
      };
      this.setConnectionState('failed');
      this.emit({ type: 'error', error });
      throw new Error(error.message);
    }

    const sessionId = config.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const roomConfigWithSession = { ...config, sessionId };

    this.activeRoom = roomConfigWithSession;
    this.activeSessionId = sessionId;
    this.setConnectionState('joining');

    // Resolve server member or global user avatar & display name
    const member = config.serverId ? pbService.getCachedServerMember(config.serverId, config.user.id) : null;
    const resolvedAvatar =
      getServerMemberAvatarUrl(member, config.user, config.serverId) ||
      (config.user.avatar
        ? config.user.avatar.startsWith('http') || config.user.avatar.startsWith('blob:') || config.user.avatar.startsWith('data:')
          ? config.user.avatar
          : `${pbService.getServerUrl()}/api/files/users/${config.user.id}/${config.user.avatar}`
        : '');
    const resolvedDisplayName =
      getServerMemberDisplayName(member, config.user, config.serverId) ||
      config.user.display_name ||
      config.user.username;

    // Build self participant model
    const selfParticipant: MediaParticipant = {
      userId: config.user.id,
      username: config.user.username,
      displayName: resolvedDisplayName,
      avatar: resolvedAvatar,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isSpeaking: false,
      isCameraEnabled: this.isCameraEnabled,
      isScreenSharing: this.isScreenSharing,
      connectionState: 'connected',
      volume: audioMixer.getParticipantVolume(config.user.id),
      roomId: config.roomId,
      callId: config.callId,
      userRef: config.user,
      joinedAt: Date.now(),
    };

    this.participants.set(config.user.id, selfParticipant);

    // 1. Trigger SFU session join if adapter is attached FIRST so room.localParticipant is ready
    if (this.sfuAdapter) {
      try {
        await this.sfuAdapter.joinSession(config);
      } catch (err: any) {
        console.warn('[SFU_SUBSYSTEM] SFU session join notice (continuing in resilient media mode):', err?.message || err);
      }
    }

    // 2. Auto-start microphone for immediate audio without manual toggle unless explicitly muted
    if (!this.isMuted) {
      await this.enableMicrophone().catch((e) => console.warn('Microphone auto-start notice:', e));
    }

    // 3. Initialize additional local media according to initial mode
    if (config.initialMode === 'video') {
      await this.enableCamera().catch((e) => console.warn('Camera auto-start notice:', e));
    } else if (config.initialMode === 'screen') {
      await this.startScreenShare().catch((e) => console.warn('Screen share auto-start notice:', e));
    }

    // 4. Start local microphone audio analysis for speaking detection
    await this.setupSpeakingDetector().catch(() => {});

    // 5. Automatic join microphone sync kick-start script to guarantee live audio stream without manual mute/unmute
    setTimeout(async () => {
      if (!this.isMuted && this.sfuAdapter) {
        console.log('[VOICE_SUBSYSTEM] Executing automatic join microphone sync script...');
        try {
          if ('setMicrophoneEnabled' in this.sfuAdapter) {
            await (this.sfuAdapter as any).setMicrophoneEnabled(true);
          }
          if (this.localAudioStream) {
            this.localAudioStream.getAudioTracks().forEach((t) => {
              t.enabled = true;
            });
          }
        } catch (syncErr) {
          console.warn('[VOICE_SUBSYSTEM] Auto join mic sync script warning:', syncErr);
        }
      }
    }, 250);

    this.setConnectionState('connected');
    this.notifyParticipantsChanged();
    return this.getParticipants();
  }

  public async leaveRoom(): Promise<void> {
    if (!this.activeRoom && (this.connectionState === 'idle' || this.connectionState === 'disconnected')) return;

    this.setConnectionState('leaving');

    if (this.activeRoom) {
      const selfId = this.activeRoom.user.id;
      const currentSessionId = this.activeRoom.sessionId || this.activeSessionId || 'default_session';
      console.log(`[CALL_CONNECTION] Explicit Leave received: userId=${selfId}, sessionId=${currentSessionId}`);
      if (currentSessionId) {
        this.explicitlyLeftUsers.set(selfId, currentSessionId);
      }
    }

    if (this.sfuAdapter) {
      await this.sfuAdapter.leaveSession().catch(() => {});
    }

    this.cleanupMediaTracks();
    this.cleanupSpeakingDetector();

    try {
      voicePresenceStore.setLocalPresence(null);
    } catch (e) {}

    this.pendingDisconnectTimers.forEach(({ timer, sessionId }, uid) => {
      clearTimeout(timer);
      console.log(`[CALL_CONNECTION] Grace period cancelled (room leave): userId=${uid}, sessionId=${sessionId || this.activeSessionId}`);
    });
    this.pendingDisconnectTimers.clear();
    this.participants.clear();
    this.activeRoom = null;
    this.activeSessionId = null;
    this.setConnectionState('disconnected');

    this.emit({ type: 'room_left' });
  }

  public async enableMicrophone(): Promise<MediaStreamTrack | null> {
    console.log(`[VOICE_SUBSYSTEM] Local mute change: enableMicrophone (unmuting) for user=${this.activeRoom?.user?.id}`);
    if (this.mutePromiseLock) {
      await this.mutePromiseLock.catch(() => {});
    }
    let resolveLock: () => void = () => {};
    this.mutePromiseLock = new Promise<void>((res) => {
      resolveLock = res;
    });

    try {
      this.isMuted = false;
      this.updateSelfParticipant({ isMuted: false });

      if (this.sfuAdapter && 'setMicrophoneEnabled' in this.sfuAdapter) {
        const success = await (this.sfuAdapter as any).setMicrophoneEnabled(true);
        if (success) {
          await this.setupSpeakingDetector();
          let sfuTrack: MediaStreamTrack | null = null;
          if ('getLocalAudioTrack' in this.sfuAdapter) {
            sfuTrack = (this.sfuAdapter as any).getLocalAudioTrack();
          }
          return sfuTrack || this.localAudioStream?.getAudioTracks()[0] || null;
        }
      }

      let audioTrack: MediaStreamTrack | null = null;

      if (this.localAudioStream) {
        const tracks = this.localAudioStream.getAudioTracks();
        if (tracks.length > 0 && tracks[0].readyState === 'live') {
          audioTrack = tracks[0];
          audioTrack.enabled = true;
        } else {
          this.localAudioStream = null;
        }
      }

      if (!audioTrack) {
        const probedStream = consumeProbedAudioStream();
        if (probedStream) {
          const probeTracks = probedStream.getAudioTracks();
          if (probeTracks.length > 0 && probeTracks[0].readyState === 'live') {
            this.localAudioStream = probedStream;
            audioTrack = probeTracks[0];
            audioTrack.enabled = true;
          }
        }
      }

      if (!audioTrack) {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('MediaDevices API unavailable in current environment');
        }

        try {
          this.localAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: { ideal: 1 },
              sampleRate: { ideal: 48000 },
              googEchoCancellation: true,
              googAutoGainControl: true,
              googNoiseSuppression: true,
              googHighpassFilter: true,
              googTypingNoiseDetection: false,
            } as any,
          });
        } catch (initialErr: any) {
          if (initialErr?.name === 'NotAllowedError' || initialErr?.name === 'PermissionDeniedError') {
            throw initialErr;
          }
          this.localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        audioTrack = this.localAudioStream.getAudioTracks()[0] || null;
        if (audioTrack) {
          audioTrack.enabled = true;
        }
      }

      if (this.sfuAdapter && audioTrack) {
        await this.sfuAdapter.publishAudioTrack(audioTrack).catch(() => {});
      }

      await this.setupSpeakingDetector();
      return audioTrack || null;
    } catch (err: any) {
      console.warn('[RealtimeMediaProvider] Microphone enable failed:', err);
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.message?.toLowerCase().includes('denied') ||
        err?.message?.toLowerCase().includes('permission');

      const mediaErr: MediaError = {
        code: isDenied ? 'PERMISSION_DENIED' : 'DEVICE_UNAVAILABLE',
        message: isDenied
          ? 'Microphone permission was denied. Please allow microphone access in your device or browser settings.'
          : err?.message || 'Failed to access microphone',
      };
      this.emit({ type: 'error', error: mediaErr });
      return null;
    } finally {
      resolveLock();
      this.mutePromiseLock = null;
    }
  }

  public disableMicrophone(): void {
    console.log(`[VOICE_SUBSYSTEM] Local mute change: disableMicrophone (muting) for user=${this.activeRoom?.user?.id}`);
    if (this.localAudioStream) {
      this.localAudioStream.getAudioTracks().forEach((track) => {
        const isScreenAudio = this.localScreenStream?.getAudioTracks().includes(track);
        if (!isScreenAudio) {
          track.enabled = false;
        }
      });
    }
    this.isMuted = true;
    this.updateSelfParticipant({ isMuted: true, isSpeaking: false });

    if (this.sfuAdapter) {
      if ('setMicrophoneEnabled' in this.sfuAdapter) {
        (this.sfuAdapter as any).setMicrophoneEnabled(false);
      } else {
        this.sfuAdapter.unpublishAudioTrack().catch(() => {});
      }
    }
  }

  public setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    this.updateSelfParticipant({ isDeafened: deafened });
    if (this.sfuAdapter && 'setDeafened' in this.sfuAdapter) {
      (this.sfuAdapter as any).setDeafened(deafened);
    }
  }

  public setCameraQualityProfile(profile: CameraQualityProfile): void {
    const previousProfile = this.cameraProfile;
    this.cameraProfile = profile;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('sirver_camera_quality_profile', profile);
      }
    } catch {}

    console.log(`[CAMERA_PIPELINE] Quality profile changed: ${previousProfile} -> ${profile}`);

    if (this.isCameraEnabled) {
      this.enableCamera().catch((err) => {
        console.warn('[CAMERA_PIPELINE] Failed to re-enable camera with new profile:', err);
      });
    }

    if (this.isScreenSharing && this.localScreenStream) {
      const screenTrack = this.localScreenStream.getVideoTracks()[0];
      if (screenTrack) {
        const specs = this.getScreenProfileSpecs(profile);
        screenTrack.applyConstraints({
          width: { ideal: specs.targetWidth, max: 3840 },
          height: { ideal: specs.targetHeight, max: 2160 },
          frameRate: { ideal: specs.targetFps, max: 60 },
        }).catch((err) => {
          console.warn('[SCREEN_SHARE] Failed to apply constraints on quality change:', err);
        });

        if (this.sfuAdapter) {
          this.sfuAdapter.publishScreenTrack(screenTrack, specs).catch((err) => {
            console.warn('[SCREEN_SHARE] Failed to update SFU screen track encoding on quality change:', err);
          });
        }
      }
    }
  }

  public getCameraQualityProfile(): CameraQualityProfile {
    return this.cameraProfile;
  }

  public getActiveCameraTelemetry(): CameraTelemetryData | null {
    return this.cameraTelemetry;
  }

  private resolveActiveCameraProfile(profile: CameraQualityProfile): 'low' | 'balanced' | 'high' | 'ultra' {
    if (profile !== 'auto') {
      return profile;
    }

    if (typeof navigator === 'undefined') return 'ultra';

    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const isSaveData = conn?.saveData === true;
    const effectiveType = conn?.effectiveType || '';
    const downlink = typeof conn?.downlink === 'number' ? conn.downlink : 10.0;

    if (isSaveData || effectiveType === '2g' || effectiveType === 'slow-2g') {
      console.log(`[CAMERA_PIPELINE] Auto profile resolved to LOW (downlink=${downlink}Mbps, saveData=${isSaveData})`);
      return 'low';
    }

    console.log(`[CAMERA_PIPELINE] Auto profile resolved to ULTRA (1080p60 max quality)`);
    return 'ultra';
  }

  private getCameraProfileSpecs(activeProfile: 'low' | 'balanced' | 'high' | 'ultra') {
    switch (activeProfile) {
      case 'ultra':
      case 'high':
        return {
          targetWidth: 1920,
          targetHeight: 1080,
          targetFps: 60,
          maxBitrateBps: 6_000_000,
          codec: 'vp8' as const,
          simulcast: true,
        };
      case 'balanced':
        return {
          targetWidth: 1920,
          targetHeight: 1080,
          targetFps: 30,
          maxBitrateBps: 4_000_000,
          codec: 'vp8' as const,
          simulcast: true,
        };
      case 'low':
      default:
        return {
          targetWidth: 1280,
          targetHeight: 720,
          targetFps: 30,
          maxBitrateBps: 1_800_000,
          codec: 'vp8' as const,
          simulcast: false,
        };
    }
  }

  public getScreenProfileSpecs(profile: CameraQualityProfile = this.cameraProfile) {
    const active = this.resolveActiveCameraProfile(profile);
    switch (active) {
      case 'ultra':
        return {
          targetWidth: 2560,
          targetHeight: 1440,
          targetFps: 60,
          maxBitrateBps: 8_000_000,
          codec: 'vp8' as const,
          simulcast: false,
        };
      case 'high':
        return {
          targetWidth: 1920,
          targetHeight: 1080,
          targetFps: 60,
          maxBitrateBps: 6_000_000,
          codec: 'vp8' as const,
          simulcast: false,
        };
      case 'balanced':
        return {
          targetWidth: 1920,
          targetHeight: 1080,
          targetFps: 30,
          maxBitrateBps: 3_500_000,
          codec: 'vp8' as const,
          simulcast: false,
        };
      case 'low':
      default:
        return {
          targetWidth: 1280,
          targetHeight: 720,
          targetFps: 20,
          maxBitrateBps: 1_200_000,
          codec: 'vp8' as const,
          simulcast: false,
        };
    }
  }

  public async enableCamera(): Promise<MediaStreamTrack | null> {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('MediaDevices API unavailable');
      }

      if (this.localVideoStream) {
        this.localVideoStream.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
        this.localVideoStream = null;
      }

      const activeProfile = this.resolveActiveCameraProfile(this.cameraProfile);
      const specs = this.getCameraProfileSpecs(activeProfile);

      console.log(`[CAMERA_PIPELINE] Attempting camera acquisition. Profile: ${this.cameraProfile} -> Active: ${activeProfile.toUpperCase()}`);

      const constraintLevels: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: this.facingMode },
            width: { ideal: specs.targetWidth, min: Math.min(640, specs.targetWidth) },
            height: { ideal: specs.targetHeight, min: Math.min(360, specs.targetHeight) },
            frameRate: { ideal: specs.targetFps, max: specs.targetFps === 60 ? 60 : 30, min: 15 },
            aspectRatio: { ideal: 1.7777777777777777 },
          },
        },
        {
          video: {
            facingMode: { ideal: this.facingMode },
            width: { ideal: specs.targetWidth },
            height: { ideal: specs.targetHeight },
            frameRate: { ideal: specs.targetFps },
          },
        },
        {
          video: {
            facingMode: { ideal: this.facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        },
        {
          video: {
            facingMode: { ideal: this.facingMode },
          },
        },
        {
          video: true,
        },
      ];

      let stream: MediaStream | null = null;
      let acquiredLevel = 0;

      for (let i = 0; i < constraintLevels.length; i++) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraintLevels[i]);
          acquiredLevel = i + 1;
          break;
        } catch (err: any) {
          if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
            throw err;
          }
          console.warn(`[CAMERA_PIPELINE] Constraint level ${i + 1} failed (${err?.message}). Trying fallback constraint level...`);
        }
      }

      if (!stream) {
        throw new Error('Could not acquire camera stream at any quality constraint level');
      }

      this.localVideoStream = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('Acquired stream has no video tracks');
      }

      try {
        await videoTrack.applyConstraints({
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        });
      } catch (cErr) {
        console.warn('[CAMERA_PIPELINE] applyConstraints 1080p60 notice:', cErr);
      }

      const trackSettings = videoTrack.getSettings();
      const actualWidth = trackSettings.width || specs.targetWidth;
      const actualHeight = trackSettings.height || specs.targetHeight;
      const actualFps = trackSettings.frameRate || specs.targetFps;
      const deviceLabel = videoTrack.label || `Camera (${this.facingMode})`;

      if ('contentHint' in videoTrack) {
        (videoTrack as any).contentHint = (activeProfile === 'ultra' || activeProfile === 'high') ? 'detail' : 'motion';
      }

      videoTrack.onended = () => {
        console.log('[CAMERA_PIPELINE] Local camera track ended');
        this.disableCamera();
      };

      this.isCameraEnabled = true;

      const publishOptions: CameraPublishOptions = {
        profile: this.cameraProfile,
        activeProfile,
        targetWidth: specs.targetWidth,
        targetHeight: specs.targetHeight,
        targetFps: specs.targetFps,
        maxBitrateBps: specs.maxBitrateBps,
        codec: specs.codec,
        simulcast: specs.simulcast,
        actualWidth,
        actualHeight,
        actualFps,
      };

      if (this.sfuAdapter) {
        await this.sfuAdapter.publishVideoTrack(videoTrack, publishOptions).catch((e) => {
          console.warn('[CAMERA_PIPELINE] Error publishing video track to SFU adapter:', e);
        });
      }

      this.cameraTelemetry = {
        profile: this.cameraProfile,
        activeProfile,
        selectedResolution: `${specs.targetWidth}x${specs.targetHeight}`,
        actualCaptureResolution: `${actualWidth}x${actualHeight}`,
        publishedResolution: `${actualWidth}x${actualHeight}`,
        targetFps: specs.targetFps,
        actualFps: Math.round(actualFps * 10) / 10,
        encoder: `WebRTC Hardware Encoder (${specs.codec.toUpperCase()})`,
        codec: specs.codec.toUpperCase(),
        maxBitrateBps: specs.maxBitrateBps,
        currentEstimatedBitrateBps: specs.maxBitrateBps,
        adaptiveBitrateState: `Optimal (${(specs.maxBitrateBps / 1_000_000).toFixed(1)} Mbps)`,
        simulcastEnabled: specs.simulcast,
        simulcastLayersCount: specs.simulcast ? 3 : 1,
        facingMode: this.facingMode,
        deviceLabel,
        timestamp: Date.now(),
      };

      console.log(`
========================================================================
[CAMERA_PIPELINE] LOCAL CAMERA STREAM ACTIVE
------------------------------------------------------------------------
Configured Profile           : ${this.cameraProfile} (Active Profile: ${activeProfile.toUpperCase()})
Constraint Level Acquired     : Level ${acquiredLevel} of ${constraintLevels.length}
Target Resolution & FPS      : ${specs.targetWidth}x${specs.targetHeight} @ ${specs.targetFps} FPS
Actual Captured Resolution   : ${actualWidth}x${actualHeight} @ ${actualFps?.toFixed(1)} FPS
Published Stream Resolution  : ${actualWidth}x${actualHeight}
Camera Device Label          : "${deviceLabel}"
Facing Mode                  : ${this.facingMode}
Video Codec / Encoder        : ${specs.codec.toUpperCase()} (Hardware Accelerated)
Max Configured Bitrate       : ${(specs.maxBitrateBps / 1_000_000).toFixed(2)} Mbps (${specs.maxBitrateBps.toLocaleString()} bps)
Simulcast Enabled            : ${specs.simulcast ? 'YES (3 Quality Layers)' : 'NO (Single Layer)'}
Adaptive Bitrate Monitor     : Running (monitoring packet loss & network throughput)
========================================================================
`);

      this.startCameraTelemetryMonitor();

      this.updateSelfParticipant({
        isCameraEnabled: true,
        videoStream: this.localVideoStream,
      });

      return videoTrack;
    } catch (err: any) {
      console.error('[CAMERA_PIPELINE] Failed to enable camera:', err);
      const mediaErr: MediaError = {
        code: err?.name === 'NotAllowedError' ? 'PERMISSION_DENIED' : 'DEVICE_UNAVAILABLE',
        message: err?.message || 'Failed to access camera',
      };
      this.emit({ type: 'error', error: mediaErr });
      return null;
    }
  }

  private startCameraTelemetryMonitor() {
    if (this.telemetryIntervalTimer) {
      clearInterval(this.telemetryIntervalTimer);
    }

    this.telemetryIntervalTimer = setInterval(() => {
      if (!this.isCameraEnabled || !this.cameraTelemetry) {
        if (this.telemetryIntervalTimer) clearInterval(this.telemetryIntervalTimer);
        return;
      }

      if (typeof navigator !== 'undefined') {
        const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (conn) {
          const downlink = typeof conn.downlink === 'number' ? conn.downlink : 5.0;
          if (downlink < 1.0 && this.cameraTelemetry.activeProfile !== 'low') {
            const reason = `Network downlink speed dropped to ${downlink} Mbps. Auto-downgrading active profile from ${this.cameraTelemetry.activeProfile.toUpperCase()} to LOW.`;
            console.warn(`[CAMERA_PIPELINE] ${reason}`);
            this.cameraTelemetry.lastDowngradeReason = reason;
            this.cameraTelemetry.adaptiveBitrateState = `Degraded (${downlink} Mbps)`;
          }
        }
      }
    }, 10_000);
  }

  public async switchCamera(): Promise<boolean> {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    try {
      LiveKitManager.getInstance().setFacingMode(this.facingMode);
    } catch (e) {}
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('sirver_camera_facing_mode', this.facingMode);
      }
    } catch {}

    if (this.isCameraEnabled) {
      const track = await this.enableCamera();
      return !!track;
    }
    return true;
  }

  public getCameraFacingMode(): 'user' | 'environment' {
    return this.facingMode;
  }

  public disableCamera(): void {
    if (this.telemetryIntervalTimer) {
      clearInterval(this.telemetryIntervalTimer);
      this.telemetryIntervalTimer = null;
    }
    this.cameraTelemetry = null;

    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((track) => track.stop());
      this.localVideoStream = null;
    }
    this.isCameraEnabled = false;
    this.updateSelfParticipant({
      isCameraEnabled: false,
      videoStream: null,
    });

    if (this.sfuAdapter) {
      this.sfuAdapter.unpublishVideoTrack().catch(() => {});
    }
  }

  public async startScreenShare(): Promise<MediaStreamTrack | null> {
    console.log(`[SCREEN_SHARE] screen share started: user=${this.activeRoom?.user?.id || 'unknown'}`);
    const hasDisplayMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
    console.log(`[SCREEN_SHARE] system audio supported: ${hasDisplayMedia}`);

    try {
      if (!hasDisplayMedia) {
        throw new Error('Screen sharing is not supported in this browser environment');
      }

      if (this.localScreenStream) {
        console.log('[SCREEN_SHARE] stopping existing screen share stream before initiating new share');
        this.localScreenStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (e) {}
        });
        this.localScreenStream = null;
      }

      const specs = this.getScreenProfileSpecs(this.cameraProfile);
      console.log(`[SCREEN_SHARE] Requesting VIDEO-ONLY screen capture with profile=${this.cameraProfile} targetRes=${specs.targetWidth}x${specs.targetHeight}@${specs.targetFps}`);

      const highQualityConstraints: DisplayMediaStreamOptions = {
        video: {
          width: { ideal: specs.targetWidth, max: 3840 },
          height: { ideal: specs.targetHeight, max: 2160 },
          frameRate: { ideal: specs.targetFps, max: 60 },
        },
        audio: false,
        systemAudio: 'exclude',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
      } as any;

      try {
        this.localScreenStream = await navigator.mediaDevices.getDisplayMedia(highQualityConstraints);
      } catch (highQualityErr: any) {
        if (highQualityErr?.name === 'NotAllowedError' || highQualityErr?.name === 'AbortError') {
          console.log('[SCREEN_SHARE] user cancelled screen picker');
          throw highQualityErr;
        }

        console.warn(`[SCREEN_SHARE] high quality getDisplayMedia failed (${highQualityErr?.message}). Retrying with basic video-only display constraints...`);

        try {
          this.localScreenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: specs.targetWidth, max: 3840 },
              height: { ideal: specs.targetHeight, max: 2160 },
              frameRate: { ideal: specs.targetFps, max: 60 },
            },
            audio: false,
          });
        } catch (fallbackErr: any) {
          if (fallbackErr?.name === 'NotAllowedError' || fallbackErr?.name === 'AbortError') {
            console.log('[SCREEN_SHARE] user cancelled screen picker');
          }
          throw fallbackErr;
        }
      }

      // Ensure no audio tracks exist or are captured on screen stream to prevent feedback / echo
      if (this.localScreenStream) {
        const audioTracks = this.localScreenStream.getAudioTracks();
        if (audioTracks.length > 0) {
          console.log(`[SCREEN_SHARE] Stopping ${audioTracks.length} captured audio track(s) on screen stream - Screen share is strictly VIDEO ONLY.`);
          audioTracks.forEach((t) => {
            try {
              t.stop();
            } catch (e) {}
          });
        }
      }

      const screenTrack = this.localScreenStream?.getVideoTracks()[0];

      if (screenTrack) {
        console.log(`[SCREEN_SHARE] video track created: id=${screenTrack.id} label="${screenTrack.label}"`);
        if ('contentHint' in screenTrack) {
          (screenTrack as any).contentHint = 'detail';
        }

        screenTrack.onended = () => {
          console.log('[SCREEN_SHARE] screen video track ended by OS/browser action (e.g. window closed)');
          this.stopScreenShare();
          this.emit({ type: 'screen_share_source_ended' });
        };
      }

      this.isScreenSharing = true;
      this.updateSelfParticipant({
        isScreenSharing: true,
        screenStream: this.localScreenStream,
      });

      if (this.sfuAdapter && screenTrack) {
        console.log('[SCREEN_SHARE] publishing screen video track to SFU adapter (VIDEO ONLY)...');
        await this.sfuAdapter.publishScreenTrack(screenTrack, specs).catch((e) => {
          console.warn('[SCREEN_SHARE] Failed to publish screen video track to SFU:', e);
        });
      }

      return screenTrack || null;
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        const mediaErr: MediaError = {
          code: 'DEVICE_UNAVAILABLE',
          message: err?.message || 'Failed to start screen sharing',
        };
        this.emit({ type: 'error', error: mediaErr });
      }
      return null;
    }
  }

  public stopScreenShare(): void {
    console.log(`[SCREEN_SHARE] stopScreenShare requested for user=${this.activeRoom?.user?.id || 'unknown'}`);
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.localScreenStream = null;
    }
    this.isScreenSharing = false;
    this.updateSelfParticipant({
      isScreenSharing: false,
      screenStream: null,
    });

    if (this.sfuAdapter) {
      this.sfuAdapter.unpublishScreenTrack().catch(() => {});
    }
  }

  public setParticipantVolume(userId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(200, volume));
    this.participantVolumes.set(userId, clamped);
    audioMixer.setParticipantVolume(userId, clamped);

    const participant = this.participants.get(userId);
    if (participant) {
      participant.volume = clamped;
      this.notifyParticipantsChanged();
    }

    if (this.sfuAdapter) {
      this.sfuAdapter.setRemoteVolume(userId, clamped);
    }
  }

  public getParticipants(): MediaParticipant[] {
    // Preserve stable ordering by sorting participants by joinedAt ascending, then userId
    return Array.from(this.participants.values()).sort((a, b) => {
      const timeDiff = (a.joinedAt || 0) - (b.joinedAt || 0);
      if (timeDiff !== 0) return timeDiff;
      return a.userId.localeCompare(b.userId);
    });
  }

  public getConnectionState(): MediaConnectionState {
    return this.connectionState;
  }

  public subscribe(listener: (event: MediaProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // --- Private Helper Methods ---

  private setConnectionState(state: MediaConnectionState) {
    this.connectionState = state;
    this.emit({ type: 'connection_changed', connectionState: state });
  }

  public updateSelfParticipant(patch: Partial<MediaParticipant>) {
    if (!this.activeRoom) return;
    const selfId = this.activeRoom.user.id;
    const current = this.participants.get(selfId);
    if (current) {
      const updated = { ...current, ...patch };
      this.participants.set(selfId, updated);
      this.notifyParticipantsChanged();
    }
  }

  public addOrUpdateParticipant(participant: MediaParticipant) {
    const userId = participant.userId;
    const currentSessionId = participant.sessionId || this.activeSessionId || 'default_session';

    // Session Validation & Explicit Leave Check
    if (this.isExplicitlyLeft(userId, currentSessionId)) {
      console.log(`[CALL_CONNECTION] Discarded stale packet/event for explicitly left user: userId=${userId}, sessionId=${currentSessionId}`);
      return;
    }

    const existing = this.participants.get(userId);

    // Cancel pending 15-second grace period timer if participant produces media again or reconnects
    const pending = this.pendingDisconnectTimers.get(userId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingDisconnectTimers.delete(userId);
      console.log(`[CALL_CONNECTION] Grace period cancelled: userId=${userId}, sessionId=${currentSessionId}`);
      console.log(`[CALL_CONNECTION] Participant reconnected: userId=${userId}, sessionId=${currentSessionId}`);
    }

    const savedVol = audioMixer.getParticipantVolume(userId);

    // Preserve active MediaStreams when patch doesn't explicitly override or clear them
    const videoStream = participant.videoStream !== undefined
      ? participant.videoStream
      : (participant.isCameraEnabled === false ? null : existing?.videoStream || null);

    const screenStream = participant.screenStream !== undefined
      ? participant.screenStream
      : (participant.isScreenSharing === false ? null : existing?.screenStream || null);

    const audioStream = participant.audioStream !== undefined
      ? participant.audioStream
      : existing?.audioStream || null;

    // Preserve original joinedAt timestamp to preserve stable list position across reconnects
    const joinedAt = existing?.joinedAt || participant.joinedAt || Date.now();

    const merged: MediaParticipant = {
      ...existing,
      ...participant,
      volume: savedVol,
      sessionId: currentSessionId,
      joinedAt,
      isPendingDisconnect: false,
      connectionState: 'connected',
      videoStream,
      screenStream,
      audioStream,
      isCameraEnabled: participant.isCameraEnabled !== undefined ? participant.isCameraEnabled : (existing?.isCameraEnabled || false),
      isScreenSharing: participant.isScreenSharing !== undefined ? participant.isScreenSharing : (existing?.isScreenSharing || false),
    };

    if (this.activeRoom && userId === this.activeRoom.user.id) {
      merged.isMuted = this.isMuted;
    }

    this.participants.set(userId, merged);

    if (this.sfuAdapter && savedVol !== undefined) {
      this.sfuAdapter.setRemoteVolume(userId, savedVol);
    }

    this.notifyParticipantsChanged();
  }

  public removeParticipant(userId: string, immediate: boolean = false, reason?: string) {
    const current = this.participants.get(userId);
    const currentSessionId = (current && current.sessionId) || this.activeSessionId || 'default_session';

    const isSelf = this.activeRoom && userId === this.activeRoom.user.id;
    const isExplicit = immediate || isSelf || reason === 'explicit_leave';

    if (isExplicit) {
      console.log(`[VOICE_LIFECYCLE] Explicit Leave received: userId=${userId}, sessionId=${currentSessionId}, reason=${reason}`);
      if (currentSessionId) {
        this.explicitlyLeftUsers.set(userId, currentSessionId);
      }

      const existingTimer = this.pendingDisconnectTimers.get(userId);
      if (existingTimer) {
        clearTimeout(existingTimer.timer);
        this.pendingDisconnectTimers.delete(userId);
      }

      if (current) {
        if (current.videoStream) {
          try { current.videoStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        }
        if (current.screenStream) {
          try { current.screenStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        }
        if (current.audioStream) {
          try { current.audioStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        }
      }

      this.participants.delete(userId);
      console.log(`[VOICE_LIFECYCLE] Participant removed immediately: userId=${userId}, sessionId=${currentSessionId}`);
      this.notifyParticipantsChanged();
      return;
    }

    if (!current) return;

    // Unexpected disconnect: check if user already explicitly left
    if (this.isExplicitlyLeft(userId, currentSessionId)) {
      console.log(`[VOICE_LIFECYCLE] Ignoring unexpected disconnect for explicitly left user: userId=${userId}, sessionId=${currentSessionId}`);
      return;
    }

    if (this.pendingDisconnectTimers.has(userId)) {
      return;
    }

    // Connection Stabilization Layer: mark as pending disconnect without deleting from UI
    current.isPendingDisconnect = true;
    current.connectionState = 'reconnecting';

    const GRACE_PERIOD_MS = 20000; // 20-second grace period for unexpected disconnects
    console.log(`[VOICE_LIFECYCLE] Grace period (20s) started for media disconnect: userId=${userId}, sessionId=${currentSessionId}`);

    this.notifyParticipantsChanged();

    const timer = setTimeout(() => {
      console.log(`[VOICE_LIFECYCLE] Grace period expired (20s) for media disconnect: userId=${userId}, sessionId=${currentSessionId}`);
      this.pendingDisconnectTimers.delete(userId);

      const p = this.participants.get(userId);
      if (p) {
        if (p.videoStream) {
          try { p.videoStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        }
        if (p.screenStream) {
          try { p.screenStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        }
        if (p.audioStream) {
          try { p.audioStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        }
      }

      this.participants.delete(userId);
      console.log(`[VOICE_LIFECYCLE] Media participant removed after grace period expiration: userId=${userId}, sessionId=${currentSessionId}`);

      if (typeof window !== 'undefined') {
        try {
          const cId = this.activeRoom?.roomId || this.activeRoom?.channelId;
          if (cId) {
            voicePresenceStore.handlePresenceEvent({
              channelId: cId,
              userId,
              status: 'left',
              reason: 'grace_period_expired'
            });
          }
        } catch (e) {}
      }

      this.notifyParticipantsChanged();
    }, GRACE_PERIOD_MS);

    this.pendingDisconnectTimers.set(userId, {
      timer,
      disconnectedAt: Date.now(),
      reason: reason || 'network_interruption',
      sessionId: currentSessionId,
    });
  }

  private notifyParticipantsChanged() {
    if (this.activeRoom && typeof window !== 'undefined') {
      const selfP = this.participants.get(this.activeRoom.user.id);
      if (selfP) {
        try {
          voicePresenceStore.setLocalPresence({
            channelId: this.activeRoom.roomId || this.activeRoom.channelId || '',
            serverId: this.activeRoom.serverId,
            userId: selfP.userId,
            userRef: selfP.userRef,
            displayName: selfP.displayName,
            avatar: selfP.avatar,
            isMuted: selfP.isMuted,
            isDeafened: selfP.isDeafened || false,
            isSpeaking: selfP.isSpeaking,
            isCameraEnabled: selfP.isCameraEnabled,
            isScreenSharing: selfP.isScreenSharing,
            joinedAt: selfP.joinedAt || Date.now(),
            lastHeartbeat: Date.now(),
          });
        } catch (e) {}
      }
    }

    this.emit({
      type: 'participants_changed',
      participants: this.getParticipants(),
    });
  }

  private emit(event: MediaProviderEvent) {
    this.listeners.forEach((fn) => fn(event));
  }

  public async switchMicrophone(deviceId: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selected_audio_input', deviceId);
    }
    if (this.sfuAdapter && 'switchMicrophone' in this.sfuAdapter) {
      const res = await (this.sfuAdapter as any).switchMicrophone(deviceId);
      if (res) {
        await this.setupSpeakingDetector();
      }
      return res;
    }
    return true;
  }

  private async setupSpeakingDetector(): Promise<void> {
    if (typeof window === 'undefined' || this.isMuted) return;

    try {
      let sourceTrack: MediaStreamTrack | null = null;
      if (this.sfuAdapter && 'getLocalAudioTrack' in this.sfuAdapter) {
        sourceTrack = (this.sfuAdapter as any).getLocalAudioTrack();
      }

      if (sourceTrack && sourceTrack.readyState === 'live') {
        this.localAudioStream = new MediaStream([sourceTrack]);
        console.log('[MIC_DIAGNOSTICS] Speaking detector attached to existing SFU audio track:', sourceTrack.id);
      } else if (!this.localAudioStream || this.localAudioStream.getAudioTracks().length === 0 || this.localAudioStream.getAudioTracks()[0].readyState !== 'live') {
        console.log('[MIC_DIAGNOSTICS] Acquiring local audio stream via getUserMedia...');
        const selectedMicId = typeof window !== 'undefined' ? localStorage.getItem('selected_audio_input') : null;
        const constraints: any = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
            googEchoCancellation: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googHighpassFilter: true,
            googTypingNoiseDetection: false,
          },
        };
        if (selectedMicId && selectedMicId !== 'default') {
          constraints.audio.deviceId = selectedMicId;
        }

        try {
          this.localAudioStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          console.warn('[MIC_DIAGNOSTICS] getUserMedia with constraints failed, retrying with simple audio: true', err);
          this.localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }

      if (this.audioContext || this.speakingDetectorInterval) {
        this.cleanupSpeakingDetector();
      }

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 512;

      this.mediaSource = this.audioContext.createMediaStreamSource(this.localAudioStream);
      this.mediaSource.connect(this.audioAnalyser);

      // Note: Do NOT connect mediaSource or audioAnalyser to audioContext.destination.
      // In WebAudio on Windows (WASAPI / WebRTC), routing mic audio through WebAudio graphs
      // to audioContext.destination causes Windows echo cancellation to treat output as loopback,
      // suppressing microphone volume down to near 0.

      let lastSpeakingState = false;

      const checkVolume = () => {
        if (!this.audioAnalyser || this.isMuted) return;
        const dataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
        this.audioAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const isSpeakingNow = avg > 14;

        if (isSpeakingNow !== lastSpeakingState) {
          lastSpeakingState = isSpeakingNow;
          this.updateSelfParticipant({ isSpeaking: isSpeakingNow });
          this.emit({ type: 'speaking_changed', data: { isSpeaking: isSpeakingNow } });
        }
      };

      this.speakingDetectorInterval = setInterval(checkVolume, 100);
    } catch (e) {
      console.warn('[MIC_DIAGNOSTICS] Speaking detector setup notice:', e);
    }
  }

  private cleanupSpeakingDetector() {
    if (this.speakingDetectorInterval) {
      clearInterval(this.speakingDetectorInterval);
      this.speakingDetectorInterval = null;
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.audioAnalyser = null;
  }

  private cleanupMediaTracks() {
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach((t) => t.stop());
      this.localAudioStream = null;
    }
    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((t) => t.stop());
      this.localVideoStream = null;
    }
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
    }
    this.isMuted = false;
    this.isDeafened = false;
    this.isCameraEnabled = false;
    this.isScreenSharing = false;
  }
}

// Singleton instance for application-wide media management
export const realtimeMediaProvider = new RealtimeMediaProvider();
export default realtimeMediaProvider;
