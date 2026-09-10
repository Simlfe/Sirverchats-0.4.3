import { pbService } from '../pocketbase';
import { AppUpdateRecord } from '../types';
import { getCachedUserSettings } from '../lib/userSettings';
import { isTauriEnvironment } from '../lib/tauriDesktopService';
import { downloadManager, DownloadItem, getBlobFromDB } from './downloadManager';

export const CURRENT_APP_VERSION = '1.0';

/**
 * Standard version increment: When told to mark a new version, add 0.0.1 (patch bump)
 * e.g., '1.0' -> '1.0.1', '1.0.1' -> '1.0.2'
 */
export function incrementVersionByPatch(version: string): string {
  const parts = version.trim().split('.');
  if (parts.length === 2) {
    return `${parts[0]}.${parts[1]}.1`;
  } else if (parts.length >= 3) {
    const patch = parseInt(parts[2], 10) || 0;
    return `${parts[0]}.${parts[1]}.${patch + 1}`;
  }
  return `${version}.1`;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'ready_to_restart'
  | 'up_to_date'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  platform: string;
  channel: string;
  availableUpdate: AppUpdateRecord | null;
  downloadItem: DownloadItem | null;
  lastCheckTime: string | null;
  errorMessage: string | null;
  mandatory: boolean;
  checksumVerified: boolean;
  // In-place auto updater fields:
  isNativeUpdater: boolean;
  newVersion?: string;
  releaseNotes?: string;
  downloadProgressPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  sourceRepo?: string;
  isRollback?: boolean;
  isInterrupted?: boolean;
  canResume?: boolean;
  canReset?: boolean;
  dismissedNotification?: boolean;
}

export type UpdateListener = (state: UpdateState) => void;

// Safe dynamic access for Tauri v2 native in-place updater plugins
let tauriUpdaterModule: typeof import('@tauri-apps/plugin-updater') | null = null;
let tauriProcessModule: typeof import('@tauri-apps/plugin-process') | null = null;

async function getTauriUpdater() {
  if (!isTauriEnvironment()) return null;
  if (!tauriUpdaterModule) {
    try {
      tauriUpdaterModule = await import('@tauri-apps/plugin-updater');
    } catch (e) {
      console.warn('[AutoUpdater] @tauri-apps/plugin-updater dynamic import failed:', e);
    }
  }
  return tauriUpdaterModule;
}

async function getTauriProcess() {
  if (!isTauriEnvironment()) return null;
  if (!tauriProcessModule) {
    try {
      tauriProcessModule = await import('@tauri-apps/plugin-process');
    } catch (e) {
      console.warn('[AutoUpdater] @tauri-apps/plugin-process dynamic import failed:', e);
    }
  }
  return tauriProcessModule;
}

/**
 * Compare two semver strings numerically (e.g., 0.3.8 < 0.3.9).
 */
export function semverCompare(v1: string, v2: string): number {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;

  const cleanV1 = v1.trim().replace(/^[vV]/, '');
  const cleanV2 = v2.trim().replace(/^[vV]/, '');

  const core1 = cleanV1.split(/[-+]/)[0];
  const core2 = cleanV2.split(/[-+]/)[0];

  const parts1 = core1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = core2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }

  const pre1 = cleanV1.includes('-') ? cleanV1.substring(cleanV1.indexOf('-')) : '';
  const pre2 = cleanV2.includes('-') ? cleanV2.substring(cleanV2.indexOf('-')) : '';

  if (pre1 && !pre2) return -1;
  if (!pre1 && pre2) return 1;
  if (pre1 && pre2) return pre1.localeCompare(pre2);

  return 0;
}

export function detectOperatingSystem(): 'windows' | 'linux' | 'mac' | 'android' | 'web' {
  if (typeof window === 'undefined' || !window.navigator) {
    return 'windows';
  }

  const ua = window.navigator.userAgent || '';
  const platformStr = window.navigator.platform || '';

  if ((window as any).Capacitor) {
    const capPlatform = (window as any).Capacitor.getPlatform();
    if (capPlatform === 'android') return 'android';
    if (capPlatform === 'ios') return 'mac';
  }

  if (/Android/i.test(ua)) return 'android';
  if (/Win/i.test(ua) || /Win/i.test(platformStr)) return 'windows';
  if (/Mac|iPod|iPhone|iPad/i.test(ua) || /Mac/i.test(platformStr)) return 'mac';
  if (/Linux/i.test(ua) || /X11/i.test(platformStr)) return 'linux';

  return 'windows';
}

