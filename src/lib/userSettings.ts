import {
  applyThemeTokensAndLayout,
  getCachedAllThemes,
  DEFAULT_BUILTIN_THEMES,
} from '../theme/adminThemeService';

export interface AttachmentCompressionSettings {
  enableCompression: boolean;
  images: {
    enabled: boolean;
    maxResolution: number; // e.g. 2048
    quality: number; // e.g. 0.82
    convertToWebP: boolean;
  };
  videos: {
    enabled: boolean;
    maxSizeMBThreshold: number; // e.g. 5MB
    compressAboveMB?: number; // alias for maxSizeMBThreshold
    maxResolution: number; // e.g. 720p
    quality?: 'fast' | 'balanced' | 'high'; // Video quality preset
    bitrateMbps?: number; // Target video bitrate in Mbps (0 for auto)
    fpsLimit?: number; // Frame rate limit (e.g. 30)
    preset?: 'fastest' | 'balanced' | 'quality'; // Fast encoding speed preset
  };
  audio: {
    enabled: boolean;
  };
}

export interface UpdateSettings {
  autoCheck: boolean;
  autoDownload: boolean;
  installOnNextRestart: boolean;
  channel: 'stable' | 'beta' | 'nightly';
  githubOwner?: string;
  repoPrefix?: string;
  enableLiveWebShell?: boolean;
  liveWebUrl?: string;
}

export interface UserSettings {
  appearance: {
    theme: 'dark' | 'light' | 'system';
    useThemes?: boolean;
    selectedThemeId?: string;
    selectedFontId?: string;
    customFontFamily?: string;
    fontFamily?: string;
    accentColor: string;
    cardColor: string;
    cardColor2?: string;
    avatarFrameColor?: string;
    fontSize: 'small' | 'medium' | 'large' | 'xlarge';
    messageDensity: 'compact' | 'comfortable' | 'spacious';
    animations: 'high' | 'low' | 'none';
    gifPlayback?: 'always' | 'hover' | 'never';
    profileCardScale?: number;
    uiScale?: number;
  };
  languageRegion: {
    appLanguage: 'en' | 'ar';
    dateFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
    timeFormat: '12h' | '24h';
    numberFormat: 'standard' | 'arabic';
  };
  chat: {
    enterToSend: boolean;
    readReceipts: boolean;
    linkPreviews: boolean;
    mediaAutoplay: boolean;
    downloadPreferences: 'auto' | 'wifi' | 'manual';
    notificationSounds: boolean;
    messagePreviewOptions: 'full' | 'sender_only' | 'hidden';
    showScrollInChats?: boolean;
  };
  notifications: {
    pushNotifications: boolean;
    mentionNotifications: boolean;
    replyNotifications: boolean;
    mentionBadges: boolean;
    mentionBlinking: boolean;
    mentionHighlight: boolean;
    mentionSounds: boolean;
    desktopMentions: boolean;
    serverNotifications: boolean;
    sound: boolean;
    vibration: boolean;
    badgeCount: boolean;
  };
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
    screenReader: boolean;
  };
  privacy: {
    onlineStatus: 'everyone' | 'friends' | 'nobody';
    lastSeen: 'everyone' | 'friends' | 'nobody';
    readReceiptsVisibility: boolean;
    blockedUsers: string[];
    twoFactor: boolean;
  };
  storageData: {
    cacheUsage: string;
    downloadedMedia: string;
    networkUsage: 'unlimited' | 'saver';
  };
  attachmentCompression: AttachmentCompressionSettings;
  updates: UpdateSettings;
}

export const AVOCADO_GREEN_ACCENT = '#7BAE37';

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function calculateActualStorageUsage(): {
  cacheUsage: string;
  downloadedMedia: string;
  cacheBytes: number;
  mediaBytes: number;
  mediaCount: number;
} {
  let cacheBytes = 0;
  let mediaBytes = 0;
  let mediaCount = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const val = localStorage.getItem(key) || '';
      const size = (key.length + val.length) * 2;

      const isMedia =
        key.startsWith('server_icon_') ||
        key.startsWith('server_banner_') ||
        key.startsWith('server_avatar_') ||
        key.startsWith('downloaded_media_') ||
        key.startsWith('member_avatar_') ||
        key.startsWith('member_banner_');

      if (isMedia) {
        mediaBytes += size;
        mediaCount++;
      } else {
        cacheBytes += size;
      }
    }

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      const val = sessionStorage.getItem(key) || '';
      cacheBytes += (key.length + val.length) * 2;
    }
  } catch (e) {
    console.warn('Failed to calculate storage usage:', e);
  }

  const cacheUsageStr = formatBytes(cacheBytes);
  const downloadedMediaStr =
    mediaCount === 0
      ? '0 files (0 KB)'
      : `${mediaCount} ${mediaCount === 1 ? 'file' : 'files'} (${formatBytes(mediaBytes)})`;

  return {
    cacheUsage: cacheUsageStr,
    downloadedMedia: downloadedMediaStr,
    cacheBytes,
    mediaBytes,
    mediaCount,
  };
}

