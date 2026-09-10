import {
  SFUProviderAdapter,
  SFUServerConfig,
  RoomConfig,
  MediaParticipant,
  MediaConnectionState,
  SFUAdapterEvent,
  CameraPublishOptions,
} from '../../types/media';
import liveKitManager from './LiveKitManager';

export const LIVEKIT_DEFAULT_URL = liveKitManager['sfuUrl'];
export const LIVEKIT_TOKEN_ENDPOINT = liveKitManager['tokenEndpoint'];

export interface TokenResponse {
  token: string;
  error?: string;
}

export class LiveKitSFUAdapter implements SFUProviderAdapter {
  public id = 'livekit-sfu';
  public name = 'LiveKit SFU Provider';

  public async configure(config: SFUServerConfig): Promise<void> {
    liveKitManager.configure(config);
  }

  public async requestToken(identity: string, name: string, roomName: string): Promise<string> {
    return liveKitManager.getToken(identity, name, roomName);
  }

  public async joinSession(roomConfig: RoomConfig): Promise<void> {
    return liveKitManager.joinRoom(roomConfig);
  }

  public async leaveSession(): Promise<void> {
    return liveKitManager.leaveRoom(true);
  }

  public async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    return liveKitManager.setMicrophoneEnabled(enabled);
  }

  public async switchMicrophone(deviceId: string): Promise<boolean> {
    return liveKitManager.switchMicrophone(deviceId);
  }

  public getLocalAudioTrack(): MediaStreamTrack | null {
    return liveKitManager.getLocalAudioTrack();
  }

  public async publishAudioTrack(track: MediaStreamTrack): Promise<void> {
    return liveKitManager.publishAudioTrack(track);
  }

  public async unpublishAudioTrack(): Promise<void> {
    return liveKitManager.unpublishAudioTrack();
  }

  public async publishVideoTrack(track: MediaStreamTrack, options?: CameraPublishOptions): Promise<void> {
    return liveKitManager.publishVideoTrack(track, options);
  }

  public async unpublishVideoTrack(): Promise<void> {
    return liveKitManager.unpublishVideoTrack();
  }

  public async publishScreenTrack(track: MediaStreamTrack, options?: CameraPublishOptions): Promise<void> {
    return liveKitManager.publishScreenTrack(track, options);
  }

  public async publishScreenAudioTrack(track: MediaStreamTrack): Promise<void> {
    return liveKitManager.publishScreenAudioTrack(track);
  }

  public async unpublishScreenTrack(): Promise<void> {
    return liveKitManager.unpublishScreenTrack();
  }

  public setRemoteVolume(userId: string, volume: number): void {
    liveKitManager.setRemoteVolume(userId, volume);
  }

  public setDeafened(deafened: boolean): void {
    liveKitManager.setDeafened(deafened);
  }

  public getConnectionState(): MediaConnectionState {
    return liveKitManager.getConnectionState();
  }

  public getIceState(): string {
    return liveKitManager.getIceState();
  }

  public getSignalingState(): string {
    return liveKitManager.getSignalingState();
  }

  public getParticipants(): MediaParticipant[] {
    return liveKitManager.getParticipants();
  }

  public onEvent(listener: (event: SFUAdapterEvent) => void): () => void {
    return liveKitManager.onEvent(listener);
  }

  public async disconnect(): Promise<void> {
    return liveKitManager.leaveRoom(true);
  }
}

export const liveKitSFUAdapter = new LiveKitSFUAdapter();
export default liveKitSFUAdapter;
