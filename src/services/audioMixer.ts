export interface AudioMixerState {
  masterVolume: number; // 0 to 200 (100 = default, voice chat volume)
  masterStreamVolume: number; // 0 to 200 (100 = default, stream audio volume)
  micGain: number; // 0 to 200 (100 = default)
  participantVolumes: Record<string, number>; // userId -> volume 0 to 200
  participantMuted: Record<string, boolean>; // userId -> boolean (local voice mute)
  screenshareVolumes: Record<string, number>; // userId -> volume 0 to 200
  screenshareMuted: Record<string, boolean>; // userId -> boolean (local screen audio mute)
}

const STORAGE_KEY = 'sirver_audio_mixer_v1';

const defaultState: AudioMixerState = {
  masterVolume: 100,
  masterStreamVolume: 100,
  micGain: 100,
  participantVolumes: {},
  participantMuted: {},
  screenshareVolumes: {},
  screenshareMuted: {},
};

class AudioMixerService {
  private state: AudioMixerState;
  private listeners: Set<(state: AudioMixerState) => void> = new Set();

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): AudioMixerState {
    try {
      if (typeof localStorage === 'undefined') return { ...defaultState };
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      return {
        masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : 100,
        masterStreamVolume: typeof parsed.masterStreamVolume === 'number' ? parsed.masterStreamVolume : 100,
        micGain: typeof parsed.micGain === 'number' ? parsed.micGain : 100,
        participantVolumes: parsed.participantVolumes || {},
        participantMuted: parsed.participantMuted || {},
        screenshareVolumes: parsed.screenshareVolumes || {},
        screenshareMuted: parsed.screenshareMuted || {},
      };
    } catch {
      return { ...defaultState };
    }
  }

  private saveState() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.warn('Failed to save Audio Mixer state:', e);
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.state));
  }

  public getState(): AudioMixerState {
    return { ...this.state };
  }

  public subscribe(listener: (state: AudioMixerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setMasterVolume(vol: number) {
    const clamped = Math.max(0, Math.min(200, vol));
    this.state.masterVolume = clamped;
    this.saveState();
  }

  public setMasterStreamVolume(vol: number) {
    const clamped = Math.max(0, Math.min(200, vol));
    this.state.masterStreamVolume = clamped;
    this.saveState();
  }

  public setMicGain(gain: number) {
    const clamped = Math.max(0, Math.min(200, gain));
    this.state.micGain = clamped;
    this.saveState();
  }

  public getParticipantVolume(userId: string): number {
    return this.state.participantVolumes[userId] ?? 100;
  }

  public setParticipantVolume(userId: string, vol: number) {
    const clamped = Math.max(0, Math.min(200, vol));
    this.state.participantVolumes[userId] = clamped;
    this.saveState();
  }

  public isParticipantMuted(userId: string): boolean {
    return !!this.state.participantMuted[userId];
  }

  public toggleParticipantMute(userId: string): boolean {
    const next = !this.isParticipantMuted(userId);
    this.state.participantMuted[userId] = next;
    this.saveState();
    return next;
  }

  public getScreenshareVolume(userId: string): number {
    return this.state.screenshareVolumes[userId] ?? 100;
  }

  public setScreenshareVolume(userId: string, vol: number) {
    const clamped = Math.max(0, Math.min(200, vol));
    this.state.screenshareVolumes[userId] = clamped;
    this.saveState();
  }

  public isScreenshareMuted(userId: string): boolean {
    return !!this.state.screenshareMuted[userId];
  }

  public toggleScreenshareMute(userId: string): boolean {
    const next = !this.isScreenshareMuted(userId);
    this.state.screenshareMuted[userId] = next;
    this.saveState();
    return next;
  }

  public resetAll() {
    this.state = { ...defaultState };
    this.saveState();
  }
}

export const audioMixer = new AudioMixerService();
