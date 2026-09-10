import { isTauriEnvironment } from '../lib/tauriDesktopService';
import { getCachedUserSettings } from '../lib/userSettings';

export interface LiveShellStatus {
  isTauri: boolean;
  isLiveWeb: boolean;
  liveUrl: string;
  isReachable: boolean | null;
  lastCheckedAt: string | null;
}

const DEFAULT_LIVE_WEB_URL = 'https://app.sirverdata.top';

class LiveShellService {
  private liveUrl: string = DEFAULT_LIVE_WEB_URL;
  private isChecking: boolean = false;
  private isReachable: boolean | null = null;
  private lastCheckedAt: string | null = null;

  constructor() {
    try {
      const settings = getCachedUserSettings();
      if (settings?.updates?.liveWebUrl) {
        this.liveUrl = settings.updates.liveWebUrl.trim().replace(/\/+$/, '');
      }
    } catch {
      this.liveUrl = DEFAULT_LIVE_WEB_URL;
    }
  }

  /**
   * Initializes the live shell.
   * If running in a Tauri native window and the live web endpoint is reachable,
   * seamlessly transitions the view to the live web app with auth state handoff.
   */
  public async init(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check if we are currently running on the live web URL inside a Tauri native shell
    const isTauri = isTauriEnvironment();
    const currentOrigin = window.location.origin.toLowerCase();
    const targetOrigin = this.liveUrl.toLowerCase();

    // 1. If we are already running on the live web URL
    if (currentOrigin === targetOrigin) {
      this.handleAuthHandoffImport();
      console.log('[LiveShell] Running inside Live Web Shell:', currentOrigin);
      return true;
    }

    // 2. Only perform automatic transition if running inside Tauri desktop environment
    if (!isTauri) {
      return false;
    }

    const settings = getCachedUserSettings();
    if (settings?.updates?.enableLiveWebShell === false) {
      console.log('[LiveShell] Live Web Shell disabled by user settings.');
      return false;
    }

    // 3. Probe the live web endpoint to verify it is active and responding
    return await this.probeAndTransition();
  }

  /**
   * Probes the live web server's versions.json file.
   * If reachable and valid, migrates credentials and transitions immediately.
   */
  public async probeAndTransition(): Promise<boolean> {
    if (this.isChecking) return false;
    this.isChecking = true;

    try {
      const pingUrl = `${this.liveUrl}/versions.json?_t=${Date.now()}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2200);

      const response = await fetch(pingUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      }).catch((e) => {
        return null;
      });

      clearTimeout(timeoutId);
      this.lastCheckedAt = new Date().toISOString();

      if (response && response.ok) {
        this.isReachable = true;
        console.log(`[LiveShell] Live web server reachable at ${this.liveUrl}. Transitioning...`);

        // Prepare seamless auth state handoff
        let hashSuffix = '';
        try {
          const authData = localStorage.getItem('pocketbase_auth');
          if (authData) {
            hashSuffix = `#auth_handoff=${encodeURIComponent(authData)}`;
          }
        } catch {}

        // Perform instant in-place navigation to the live web app
        const currentPath = window.location.pathname === '/' ? '' : window.location.pathname;
        const targetLocation = `${this.liveUrl}${currentPath}${window.location.search}${hashSuffix}`;
        window.location.replace(targetLocation);
        return true;
      } else {
        this.isReachable = false;
        console.warn(
          `[LiveShell] Live web server at ${this.liveUrl} returned status ${response?.status || 'unreachable'}. Using local bundled app.`
        );
        return false;
      }
    } catch (err) {
      this.isReachable = false;
      console.warn(`[LiveShell] Unable to reach live web server (${err}). Using local bundled app.`);
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Imports auth credentials handed off from the local shell to prevent requiring re-login
   */
  private handleAuthHandoffImport(): void {
    try {
      const hash = window.location.hash || '';
      if (hash.includes('auth_handoff=')) {
        const match = hash.match(/auth_handoff=([^&]+)/);
        if (match && match[1]) {
          const raw = decodeURIComponent(match[1]);
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.token || parsed.model)) {
            // Only set if we don't already have a valid session
            const currentAuth = localStorage.getItem('pocketbase_auth');
            if (!currentAuth) {
              localStorage.setItem('pocketbase_auth', raw);
              console.log('[LiveShell] Successfully imported authenticated session from native shell.');
            }
          }
        }
        // Clean up the URL hash without reloading
        const cleanHash = hash.replace(/[#&]auth_handoff=[^&]+/, '').replace(/^#$/, '');
        const newUrl = window.location.pathname + window.location.search + (cleanHash ? `#${cleanHash}` : '');
        window.history.replaceState(null, '', newUrl);
      }
    } catch (e) {
      console.warn('[LiveShell] Failed to import auth handoff:', e);
    }
  }

  public getStatus(): LiveShellStatus {
    const isTauri = isTauriEnvironment();
    const isLiveWeb = window.location.origin.toLowerCase() === this.liveUrl.toLowerCase();
    return {
      isTauri,
      isLiveWeb,
      liveUrl: this.liveUrl,
      isReachable: this.isReachable,
      lastCheckedAt: this.lastCheckedAt,
    };
  }

  public setLiveUrl(url: string) {
    this.liveUrl = url.trim().replace(/\/+$/, '');
  }
}

export const liveShellService = new LiveShellService();