export async function calculateBlobSHA256(blob: Blob): Promise<string> {
  try {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
  } catch (e) {
    console.warn('SHA-256 hash calculation failed:', e);
    return '';
  }
}

class UpdateServiceClass {
  private state: UpdateState;
  private listeners: Set<UpdateListener> = new Set();
  private isChecking: boolean = false;
  private downloadUnsub: (() => void) | null = null;
  private nativeUpdate: any = null;
  private abortRequested: boolean = false;

  constructor() {
    const platform = detectOperatingSystem();
    const settings = getCachedUserSettings();
    const channel = settings.updates?.channel || 'stable';

    this.state = {
      status: 'idle',
      currentVersion: CURRENT_APP_VERSION,
      platform,
      channel,
      availableUpdate: null,
      downloadItem: null,
      lastCheckTime: localStorage.getItem('sirver_last_update_check') || null,
      errorMessage: null,
      mandatory: false,
      checksumVerified: false,
      isNativeUpdater: isTauriEnvironment(),
      downloadProgressPercent: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      isInterrupted: false,
      canResume: false,
      canReset: false,
      dismissedNotification: false,
    };

    // Auto-detect native version if available in Tauri
    this.fetchCurrentVersion().catch(() => {});

    // Subscribe to downloadManager events as secondary fallback
    this.downloadUnsub = downloadManager.subscribe(() => {
      this.syncWithDownloadManager();
    });

    // Auto check on startup after short delay
    setTimeout(() => {
      const cfg = getCachedUserSettings();
      if (cfg.updates?.autoCheck ?? true) {
        this.checkForUpdates(false).catch(() => {});
      }
    }, 1200);
  }

