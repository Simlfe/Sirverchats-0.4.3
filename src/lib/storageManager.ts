import { BaseAuthStore } from 'pocketbase';

/**
 * Storage Quota Manager & Resilient Storage Utilities
 * 
 * Prevents QuotaExceededError crashes, automatically purges non-essential caches
 * when storage is tight, and provides a ResilientAuthStore that guarantees
 * PocketBase authentication succeeds even when localStorage is constrained.
 */

export const CRITICAL_STORAGE_KEYS = new Set<string>([
  'pocketbase_auth',
  'sirver_pb_url',
  'sirver_theme_mode',
  'sirver_selected_theme_id',
  'app_lang',
  'app_player_volume',
]);

/**
 * Proactively cleans up disposable and oversized items from localStorage
 * to ensure adequate free space for authentication and essential settings.
 */
export function cleanupStorageQuota(): { freedBytes: number; purgedKeys: string[] } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { freedBytes: 0, purgedKeys: [] };
  }

  let freedBytes = 0;
  const purgedKeys: string[] = [];

  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || CRITICAL_STORAGE_KEYS.has(k)) continue;

      try {
        const val = window.localStorage.getItem(k);
        if (!val) {
          keysToRemove.push(k);
          continue;
        }

        const size = val.length * 2; // Approximate byte size for UTF-16 characters

        // 1. Data URLs (images/audio/video base64) - huge consumers of quota
        if (
          val.startsWith('data:image/') ||
          val.startsWith('data:video/') ||
          val.startsWith('data:audio/') ||
          val.startsWith('data:application/')
        ) {
          keysToRemove.push(k);
          freedBytes += size;
          continue;
        }

        // 2. Ephemeral server/channel/user branding and image caches
        if (
          k.startsWith('server_icon_') ||
          k.startsWith('server_banner_') ||
          k.startsWith('server_avatar_') ||
          k.startsWith('user_avatar_')
        ) {
          keysToRemove.push(k);
          freedBytes += size;
          continue;
        }

        // 3. User lists and large directory caches (can be fetched on demand)
        if (k === 'cached_all_users') {
          keysToRemove.push(k);
          freedBytes += size;
          continue;
        }

        // 4. Redundant offline collections (already stored safely in IndexedDB)
        if (
          k.startsWith('offline_servers_') ||
          k.startsWith('offline_channels_') ||
          k.startsWith('offline_dms_')
        ) {
          keysToRemove.push(k);
          freedBytes += size;
          continue;
        }

        // 5. Server member and temporary server connection lists
        if (k.startsWith('cached_server_members_') || k.startsWith('cached_pcs_')) {
          keysToRemove.push(k);
          freedBytes += size;
          continue;
        }

        // 6. Non-critical fallback states, drafts, and demo reactions
        if (
          k.startsWith('demo_reactions_') ||
          k === 'reports_fallback' ||
          k.startsWith('sirver_theme_editor_session_')
        ) {
          keysToRemove.push(k);
          freedBytes += size;
          continue;
        }

        // 7. Any non-critical item exceeding 30KB
        if (size > 30000) {
          keysToRemove.push(k);
          freedBytes += size;
          continue;
        }
      } catch (_) {}
    }

    // Perform removals
    for (const key of keysToRemove) {
      try {
        window.localStorage.removeItem(key);
        purgedKeys.push(key);
      } catch (_) {}
    }

    if (purgedKeys.length > 0) {
      console.info(
        `[StorageQuotaManager] Quota cleanup freed ~${Math.round(freedBytes / 1024)} KB across ${purgedKeys.length} cached keys.`
      );
    }
  } catch (err) {
    console.warn('[StorageQuotaManager] Error during storage quota cleanup:', err);
  }

  return { freedBytes, purgedKeys };
}

/**
 * Safe wrapper for localStorage.setItem that catches QuotaExceededError,
 * frees up quota automatically, retries, and gracefully falls back to sessionStorage.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  // Divert large non-critical strings (> 50KB, like base64 image previews) to sessionStorage
  // to permanently preserve localStorage quota for auth tokens and critical settings
  if (value.length > 50000 && !CRITICAL_STORAGE_KEYS.has(key)) {
    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return true;
      }
    } catch (_) {}
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[StorageManager] localStorage.setItem failed for "${key}". Running emergency cleanup...`, err);
    cleanupStorageQuota();
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (retryErr) {
      console.warn(`[StorageManager] localStorage.setItem still failed for "${key}". Falling back to sessionStorage.`, retryErr);
      try {
        if (window.sessionStorage) {
          window.sessionStorage.setItem(key, value);
          return true;
        }
      } catch (_) {}
      return false;
    }
  }
}

/**
 * Safe wrapper for reading from localStorage with sessionStorage fallback.
 */
