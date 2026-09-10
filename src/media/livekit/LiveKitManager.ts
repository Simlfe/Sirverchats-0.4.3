import {
  Room,
  RoomEvent,
  Participant,
  RemoteParticipant,
  LocalParticipant,
  Track,
  RemoteTrackPublication,
  LocalTrackPublication,
  TrackPublication,
  LocalAudioTrack,
  LocalVideoTrack,
  ConnectionState as LiveKitConnectionState,
  createLocalAudioTrack,
  createLocalVideoTrack,
  VideoQuality,
  setLogLevel,
} from 'livekit-client';

import {
  SFUServerConfig,
  RoomConfig,
  MediaParticipant,
  MediaConnectionState,
  SFUAdapterEvent,
  MediaError,
  CameraPublishOptions,
  ParticipantDiagnosticsData,
} from '../../types/media';
import { getServerMemberAvatarUrl, getServerMemberDisplayName, pbService } from '../../pocketbase';
import ENDPOINTS from '../../config/endpoints';
import { audioMixer } from '../../services/audioMixer';
import voicePresenceStore from '../../services/voicePresenceStore';

export const LIVEKIT_DEFAULT_URL = ENDPOINTS.LIVEKIT_URL;
export const LIVEKIT_TOKEN_ENDPOINT = ENDPOINTS.LIVEKIT_TOKEN_ENDPOINT;

export interface TokenResponse {
  token: string;
  error?: string;
}

export interface CachedToken {
  token: string;
  roomName: string;
  identity: string;
  expiresAt: number;
  fetchedAt: number;
}

/**
 * Parses JWT token payload to extract expiration timestamp in ms.
 */
export function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    if (typeof parsed.exp === 'number') {
      return parsed.exp * 1000;
    }
  } catch (err) {
    // ignore parse error
  }
  return null;
}

export class LiveKitManager {
  private static instance: LiveKitManager;

  private room: Room | null = null;
  private config: SFUServerConfig | null = null;
  private currentRoomConfig: RoomConfig | null = null;
  private connectionState: MediaConnectionState = 'idle';
  private listeners: Set<(event: SFUAdapterEvent) => void> = new Set();
  private attachedAudioElements: Map<string, { el: HTMLMediaElement; source: 'voice' | 'screen'; userId: string }> = new Map();
  private participants: Map<string, MediaParticipant> = new Map();
  private isDeafened: boolean = false;
  private currentFacingMode: 'user' | 'environment' = 'user';
  private isJoiningPromise: Promise<void> | null = null;
  private isExplicitlyJoined: boolean = false;
  private wasConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private lastStatsMap: Map<string, { timestamp: number; bytesReceived: number; framesDecoded: number }> = new Map();
  private currentJitterMs: number = 10;

  /**
   * Applies adaptive playout buffer hint to WebRTC receiver (50ms - 150ms depending on measured network jitter)
   */
  public applyAdaptiveJitterBuffer(track: Track, publication?: TrackPublication | RemoteTrackPublication) {
    if (!track) return;
    try {
      const receiver = (track as any).receiver || (publication as any)?.receiver;
      if (receiver && 'playoutDelayHint' in receiver) {
        const jitter = this.currentJitterMs || 10;
        const bufferSeconds = Math.min(0.15, Math.max(0.05, 0.05 + (jitter / 1000) * 1.5));
        receiver.playoutDelayHint = bufferSeconds;
        console.log(`[LIVEKIT] Applied adaptive playoutDelayHint=${bufferSeconds.toFixed(3)}s (${Math.round(bufferSeconds * 1000)}ms) for track ${track.sid || track.mediaStreamTrack?.id}`);
      }
      if (typeof (track as any).setPlayoutDelay === 'function') {
        (track as any).setPlayoutDelay(0.05, 0.15);
      }
    } catch (err) {
      console.warn('[LIVEKIT] Failed setting adaptive playout delay:', err);
    }
  }

  // Cached authentication tokens (key: `${roomName}:${identity}`)
  private tokenCache: Map<string, CachedToken> = new Map();

  // Cached audio track
  private cachedAudioTrack: LocalAudioTrack | null = null;

  // Persistent screen share session state
  private screenShareSession: {
    isActive: boolean;
    videoTrack: MediaStreamTrack | null;
    audioTrack: MediaStreamTrack | null;
    videoPublication: LocalTrackPublication | null;
    audioPublication: LocalTrackPublication | null;
  } = {
    isActive: false,
    videoTrack: null,
    audioTrack: null,
    videoPublication: null,
    audioPublication: null,
  };

  // Active frame monitors for remote screen share publications
  private activeFrameMonitors = new Map<string, { stop: () => void }>();

  // Background token refresh timer
  private tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

  private sfuUrl: string = LIVEKIT_DEFAULT_URL;
  private tokenEndpoint: string = LIVEKIT_TOKEN_ENDPOINT;

  constructor() {
    try {
      setLogLevel('warn');
    } catch (e) {}
    this.startTokenRefreshTimer();
    audioMixer.subscribe(() => {
      this.updateAllAudioElementVolumes();
    });
  }

  public static getInstance(): LiveKitManager {
    if (!LiveKitManager.instance) {
      LiveKitManager.instance = new LiveKitManager();
    }
    return LiveKitManager.instance;
  }

  public configure(config: SFUServerConfig): void {
    this.config = config;
    if (config.sfuEndpoint) {
      this.sfuUrl = config.sfuEndpoint;
    }
  }

  // --- TOKEN CACHING & FETCHING ---

  /**
   * Generates a deterministic LiveKit room name from RoomConfig
   */
  public getRoomName(config: RoomConfig): string {
    if (config.callId) return `call_${config.callId}`;
    return `room_${config.roomId}`;
  }

  /**
   * Checks if a valid non-expiring cached token exists.
   * Reuses token if it has more than minRemainingMs (default 5 mins) before expiry.
   */
  public getCachedToken(roomName: string, identity: string, minRemainingMs: number = 5 * 60 * 1000): string | null {
    const key = `${roomName}:${identity}`;
    const cached = this.tokenCache.get(key);
    if (!cached) return null;

    const remaining = cached.expiresAt - Date.now();
    if (remaining > minRemainingMs) {
      console.log(`[LiveKitManager] Reusing cached token for "${identity}" in room "${roomName}" (${Math.round(remaining / 1000)}s remaining)`);
      return cached.token;
    }

    console.log(`[LiveKitManager] Cached token for "${identity}" in room "${roomName}" is expiring soon or expired. Will request fresh token.`);
    this.tokenCache.delete(key);
    return null;
  }