export const DEFAULT_ATTACHMENT_SETTINGS: AttachmentCompressionSettings = {
  enableCompression: true,
  images: {
    enabled: true,
    maxResolution: 2048,
    quality: 0.82,
    convertToWebP: true,
  },
  videos: {
    enabled: true,
    maxSizeMBThreshold: 5,
    compressAboveMB: 5,
    maxResolution: 720,
    quality: 'fast',
    bitrateMbps: 2.5,
    fpsLimit: 30,
    preset: 'fastest',
  },
  audio: {
    enabled: true,
  },
};

export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  autoCheck: true,
  autoDownload: true,
  installOnNextRestart: true,
  channel: 'stable',
  githubOwner: 'Simlfe',
  repoPrefix: 'sirverchats',
  enableLiveWebShell: true,
  liveWebUrl: 'https://app.sirverdata.top',
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  appearance: {
    theme: 'dark',
    useThemes: false,
    selectedThemeId: 'none',
    selectedFontId: 'theme',
    customFontFamily: '',
    fontFamily: '',
    accentColor: '#FAFAFA',
    cardColor: '#18181B',
    cardColor2: '#09090B',
    avatarFrameColor: '#FAFAFA',
    fontSize: 'medium',
    messageDensity: 'compact',
    animations: 'high',
    gifPlayback: 'always',
    profileCardScale: 100,
    uiScale: 100,
  },
  languageRegion: {
    appLanguage: 'ar',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '12h',
    numberFormat: 'standard',
  },
  chat: {
    enterToSend: true,
    readReceipts: true,
    linkPreviews: true,
    mediaAutoplay: true,
    downloadPreferences: 'auto',
    notificationSounds: true,
    messagePreviewOptions: 'full',
    showScrollInChats: false,
  },
  notifications: {
    pushNotifications: true,
    mentionNotifications: true,
    replyNotifications: true,
    mentionBadges: true,
    mentionBlinking: true,
    mentionHighlight: true,
    mentionSounds: true,
    desktopMentions: true,
    serverNotifications: true,
    sound: true,
    vibration: true,
    badgeCount: true,
  },
  accessibility: {
    highContrast: false,
    reducedMotion: false,
    screenReader: false,
  },
  privacy: {
    onlineStatus: 'everyone',
    lastSeen: 'everyone',
    readReceiptsVisibility: true,
    blockedUsers: [],
    twoFactor: false,
  },
  storageData: {
    cacheUsage: '0 KB',
    downloadedMedia: '0 files (0 KB)',
    networkUsage: 'unlimited',
  },
  attachmentCompression: DEFAULT_ATTACHMENT_SETTINGS,
  updates: DEFAULT_UPDATE_SETTINGS,
};

const SETTINGS_CACHE_KEY = 'sirver_user_settings_cache_v2';

export function getCachedUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return mergeWithDefaults(parsed);
    }
  } catch (e) {
    console.warn('Failed to parse cached user settings:', e);
  }
  return DEFAULT_USER_SETTINGS;
}

export const loadUserSettings = getCachedUserSettings;

export function saveCachedUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('user-settings-changed', { detail: settings }));
      if (settings?.appearance?.gifPlayback) {
        window.dispatchEvent(new CustomEvent('gif-playback-setting-changed', { detail: { gifPlayback: settings.appearance.gifPlayback } }));
      }
    }
  } catch (e) {
    console.warn('Failed to save user settings to local storage:', e);
  }
}

