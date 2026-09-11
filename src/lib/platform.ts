export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__ || (window as any).isTauri);
}

export function isMobilePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as any).Capacitor;
  if (capacitor) {
    const platform = capacitor.getPlatform?.();
    if (platform === 'android' || platform === 'ios') return true;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
}