  public async fetchCurrentVersion(): Promise<string> {
    if (isTauriEnvironment()) {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const ver = await getVersion();
        if (ver) {
          this.updateState({ currentVersion: ver });
          return ver;
        }
      } catch (e) {
        console.warn('[AutoUpdater] Failed to get native version:', e);
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const resp = await fetch('/versions', { cache: 'no-cache' });
        if (resp.ok) {
          const text = await resp.text();
          const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
          if (lines.length > 0) {
            const firstVer = lines[0];
            this.updateState({ currentVersion: firstVer });
            return firstVer;
          }
        }
      } catch {
        // Continue with default
      }
    }
    return this.state.currentVersion || CURRENT_APP_VERSION;
  }

  public setNotificationDismissed(dismissed: boolean) {
    this.updateState({ dismissedNotification: dismissed });
  }

  public getState(): UpdateState {
    return { ...this.state };
  }

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (e) {
        console.warn('[UpdateService] listener error:', e);
      }
    });
  }

  private updateState(partial: Partial<UpdateState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  /**
   * Double-check updates via GitHub:
   * 1. Finds all repos under githubOwner matching repoPrefix (e.g., sirverchats, sirverchats-0.1, sirverchats-1.0)
   * 2. Extracts version directly from repo name (e.g. sirverchats-1.0 -> 1.0)
   * 3. Also inspects 'versions' (or versions.txt, updates/latest.json, package.json)
   * 4. Auto-Rollback: If the currently running version is not found on GitHub (e.g. faulty release deleted by developer),
   *    finds the highest version available on GitHub and rolls back to it seamlessly!
   */
  public async checkGitHubReposAndVersions(
    owner: string = 'Simlfe',
    prefix: string = 'sirverchats'
  ): Promise<{
    hasUpdate: boolean;
    newVersion: string;
    repoName: string;
    rawList: string[];
    isRollback?: boolean;
    downloadUrl?: string;
  } | null> {
    try {
      console.log(`[AutoUpdater] Scanning GitHub repositories for user '${owner}' matching prefix '${prefix}'...`);
      // 1. Fetch public repositories of the user
      const resp = await fetch(`https://api.github.com/users/${owner}/repos?per_page=100&sort=updated`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (!resp.ok) {
        console.warn(`[AutoUpdater] GitHub REST repos query returned status ${resp.status} (rate limit or offline). Falling back to direct repository verification...`);
      }

      const normalizedPrefix = prefix.trim().toLowerCase();
      let matchingRepos: Array<{ name: string; default_branch?: string }> = [];

      if (resp && resp.ok) {
        try {
          const repos: Array<{ name: string; default_branch?: string }> = await resp.json();
          if (Array.isArray(repos) && repos.length > 0) {
            matchingRepos = repos.filter((r) => {
              const lower = r.name.toLowerCase();
              return (
                lower === normalizedPrefix ||
                lower === 'sirverdata' ||
                lower.startsWith(`${normalizedPrefix}-`) ||
                lower.startsWith(`${normalizedPrefix}_`) ||
                lower.startsWith(`${normalizedPrefix}.`) ||
                lower.startsWith('sirverdata-')
              );
            });
          }
        } catch {
          // Continue to direct fallback
        }
      }

      // If GitHub REST API is rate limited (403) or returned no matches, test direct candidate repos
      if (matchingRepos.length === 0) {
        const directCandidates = Array.from(new Set([prefix.trim(), 'SirverData', 'sirverchats']));
        for (const candidate of directCandidates) {
          try {
            const probe = await fetch(`https://raw.githubusercontent.com/${owner}/${candidate}/main/versions`, {
              method: 'HEAD',
              cache: 'no-store',
            });
            if (probe.ok || probe.status === 200) {
              matchingRepos.push({ name: candidate, default_branch: 'main' });
            }
          } catch {
            // try next candidate
          }
        }
      }

      // DOUBLE CHECK 1: Is repository found?
      if (matchingRepos.length === 0) {
        console.warn(`[AutoUpdater] Double Check 1/2: Repository NOT FOUND for prefix '${prefix}' or 'SirverData' under owner '${owner}'.`);
        return null;
      }

      console.log(
        `[AutoUpdater] Double Check 1/2: Repository FOUND (${matchingRepos.length} matching):`,
        matchingRepos.map((r) => r.name)
      );

      // Track all discovered versions across all repos: version -> repoName
      const versionToRepoMap = new Map<string, string>();
      const allFoundVersions: string[] = [];

      for (const repo of matchingRepos) {
        const branch = repo.default_branch || 'main';

        // 1. Candidate paths for the versions manifest file: "versions", "versions.json", "versions.txt", "updates/latest.json"
        const candidates = [
          `https://raw.githubusercontent.com/${owner}/${repo.name}/${branch}/versions`,
          `https://raw.githubusercontent.com/${owner}/${repo.name}/${branch}/versions.json`,
          `https://raw.githubusercontent.com/${owner}/${repo.name}/${branch}/versions.txt`,
          `https://raw.githubusercontent.com/${owner}/${repo.name}/${branch}/version.txt`,
          `https://raw.githubusercontent.com/${owner}/${repo.name}/${branch}/updates/latest.json`,
        ];

        let versionsText: string | null = null;
        for (const url of candidates) {
          try {
            const vResp = await fetch(url, { cache: 'no-store' });
            if (vResp.ok) {
              versionsText = await vResp.text();
              break;
            }
          } catch {
            // continue to next candidate
          }
        }

        let foundExplicitVersionInRepo = false;

        if (versionsText) {
          // Check if JSON (e.g. versions.json or updates/latest.json)
          if (versionsText.trim().startsWith('{')) {
            try {
              const json = JSON.parse(versionsText);
              if (Array.isArray(json.versions)) {
                for (const v of json.versions) {
                  if (typeof v === 'string' && v.trim()) {
                    versionToRepoMap.set(v.trim(), repo.name);
                    allFoundVersions.push(v.trim());
                    foundExplicitVersionInRepo = true;
                  }
                }
              }
              if (json.current_version && typeof json.current_version === 'string') {
                versionToRepoMap.set(json.current_version.trim(), repo.name);
                allFoundVersions.push(json.current_version.trim());
                foundExplicitVersionInRepo = true;
              }
              if (json.version && typeof json.version === 'string') {
                versionToRepoMap.set(json.version.trim(), repo.name);
                allFoundVersions.push(json.version.trim());
                foundExplicitVersionInRepo = true;
              }
            } catch {}
          } else {
            // Parse plain text lines: e.g. "1.0"
            const lines = versionsText
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l.length > 0 && !l.startsWith('#'));

            for (const line of lines) {
              versionToRepoMap.set(line, repo.name);
              allFoundVersions.push(line);
              foundExplicitVersionInRepo = true;
            }
          }
        }

        // 2. If NO explicit versions manifest file in repo, check GitHub Releases for tags
        if (!foundExplicitVersionInRepo) {
          try {
            const relResp = await fetch(`https://api.github.com/repos/${owner}/${repo.name}/releases?per_page=10`, {
              headers: { Accept: 'application/vnd.github.v3+json' },
            });
            if (relResp.ok) {
              const releases = await relResp.json();
              if (Array.isArray(releases) && releases.length > 0) {
                for (const rel of releases) {
                  const tagVer = (rel.tag_name || '').replace(/^v/, '').trim();
                  if (tagVer) {
                    versionToRepoMap.set(tagVer, repo.name);
                    allFoundVersions.push(tagVer);
                    foundExplicitVersionInRepo = true;
                  }
                }
              }
            }
          } catch {}
        }

        // 3. Fallback ONLY if repo has NO versions manifest file and NO releases at all
        // Only match full version patterns like "sirverchats-1.0.1" (not random numbers or branch tags)
        if (!foundExplicitVersionInRepo) {
          const nameMatch = repo.name.match(new RegExp(`^${normalizedPrefix}[-_.]v?([0-9]+(?:\\.[0-9]+)+)$`, 'i'));
          if (nameMatch && nameMatch[1]) {
            const repoVersion = nameMatch[1];
            versionToRepoMap.set(repoVersion, repo.name);
            allFoundVersions.push(repoVersion);
          }
        }
      }

      // DOUBLE CHECK 2: Is version found?
      if (allFoundVersions.length === 0) {
        console.warn(`[AutoUpdater] Double Check 2/2: Version NOT FOUND in repository '${matchingRepos[0].name}'. No 'versions' file or releases found.`);
        return null;
      }

      console.log(`[AutoUpdater] Double Check 2/2: Versions FOUND on GitHub:`, Array.from(new Set(allFoundVersions)));

      // Deduplicate and sort versions descending (highest version first)
      const uniqueVersions = Array.from(new Set(allFoundVersions)).sort((a, b) => semverCompare(b, a));
      const highestVersionOnGitHub = uniqueVersions[0];
      const bestRepoName = versionToRepoMap.get(highestVersionOnGitHub) || matchingRepos[0].name;

      const currentVer = this.state.currentVersion || CURRENT_APP_VERSION;

      // Case 1: Normal Upgrade — A strictly higher version exists on GitHub
      if (semverCompare(currentVer, highestVersionOnGitHub) < 0) {
        console.log(`[AutoUpdater] Higher version found in repo ${bestRepoName}: v${highestVersionOnGitHub} (current: v${currentVer})`);
        const downloadUrl = await this.resolveDownloadUrlForVersion(owner, bestRepoName, highestVersionOnGitHub, this.state.platform);
        return {
          hasUpdate: true,
          newVersion: highestVersionOnGitHub,
          repoName: bestRepoName,
          rawList: uniqueVersions,
          isRollback: false,
          downloadUrl: downloadUrl || undefined,
        };
      }

      // Case 2: Safe Rollback Fallback
      // If the current version is NOT found in any valid repo on GitHub, AND current version is higher than what exists on GitHub
      // (meaning the developer deleted the faulty higher release), roll back to the highest available version on GitHub!
      const currentVersionExistsOnGitHub = uniqueVersions.some(
        (v) => semverCompare(v, currentVer) === 0
      );

      if (!currentVersionExistsOnGitHub && semverCompare(currentVer, highestVersionOnGitHub) > 0) {
        console.warn(
          `[AutoUpdater] Current version v${currentVer} was NOT found on GitHub! Initiating safe rollback to highest verified release: v${highestVersionOnGitHub} (from repo ${bestRepoName})`
        );
        const downloadUrl = await this.resolveDownloadUrlForVersion(owner, bestRepoName, highestVersionOnGitHub, this.state.platform);
        return {
          hasUpdate: true,
          newVersion: highestVersionOnGitHub,
          repoName: bestRepoName,
          rawList: uniqueVersions,
          isRollback: true,
          downloadUrl: downloadUrl || undefined,
        };
      }

      return null;
    } catch (e) {
      console.warn('[AutoUpdater] Error in checkGitHubReposAndVersions:', e);
      return null;
    }
  }

  /**
   * Resolves a verified, real download URL for an update package on GitHub.
   * Priority:
   * 1. GitHub Releases pre-compiled binary asset for current platform (.exe, .apk, .AppImage, .deb, etc.)
   * 2. Release tag archive
   * 3. Default branch archive
   */
  public async resolveDownloadUrlForVersion(
    owner: string,
    repo: string,
    version: string,
    platform: string
  ): Promise<string | null> {
    // 1. Check GitHub Releases for pre-compiled platform binaries
    try {
      const relResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (relResp.ok) {
        const releases = await relResp.json();
        if (Array.isArray(releases)) {
          const matchRel = releases.find(
            (r: any) => r.tag_name === `v${version}` || r.tag_name === version
          );
          if (matchRel && Array.isArray(matchRel.assets) && matchRel.assets.length > 0) {
            let asset = null;
            if (platform === 'windows') {
              asset = matchRel.assets.find((a: any) => a.name.endsWith('.exe') || a.name.endsWith('.msi'));
            } else if (platform === 'android') {
              asset = matchRel.assets.find((a: any) => a.name.endsWith('.apk'));
            } else if (platform === 'linux') {
              asset = matchRel.assets.find((a: any) => a.name.endsWith('.AppImage') || a.name.endsWith('.deb'));
            }
            if (!asset && matchRel.assets.length > 0) {
              asset = matchRel.assets[0];
            }
            if (asset && asset.browser_download_url) {
              return asset.browser_download_url;
            }
          }
        }
      }
    } catch (e) {}

    // 2. Check if git release tag archive exists (probe HEAD to ensure it's not 404)
    try {
      const tagUrl = `https://github.com/${owner}/${repo}/archive/refs/tags/v${version}.zip`;
      const probe = await fetch(tagUrl, { method: 'HEAD', cache: 'no-store' });
      if (probe.ok || probe.status === 200) {
        return tagUrl;
      }
    } catch (e) {}

    // 3. Check branch archive: e.g. main/master branch zip
    for (const branch of ['main', 'master']) {
      const candidateUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
      try {
        const probe = await fetch(candidateUrl, { method: 'HEAD', cache: 'no-store' });
        if (probe.ok || probe.status === 200) {
          return candidateUrl;
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Check for updates: First via Tauri's native in-place updater (if on desktop),
   * then PocketBase app_updates collection.
   */
  public async checkForUpdates(manualTrigger: boolean = false): Promise<UpdateState> {
    if (this.isChecking) {
      return this.getState();
    }

    const settings = getCachedUserSettings();
    const autoCheck = settings.updates?.autoCheck ?? true;

    if (!manualTrigger && !autoCheck) {
      return this.getState();
    }

    this.isChecking = true;
    await this.fetchCurrentVersion();
    const currentPlatform = detectOperatingSystem();
    const currentChannel = settings.updates?.channel || 'stable';

    this.updateState({
      status: 'checking',
      errorMessage: null,
      platform: currentPlatform,
      channel: currentChannel,
    });

    // 1. Native Desktop In-Place Auto-Updater Check (Tauri v2)
    if (isTauriEnvironment()) {
      const updater = await getTauriUpdater();
      if (updater) {
        try {
          console.log('[AutoUpdater] Checking native update endpoints...');
          const update = await updater.check();
          const nowIso = new Date().toISOString();
          localStorage.setItem('sirver_last_update_check', nowIso);

          if (update) {
            console.log(`[AutoUpdater] Native in-place update found: v${update.version}`);
            this.nativeUpdate = update;
            this.isChecking = false;

            this.updateState({
              status: 'available',
              isNativeUpdater: true,
              newVersion: update.version,
              releaseNotes: update.body || 'Internal application update with security, stability, and feature improvements.',
              lastCheckTime: nowIso,
              errorMessage: null,
              dismissedNotification: false,
            });

            // Automatically download and install in-place if autoDownload is enabled
            if (settings.updates?.autoDownload ?? true) {
              this.startDownload();
            }

            return this.getState();
          } else {
            console.log('[AutoUpdater] Native app is up to date.');
          }
        } catch (nativeErr: any) {
          console.warn('[AutoUpdater] Native updater check returned error or offline:', nativeErr);
        }
      }
    }

    // 2. Secondary Channel: PocketBase app_updates
    try {
      const records = await pbService.fetchAppUpdates(currentChannel, currentPlatform);
      const nowIso = new Date().toISOString();
      localStorage.setItem('sirver_last_update_check', nowIso);

      if (records && records.length > 0) {
        // Filter published updates matching platform & channel
        const eligible = records.filter(
          (r) => r.published !== false && (r.platform === currentPlatform || !r.platform)
        );

        // Find the highest version
        let newestRecord: AppUpdateRecord | null = null;
        for (const rec of eligible) {
          if (!newestRecord || semverCompare(newestRecord.version, rec.version) < 0) {
            newestRecord = rec;
          }
        }

        if (newestRecord && semverCompare(this.state.currentVersion, newestRecord.version) < 0) {
          const isMandatory = !!newestRecord.mandatory;
          const attachmentId = `app_update_${newestRecord.id}`;
          const existingDownload = downloadManager.getDownloadByAttachmentId(attachmentId);

          let initialStatus: UpdateStatus = 'available';

          if (existingDownload && existingDownload.status === 'completed') {
            const isVerified = await this.verifyChecksum(existingDownload.id, newestRecord.checksum);
            initialStatus = isVerified ? 'downloaded' : 'available';
          }

          this.isChecking = false;
          this.updateState({
            status: initialStatus,
            availableUpdate: newestRecord,
            newVersion: newestRecord.version,
            totalBytes: newestRecord.file_size || 0,
            releaseNotes: newestRecord.release_notes || 'Internal update available.',
            lastCheckTime: nowIso,
            mandatory: isMandatory,
            downloadItem: existingDownload || null,
            dismissedNotification: false,
          });

          if (
            initialStatus === 'available' &&
            (settings.updates?.autoDownload ?? true) &&
            newestRecord.download_url
          ) {
            this.startDownload();
          }

          return this.getState();
        }
      }

      // 3. Double-Check Channel: GitHub Multi-Repo & 'versions' simple file check
      // Checks repositories: <prefix>, <prefix>-0.1, <prefix>-0.2, etc. and inspects 'versions'
      const githubOwner = settings.updates?.githubOwner || 'Simlfe';
      const repoPrefix = settings.updates?.repoPrefix || 'sirverchats';

      const githubCheck = await this.checkGitHubReposAndVersions(githubOwner, repoPrefix);
      if (githubCheck && githubCheck.hasUpdate) {
        this.isChecking = false;
        const isRollback = !!githubCheck.isRollback;
        const releaseNotes = isRollback
          ? `Safe rollback to v${githubCheck.newVersion} (from repo '${githubCheck.repoName}') because current version is no longer active on GitHub.`
          : `New version v${githubCheck.newVersion} detected from repository '${githubCheck.repoName}'.`;

        const availableUpdate: AppUpdateRecord | null = githubCheck.downloadUrl
          ? {
              id: `gh_${githubCheck.repoName}_${githubCheck.newVersion}`,
              version: githubCheck.newVersion,
              platform: this.state.platform,
              channel: (this.state.channel as any) || 'stable',
              download_url: githubCheck.downloadUrl,
              release_notes: releaseNotes,
              mandatory: isRollback,
              published: true,
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            }
          : null;

        this.updateState({
          status: 'available',
          newVersion: githubCheck.newVersion,
          sourceRepo: githubCheck.repoName,
          availableUpdate,
          isRollback,
          releaseNotes,
          lastCheckTime: nowIso,
          mandatory: isRollback, // Rollback is treated with high priority so client falls back safely
          dismissedNotification: false,
        });

        // Only auto-download if we have a valid, verified download URL
        if (githubCheck.downloadUrl && (settings.updates?.autoDownload ?? true)) {
          this.startDownload();
        }

        return this.getState();
      }

      this.isChecking = false;
      this.updateState({
        status: 'up_to_date',
        availableUpdate: null,
        newVersion: undefined,
        lastCheckTime: nowIso,
        mandatory: false,
      });
      return this.getState();
    } catch (err: any) {
      console.warn('[AutoUpdater] Update check failed:', err);
      // Fallback check GitHub even if PB is down
      try {
        const githubOwner = settings.updates?.githubOwner || 'Simlfe';
        const repoPrefix = settings.updates?.repoPrefix || 'sirverchats';
        const githubCheck = await this.checkGitHubReposAndVersions(githubOwner, repoPrefix);
        if (githubCheck && githubCheck.hasUpdate) {
          this.isChecking = false;
          const availableUpdate: AppUpdateRecord | null = githubCheck.downloadUrl
            ? {
                id: `gh_${githubCheck.repoName}_${githubCheck.newVersion}`,
                version: githubCheck.newVersion,
                platform: this.state.platform,
                channel: (this.state.channel as any) || 'stable',
                download_url: githubCheck.downloadUrl,
                release_notes: `New version v${githubCheck.newVersion} detected from repository '${githubCheck.repoName}'.`,
                mandatory: false,
                published: true,
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
              }
            : null;

          this.updateState({
            status: 'available',
            newVersion: githubCheck.newVersion,
            sourceRepo: githubCheck.repoName,
            availableUpdate,
            releaseNotes: `New version v${githubCheck.newVersion} detected from repository '${githubCheck.repoName}'.`,
            lastCheckTime: new Date().toISOString(),
            mandatory: false,
            dismissedNotification: false,
          });
          return this.getState();
        }
      } catch (ghErr) {
        console.warn('[AutoUpdater] Fallback GitHub check failed:', ghErr);
      }

      this.isChecking = false;
      this.updateState({
        status: 'error',
        errorMessage: err?.message || 'Failed to check for updates from server',
        lastCheckTime: new Date().toISOString(),
      });
      return this.getState();
    }
  }

  /**
   * Downloads and applies the update in-place internally.
   * NEVER opens or requires running an external setup file or installer!
   */
  public async startDownload(): Promise<void> {
    this.abortRequested = false;
    this.updateState({
      dismissedNotification: false,
      errorMessage: null,
      isInterrupted: false,
      canResume: false,
      canReset: true,
    });

    // A. If Native Tauri Update is active:
    if (this.nativeUpdate) {
      this.updateState({
        status: 'downloading',
        downloadProgressPercent: 0,
        downloadedBytes: 0,
        totalBytes: this.state.totalBytes || 0,
        errorMessage: null,
      });

      try {
        console.log('[AutoUpdater] Initiating in-place native download and binary replacement...');
        let downloaded = 0;
        let total = this.state.totalBytes || 0;

        await this.nativeUpdate.downloadAndInstall((event: any) => {
          if (this.abortRequested) {
            throw new Error('Download cancelled by user');
          }
          if (event.event === 'Started') {
            total = event.data.contentLength || total || 0;
            this.updateState({
              status: 'downloading',
              totalBytes: total,
              downloadedBytes: 0,
              downloadProgressPercent: 0,
              isInterrupted: false,
            });
          } else if (event.event === 'Progress') {
            if (this.abortRequested) {
              throw new Error('Download cancelled by user');
            }
            downloaded += event.data.chunkLength;
            const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 50;
            this.updateState({
              status: 'downloading',
              downloadedBytes: downloaded,
              totalBytes: total,
              downloadProgressPercent: pct,
              isInterrupted: false,
            });
          } else if (event.event === 'Finished') {
            this.updateState({
              downloadProgressPercent: 100,
              downloadedBytes: total > 0 ? total : downloaded,
            });
          }
        });

        console.log('[AutoUpdater] Internal update installed in place! Ready to restart.');
        this.updateState({
          status: 'ready_to_restart',
          downloadProgressPercent: 100,
          errorMessage: null,
          canReset: false,
          canResume: false,
        });
        return;
      } catch (err: any) {
        console.error('[AutoUpdater] In-place native download/install failed:', err);
        const wasCancelled = this.abortRequested;
        this.updateState({
          status: wasCancelled ? 'available' : 'error',
          isInterrupted: !wasCancelled,
          canResume: true,
          canReset: true,
          errorMessage: wasCancelled
            ? null
            : `Update interrupted: ${err?.message || 'Network stream error'}. You can resume or reset safely.`,
        });
        return;
      }
    }

    // B. PocketBase / Web / DownloadManager Fallback
    let update = this.state.availableUpdate;

    // If discovered via GitHub repo but no PocketBase record or download URL, resolve verified download URL
    if ((!update || !update.download_url) && this.state.newVersion && this.state.sourceRepo) {
      const owner = getCachedUserSettings().updates?.githubOwner || 'Simlfe';
      const repo = this.state.sourceRepo;
      const ver = this.state.newVersion;
      const resolvedUrl = await this.resolveDownloadUrlForVersion(owner, repo, ver, this.state.platform);

      if (resolvedUrl) {
        update = {
          id: `gh_${repo}_${ver}`,
          version: ver,
          platform: this.state.platform,
          channel: (this.state.channel as any) || 'stable',
          download_url: resolvedUrl,
          release_notes: this.state.releaseNotes || `Update v${ver} from ${repo}`,
          mandatory: !!this.state.isRollback,
          published: true,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };
        this.updateState({ availableUpdate: update });
      }
    }

    if (!update || !update.download_url) {
      this.updateState({
        status: 'error',
        errorMessage: `No installable release binary found for v${this.state.newVersion || ''} on GitHub.`,
      });
      return;
    }

    const attachmentId = `app_update_${update.id}`;
    let item = downloadManager.getDownloadByAttachmentId(attachmentId);

    const ext =
      this.state.platform === 'windows'
        ? 'exe'
        : this.state.platform === 'linux'
        ? 'AppImage'
        : this.state.platform === 'android'
        ? 'apk'
        : 'bin';

    const filename = update.filename || `SirverData_Update_v${update.version}.${ext}`;

    if (!item) {
      item = downloadManager.startDownload({
        attachmentId,
        filename,
        downloadUrl: update.download_url,
        sizeBytes: update.file_size || 0,
        mimeType: 'application/octet-stream',
      });
    } else if (item.status === 'failed' || item.status === 'cancelled') {
      downloadManager.retryDownload(item.id);
    }

    this.updateState({
      status: 'downloading',
      downloadItem: item,
      totalBytes: update.file_size || 0,
      errorMessage: null,
      canResume: false,
      canReset: true,
    });
  }

  /**
   * Resets or cancels an in-progress or interrupted update safely.
   * Cleans up partial caches and resets progress counters.
   */
  public async cancelOrResetDownload(): Promise<void> {
    console.log('[AutoUpdater] Resetting update state safely...');
    this.abortRequested = true;

    if (this.state.downloadItem) {
      try {
        downloadManager.cancelDownload(this.state.downloadItem.id);
        await downloadManager.deleteDownloadedFile(this.state.downloadItem.id);
        await downloadManager.removeFromHistory(this.state.downloadItem.id);
      } catch (e) {
        console.warn('[AutoUpdater] downloadManager cleanup error:', e);
      }
    }

    const hasUpdate = !!(this.nativeUpdate || this.state.availableUpdate);
    this.updateState({
      status: hasUpdate ? 'available' : 'idle',
      downloadProgressPercent: 0,
      downloadedBytes: 0,
      errorMessage: null,
      isInterrupted: false,
      downloadItem: null,
      dismissedNotification: false,
      canResume: false,
      canReset: false,
    });
  }

  /**
   * Resumes or retries downloading the update after interruption.
   */
  public async retryOrResumeDownload(): Promise<void> {
    console.log('[AutoUpdater] Resuming update download...');
    this.abortRequested = false;
    this.updateState({
      errorMessage: null,
      isInterrupted: false,
    });
    await this.startDownload();
  }

  /**
   * Verifies SHA-256 checksum of downloaded payload.
   */
  public async verifyChecksum(downloadId: string, expectedChecksum?: string): Promise<boolean> {
    if (!expectedChecksum || expectedChecksum.trim() === '') {
      this.updateState({ checksumVerified: true });
      return true;
    }

    const blob = await getBlobFromDB(downloadId);
    if (!blob) {
      this.updateState({
        checksumVerified: false,
        status: 'error',
        errorMessage: 'Downloaded update payload not found in storage',
      });
      return false;
    }

    const calculatedHash = await calculateBlobSHA256(blob);
    const expectedClean = expectedChecksum.trim().toLowerCase();

    if (calculatedHash && calculatedHash === expectedClean) {
      this.updateState({ checksumVerified: true });
      return true;
    } else {
      console.warn(`Checksum mismatch for download ${downloadId}. Expected: ${expectedClean}, calculated: ${calculatedHash}`);
      await downloadManager.deleteDownloadedFile(downloadId);
      await downloadManager.removeFromHistory(downloadId);

      this.updateState({
        checksumVerified: false,
        status: 'error',
        errorMessage: 'Checksum verification failed! Corrupted download deleted for safety.',
        downloadItem: null,
      });
      return false;
    }
  }

  private async syncWithDownloadManager() {
    if (this.nativeUpdate || !this.state.availableUpdate) return;

    const attachmentId = `app_update_${this.state.availableUpdate.id}`;
    const item = downloadManager.getDownloadByAttachmentId(attachmentId);

    if (!item) return;

    if (item.status === 'downloading' && this.state.status !== 'downloading') {
      this.updateState({ status: 'downloading', downloadItem: item });
    } else if (item.status === 'completed' && this.state.status === 'downloading') {
      const verified = await this.verifyChecksum(item.id, this.state.availableUpdate.checksum);
      if (verified) {
        this.updateState({
          status: 'ready_to_restart',
          downloadItem: item,
          checksumVerified: true,
        });
      }
    } else if (item.status === 'failed') {
      this.updateState({
        status: 'error',
        errorMessage: item.errorMessage || 'Update download failed',
        downloadItem: item,
      });
    } else {
      this.updateState({ downloadItem: item });
    }
  }

  /**
   * Applies the update and restarts the app seamlessly.
   * Never asks the user to run setup.exe or msi!
   */
  public async installUpdate(): Promise<void> {
    this.updateState({ status: 'installing' });

    // 1. Desktop native relaunch via Tauri Process
    if (isTauriEnvironment()) {
      const proc = await getTauriProcess();
      if (proc) {
        console.log('[AutoUpdater] In-place update complete. Relaunching application...');
        try {
          await proc.relaunch();
          return;
        } catch (relaunchErr) {
          console.warn('[AutoUpdater] Relaunch failed, attempting exit:', relaunchErr);
          try {
            await proc.exit(0);
          } catch (e) {}
        }
      }
    }

    // 2. Web / Browser seamless reload
    if (typeof window !== 'undefined' && window.location) {
      console.log('[AutoUpdater] Reloading web client with updated version...');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }

  public clearError() {
    this.updateState({
      errorMessage: null,
      status: this.nativeUpdate || this.state.availableUpdate ? 'available' : 'idle',
    });
  }
}

export const updateService = new UpdateServiceClass();
