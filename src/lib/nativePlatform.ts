/**
 * Small browser-safe facade for the native/Tauri helpers.
 *
 * Keeping this module free of Tauri imports means the web entry can render
 * without downloading the native bridge. The full implementation is loaded
 * only when a native action is actually requested.
 */
import type { UnlistenFn } from '@tauri-apps/api/event';

export type TargetOS = 'windows' | 'linux' | 'android' | 'macos' | 'unknown';
export const TAURI_DOWNLOAD_SUBDIR = 'Downloads';
export const CUSTOM_DOWNLOAD_DIR_STORAGE_KEY = 'sirver_custom_download_dir';

const loadNativeService = () => import('./tauriDesktopService');

export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__ || (window as any).isTauri);
}

export function isAndroidPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).Capacitor?.getPlatform?.() === 'android') return true;
  return /Android/i.test(navigator.userAgent || '');
}

export function isMobilePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const capPlatform = (window as any).Capacitor?.getPlatform?.();
  if (capPlatform === 'android' || capPlatform === 'ios') return true;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
}

export function getPlatformOS(): TargetOS {
  if (isAndroidPlatform()) return 'android';
  if (typeof window === 'undefined') return 'unknown';
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = ((navigator as any).userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (platform.includes('win') || ua.includes('windows')) return 'windows';
  if (platform.includes('linux') || ua.includes('linux')) return 'linux';
  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) return 'macos';
  return 'unknown';
}

export function getCustomDownloadDirSetting(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CUSTOM_DOWNLOAD_DIR_STORAGE_KEY) || null;
}

export function setCustomDownloadDirSetting(path: string | null): void {
  if (typeof window === 'undefined') return;
  if (path?.trim()) localStorage.setItem(CUSTOM_DOWNLOAD_DIR_STORAGE_KEY, path.trim());
  else localStorage.removeItem(CUSTOM_DOWNLOAD_DIR_STORAGE_KEY);
}

export async function selectFolderWithNativeDialog(): Promise<string | null> {
  return (await loadNativeService()).selectFolderWithNativeDialog();
}
export async function getDownloadDirectory(): Promise<string> {
  return (await loadNativeService()).getDownloadDirectory();
}
export async function ensureDownloadDirectoryExists(): Promise<string> {
  return (await loadNativeService()).ensureDownloadDirectoryExists();
}
export async function openDownloadDirectory(): Promise<boolean> {
  return (await loadNativeService()).openDownloadDirectory();
}
export async function openPathExternally(path: string): Promise<boolean> {
  return (await loadNativeService()).openPathExternally(path);
}
export async function openExternalUrl(url: string): Promise<boolean> {
  return (await loadNativeService()).openExternalUrl(url);
}
export async function openFileExternally(path: string, objectUrl?: string): Promise<boolean> {
  return (await loadNativeService()).openFileExternally(path, objectUrl);
}
export async function saveFileToTauriDisk(...args: Parameters<(typeof import('./tauriDesktopService'))['saveFileToTauriDisk']>): Promise<ReturnType<(typeof import('./tauriDesktopService'))['saveFileToTauriDisk']> extends Promise<infer T> ? T : never> {
  return (await loadNativeService()).saveFileToTauriDisk(...args);
}
export async function removeFileFromTauriDisk(path: string): Promise<boolean> {
  return (await loadNativeService()).removeFileFromTauriDisk(path);
}
export async function checkFileExistsOnDisk(path: string): Promise<boolean> {
  return (await loadNativeService()).checkFileExistsOnDisk(path);
}
export async function executeSilentMsiInstall(path: string): Promise<boolean> {
  return (await loadNativeService()).executeSilentMsiInstall(path);
}
export async function minimizeWindow(): Promise<void> { return (await loadNativeService()).minimizeWindow(); }
export async function showAndFocusWindow(): Promise<void> { return (await loadNativeService()).showAndFocusWindow(); }
export async function toggleMaximizeWindow(): Promise<boolean> { return (await loadNativeService()).toggleMaximizeWindow(); }
export async function closeWindow(): Promise<void> { return (await loadNativeService()).closeWindow(); }
export async function isWindowMaximized(): Promise<boolean> { return (await loadNativeService()).isWindowMaximized(); }
export async function restoreWindowState(): Promise<void> { return (await loadNativeService()).restoreWindowState(); }
export async function saveWindowState(): Promise<void> { return (await loadNativeService()).saveWindowState(); }
export async function startWindowDragging(): Promise<void> { return (await loadNativeService()).startWindowDragging(); }
export async function createRealFileFromLocalPath(path: string): Promise<File> { return (await loadNativeService()).createRealFileFromLocalPath(path); }
export async function setupTauriFileDropListener(...args: Parameters<(typeof import('./tauriDesktopService'))['setupTauriFileDropListener']>): Promise<UnlistenFn | null> {
  return (await loadNativeService()).setupTauriFileDropListener(...args);
}
