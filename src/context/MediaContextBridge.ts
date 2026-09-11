import { createContext, useContext } from 'react';
import type { User, Channel } from '../types';
import type {
  MediaParticipant, MediaConnectionState, RoomConfig, IncomingCallEvent,
  MediaError, SFUServerConfig, SFUProviderAdapter, CameraQualityProfile,
  CameraTelemetryData,
} from '../types/media';

export interface MediaContextType {
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
  joinVoiceRoom: (channel: Channel, currentUser: User, mode?: 'voice' | 'video' | 'screen', options?: { listenOnly?: boolean }) => Promise<void>;
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
  setSFUAdapter: (adapter: SFUProviderAdapter | null) => void;
  setSFUConfig: (config: SFUServerConfig) => void;
}

let registeredMediaContext: MediaContextType | null = null;
let registeredMediaLoader: (() => Promise<void>) | null = null;
let mediaReadyPromise: Promise<void> | null = null;
let resolveMediaReady: (() => void) | null = null;

/** Register the deferred provider's loader so call actions can opt in before
 * the media chunk has been rendered. */
export function registerMediaProviderLoader(loader: (() => Promise<void>) | null): void {
  registeredMediaLoader = loader;
}

export function registerMediaContext(value: MediaContextType): void {
  registeredMediaContext = value;
  if (resolveMediaReady) {
    resolveMediaReady();
    resolveMediaReady = null;
  }
}

export function unregisterMediaContext(value?: MediaContextType): void {
  if (!value || registeredMediaContext === value) registeredMediaContext = null;
}

export function getRegisteredMediaContext(): MediaContextType | null {
  return registeredMediaContext;
}

export function ensureMediaProvider(): Promise<void> {
  if (registeredMediaContext) return Promise.resolve();
  if (!mediaReadyPromise) {
    mediaReadyPromise = new Promise<void>((resolve) => {
      resolveMediaReady = resolve;
    });
  }
  if (registeredMediaLoader) {
    void registeredMediaLoader().catch(() => {});
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sirver:media-request'));
  }
  return mediaReadyPromise;
}

const noopAsync = async () => {};
const noopBool = async () => false;
const deferredJoinVoiceRoom: MediaContextType['joinVoiceRoom'] = async (...args) => {
  await ensureMediaProvider();
  return getRegisteredMediaContext()?.joinVoiceRoom(...args);
};
const deferredStartDmCall: MediaContextType['startDmCall'] = async (...args) => {
  await ensureMediaProvider();
  return getRegisteredMediaContext()?.startDmCall(...args);
};
const deferredAcceptCall: MediaContextType['acceptCall'] = async () => {
  await ensureMediaProvider();
  return getRegisteredMediaContext()?.acceptCall();
};
const deferredLeaveRoomOrCall: MediaContextType['leaveRoomOrCall'] = async () => {
  await ensureMediaProvider();
  return getRegisteredMediaContext()?.leaveRoomOrCall();
};
const deferredDeclineCall: MediaContextType['declineCall'] = () => {
  void ensureMediaProvider().then(() => getRegisteredMediaContext()?.declineCall());
};
const deferredCancelOutgoingCall: MediaContextType['cancelOutgoingCall'] = () => {
  void ensureMediaProvider().then(() => getRegisteredMediaContext()?.cancelOutgoingCall());
};
const defaultContext: MediaContextType = {
  activeRoom: null,
  participants: [],
  connectionState: 'idle',
  isMuted: false,
  isDeafened: false,
  isCameraEnabled: false,
  isScreenSharing: false,
  incomingCall: null,
  outgoingCall: null,
  isRingMuted: false,
  activeCallDuration: 0,
  formattedDuration: '00:00',
  error: null,
  cameraQualityProfile: 'balanced' as CameraQualityProfile,
  cameraTelemetry: null,
  joinVoiceRoom: deferredJoinVoiceRoom,
  startDmCall: deferredStartDmCall,
  acceptCall: deferredAcceptCall,
  declineCall: deferredDeclineCall,
  cancelOutgoingCall: deferredCancelOutgoingCall,
  toggleMuteRing: () => {},
  leaveRoomOrCall: deferredLeaveRoomOrCall,
  toggleMute: () => {},
  toggleDeafen: () => {},
  toggleCamera: noopAsync,
  switchCamera: noopBool,
  switchMicrophone: noopBool,
  setCameraQualityProfile: () => {},
  toggleScreenShare: noopAsync,
  setParticipantVolume: () => {},
  clearError: () => {},
  setSFUAdapter: () => {},
  setSFUConfig: () => {},
};

export const MediaContext = createContext<MediaContextType>(defaultContext);
export const useRealtimeMedia = (): MediaContextType => useContext(MediaContext);
export default useRealtimeMedia;