export function mergeWithDefaults(rawObj: any): UserSettings {
  if (!rawObj || typeof rawObj !== 'object') {
    return DEFAULT_USER_SETTINGS;
  }

  // Handle legacy flat format if present
  if (rawObj.theme && !rawObj.appearance) {
    return {
      ...DEFAULT_USER_SETTINGS,
      appearance: {
        ...DEFAULT_USER_SETTINGS.appearance,
        theme: rawObj.theme || 'slate',
        fontSize: rawObj.fontSize || 'medium',
        animations: rawObj.animations || 'high',
      }
    };
  }

  return {
    appearance: { ...DEFAULT_USER_SETTINGS.appearance, ...(rawObj.appearance || {}) },
    languageRegion: { ...DEFAULT_USER_SETTINGS.languageRegion, ...(rawObj.languageRegion || {}) },
    chat: { ...DEFAULT_USER_SETTINGS.chat, ...(rawObj.chat || {}) },
    notifications: { ...DEFAULT_USER_SETTINGS.notifications, ...(rawObj.notifications || {}) },
    accessibility: { ...DEFAULT_USER_SETTINGS.accessibility, ...(rawObj.accessibility || {}) },
    privacy: { ...DEFAULT_USER_SETTINGS.privacy, ...(rawObj.privacy || {}) },
    storageData: { ...DEFAULT_USER_SETTINGS.storageData, ...(rawObj.storageData || {}) },
    attachmentCompression: {
      ...DEFAULT_USER_SETTINGS.attachmentCompression,
      ...(rawObj.attachmentCompression || {}),
      images: { ...DEFAULT_USER_SETTINGS.attachmentCompression.images, ...(rawObj.attachmentCompression?.images || {}) },
      videos: { ...DEFAULT_USER_SETTINGS.attachmentCompression.videos, ...(rawObj.attachmentCompression?.videos || {}) },
      audio: { ...DEFAULT_USER_SETTINGS.attachmentCompression.audio, ...(rawObj.attachmentCompression?.audio || {}) },
    },
    updates: { ...DEFAULT_UPDATE_SETTINGS, ...(rawObj.updates || {}) },
  };
}

export function resolveEffectiveTheme(themeChoice: string): 'light' | 'dark' {
  if (themeChoice === 'system') {
    const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isSystemDark ? 'dark' : 'light';
  }
  if (themeChoice === 'light') return 'light';
  return 'dark';
}

function hexToRgb(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return '99, 102, 241';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

export function applySettingsToDocument(settings: UserSettings): void {
  const effectiveTheme = resolveEffectiveTheme(settings.appearance.theme);
  const root = document.documentElement;

  const useThemes = settings.appearance.useThemes ?? false;
  const selectedThemeId = settings.appearance.selectedThemeId || 'none';

  // Find active theme definition
  const allThemes = getCachedAllThemes();
  const activeTheme = (useThemes && selectedThemeId !== 'none')
    ? (allThemes.find(t => t.id === selectedThemeId) || DEFAULT_BUILTIN_THEMES.find(t => t.id === selectedThemeId) || null)
    : null;

  // Apply Theme tokens & CSS Custom Properties synchronously
  const fontOverride = settings.appearance.selectedFontId || settings.appearance.fontFamily || settings.appearance.customFontFamily || 'theme';
  applyThemeTokensAndLayout(activeTheme, effectiveTheme, useThemes, fontOverride);

  // Save theme mode to sirver_theme_mode for startup script synchronization
  localStorage.setItem('sirver_theme_mode', effectiveTheme);

  // Toggle dark/light class
  if (effectiveTheme === 'light') {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme-mode', 'light');
    root.dataset.theme = 'light';
  } else {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme-mode', 'dark');
    root.dataset.theme = effectiveTheme;
  }

  // Font size & Message Density & GIF Playback mode
  root.dataset.fontSize = settings.appearance.fontSize || 'medium';
  root.dataset.messageDensity = settings.appearance.messageDensity || 'compact';
  root.dataset.gifPlayback = settings.appearance.gifPlayback || 'always';
  
  // Independent Profile Card Scale
  const rawScale = settings.appearance?.profileCardScale ?? 100;
  const numericScale = rawScale > 5 ? rawScale / 100 : rawScale;
  root.style.setProperty('--profile-card-scale', `${numericScale}`);
  
  // UI Scale (Proportional Design Token Scaling)
  const rawUiScale = settings.appearance?.uiScale ?? 100;
  const numericUiScale = rawUiScale > 5 ? rawUiScale / 100 : rawUiScale;
  root.style.setProperty('--ui-scale', `${numericUiScale}`);
  delete (root.style as any).zoom;
  root.style.removeProperty('zoom');
  
  // High Contrast & Reduced motion
  if (settings.accessibility.highContrast) {
    root.classList.add('high-contrast');
  } else {
    root.classList.remove('high-contrast');
  }

  if (settings.accessibility.reducedMotion || settings.appearance.animations === 'none') {
    root.classList.add('reduced-motion');
  } else {
    root.classList.remove('reduced-motion');
  }
}
