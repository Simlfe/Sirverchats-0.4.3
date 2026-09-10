export interface RecoverableVoiceSession {
  channelId: string;
  serverId?: string;
  channelName?: string;
  userId: string;
  joinTimestamp: number;
  lastActiveTimestamp: number;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  mode: 'voice' | 'video' | 'screen';
}

const STORAGE_KEY = 'sirver_voice_session_recovery_v1';
const EXPIRATION_MS = 2 * 60 * 1000; // 2 minutes maximum window

class VoiceSessionRecoveryService {
  public saveSession(session: Omit<RecoverableVoiceSession, 'lastActiveTimestamp'>) {
    try {
      if (typeof localStorage === 'undefined') return;
      const data: RecoverableVoiceSession = {
        ...session,
        lastActiveTimestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[VoiceRecovery] Failed to save session state:', err);
    }
  }

  public updateState(partial: Partial<RecoverableVoiceSession>) {
    try {
      if (typeof localStorage === 'undefined') return;
      const existing = this.getValidSession();
      if (existing) {
        const updated: RecoverableVoiceSession = {
          ...existing,
          ...partial,
          lastActiveTimestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (err) {
      console.warn('[VoiceRecovery] Failed to update session state:', err);
    }
  }

  public getValidSession(): RecoverableVoiceSession | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const session: RecoverableVoiceSession = JSON.parse(raw);
      const now = Date.now();
      const elapsed = now - (session.lastActiveTimestamp || session.joinTimestamp);

      if (elapsed < EXPIRATION_MS) {
        return session;
      }

      // Session expired (> 2 mins)
      console.log(`[VoiceRecovery] Session expired (${Math.round(elapsed / 1000)}s old). Purging.`);
      this.clearSession();
      return null;
    } catch {
      this.clearSession();
      return null;
    }
  }

  public clearSession() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn('[VoiceRecovery] Failed to clear session:', err);
    }
  }
}

export const voiceSessionRecovery = new VoiceSessionRecoveryService();