export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    if (window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch (_) {}

  try {
    if (window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch (_) {}

  return null;
}

/**
 * Safe wrapper for removing an item from both localStorage and sessionStorage.
 */
export function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage?.removeItem(key);
  } catch (_) {}

  try {
    window.sessionStorage?.removeItem(key);
  } catch (_) {}
}

/**
 * Resilient PocketBase AuthStore implementation that NEVER throws QuotaExceededError.
 * 
 * - Stores auth token and model in localStorage
 * - If quota is exceeded, automatically triggers cleanupStorageQuota() and retries
 * - If quota is still restricted, safely mirrors into sessionStorage and runtime memory
 * - Preserves multi-tab sync via 'storage' window events
 */
export class ResilientAuthStore extends BaseAuthStore {
  private storageFallback: Record<string, any> = {};
  public storageKey: string;

  constructor(storageKey = 'pocketbase_auth') {
    super();
    this.storageKey = storageKey;
    this._bindStorageEvent();

    // Load existing auth session safely on initialization
    const initial = this._safeGet(this.storageKey);
    if (initial && typeof initial === 'object') {
      super.save(initial.token || '', initial.record || initial.model || null);
    }
  }

  get token(): string {
    const data = this._safeGet(this.storageKey);
    if (data && typeof data === 'object' && typeof data.token === 'string') {
      return data.token;
    }
    return this.baseToken || '';
  }

  get record(): any {
    const data = this._safeGet(this.storageKey);
    if (data && typeof data === 'object') {
      return data.record || data.model || null;
    }
    return this.baseModel || null;
  }

  get model(): any {
    return this.record;
  }

  save(token: string, record?: any): void {
    this._safeSet(this.storageKey, { token, record: record || null });
    super.save(token, record);
  }

  clear(): void {
    this._safeRemove(this.storageKey);
    super.clear();
  }

  private _safeGet(key: string): any {
    if (typeof window !== 'undefined') {
      // 1. Try localStorage
      try {
        if (window.localStorage) {
          const raw = window.localStorage.getItem(key);
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {
              return raw;
            }
          }
        }
      } catch (_) {}

      // 2. Try sessionStorage fallback
      try {
        if (window.sessionStorage) {
          const raw = window.sessionStorage.getItem(key);
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {
              return raw;
            }
          }
        }
      } catch (_) {}
    }

    return this.storageFallback[key];
  }

  private _safeSet(key: string, val: any): void {
    let serialized: string;
    try {
      serialized = typeof val === 'string' ? val : JSON.stringify(val);
    } catch {
      serialized = String(val);
    }

    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          window.localStorage.setItem(key, serialized);
        }
      } catch (err) {
        console.warn(
          `[ResilientAuthStore] Storage quota exceeded saving "${key}". Running emergency cleanup...`,
          err
        );
        cleanupStorageQuota();
        try {
          if (window.localStorage) {
            window.localStorage.setItem(key, serialized);
          }
        } catch (retryErr) {
          console.warn(
            `[ResilientAuthStore] Retry failed after quota cleanup. Persisting to sessionStorage and memory.`,
            retryErr
          );
        }
      }

      // Always sync to sessionStorage as an active session fallback
      try {
        if (window.sessionStorage) {
          window.sessionStorage.setItem(key, serialized);
        }
      } catch (_) {}
    }

    // Always update in-memory fallback
    this.storageFallback[key] = val;
  }

  private _safeRemove(key: string): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.removeItem(key);
      } catch (_) {}
      try {
        window.sessionStorage?.removeItem(key);
      } catch (_) {}
    }
    delete this.storageFallback[key];
  }

  private _bindStorageEvent(): void {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === this.storageKey) {
          const data = this._safeGet(this.storageKey) || {};
          super.save(data.token || '', data.record || data.model || null);
        }
      });
    }
  }
}

// Proactively run an initial cleanup on module load if localStorage exists
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    let totalLength = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) {
        totalLength += (window.localStorage.getItem(k)?.length || 0);
      }
    }
    // If usage exceeds ~1.5MB (approx 1.5M chars), clean up preemptively to keep plenty of headroom
    if (totalLength > 1500000) {
      cleanupStorageQuota();
    }
  } catch (_) {}
}