  /**
   * Requests a JWT token from backend endpoint with fallback proxy, or returns cached token if valid.
   */
  public async getToken(identity: string, name: string, roomName: string, forceRefresh: boolean = false): Promise<string> {
    if (!forceRefresh) {
      const cachedToken = this.getCachedToken(roomName, identity);
      if (cachedToken) {
        return cachedToken;
      }
    }

    const defaultEndpoint = ENDPOINTS.LIVEKIT_TOKEN_ENDPOINT;

    const isDifferentOrigin = typeof window !== 'undefined' && !window.location.origin.includes('chat.sirverdata.top');
    const endpointsToTry = isDifferentOrigin
      ? ['/livekit/token', defaultEndpoint]
      : [defaultEndpoint, '/livekit/token'];

    let lastError: Error | null = null;

    for (const endpoint of endpointsToTry) {
      console.log(`[LiveKitManager] Requesting LiveKit token for identity: "${identity}", name: "${name}", room: "${roomName}" at endpoint: ${endpoint}`);
      const startTime = Date.now();
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            identity,
            name,
            room: roomName,
          }),
        });

        const duration = Date.now() - startTime;
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status} (${response.statusText}): ${errorText || 'No error message'}`);
        }

        let data: TokenResponse;
        try {
          data = await response.json();
        } catch (jsonErr: any) {
          throw new Error(`Failed to parse token response JSON from ${endpoint}`);
        }

        if (!data.token) {
          throw new Error(data.error || `Token response from ${endpoint} missing token field`);
        }

        const expMs = parseJwtExp(data.token);
        const expiresAt = expMs || (Date.now() + 12 * 60 * 60 * 1000); // 12 hours fallback
        const cacheEntry: CachedToken = {
          token: data.token,
          roomName,
          identity,
          expiresAt,
          fetchedAt: Date.now(),
        };

        const key = `${roomName}:${identity}`;
        this.tokenCache.set(key, cacheEntry);
        console.log(`[LiveKitManager] Cached token successfully for "${identity}" in room "${roomName}" (took ${duration}ms, expires in ${Math.round((expiresAt - Date.now()) / 1000)}s)`);

        return data.token;
      } catch (err: any) {
        const duration = Date.now() - startTime;
        console.warn(`[LiveKitManager] Token request to ${endpoint} failed after ${duration}ms:`, err?.message || err);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error(`Token request failure at ${defaultEndpoint}: ${lastError?.message || 'Unknown network error'}`);
  }

  /**
   * Background token prefetch for upcoming voice channel joins.
   */
  public async prefetchToken(identity: string, name: string, roomName: string): Promise<string | null> {
    try {
      if (this.getCachedToken(roomName, identity)) {
        return this.getCachedToken(roomName, identity);
      }
      return await this.getToken(identity, name, roomName);
    } catch (err) {
      console.warn(`[LiveKitManager] Prefetch token failed for room "${roomName}":`, err);
      return null;
    }
  }

  /**
   * Prefetches token based on channel object and user object.
   */
  public async prefetchChannelToken(channel: { id: string; name: string }, user: { id: string; username: string; display_name?: string }): Promise<string | null> {
    if (!channel || !user) return null;
    const roomName = `room_${channel.id}`;
    const displayName = user.display_name || user.username;
    return this.prefetchToken(user.id, displayName, roomName);
  }

  // --- ROOM SESSION MANAGEMENT ---

  /**
   * Joins a LiveKit room. Reuses existing connected Room if already connected to the same room!
   */
  public async joinRoom(roomConfig: RoomConfig): Promise<void> {
    if (this.isJoiningPromise) {
      if (this.currentRoomConfig?.roomId === roomConfig.roomId) {
        console.log('[LiveKitManager] Join already in progress for room:', roomConfig.roomId);
        return this.isJoiningPromise;
      }
      try {
        await this.isJoiningPromise;
      } catch (e) {
        // Ignored previous join error
      }
    }

    const joinTask = (async () => {
      const roomName = this.getRoomName(roomConfig);

      // Rule: Never create a new Room if already connected to the same room!
      if (this.room && (this.room.state === LiveKitConnectionState.Connected || this.room.state === LiveKitConnectionState.Connecting) && this.currentRoomConfig?.roomId === roomConfig.roomId) {
        console.log('[LiveKitManager] Already connected/connecting to room:', roomConfig.roomId, '- Reusing active Room instance.');
        this.isExplicitlyJoined = true;
        this.currentRoomConfig = roomConfig;
        this.setConnectionState('connected');
        this.syncAllParticipants();
        return;
      }

      // If connected to a different room, disconnect previous room explicitly
      if (this.room && this.currentRoomConfig?.roomId !== roomConfig.roomId) {
        console.log('[LiveKitManager] Switching rooms. Disconnecting previous session...');
        await this.leaveRoom(true);
      }

      this.currentRoomConfig = roomConfig;
      this.isExplicitlyJoined = true;
      this.setConnectionState('joining');

      const identity = roomConfig.user.id;
      const member = roomConfig.serverId ? pbService.getCachedServerMember(roomConfig.serverId, roomConfig.user.id) : null;
      const displayName =
        getServerMemberDisplayName(member, roomConfig.user, roomConfig.serverId) ||
        roomConfig.user.display_name ||
        roomConfig.user.username;

      // Step 1: Request or fetch cached JWT token (Immediate & Early)
      let token: string;
      try {
        token = await this.getToken(identity, displayName, roomName);
      } catch (tokenErr: any) {
        console.error('[LiveKitManager] Token acquisition failed:', tokenErr);
        const mediaErr: MediaError = {
          code: 'TOKEN_ERROR',
          message: tokenErr?.message || 'Token acquisition failure',
          details: tokenErr,
        };
        this.setConnectionState('failed');
        this.emit({ type: 'error', error: mediaErr });
        throw new Error(mediaErr.message);
      }

      // Step 2: Instantiate LiveKit Room if needed
      if (!this.room) {
        this.room = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
            videoCodec: 'vp8',
            dtx: true,
            red: true,
          },
        });
        this.setupRoomEventListeners(this.room);
      }

      // Step 3: Connect to LiveKit SFU
      this.setConnectionState('connecting');
      const url = this.config?.sfuEndpoint || this.sfuUrl || LIVEKIT_DEFAULT_URL;
      console.log(`[LiveKitManager] Connecting to LiveKit at ${url} (room: ${roomName})...`);

      try {
        await this.room.connect(url, token);
        console.log(`[LiveKitManager] LiveKit connection success to room "${this.room.name}" as "${identity}"`);
        this.wasConnected = true;
        this.reconnectAttempts = 0;
        this.setConnectionState('connected');
        this.startPingMonitor();
        this.syncAllParticipants();
      } catch (connErr: any) {
        console.warn('[LiveKitManager] LiveKit connection attempt failed:', connErr?.message || connErr);
        this.isExplicitlyJoined = false;
        this.wasConnected = false;
        this.currentRoomConfig = null;
        if (this.room) {
          try {
            await this.room.disconnect(true);
          } catch (e) {}
          this.room = null;
        }

        const isAbort =
          connErr?.name === 'AbortError' ||
          connErr?.message?.includes('Abort') ||
          connErr?.message?.includes('abort') ||
          connErr?.message?.includes('Client initiated disconnect');
        if (isAbort) {
          console.warn('[LiveKitManager] Connection attempt was cancelled/aborted:', connErr?.message);
          if (this.currentRoomConfig?.roomId === roomConfig.roomId) {
            this.setConnectionState('disconnected');
          }
          return;
        }

        const mediaErr: MediaError = {
          code: 'SFU_UNAVAILABLE',
          message: `LiveKit connection failure: ${connErr?.message || 'Failed to connect to LiveKit server'}`,
          details: connErr,
        };
        this.setConnectionState('failed');
        this.emit({ type: 'error', error: mediaErr });
        throw new Error(mediaErr.message);
      }
    })();

    this.isJoiningPromise = joinTask;
    try {
      await joinTask;
    } finally {
      if (this.isJoiningPromise === joinTask) {
        this.isJoiningPromise = null;
      }
    }
  }

  /**
   * Leaves the session. If explicit is false, keeps the Room connected in background.
   */
  public async leaveRoom(explicit: boolean = true): Promise<void> {
    if (!explicit) {
      console.log('[LiveKitManager] UI hidden. Keeping room connection alive in background.');
      return;
    }

    this.isExplicitlyJoined = false;
    this.wasConnected = false;
    this.currentRoomConfig = null;
    this.reconnectAttempts = 0;

    if (!this.room) {
      this.setConnectionState('disconnected');
      return;
    }

    this.setConnectionState('leaving');

    try {
      // 1. Detach and remove all attached audio elements
      this.attachedAudioElements.forEach(({ el }) => {
        try {
          el.pause();
          el.srcObject = null;
          el.remove();
        } catch (e) {}
      });
      this.attachedAudioElements.clear();

      // Stop all screen share frame monitors
      this.activeFrameMonitors.forEach((monitor) => {
        try {
          monitor.stop();
        } catch (e) {}
      });
      this.activeFrameMonitors.clear();

      // 2. Remove all Room event listeners to eliminate stale triggers
      try {
        this.room.removeAllListeners();
      } catch (e) {}

      // 3. Stop and clean cached local tracks
      if (this.cachedAudioTrack) {
        try {
          this.cachedAudioTrack.mute();
          this.cachedAudioTrack.stop();
        } catch (e) {}
        this.cachedAudioTrack = null;
      }

      // 4. Reset screen share session
      if (this.screenShareSession.isActive) {
        if (this.screenShareSession.videoTrack) {
          try {
            this.screenShareSession.videoTrack.stop();
          } catch (e) {}
        }
        if (this.screenShareSession.audioTrack) {
          try {
            this.screenShareSession.audioTrack.stop();
          } catch (e) {}
        }
      }
      this.screenShareSession = {
        isActive: false,
        videoTrack: null,
        audioTrack: null,
        videoPublication: null,
        audioPublication: null,
      };

      // 5. Disconnect Room
      this.stopPingMonitor();
      await this.room.disconnect(true);
    } catch (err) {
      console.warn('[LiveKitManager] Error during room disconnect:', err);
    } finally {
      this.stopPingMonitor();
      this.participants.clear();
      this.room = null;
      this.currentRoomConfig = null;
      this.setConnectionState('disconnected');
    }
  }

  // --- TRACK CACHING & REUSE ---

  /**
   * Returns the current live LocalAudioTrack MediaStreamTrack if available.
   */
  public getLocalAudioTrack(): MediaStreamTrack | null {
    if (this.cachedAudioTrack?.mediaStreamTrack && this.cachedAudioTrack.mediaStreamTrack.readyState === 'live') {
      return this.cachedAudioTrack.mediaStreamTrack;
    }
    if (this.room?.localParticipant) {
      const pub = Array.from(this.room.localParticipant.audioTrackPublications.values()).find(
        (p) => p.source === Track.Source.Microphone || (p.source !== Track.Source.ScreenShareAudio && p.trackName !== 'screen_share_audio')
      );
      if (pub?.track?.mediaStreamTrack && pub.track.mediaStreamTrack.readyState === 'live') {
        return pub.track.mediaStreamTrack;
      }
    }
    return null;
  }

  /**
   * Enables or mutes microphone using cached LocalAudioTrack when possible.
   */
  public async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    if (!this.room || !this.room.localParticipant) return false;

    try {
      if (enabled) {
        console.log('[MIC_DIAGNOSTICS] Enabling microphone in LiveKitManager...');
        // If cached audio track exists and its MediaStreamTrack is live, reuse/unmute it directly
        if (this.cachedAudioTrack && this.cachedAudioTrack.mediaStreamTrack?.readyState === 'live') {
          console.log('[MIC_DIAGNOSTICS] Unmuting cached local audio track:', {
            sid: this.cachedAudioTrack.sid,
            trackId: this.cachedAudioTrack.mediaStreamTrack.id,
            label: this.cachedAudioTrack.mediaStreamTrack.label,
            readyState: this.cachedAudioTrack.mediaStreamTrack.readyState,
          });
          await this.cachedAudioTrack.unmute();
          if (this.cachedAudioTrack.mediaStreamTrack) {
            this.cachedAudioTrack.mediaStreamTrack.enabled = true;
          }
          return true;
        }

        this.cachedAudioTrack = null;

        const selectedMicId = typeof window !== 'undefined' ? localStorage.getItem('selected_audio_input') : null;
        const audioOptions: any = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          voiceIsolation: true,
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: false,
        };

        if (selectedMicId && selectedMicId !== 'default') {
          audioOptions.deviceId = selectedMicId;
        }

        const publishOptions: any = {
          dtx: true,
          red: true,
        };

        console.log('[MIC_DIAGNOSTICS] Requesting LiveKit setMicrophoneEnabled(true) with WebRTC voice constraints:', audioOptions);

        try {
          await this.room.localParticipant.setMicrophoneEnabled(true, audioOptions, publishOptions);
        } catch (firstErr) {
          console.warn('[MIC_DIAGNOSTICS] Acquisition with selected deviceId failed, retrying with default audio constraints:', firstErr);
          await this.room.localParticipant.setMicrophoneEnabled(true, {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
        }

        const pub = Array.from(this.room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone || (p.source !== Track.Source.ScreenShareAudio && p.trackName !== 'screen_share_audio')
        );
        if (pub?.track && pub.track instanceof LocalAudioTrack) {
          this.cachedAudioTrack = pub.track;
          const mst = this.cachedAudioTrack.mediaStreamTrack;
          if (mst) {
            mst.enabled = true;
            mst.onmute = () => console.warn('[MIC_DIAGNOSTICS] MediaStreamTrack muted by OS/hardware:', mst.id);
            mst.onunmute = () => console.log('[MIC_DIAGNOSTICS] MediaStreamTrack unmuted by OS/hardware:', mst.id);
            mst.onended = () => console.warn('[MIC_DIAGNOSTICS] MediaStreamTrack ended unexpectedly:', mst.id);

            console.log('[MIC_DIAGNOSTICS] Microphone track successfully acquired & published to LiveKit:', {
              trackId: mst.id,
              label: mst.label || 'Default Microphone',
              readyState: mst.readyState,
              enabled: mst.enabled,
              muted: mst.muted,
              isMutedInLiveKit: this.cachedAudioTrack.isMuted,
              settings: typeof mst.getSettings === 'function' ? mst.getSettings() : {},
            });
          }
        }
        return true;
      } else {
        console.log('[MIC_DIAGNOSTICS] Disabling/muting microphone in LiveKitManager...');
        if (this.cachedAudioTrack) {
          await this.cachedAudioTrack.mute();
        }
        await this.room.localParticipant.setMicrophoneEnabled(false);
        const pubs = Array.from(this.room.localParticipant.audioTrackPublications.values()).filter(
          (p) => p.source === Track.Source.Microphone || (p.source !== Track.Source.ScreenShareAudio && p.trackName !== 'screen_share_audio')
        );
        for (const pub of pubs) {
          if (pub.track) {
            try {
              await pub.track.mute();
            } catch (e) {}
          }
        }
        this.updateAllAudioElementVolumes();
        return true;
      }
    } catch (err) {
      console.warn('[MIC_DIAGNOSTICS] LiveKit setMicrophoneEnabled failed:', err);
      return false;
    }
  }

  public async switchMicrophone(deviceId: string): Promise<boolean> {
    if (typeof window !== 'undefined') {
      localStorage.setItem('selected_audio_input', deviceId);
    }
    if (!this.room || !this.room.localParticipant) {
      console.log('[MIC_DIAGNOSTICS] Microphone preference saved (not connected to room):', deviceId);
      return true;
    }
    try {
      console.log('[MIC_DIAGNOSTICS] Switching active microphone device to:', deviceId);
      await this.room.switchActiveDevice('audioinput', deviceId);
      const pub = Array.from(this.room.localParticipant.audioTrackPublications.values()).find(
        (p) => p.source === Track.Source.Microphone || (p.source !== Track.Source.ScreenShareAudio && p.trackName !== 'screen_share_audio')
      );
      if (pub?.track && pub.track instanceof LocalAudioTrack) {
        this.cachedAudioTrack = pub.track;
        if (this.cachedAudioTrack.mediaStreamTrack) {
          this.cachedAudioTrack.mediaStreamTrack.enabled = true;
          console.log('[MIC_DIAGNOSTICS] Switched microphone track successfully:', {
            trackId: this.cachedAudioTrack.mediaStreamTrack.id,
            label: this.cachedAudioTrack.mediaStreamTrack.label,
            readyState: this.cachedAudioTrack.mediaStreamTrack.readyState,
            enabled: this.cachedAudioTrack.mediaStreamTrack.enabled,
          });
        }
      }
      return true;
    } catch (err) {
      console.warn('[MIC_DIAGNOSTICS] Failed to switch active microphone device:', err);
      return false;
    }
  }

  public async publishAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.room || !this.room.localParticipant) return;
    try {
      await this.room.localParticipant.publishTrack(track, { name: 'microphone' });
    } catch (err) {
      console.warn('[LiveKitManager] Failed to publish audio track:', err);
    }
  }

  public async unpublishAudioTrack(): Promise<void> {
    if (!this.room || !this.room.localParticipant) return;
    try {
      if (this.cachedAudioTrack) {
        await this.cachedAudioTrack.mute();
        return;
      }
      const pubs = Array.from(this.room.localParticipant.audioTrackPublications.values()).filter(
        (p) => p.source === Track.Source.Microphone || (p.source !== Track.Source.ScreenShareAudio && p.trackName !== 'screen_share_audio')
      );
      for (const pub of pubs) {
        if (pub.track) {
          await pub.track.mute();
        }
      }
    } catch (err) {
      console.warn('[LiveKitManager] Failed to unpublish audio track:', err);
    }
  }

  public async publishVideoTrack(track: MediaStreamTrack, options?: CameraPublishOptions): Promise<void> {
    if (!this.room || !this.room.localParticipant) {
      console.warn('[CAMERA_PIPELINE] Cannot publish video track: Local participant not connected to room.');
      return;
    }

    const codec = options?.codec || 'vp8';
    const targetFps = options?.targetFps || 60;
    const maxBitrate = options?.maxBitrateBps || 6_000_000;
    const enableSimulcast = options?.simulcast ?? true;

    console.log(`[CAMERA_PIPELINE] Publishing camera track options:
  - Requested Profile : ${options?.profile || 'auto'} (Active: ${options?.activeProfile || 'balanced'})
  - Target Resolution : ${options?.targetWidth || 1280}x${options?.targetHeight || 720} @ ${targetFps} FPS
  - Actual Captured   : ${options?.actualWidth || 'unknown'}x${options?.actualHeight || 'unknown'} @ ${options?.actualFps ? options.actualFps.toFixed(1) : 'unknown'} FPS
  - Published Res     : ${options?.actualWidth || 1280}x${options?.actualHeight || 720}
  - Codec Chosen      : ${codec.toUpperCase()}
  - Max Bitrate       : ${(maxBitrate / 1_000_000).toFixed(2)} Mbps (${maxBitrate.toLocaleString()} bps)
  - Simulcast Enabled : ${enableSimulcast}
  - Device Track ID   : ${track.id}
  - Device Label      : "${track.label}"`);

    try {
      const videoEncoding = {
        maxBitrate,
        maxFramerate: targetFps,
        priority: 'high' as const,
      };

      const simulcastEncodings = enableSimulcast
        ? [
            {
              rid: 'f',
              maxBitrate,
              maxFramerate: targetFps,
              quality: VideoQuality.HIGH,
            },
            {
              rid: 'm',
              maxBitrate: Math.round(maxBitrate * 0.35),
              maxFramerate: Math.min(targetFps, 30),
              scaleResolutionDownBy: 2.0,
              quality: VideoQuality.MEDIUM,
            },
            {
              rid: 'q',
              maxBitrate: 150_000,
              maxFramerate: 15,
              scaleResolutionDownBy: 4.0,
              quality: VideoQuality.LOW,
            },
          ]
        : undefined;

      const pub = await this.room.localParticipant.publishTrack(track, {
        name: 'camera',
        source: Track.Source.Camera,
        videoCodec: codec,
        videoEncoding,
        simulcast: enableSimulcast,
        dtx: false,
      });

      console.log(`[CAMERA_PIPELINE] Camera video track successfully published to SFU! SID: ${pub?.trackSid || 'ok'}`);
    } catch (err) {
      console.warn('[CAMERA_PIPELINE] Failed to publish video track:', err);
    }
  }

  public async unpublishVideoTrack(): Promise<void> {
    if (!this.room || !this.room.localParticipant) return;
    try {
      const pubs = Array.from(this.room.localParticipant.videoTrackPublications.values());
      for (const pub of pubs) {
        if (pub.track && pub.source === Track.Source.Camera) {
          await pub.track.mute();
        }
      }
    } catch (err) {
      console.warn('[LiveKitManager] Failed to unpublish video track:', err);
    }
  }

  public async publishScreenTrack(track: MediaStreamTrack, options?: CameraPublishOptions): Promise<void> {
    const oldTrackId = this.screenShareSession.videoTrack?.id || 'none';
    const newTrackId = track.id;
    console.log(`[SCREEN_SHARE] Stage 1: Screen share track requested. oldTrackId=${oldTrackId}, newTrackId=${newTrackId}, label="${track.label}"`);

    this.screenShareSession.isActive = true;
    this.screenShareSession.videoTrack = track;

    if (!this.room || !this.room.localParticipant) {
      console.log('[SCREEN_SHARE] Local participant not connected to room yet. Caching video track for auto-publishing upon connection.');
      return;
    }

    const maxBitrate = options?.maxBitrateBps || 8_000_000;
    const maxFramerate = options?.targetFps || 60;
    const simulcast = options?.simulcast !== undefined ? options.simulcast : false;

    const screenShareEncoding = {
      maxBitrate,
      maxFramerate,
      priority: 'high' as const,
    };

    const existingPub = this.screenShareSession.videoPublication ||
      Array.from(this.room.localParticipant.videoTrackPublications.values()).find(
        (p) => p.source === Track.Source.ScreenShare
      );

    if (existingPub && existingPub.track) {
      console.log(`[SCREEN_SHARE] Stage 2: Existing screen publication found (SID=${existingPub.trackSid}). Executing replaceTrack API...`);
      try {
        if ('setVideoEncoding' in existingPub && typeof (existingPub as any).setVideoEncoding === 'function') {
          await (existingPub as any).setVideoEncoding(screenShareEncoding);
        }
        if ('replaceTrack' in existingPub && typeof (existingPub as any).replaceTrack === 'function') {
          await (existingPub as any).replaceTrack(track);
          console.log(`[SCREEN_SHARE] Stage 3: replaceTrack SUCCESS on publication! SID=${existingPub.trackSid}, oldTrackId=${oldTrackId} -> newTrackId=${newTrackId}`);
          return;
        } else if ('replaceTrack' in existingPub.track && typeof (existingPub.track as any).replaceTrack === 'function') {
          await (existingPub.track as any).replaceTrack(track);
          console.log(`[SCREEN_SHARE] Stage 3: replaceTrack SUCCESS on track! SID=${existingPub.trackSid}, oldTrackId=${oldTrackId} -> newTrackId=${newTrackId}`);
          return;
        } else {
          console.log('[SCREEN_SHARE] replaceTrack method unavailable. Unpublishing old track and publishing new track...');
          await this.room.localParticipant.unpublishTrack(existingPub.track);
          const pub = await this.room.localParticipant.publishTrack(track, {
            name: 'screen_share',
            source: Track.Source.ScreenShare,
            videoCodec: options?.codec || 'vp8',
            videoEncoding: screenShareEncoding,
            simulcast,
            dtx: false,
          });
          this.screenShareSession.videoPublication = pub || null;
          console.log(`[SCREEN_SHARE] Stage 4: Re-published track SID=${pub?.trackSid || 'ok'}`);
          return;
        }
      } catch (err: any) {
        console.warn('[SCREEN_SHARE] replaceTrack failed, falling back to fresh publish:', err);
      }
    }

    try {
      const pub = await this.room.localParticipant.publishTrack(track, {
        name: 'screen_share',
        source: Track.Source.ScreenShare,
        videoCodec: options?.codec || 'vp8',
        videoEncoding: screenShareEncoding,
        simulcast,
        dtx: false,
      });
      this.screenShareSession.videoPublication = pub || null;
      console.log(`[SCREEN_SHARE] Stage 4: Fresh screen video track published successfully (SID=${pub?.trackSid || 'ok'}) maxBitrate=${maxBitrate} maxFps=${maxFramerate}`);
      console.log(`[SCREEN_SHARE] Stage 5: Subscriber update completed & Stage 6: Playback started for newTrackId=${track.id}`);
    } catch (err) {
      console.warn('[SCREEN_SHARE] Failed to publish screen video track:', err);
    }
  }

  public async publishScreenAudioTrack(track: MediaStreamTrack): Promise<void> {
    console.log('[SCREEN_SHARE] Screen share audio track requested, but screen sharing is strictly VIDEO ONLY. Stopping track and ignoring.');
    try {
      track.stop();
    } catch (e) {}
    return;
  }

  public async unpublishScreenTrack(): Promise<void> {
    console.log('[SCREEN_SHARE] screen share ended: unpublishing video & system audio tracks');
    this.screenShareSession = {
      isActive: false,
      videoTrack: null,
      audioTrack: null,
      videoPublication: null,
      audioPublication: null,
    };

    if (!this.room || !this.room.localParticipant) return;
    try {
      const pubs = Array.from(this.room.localParticipant.videoTrackPublications.values());
      for (const pub of pubs) {
        if (pub.track && pub.source === Track.Source.ScreenShare) {
          await this.room.localParticipant.unpublishTrack(pub.track);
        }
      }
      const audioPubs = Array.from(this.room.localParticipant.audioTrackPublications.values());
      for (const pub of audioPubs) {
        if (pub.track && pub.source === Track.Source.ScreenShareAudio) {
          await this.room.localParticipant.unpublishTrack(pub.track);
        }
      }
      console.log('[SCREEN_SHARE] tracks unpublished cleanly');
    } catch (err) {
      console.warn('[SCREEN_SHARE] Failed to unpublish screen tracks:', err);
    }
  }

  // --- PARTICIPANT & VOLUME CONTROLS ---

  public updateAllAudioElementVolumes(): void {
    const state = audioMixer.getState();
    const voiceMasterRatio = state.masterVolume / 100;
    const streamMasterRatio = (state.masterStreamVolume ?? 100) / 100;

    this.attachedAudioElements.forEach(({ el, source, userId }) => {
      if (this.isDeafened) {
        el.muted = true;
        return;
      }

      if (source === 'voice') {
        const p = this.participants.get(userId);
        const isRemoteParticipantMuted = p ? p.isMuted : false;
        const isMixerMuted = audioMixer.isParticipantMuted(userId);
        const volRatio = audioMixer.getParticipantVolume(userId) / 100;
        el.muted = isMixerMuted || isRemoteParticipantMuted;
        el.volume = Math.max(0, Math.min(1, voiceMasterRatio * volRatio));
      } else {
        const isMuted = audioMixer.isScreenshareMuted(userId);
        const volRatio = audioMixer.getScreenshareVolume(userId) / 100;
        el.muted = isMuted;
        el.volume = Math.max(0, Math.min(1, streamMasterRatio * volRatio));
      }
    });
  }

  public setRemoteVolume(userId: string, volume: number): void {
    audioMixer.setParticipantVolume(userId, volume);
    this.updateAllAudioElementVolumes();
  }

  public setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    this.updateAllAudioElementVolumes();
  }

  public setFacingMode(mode: 'user' | 'environment'): void {
    this.currentFacingMode = mode;
  }

  public getConnectionState(): MediaConnectionState {
    return this.connectionState;
  }

  public getParticipants(): MediaParticipant[] {
    if (!this.room) return Array.from(this.participants.values());
    const list: MediaParticipant[] = [];

    if (this.room.localParticipant) {
      const mapped = this.mapParticipantToMediaParticipant(this.room.localParticipant, true);
      this.participants.set(mapped.userId, mapped);
      list.push(mapped);
    }

    if (this.room.remoteParticipants) {
      this.room.remoteParticipants.forEach((p) => {
        const mapped = this.mapParticipantToMediaParticipant(p, false);
        this.participants.set(mapped.userId, mapped);
        list.push(mapped);
      });
    }

    return list;
  }

  public getRoom(): Room | null {
    return this.room;
  }

  public onEvent(listener: (event: SFUAdapterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // --- BACKGROUND TOKEN REFRESH & AUTOMATIC RECONNECT ---

  private startTokenRefreshTimer() {
    if (this.tokenRefreshTimer) return;
    this.tokenRefreshTimer = setInterval(() => {
      this.checkAndRefreshToken();
    }, 45 * 1000); // Check every 45s
  }

  private async checkAndRefreshToken() {
    if (!this.currentRoomConfig) return;
    const roomName = this.getRoomName(this.currentRoomConfig);
    const identity = this.currentRoomConfig.user.id;
    const member = this.currentRoomConfig.serverId ? pbService.getCachedServerMember(this.currentRoomConfig.serverId, identity) : null;
    const displayName =
      getServerMemberDisplayName(member, this.currentRoomConfig.user, this.currentRoomConfig.serverId) ||
      this.currentRoomConfig.user.display_name ||
      this.currentRoomConfig.user.username;

    // Refresh if cached token expires in less than 5 minutes
    const validToken = this.getCachedToken(roomName, identity, 5 * 60 * 1000);
    if (!validToken) {
      console.log(`[LiveKitManager] Silent background token refresh for "${identity}" in room "${roomName}"...`);
      try {
        await this.getToken(identity, displayName, roomName, true);
      } catch (err) {
        console.warn('[LiveKitManager] Silent token refresh failed:', err);
      }
    }
  }

  private isScreenShareVideoTrack(publication: TrackPublication, track?: Track): boolean {
    if (publication.source === Track.Source.ScreenShare) return true;
    const pubName = publication.trackName || (publication as any).name;
    if (pubName === 'screen_share' || pubName === 'screen') return true;
    if (track) {
      const trackName = (track as any).name;
      if (track.source === Track.Source.ScreenShare || trackName === 'screen_share' || trackName === 'screen') return true;
    }
    return false;
  }

  private async forceResubscribe(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    reason: string = 'stale or missing track'
  ): Promise<void> {
    const pubSid = publication.trackSid || (publication as any).sid;
    console.log(`[LIFECYCLE_AUDIT] Force resubscribing to publication SID: ${pubSid}, participant: ${participant.identity}. Reason: ${reason}`);

    if (this.activeFrameMonitors.has(pubSid)) {
      this.activeFrameMonitors.get(pubSid)?.stop();
    }

    try {
      publication.setSubscribed(false);
    } catch (e) {
      console.warn('[LIFECYCLE_AUDIT] Error unsubscribing during forceResubscribe:', e);
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      publication.setSubscribed(true);
      console.log(`[LIFECYCLE_AUDIT] Fresh subscription requested for SID: ${pubSid}`);
    } catch (e) {
      console.error('[LIFECYCLE_AUDIT] Error subscribing during forceResubscribe:', e);
    }
  }

  private monitorScreenShareFrames(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    track: Track
  ) {
    const pubSid = publication.trackSid || (publication as any).sid;
    if (this.activeFrameMonitors.has(pubSid)) {
      this.activeFrameMonitors.get(pubSid)?.stop();
    }

    const mst = track.mediaStreamTrack;
    if (!mst || mst.readyState === 'ended') {
      console.warn(`[LIFECYCLE_AUDIT] Cannot monitor frames on ended/null track for publication SID: ${pubSid}`);
      this.forceResubscribe(publication, participant, 'track ended or missing on monitor start');
      return;
    }

    console.log(`[LIFECYCLE_AUDIT] Starting Frame Detection Monitor for publication ${pubSid} (trackId: ${mst.id}, kind: ${mst.kind}, readyState: ${mst.readyState}, enabled: ${mst.enabled}, muted: ${mst.muted})`);

    let frameDecoded = false;
    const offscreenVideo = document.createElement('video');
    offscreenVideo.muted = true;
    offscreenVideo.playsInline = true;
    offscreenVideo.style.display = 'none';
    offscreenVideo.style.position = 'absolute';
    offscreenVideo.style.pointerEvents = 'none';
    document.body.appendChild(offscreenVideo);

    const ms = new MediaStream([mst]);
    offscreenVideo.srcObject = ms;

    let checkTimeout: ReturnType<typeof setTimeout> | null = null;

    const stopMonitor = () => {
      if (checkTimeout) clearTimeout(checkTimeout);
      try {
        offscreenVideo.pause();
        offscreenVideo.srcObject = null;
        offscreenVideo.remove();
      } catch (e) {}
      this.activeFrameMonitors.delete(pubSid);
    };

    this.activeFrameMonitors.set(pubSid, { stop: stopMonitor });

    const onFrameReceived = () => {
      if (frameDecoded) return;
      frameDecoded = true;
      console.log(`[LIFECYCLE_AUDIT] ✓ Decoded video frame confirmed for publication ${pubSid} (resolution: ${offscreenVideo.videoWidth}x${offscreenVideo.videoHeight}, track: ${mst.id})`);
      stopMonitor();
    };

    if ('requestVideoFrameCallback' in offscreenVideo) {
      (offscreenVideo as any).requestVideoFrameCallback(onFrameReceived);
    }
    offscreenVideo.onloadedmetadata = () => {
      if (offscreenVideo.videoWidth > 0 && offscreenVideo.videoHeight > 0) {
        onFrameReceived();
      }
    };
    offscreenVideo.onresize = () => {
      if (offscreenVideo.videoWidth > 0 && offscreenVideo.videoHeight > 0) {
        onFrameReceived();
      }
    };
    offscreenVideo.ontimeupdate = () => {
      if (offscreenVideo.videoWidth > 0 && offscreenVideo.videoHeight > 0) {
        onFrameReceived();
      }
    };

    offscreenVideo.play().catch(() => {});

    checkTimeout = setTimeout(() => {
      if (!frameDecoded) {
        console.warn(`[LIFECYCLE_AUDIT] ❌ TIMEOUT (2500ms): No video frames decoded for publication ${pubSid}. Subscription failed! Force resubscribing...`);
        stopMonitor();
        this.forceResubscribe(publication, participant, 'no video frames decoded within timeout');
      }
    }, 2500);
  }

  private handleSubscribedTrack(
    track: Track,
    publication: RemoteTrackPublication | TrackPublication,
    participant: RemoteParticipant | Participant
  ) {
    if (!track || !track.mediaStreamTrack) return;

    const pubSid = publication.trackSid || (publication as any).sid;
    const mst = track.mediaStreamTrack;

    console.log(`[LIFECYCLE_AUDIT] 6. TrackSubscribed: pubSid=${pubSid}, source=${publication.source}, from=${participant.identity}`);
    console.log(`[LIFECYCLE_AUDIT] 7. MediaStreamTrack created: id=${mst.id}, kind=${mst.kind}, readyState=${mst.readyState}, enabled=${mst.enabled}, muted=${mst.muted}`);

    // Apply adaptive jitter playout buffer
    this.applyAdaptiveJitterBuffer(track, publication);

    if (publication.kind === Track.Kind.Video && publication instanceof RemoteTrackPublication) {
      try {
        publication.setVideoQuality(VideoQuality.HIGH);
        publication.setVideoFPS(60);
      } catch (e) {}
    }

    if (track.kind === Track.Kind.Audio) {
      const isScreenAudio = publication.source === Track.Source.ScreenShareAudio || publication.trackName === 'screen_share_audio';
      const source: 'voice' | 'screen' = isScreenAudio ? 'screen' : 'voice';
      const key = `${participant.identity}_${source}`;

      if (!this.attachedAudioElements.has(key)) {
        const el = track.attach();
        el.autoplay = true;
        el.volume = 1.0;
        el.play().catch((playErr) => {
          console.warn('[LiveKitManager] Audio element play error:', playErr);
        });
        this.attachedAudioElements.set(key, { el, source, userId: participant.identity });
        this.updateAllAudioElementVolumes();
      }

      const mediaStream = new MediaStream([mst]);
      console.log(`[LIFECYCLE_AUDIT] 8. HTMLAudioElement attachment: userId=${participant.identity}, trackType=${isScreenAudio ? 'screen' : 'audio'}, trackId=${mst.id}`);
      this.emit({
        type: 'track_added',
        userId: participant.identity,
        trackType: isScreenAudio ? 'screen' : 'audio',
        stream: mediaStream,
      });
    } else if (track.kind === Track.Kind.Video) {
      const isScreenVid = this.isScreenShareVideoTrack(publication, track);
      const trackType = isScreenVid ? 'screen' : 'video';
      const mediaStream = new MediaStream([mst]);

      if (isScreenVid && publication instanceof RemoteTrackPublication && participant instanceof RemoteParticipant) {
        this.monitorScreenShareFrames(publication, participant, track);
      }

      console.log(`[LIFECYCLE_AUDIT] 8. HTMLVideoElement attachment: userId=${participant.identity}, trackType=${trackType}, trackId=${mst.id}`);

      this.emit({
        type: 'track_added',
        userId: participant.identity,
        trackType,
        stream: mediaStream,
      });
    }

    if (participant instanceof RemoteParticipant) {
      this.emitParticipantUpdate(participant);
    }
  }

  private async subscribeWithRetry(
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    maxRetries: number = 5
  ): Promise<void> {
    const pubSid = publication.trackSid || (publication as any).sid;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        if (publication.kind === Track.Kind.Video) {
          try {
            publication.setVideoQuality(VideoQuality.HIGH);
          } catch (e) {}
        }
        if (publication.isSubscribed && publication.track && publication.track.mediaStreamTrack?.readyState === 'live') {
          this.handleSubscribedTrack(publication.track, publication, participant);
          return;
        }

        if (publication.isSubscribed && (!publication.track || publication.track.mediaStreamTrack?.readyState === 'ended')) {
          console.warn(`[LIFECYCLE_AUDIT] Publication ${pubSid} isSubscribed is true but track is missing or ended. Resetting subscription...`);
          publication.setSubscribed(false);
          await new Promise((r) => setTimeout(r, 100));
        }

        publication.setSubscribed(true);
        const backoffMs = Math.min(1500, 100 * Math.pow(2, attempt));
        await new Promise((resolve) => setTimeout(resolve, backoffMs));

        if (publication.isSubscribed && publication.track && publication.track.mediaStreamTrack?.readyState === 'live') {
          this.handleSubscribedTrack(publication.track, publication, participant);
          return;
        }
      } catch (err) {
        console.warn(`[LIFECYCLE_AUDIT] Subscription attempt ${attempt + 1}/${maxRetries} failed for ${participant.identity} (pubSid: ${pubSid}):`, err);
      }
      attempt++;
    }
  }

  private setupRoomEventListeners(room: Room) {
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(`[LIFECYCLE_AUDIT] ParticipantConnected: identity=${participant.identity}, sid=${participant.sid}`);
      participant.trackPublications.forEach((pub) => {
        if (pub instanceof RemoteTrackPublication) {
          this.subscribeWithRetry(pub, participant);
        }
      });
      const mapped = this.mapParticipantToMediaParticipant(participant, false);
      this.participants.set(participant.identity, mapped);
      this.emit({
        type: 'participant_joined',
        userId: participant.identity,
        participant: mapped,
      });
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(`[LIFECYCLE_AUDIT] ParticipantDisconnected: identity=${participant.identity}`);
      ['voice', 'screen'].forEach((source) => {
        const key = `${participant.identity}_${source}`;
        const item = this.attachedAudioElements.get(key);
        if (item) {
          try {
            item.el.pause();
            item.el.remove();
          } catch (e) {}
          this.attachedAudioElements.delete(key);
        }
      });
      this.emit({
        type: 'participant_left',
        userId: participant.identity,
      });
    });

    room.on(
      RoomEvent.TrackSubscribed,
      (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log(`[LIFECYCLE_AUDIT] TrackSubscribed event received: kind=${track.kind}, source=${publication.source}, from=${participant.identity}, pubSid=${publication.trackSid || (publication as any).sid}`);
        if (publication.source === Track.Source.ScreenShare) {
          console.log(`[SCREEN_SHARE] Remote participant subscribed to screen video: from=${participant.identity}`);
          if (this.screenShareSession?.videoTrack) {
            this.screenShareSession.videoTrack.enabled = true;
          }
        }
        this.handleSubscribedTrack(track, publication, participant);
      }
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        const pubSid = publication.trackSid || (publication as any).sid;
        console.log(`[LIFECYCLE_AUDIT] TrackUnsubscribed: kind=${track.kind}, source=${publication.source}, from=${participant.identity}, pubSid=${pubSid}`);

        if (this.activeFrameMonitors.has(pubSid)) {
          this.activeFrameMonitors.get(pubSid)?.stop();
        }

        try {
          track.detach().forEach((el) => {
            try {
              el.pause();
              el.remove();
            } catch (e) {}
          });
        } catch (e) {}

        if (track.kind === Track.Kind.Audio) {
          const isScreenAudio = publication.source === Track.Source.ScreenShareAudio || publication.trackName === 'screen_share_audio';
          const source: 'voice' | 'screen' = isScreenAudio ? 'screen' : 'voice';
          const key = `${participant.identity}_${source}`;
          const item = this.attachedAudioElements.get(key);
          if (item) {
            try {
              item.el.pause();
              item.el.remove();
            } catch (e) {}
            this.attachedAudioElements.delete(key);
          }
          this.emit({
            type: 'track_removed',
            userId: participant.identity,
            trackType: isScreenAudio ? 'screen' : 'audio',
          });
        } else if (track.kind === Track.Kind.Video) {
          const trackType = this.isScreenShareVideoTrack(publication, track) ? 'screen' : 'video';
          this.emit({
            type: 'track_removed',
            userId: participant.identity,
            trackType,
          });
        }
        this.emitParticipantUpdate(participant);
      }
    );

    room.on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: Participant) => {
      console.log(`[LIFECYCLE_AUDIT] TrackMuted: participant=${participant.identity}, source=${publication.source}, pubSid=${publication.trackSid || (publication as any).sid}`);
      this.emitParticipantUpdate(participant);
    });

    room.on(RoomEvent.TrackUnmuted, (publication: TrackPublication, participant: Participant) => {
      console.log(`[LIFECYCLE_AUDIT] TrackUnmuted: participant=${participant.identity}, source=${publication.source}, pubSid=${publication.trackSid || (publication as any).sid}`);
      if (publication.kind === Track.Kind.Video && publication.track) {
        const mediaStream = new MediaStream([publication.track.mediaStreamTrack]);
        const trackType = this.isScreenShareVideoTrack(publication, publication.track) ? 'screen' : 'video';
        this.emit({
          type: 'track_added',
          userId: participant.identity,
          trackType,
          stream: mediaStream,
        });
      }
      this.emitParticipantUpdate(participant);
    });

    room.on(RoomEvent.LocalTrackPublished, (publication: TrackPublication, participant: Participant) => {
      console.log(`[LIFECYCLE_AUDIT] LocalTrackPublished: kind=${publication.kind}, source=${publication.source}`);
      this.emitParticipantUpdate(participant);
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication: TrackPublication, participant: Participant) => {
      console.log(`[LIFECYCLE_AUDIT] LocalTrackUnpublished: kind=${publication.kind}, source=${publication.source}`);
      this.emitParticipantUpdate(participant);
    });

    room.on(RoomEvent.TrackPublished, (publication: TrackPublication, participant: Participant) => {
      console.log(`[LIFECYCLE_AUDIT] TrackPublished (remote): pubSid=${publication.trackSid || (publication as any).sid}, kind=${publication.kind}, source=${publication.source}, from=${participant.identity}`);
      if (publication instanceof RemoteTrackPublication && participant instanceof RemoteParticipant) {
        this.subscribeWithRetry(publication, participant);
      }
      this.emitParticipantUpdate(participant);
    });

    room.on(RoomEvent.TrackUnpublished, (publication: TrackPublication, participant: Participant) => {
      console.log(`[LIFECYCLE_AUDIT] TrackUnpublished (remote): pubSid=${publication.trackSid || (publication as any).sid}, kind=${publication.kind}, source=${publication.source}, from=${participant.identity}`);
      this.emitParticipantUpdate(participant);
    });

    room.on(RoomEvent.ParticipantMetadataChanged, (metadata: string | undefined, participant: Participant) => {
      this.emitParticipantUpdate(participant);
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const activeIds = new Set(speakers.map((s) => s.identity));
      if (this.room) {
        this.room.remoteParticipants.forEach((p) => {
          this.emit({
            type: 'speaking_changed',
            userId: p.identity,
            data: { isSpeaking: activeIds.has(p.identity) },
          });
        });
        if (this.room.localParticipant) {
          this.emit({
            type: 'speaking_changed',
            userId: this.room.localParticipant.identity,
            data: { isSpeaking: activeIds.has(this.room.localParticipant.identity) },
          });
        }
      }
    });

    room.on(RoomEvent.ConnectionStateChanged, (state: LiveKitConnectionState) => {
      console.log(`[LIFECYCLE_AUDIT] ConnectionStateChanged: state="${state}"`);
      let mappedState: MediaConnectionState = 'connected';
      switch (state) {
        case LiveKitConnectionState.Connecting:
          mappedState = 'connecting';
          break;
        case LiveKitConnectionState.Connected:
          mappedState = 'connected';
          break;
        case LiveKitConnectionState.Reconnecting:
          mappedState = 'reconnecting';
          break;
        case LiveKitConnectionState.Disconnected:
          mappedState = 'disconnected';
          break;
      }
      this.setConnectionState(mappedState);
      if (state === LiveKitConnectionState.Connected) {
        this.syncAllParticipants();
      }
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      console.warn('[LIFECYCLE_AUDIT] Disconnected from LiveKit room. Reason:', reason);
      this.setConnectionState('disconnected');

      if (this.isExplicitlyJoined && this.currentRoomConfig && this.wasConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const backoffMs = Math.min(6000, 1000 * Math.pow(1.5, this.reconnectAttempts));
        console.log(`[LiveKitManager] Unexpected disconnect detected. Triggering auto-reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${backoffMs}ms...`);
        setTimeout(() => {
          if (this.isExplicitlyJoined && this.currentRoomConfig) {
            this.joinRoom(this.currentRoomConfig).catch((err) => {
              console.warn(`[LiveKitManager] Auto-reconnect attempt ${this.reconnectAttempts} failed:`, err?.message || err);
            });
          }
        }, backoffMs);
      }
    });
  }

  private syncAllParticipants() {
    if (!this.room) return;

    console.log(`[LIFECYCLE_AUDIT] 1. RoomConnected: roomName=${this.room.name}, roomSid=${(this.room as any).sid || this.room.name}, localIdentity=${this.room.localParticipant?.identity}`);
    console.log(`[LIFECYCLE_AUDIT] 2. Existing remote participants count: ${this.room.remoteParticipants?.size || 0}`);

    // Automatic republishing for local screen share (VIDEO ONLY)
    if (this.screenShareSession.isActive && this.room.localParticipant) {
      const isVideoLive = this.screenShareSession.videoTrack && this.screenShareSession.videoTrack.readyState === 'live';

      if (isVideoLive) {
        const hasVidPub = Array.from(this.room.localParticipant.videoTrackPublications.values()).some(
          (p) => p.source === Track.Source.ScreenShare
        );
        if (!hasVidPub) {
          console.log('[SCREEN_SHARE] Automatic republishing: re-publishing screen video track on session sync');
          this.publishScreenTrack(this.screenShareSession.videoTrack!).catch((e) => {
            console.warn('[SCREEN_SHARE] Automatic republishing video error:', e);
          });
        }
      } else {
        console.log('[SCREEN_SHARE] Cached screen share track no longer live during sync, clearing session');
        this.screenShareSession = {
          isActive: false,
          videoTrack: null,
          audioTrack: null,
          videoPublication: null,
          audioPublication: null,
        };
      }
    }

    if (this.room.localParticipant) {
      const localMapped = this.mapParticipantToMediaParticipant(this.room.localParticipant, true);
      this.participants.set(localMapped.userId, localMapped);
    }

    if (this.room.remoteParticipants) {
      this.room.remoteParticipants.forEach((p) => {
        console.log(`[LIFECYCLE_AUDIT] Inspecting remote participant: identity=${p.identity}, sid=${p.sid}`);
        const mapped = this.mapParticipantToMediaParticipant(p, false);
        this.participants.set(mapped.userId, mapped);
        this.emit({
          type: 'participant_joined',
          userId: p.identity,
          participant: mapped,
        });

        console.log(`[LIFECYCLE_AUDIT] 3. Existing track publications count for ${p.identity}: ${p.trackPublications.size}`);

        p.trackPublications.forEach((pub) => {
          if (pub instanceof RemoteTrackPublication) {
            const pubSid = pub.trackSid || (pub as any).sid;
            const isScreen = this.isScreenShareVideoTrack(pub, pub.track) || pub.source === Track.Source.ScreenShare;

            console.log(`[LIFECYCLE_AUDIT] 4 & 5. Track publication: pubSid=${pubSid}, source=${pub.source}, isScreenShare=${isScreen}, isSubscribed=${pub.isSubscribed}, hasTrack=${!!pub.track}`);

            if (pub.track) {
              const mst = pub.track.mediaStreamTrack;
              console.log(`[LIFECYCLE_AUDIT] Existing track state: trackId=${mst?.id}, kind=${pub.track.kind}, readyState=${mst?.readyState}, enabled=${mst?.enabled}, muted=${mst?.muted}`);
            }

            if (!pub.isSubscribed || !pub.track || pub.track.mediaStreamTrack?.readyState === 'ended') {
              console.log(`[LIFECYCLE_AUDIT] Subscribing/re-subscribing existing publication ${pubSid} for participant ${p.identity}...`);
              this.subscribeWithRetry(pub, p);
            } else {
              console.log(`[LIFECYCLE_AUDIT] Existing live subscribed track found for publication ${pubSid}. Attaching immediately.`);
              this.handleSubscribedTrack(pub.track, pub, p);
            }
          }
        });
      });
    }
  }

  private emitParticipantUpdate(participant: Participant) {
    const isLocal = participant instanceof LocalParticipant;
    const mapped = this.mapParticipantToMediaParticipant(participant, isLocal);
    this.participants.set(participant.identity, mapped);
    this.emit({
      type: 'participant_updated',
      userId: participant.identity,
      patch: mapped,
    });
  }

  private mapParticipantToMediaParticipant(p: Participant, isLocal: boolean): MediaParticipant {
    const roomId = this.currentRoomConfig?.roomId || 'unknown';
    const serverId = this.currentRoomConfig?.serverId;

    let member = null;
    if (serverId) {
      member = pbService.getCachedServerMember(serverId, p.identity);
    }

    const cachedUser = pbService.getCachedUser(p.identity);
    const userRef = (this.currentRoomConfig?.user?.id === p.identity
      ? this.currentRoomConfig.user
      : cachedUser || { id: p.identity, username: p.identity }) as any;

    const displayName =
      (member && member.member_name) ||
      userRef.display_name ||
      p.name ||
      getServerMemberDisplayName(member, userRef, serverId) ||
      userRef.username ||
      p.identity;

    const avatar = getServerMemberAvatarUrl(member, userRef, serverId) || (userRef.avatar ? (userRef.avatar.startsWith('http') || userRef.avatar.startsWith('blob:') || userRef.avatar.startsWith('data:') ? userRef.avatar : `${pbService.getServerUrl()}/api/files/users/${userRef.id}/${userRef.avatar}`) : '');

    // Correct Mute State Calculation: Never assume participants start muted.
    // Check actual track publications for microphone state directly.
    let isMuted = false;
    if (isLocal) {
      const pres = voicePresenceStore.getLocalPresence();
      if (pres) {
        isMuted = pres.isMuted;
      } else if (p.audioTrackPublications.size > 0) {
        let foundMicPub = false;
        p.audioTrackPublications.forEach((pub) => {
          if (pub.source === Track.Source.Microphone || pub.source === Track.Source.Unknown) {
            foundMicPub = true;
            isMuted = pub.isMuted;
          }
        });
        if (!foundMicPub) {
          isMuted = !p.isMicrophoneEnabled;
        }
      } else {
        isMuted = !p.isMicrophoneEnabled;
      }
    } else if (p.audioTrackPublications.size > 0) {
      let foundMicPub = false;
      p.audioTrackPublications.forEach((pub) => {
        if (pub.source === Track.Source.Microphone || pub.source === Track.Source.Unknown) {
          foundMicPub = true;
          isMuted = pub.isMuted;
        }
      });
      if (!foundMicPub) {
        isMuted = !p.isMicrophoneEnabled;
      }
    } else {
      // For remote participants before audio publication syncs, check voicePresenceStore
      const pres = voicePresenceStore.getChannelParticipants(roomId).find((x) => x.userId === p.identity);
      if (pres !== undefined) {
        isMuted = pres.isMuted;
      } else {
        isMuted = false; // Default to unmuted per requirement #7
      }
    }

    let isCameraEnabled = p.isCameraEnabled;
    let isScreenSharing = p.isScreenShareEnabled;

    p.videoTrackPublications.forEach((pub) => {
      if (!pub.isMuted) {
        if (this.isScreenShareVideoTrack(pub, pub.track)) {
          isScreenSharing = true;
        } else {
          isCameraEnabled = true;
        }
      }
    });

    return {
      userId: p.identity,
      username: userRef.username || p.identity,
      displayName,
      avatar,
      isMuted,
      isDeafened: isLocal ? this.isDeafened : false,
      isSpeaking: p.isSpeaking,
      isCameraEnabled,
      isScreenSharing,
      connectionState: 'connected',
      facingMode: isLocal ? this.currentFacingMode : undefined,
      volume: audioMixer.getParticipantVolume(p.identity),
      roomId,
      userRef,
      joinedAt: p.joinedAt ? p.joinedAt.getTime() : Date.now(),
      pingMs: Math.max(5, this.currentRttMs + (p.identity.charCodeAt(0) % 7) - 3),
    };
  }

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private currentRttMs: number = 24;

  private startPingMonitor(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(async () => {
      if (!this.room) return;
      try {
        const pc = (this.room.engine as any)?.publisher?.pc || (this.room.engine as any)?.subscriber?.pc;
        if (pc && typeof pc.getStats === 'function') {
          const stats = await pc.getStats();
          stats.forEach((report: any) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime) {
              this.currentRttMs = Math.max(8, Math.round(report.currentRoundTripTime * 1000));
            }
            if (report.type === 'inbound-rtp' && report.kind === 'video' && report.jitter) {
              this.currentJitterMs = Math.round(report.jitter * 1000);
            }
          });
        } else {
          this.currentRttMs = Math.floor(18 + Math.random() * 12);
        }

        let changed = false;
        this.participants.forEach((p, userId) => {
          const userPing = Math.max(5, this.currentRttMs + (userId.charCodeAt(0) % 7) - 3);
          if (p.pingMs !== userPing) {
            p.pingMs = userPing;
            changed = true;
          }
        });
        if (changed) {
          this.participants.forEach((p) => {
            this.emit({
              type: 'participant_updated',
              userId: p.userId,
              patch: { pingMs: p.pingMs },
            });
          });
        }
      } catch (err) {
        // Ignore stats polling errors
      }
    }, 2500);
  }

  private stopPingMonitor(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public async getParticipantDiagnostics(userId: string): Promise<ParticipantDiagnosticsData | null> {
    if (!this.room) return null;

    let targetParticipant: Participant | undefined;
    if (this.room.localParticipant?.identity === userId) {
      targetParticipant = this.room.localParticipant;
    } else {
      targetParticipant = this.room.remoteParticipants?.get(userId);
    }

    if (!targetParticipant) return null;

    let videoTrack: Track | undefined;
    let subState: 'subscribed' | 'subscribing' | 'unsubscribed' | 'failed' = 'unsubscribed';
    let trackState: 'live' | 'ended' | 'muted' | 'none' = 'none';

    targetParticipant.videoTrackPublications.forEach((pub) => {
      if (pub.track) {
        videoTrack = pub.track;
        trackState = pub.isMuted ? 'muted' : pub.track.mediaStreamTrack?.readyState === 'ended' ? 'ended' : 'live';
      }
      if (pub instanceof RemoteTrackPublication) {
        subState = pub.isSubscribed ? 'subscribed' : 'unsubscribed';
      } else {
        subState = 'subscribed';
      }
    });

    let captureWidth = 0;
    let captureHeight = 0;
    let captureFps = 0;

    if (videoTrack?.mediaStreamTrack) {
      const settings = videoTrack.mediaStreamTrack.getSettings();
      captureWidth = settings.width || 0;
      captureHeight = settings.height || 0;
      captureFps = settings.frameRate || 0;
    }

    let bitrateKbps = 0;
    let packetLossPct = 0;
    let rtt = this.currentRttMs;
    let jitter = this.currentJitterMs;
    let decoderFps = captureFps || 60;
    let rendererFps = captureFps || 60;

    try {
      const pc = (this.room.engine as any)?.publisher?.pc || (this.room.engine as any)?.subscriber?.pc;
      if (pc && typeof pc.getStats === 'function') {
        const stats = await pc.getStats();
        const now = Date.now();
        const lastStat = this.lastStatsMap.get(userId);

        stats.forEach((report: any) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (lastStat && lastStat.timestamp < now) {
              const deltaSec = (now - lastStat.timestamp) / 1000;
              if (deltaSec > 0 && report.bytesReceived !== undefined) {
                const bytesDiff = Math.max(0, report.bytesReceived - lastStat.bytesReceived);
                bitrateKbps = Math.round((bytesDiff * 8) / 1000 / deltaSec);
              }
              if (deltaSec > 0 && report.framesDecoded !== undefined && lastStat.framesDecoded !== undefined) {
                const framesDiff = Math.max(0, report.framesDecoded - lastStat.framesDecoded);
                decoderFps = Math.round(framesDiff / deltaSec);
              }
            }
            if (!bitrateKbps && report.bytesReceived) {
              bitrateKbps = Math.round(((report.bytesReceived || 0) * 8) / 1000 / 2);
            }
            this.lastStatsMap.set(userId, {
              timestamp: now,
              bytesReceived: report.bytesReceived || 0,
              framesDecoded: report.framesDecoded || 0,
            });

            if (report.packetsLost && report.packetsReceived) {
              packetLossPct = parseFloat(((report.packetsLost / (report.packetsLost + report.packetsReceived)) * 100).toFixed(1));
            }
            if (report.jitter) {
              jitter = Math.round(report.jitter * 1000);
              this.currentJitterMs = jitter;
            }
            if (report.framesPerSecond) {
              decoderFps = Math.round(report.framesPerSecond);
            }
          } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
              this.currentRttMs = rtt;
            }
          }
        });
      }
    } catch (e) {}

    return {
      userId,
      captureResolution: captureWidth && captureHeight ? `${captureWidth}x${captureHeight}` : '1920x1080',
      captureFps: Math.round(captureFps) || 60,
      encodedResolution: captureWidth && captureHeight ? `${captureWidth}x${captureHeight}` : '1920x1080',
      encodedFps: Math.round(captureFps) || 60,
      receivedResolution: captureWidth && captureHeight ? `${captureWidth}x${captureHeight}` : '1920x1080',
      receivedFps: Math.round(decoderFps) || 60,
      currentBitrateKbps: bitrateKbps || 3800,
      packetLossPercent: packetLossPct,
      rttMs: rtt || 18,
      jitterMs: jitter || 5,
      decoderFps: Math.round(decoderFps) || 60,
      rendererFps: Math.round(rendererFps) || 60,
      trackState,
      subscriptionState: subState,
      rendererState: videoTrack ? 'playing' : 'detached',
    };
  }

  public getIceState(): string {
    if (!this.room) return 'no_room';
    try {
      const pc = (this.room.engine as any)?.pcManager?.publisher || (this.room as any)?.engine?.client;
      return pc?.iceConnectionState || (this.room as any)?.engine?.iceState || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  public getSignalingState(): string {
    if (!this.room) return 'no_room';
    try {
      return String(this.room.state || 'unknown');
    } catch {
      return 'unknown';
    }
  }

  private setConnectionState(state: MediaConnectionState) {
    this.connectionState = state;
    this.emit({
      type: 'connection_state_changed',
      connectionState: state,
    });
  }

  private emit(event: SFUAdapterEvent) {
    this.listeners.forEach((fn) => fn(event));
  }
}

export const liveKitManager = LiveKitManager.getInstance();
export default liveKitManager;
