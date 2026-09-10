import { User } from '../types';

export type MediaCommunicationType = 'dm_call' | 'voice_room';

export type MediaConnectionState =
  | 'idle'
  | 'joining'
  | 'connecting'
  | 'connected'
  | 'leaving'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export type CallSignalingState =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'ended'
  | 'missed'
  | 'timeout'
  | 'busy';

export interface MediaParticipant {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  hasScreenShareAudio?: boolean;
  connectionState: MediaConnectionState;
  isPendingDisconnect?: boolean;
  volume: number; // Local volume 0 - 100
  roomId: string;
  callId?: string;
  userRef: User;
  audioStream?: MediaStream | null;
  videoStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  joinedAt: number;
  pingMs?: number;
  facingMode?: 'user' | 'environment';
  sessionId?: string;
}

export interface RoomConfig {
  roomId: string;
  roomName?: string;
  roomType: MediaCommunicationType;
  maxParticipants: number; // 2 for DM calls, 8 for voice rooms
  user: User;
  initialMode?: 'voice' | 'video' | 'screen';
  callId?: string;
  channelId?: string;
  serverId?: string;
  sessionId?: string;
}

export interface IncomingCallEvent {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callerUser: User;
  targetUser?: User;
  targetUserId?: string;
  callType: 'voice' | 'video';
  conversationId: string; // DM channel ID
  state: CallSignalingState;
  timestamp: number;
}

export interface MediaError {
  code:
    | 'PERMISSION_DENIED'
    | 'DEVICE_UNAVAILABLE'
    | 'ROOM_FULL'
    | 'SFU_UNAVAILABLE'
    | 'SIGNALING_ERROR'
    | 'TOKEN_ERROR'
    | 'SCREEN_AUDIO_UNAVAILABLE'
    | 'UNKNOWN';
  message: string;
  details?: any;
}

// Environment & Configuration interface for future SFU provider
export interface SFUServerConfig {
  sfuEndpoint?: string;         // e.g. wss://sfu.sirverdata.top or VITE_LIVEKIT_URL
  signalingEndpoint?: string;   // Optional fallback signaling endpoint
  turnServers?: RTCIceServer[]; // ICE servers (STUN/TURN)
  authToken?: string;          // Short-lived authentication token for the SFU session
  roomId?: string;             // Deterministic room identity
  userId?: string;             // Authenticated user ID
  serverId?: string;           // Optional server context (for voice channels)
  channelId?: string;          // Optional channel context
  maxParticipants?: number;    // Maximum capacity (8 for voice channels, 2 for DM calls)
}

export interface MediaProviderEvent {
  type:
    | 'participants_changed'
    | 'speaking_changed'
    | 'connection_changed'
    | 'track_changed'
    | 'screen_share_source_ended'
    | 'error'
    | 'room_left';
  participants?: MediaParticipant[];
  connectionState?: MediaConnectionState;
  error?: MediaError;
  data?: any;
}

export type SFUAdapterEventType =
  | 'participant_joined'
  | 'participant_left'
  | 'participant_updated'
  | 'track_added'
  | 'track_removed'
  | 'speaking_changed'
  | 'connection_state_changed'
  | 'error';

export interface SFUAdapterEvent {
  type: SFUAdapterEventType;
  userId?: string;
  participant?: MediaParticipant;
  patch?: Partial<MediaParticipant>;
  trackType?: 'audio' | 'video' | 'screen';
  stream?: MediaStream;
  connectionState?: MediaConnectionState;
  error?: MediaError;
  data?: any;
  sessionId?: string;
  reason?: string;
  explicit?: boolean;
}

export interface ParticipantDiagnosticsData {
  userId: string;
  captureResolution: string;
  captureFps: number;
  encodedResolution: string;
  encodedFps: number;
  receivedResolution: string;
  receivedFps: number;
  currentBitrateKbps: number;
  packetLossPercent: number;
  rttMs: number;
  jitterMs: number;
  decoderFps: number;
  rendererFps: number;
  trackState: 'live' | 'ended' | 'muted' | 'none';
  subscriptionState: 'subscribed' | 'subscribing' | 'unsubscribed' | 'failed';
  rendererState: 'playing' | 'paused' | 'attached' | 'detached' | 'stalled';
}

export type CameraQualityProfile = 'auto' | 'low' | 'balanced' | 'high' | 'ultra';

export interface CameraPublishOptions {
  profile?: CameraQualityProfile;
  activeProfile?: 'low' | 'balanced' | 'high' | 'ultra';
  targetWidth?: number;
  targetHeight?: number;
  targetFps?: number;
  maxBitrateBps?: number;
  codec?: 'vp8' | 'h264' | 'vp9';
  simulcast?: boolean;
  actualWidth?: number;
  actualHeight?: number;
  actualFps?: number;
}

export interface CameraTelemetryData {
  profile: CameraQualityProfile;
  activeProfile: 'low' | 'balanced' | 'high' | 'ultra';
  selectedResolution: string;
  actualCaptureResolution: string;
  publishedResolution: string;
  targetFps: number;
  actualFps: number;
  encoder: string;
  codec: string;
  maxBitrateBps: number;
  currentEstimatedBitrateBps: number;
  adaptiveBitrateState: string;
  simulcastEnabled: boolean;
  simulcastLayersCount: number;
  lastDowngradeReason?: string;
  facingMode: string;
  deviceLabel: string;
  timestamp: number;
}

export interface SFUProviderAdapter {
  id: string;
  name: string;
  configure(config: SFUServerConfig): Promise<void>;
  joinSession(roomConfig: RoomConfig): Promise<void>;
  leaveSession(): Promise<void>;
  publishAudioTrack(track: MediaStreamTrack): Promise<void>;
  unpublishAudioTrack(): Promise<void>;
  publishVideoTrack(track: MediaStreamTrack, options?: CameraPublishOptions): Promise<void>;
  unpublishVideoTrack(): Promise<void>;
  publishScreenTrack(track: MediaStreamTrack, options?: CameraPublishOptions): Promise<void>;
  publishScreenAudioTrack?(track: MediaStreamTrack): Promise<void>;
  unpublishScreenTrack(): Promise<void>;
  setRemoteVolume(userId: string, volume: number): void;
  getConnectionState(): MediaConnectionState;
  getParticipants(): MediaParticipant[];
  onEvent(listener: (event: SFUAdapterEvent) => void): () => void;
  disconnect(): Promise<void>;
}
