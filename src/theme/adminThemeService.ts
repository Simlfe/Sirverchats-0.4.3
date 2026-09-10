import { DEFAULT_BUILTIN_THEMES, PRESET_WALLPAPERS, WallpaperPreset } from './builtinThemes';
import { AVAILABLE_FONTS, DEFAULT_LAYOUT_SETTINGS, FontOption, createThemeLayout } from './themeDefaults';
import { pbService, getAttachmentUrl } from '../pocketbase';
export { DEFAULT_BUILTIN_THEMES, DEFAULT_LAYOUT_SETTINGS, PRESET_WALLPAPERS, type WallpaperPreset, AVAILABLE_FONTS, type FontOption, createThemeLayout };

export interface ThemeTokenGroup {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface BackgroundTokens {
  window: string;
  sidebar: string;
  chat: string;
  card: string;
  popup: string;
  dialog: string;
}

export interface TextTokens {
  primary: string;
  secondary: string;
  muted: string;
  link: string;
}

export interface ButtonTokens {
  normal: string;
  hover: string;
  pressed: string;
  disabled: string;
}

export interface InputTokens {
  background: string;
  border: string;
  placeholder: string;
  focus: string;
}

export interface NavigationTokens {
  serverList: string;
  channelList: string;
  selectedChannel: string;
  hoverState: string;
}

export interface MessageTokens {
  ownMessage: string;
  otherMessages: string;
  mentions: string;
  replyHighlights: string;
  reactions: string;
}

export interface MemberTokens {
  memberList: string;
  roleColors: string;
  presenceIndicators?: string;
  presenceOnline?: string;
  presenceAway?: string;
  presenceDnd?: string;
  presenceOffline?: string;
}

export interface MediaTokens {
  videoControls: string;
  imageViewer: string;
  attachmentCards: string;
}

export interface BorderTokens {
  borderColors: string;
  separators: string;
  shadows: string;
}

export interface ThemeTokens {
  general: ThemeTokenGroup;
  backgrounds: BackgroundTokens;
  text: TextTokens;
  buttons: ButtonTokens;
  inputs: InputTokens;
  navigation: NavigationTokens;
  messages: MessageTokens;
  members: MemberTokens;
  media: MediaTokens;
  borders: BorderTokens;
}

export interface LayoutSettings {
  profileCards: {
    width: number;
    height: number;
    cornerRadius: number;
    avatarSize: number;
    scale?: number;
  };
  chat: {
    messageSpacing: number;
    bubbleRadius: number;
    bubblePadding: number;
    timestampFormat: '12h' | '24h' | 'relative';
  };
  sidebar: {
    width: number;
    iconSize: number;
    spacing: number;
  };
  channels: {
    rowHeight: number;
    fontSize: number;
    iconSpacing: number;
  };
  serverList: {
    iconSize: number;
    spacing: number;
    hoverAnimation: 'scale' | 'bounce' | 'glow' | 'none';
  };
  titleBar: {
    height: number;
    buttonSpacing: number;
    cornerRadius: number;
  };
  animations: {
    preset?: string;
    duration: number;
    delay?: number;
    easing: string;
    direction?: string;
    loop?: string;
    speed?: number;
    enabled: boolean;
    components?: Record<string, any>;
  };
  typography: {
    fontFamily: string;
    fontHeadings?: string;
    fontChat?: string;
    baseFontSize: number;
    lineHeight: number;
    fontWeightNormal: number;
    fontWeightBold: number;
  };
}

export interface PartialThemeTokens {
  general?: Partial<ThemeTokenGroup>;
  backgrounds?: Partial<BackgroundTokens>;
  text?: Partial<TextTokens>;
  buttons?: Partial<ButtonTokens>;
  inputs?: Partial<InputTokens>;
  navigation?: Partial<NavigationTokens>;
  messages?: Partial<MessageTokens>;
  members?: Partial<MemberTokens>;
  media?: Partial<MediaTokens>;
  borders?: Partial<BorderTokens>;
}

export interface ThemeBackgroundConfig {
  imageUrl?: string;
  opacity?: number; // 0 to 1
  blur?: number; // px blur
  fit?: 'cover' | 'contain' | 'repeat' | 'fixed';
  position?: string; // e.g. 'center center'
  overlayColor?: string;
}

export type ThemeCategory = 'all' | 'anime' | 'games' | 'action' | 'core' | 'aesthetic';

export interface ThemeDefinition {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  category?: 'anime' | 'games' | 'action' | 'core' | 'aesthetic' | string;
  tags?: string[];
  backgroundImage?: string;
  backgroundImage2?: string;
  activeImageIndex?: number;
  backgroundConfig?: ThemeBackgroundConfig;
  authorId?: string;
  version?: string;
  mode?: 'light' | 'dark' | 'both';
  isSystem?: boolean;
  isPublished: boolean;
  isDraft: boolean;
  isUnlisted?: boolean;
  createdAt: string;
  updatedAt: string;
  variants: {
    light: PartialThemeTokens;
    dark: PartialThemeTokens;
  };
  layout?: Partial<LayoutSettings> | LayoutSettings;
  overrides?: PartialThemeTokens;
  tokens?: ThemeTokens;
}

export interface AdminAppSettingsData {
  themes: ThemeDefinition[];
  publishedThemeIds: string[];
  publishedThemeId?: string;
  layoutSettings: LayoutSettings;
  themeVersion: number;
  updatedAt: string;
}

export const DEFAULT_DARK_MONOCHROME_TOKENS: ThemeTokens = {
  general: {
    primary: '#09090B',
    secondary: '#18181B',
    accent: '#FAF8ED',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  backgrounds: {
    window: '#000000',
    sidebar: '#262630',
    chat: '#000000',
    card: '#22222B',
    popup: '#262630',
    dialog: '#262630',
  },
  text: {
    primary: '#FAF8ED',
    secondary: '#A1A1AA',
    muted: '#71717A',
    link: '#FAF8ED',
  },
  buttons: {
    normal: '#3E3E50',
    hover: '#4C4C60',
    pressed: '#5A5A70',
    disabled: '#262630',
  },
  inputs: {
    background: '#22222B',
    border: '#3E3E50',
    placeholder: '#71717A',
    focus: '#FAF8ED',
  },
  navigation: {
    serverList: '#262630',
    channelList: '#262630',
    selectedChannel: '#3E3E50',
    hoverState: '#363646',
  },
  messages: {
    ownMessage: '#22222B',
    otherMessages: '#262630',
    mentions: 'rgba(250, 248, 237, 0.12)',
    replyHighlights: 'rgba(250, 248, 237, 0.08)',
    reactions: '#3E3E50',
  },
  members: {
    memberList: '#262630',
    roleColors: '#FAF8ED',
    presenceIndicators: '#10B981',
    presenceOnline: '#22C55E',
    presenceAway: '#F59E0B',
    presenceDnd: '#EF4444',
    presenceOffline: '#71717A',
  },
  media: {
    videoControls: 'rgba(0, 0, 0, 0.8)',
    imageViewer: 'rgba(0, 0, 0, 0.9)',
    attachmentCards: '#18181B',
  },
  borders: {
    borderColors: '#27272A',
    separators: '#27272A',
    shadows: 'rgba(0, 0, 0, 0.5)',
  },
};

export const DEFAULT_LIGHT_MONOCHROME_TOKENS: ThemeTokens = {
  general: {
    primary: '#FAF9F5',
    secondary: '#F4F3EE',
    accent: '#18181B',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  backgrounds: {
    window: '#FAF9F5',
    sidebar: '#F4F3EE',
    chat: '#FAF9F5',
    card: '#FFFFFF',
    popup: '#FFFFFF',
    dialog: '#FFFFFF',
  },
  text: {
    primary: '#1C1917',
    secondary: '#44403C',
    muted: '#78716C',
    link: '#18181B',
  },
  buttons: {
    normal: '#EBE9E1',
    hover: '#DFDDD4',
    pressed: '#D0CCC6',
    disabled: '#F4F3EE',
  },
  inputs: {
    background: '#FFFFFF',
    border: '#E2DFD8',
    placeholder: '#78716C',
    focus: '#18181B',
  },
  navigation: {
    serverList: '#F4F3EE',
    channelList: '#F4F3EE',
    selectedChannel: '#EBE9E1',
    hoverState: '#EAE8E0',
  },
  messages: {
    ownMessage: '#F4F3EE',
    otherMessages: '#FFFFFF',
    mentions: 'rgba(24, 24, 27, 0.08)',
    replyHighlights: 'rgba(24, 24, 27, 0.05)',
    reactions: '#EBE9E1',
  },
  members: {
    memberList: '#F4F3EE',
    roleColors: '#18181B',
    presenceIndicators: '#10B981',
    presenceOnline: '#22C55E',
    presenceAway: '#F59E0B',
    presenceDnd: '#EF4444',
    presenceOffline: '#78716C',
  },
  media: {
    videoControls: 'rgba(255, 255, 255, 0.9)',
    imageViewer: 'rgba(0, 0, 0, 0.85)',
    attachmentCards: '#D4D4E0',
  },
  borders: {
    borderColors: '#A0A0B2',
    separators: '#8A8A9E',
    shadows: 'rgba(0, 0, 0, 0.1)',
  },
};

export const DEFAULT_DARK_TOKENS: ThemeTokens = {
  general: {
    primary: '#09090B',
    secondary: '#18181B',
    accent: '#FAFAFA',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  backgrounds: {
    window: '#000000',
    sidebar: '#09090B',
    chat: '#000000',
    card: '#18181B',
    popup: '#09090B',
    dialog: '#09090B',
  },
  text: {
    primary: '#FAFAFA',
    secondary: '#A1A1AA',
    muted: '#71717A',
    link: '#FAFAFA',
  },
  buttons: {
    normal: '#FAFAFA',
    hover: '#E4E4E7',
    pressed: '#D4D4D8',
    disabled: '#27272A',
  },
  inputs: {
    background: '#18181B',
    border: '#27272A',
    placeholder: '#71717A',
    focus: '#FAFAFA',
  },
  navigation: {
    serverList: '#09090B',
    channelList: '#09090B',
    selectedChannel: '#18181B',
    hoverState: '#18181B',
  },
  messages: {
    ownMessage: '#18181B',
    otherMessages: '#09090B',
    mentions: 'rgba(250, 250, 250, 0.15)',
    replyHighlights: 'rgba(250, 250, 250, 0.10)',
    reactions: '#27272A',
  },
  members: {
    memberList: '#09090B',
    roleColors: '#FAFAFA',
    presenceIndicators: '#10B981',
    presenceOnline: '#22C55E',
    presenceAway: '#F59E0B',
    presenceDnd: '#EF4444',
    presenceOffline: '#71717A',
  },
  media: {
    videoControls: 'rgba(0, 0, 0, 0.8)',
    imageViewer: 'rgba(0, 0, 0, 0.9)',
    attachmentCards: '#18181B',
  },
  borders: {
    borderColors: '#27272A',
    separators: '#27272A',
    shadows: 'rgba(0, 0, 0, 0.5)',
  },
};

export const DEFAULT_LIGHT_TOKENS: ThemeTokens = {
  general: {
    primary: '#FFFFFF',
    secondary: '#E8E8F0',
    accent: '#18181B',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  backgrounds: {
    window: '#FFFFFF',
    sidebar: '#D4D4E0',
    chat: '#FFFFFF',
    card: '#FFFFFF',
    popup: '#FFFFFF',
    dialog: '#FFFFFF',
  },
  text: {
    primary: '#09090B',
    secondary: '#4A4A56',
    muted: '#666676',
    link: '#18181B',
  },
  buttons: {
    normal: '#18181B',
    hover: '#27272A',
    pressed: '#3F3F46',
    disabled: '#E4E4E7',
  },
  inputs: {
    background: '#FFFFFF',
    border: '#A0A0B2',
    placeholder: '#71717A',
    focus: '#18181B',
  },
  navigation: {
    serverList: '#D4D4E0',
    channelList: '#D4D4E0',
    selectedChannel: '#C2C2CE',
    hoverState: '#C8C8D6',
  },
  messages: {
    ownMessage: '#D4D4E0',
    otherMessages: '#FFFFFF',
    mentions: 'rgba(24, 24, 27, 0.12)',
    replyHighlights: 'rgba(24, 24, 27, 0.08)',
    reactions: '#C2C2CE',
  },
  members: {
    memberList: '#D4D4E0',
    roleColors: '#18181B',
    presenceIndicators: '#10B981',
    presenceOnline: '#22C55E',
    presenceAway: '#F59E0B',
    presenceDnd: '#EF4444',
    presenceOffline: '#71717A',
  },
  media: {
    videoControls: 'rgba(255, 255, 255, 0.9)',
    imageViewer: 'rgba(0, 0, 0, 0.85)',
    attachmentCards: '#D4D4E0',
  },
  borders: {
    borderColors: '#A0A0B2',
    separators: '#8A8A9E',
    shadows: 'rgba(0, 0, 0, 0.1)',
  },
};

const LOCAL_STORAGE_PUBLISHED_KEY = 'admin_published_theme_v1';
const LOCAL_STORAGE_DRAFTS_KEY = 'admin_draft_themes_v1';
const LOCAL_STORAGE_ALL_THEMES_KEY = 'admin_all_themes_v1';

export function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any>): T {
  const result = { ...target } as any;
  if (!source || typeof source !== 'object') return result;

  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'object' && !Array.isArray(val) && result[key] && typeof result[key] === 'object') {
      result[key] = deepMerge(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export function resolveFinalThemeTokens(
  mode: 'light' | 'dark',
  theme?: ThemeDefinition | null,
  useThemes: boolean = true
): ThemeTokens {
  if (!useThemes || !theme || theme.id === 'none') {
    return mode === 'light'
      ? JSON.parse(JSON.stringify(DEFAULT_LIGHT_TOKENS))
      : JSON.parse(JSON.stringify(DEFAULT_DARK_TOKENS));
  }

  const baseTokens = mode === 'light' ? DEFAULT_LIGHT_TOKENS : DEFAULT_DARK_TOKENS;
  let merged = JSON.parse(JSON.stringify(baseTokens));

  // If mode-specific variant exists, merge base with variant, else fallback to theme.tokens
  if (theme.variants && theme.variants[mode]) {
    merged = deepMerge(merged, theme.variants[mode]);
  } else if (theme.tokens) {
    merged = deepMerge(merged, theme.tokens);
  }

  if (theme.overrides) {
    merged = deepMerge(merged, theme.overrides);
  }

  return merged;
}

function getContrastTextColor(hexColor: string): string {
  if (!hexColor || typeof hexColor !== 'string') return '#000000';
  let hex = hexColor.replace('#', '').trim();
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return '#000000';
  if (hex.length === 3) {
    hex = hex.split('').map((x) => x + x).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) return '#000000';
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 135 ? '#000000' : '#FFFFFF';
}

function hexToRgb(hex: string): string {
  if (!hex || typeof hex !== 'string') return '123, 174, 55';
  let c = hex.replace('#', '').trim();
  if (c.startsWith('rgba') || c.startsWith('rgb')) return '123, 174, 55';
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return '123, 174, 55';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

// In-memory cache for high-speed reads
let cachedAllThemesMemory: ThemeDefinition[] | null = null;
let lastThemesRawString: string | null = null;

let appliedThemeCssProps = new Set<string>();

export function applyThemeTokensAndLayout(
  theme: ThemeDefinition | null | undefined,
  mode: 'light' | 'dark' = 'dark',
  useThemes: boolean = true,
  fontOverride?: string | null
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const resolvedTokens = resolveFinalThemeTokens(mode, theme, useThemes);
  const layout = (useThemes && theme && theme.id !== 'none')
    ? deepMerge(DEFAULT_LAYOUT_SETTINGS, theme.layout || {})
    : DEFAULT_LAYOUT_SETTINGS;

  // Mode attribute & classes
  root.setAttribute('data-theme-mode', mode);
  root.dataset.theme = mode;
  if (mode === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }

  const newProps = new Map<string, string>();

  // Inject General Tokens
  if (resolvedTokens.general) {
    newProps.set('--theme-color-primary', resolvedTokens.general.primary);
    newProps.set('--theme-color-secondary', resolvedTokens.general.secondary);
    newProps.set('--accent-color', resolvedTokens.general.accent);
    newProps.set('--accent-color-rgb', hexToRgb(resolvedTokens.general.accent));
    newProps.set('--theme-color-accent', resolvedTokens.general.accent);
    const contrastText = getContrastTextColor(resolvedTokens.general.accent);
    newProps.set('--theme-accent-contrast', contrastText);
    newProps.set('--theme-accent-text', contrastText);
    newProps.set('--theme-color-success', resolvedTokens.general.success);
    newProps.set('--theme-color-warning', resolvedTokens.general.warning);
    newProps.set('--theme-color-error', resolvedTokens.general.error);
    newProps.set('--theme-color-info', resolvedTokens.general.info);
  }

  const hasWallpaper = Boolean(useThemes && theme && theme.backgroundImage && theme.id !== 'none');

  // Backgrounds & Surfaces
  if (resolvedTokens.backgrounds) {
    newProps.set('--theme-bg-primary', resolvedTokens.backgrounds.window);
    newProps.set('--theme-bg-secondary', resolvedTokens.backgrounds.sidebar);
    newProps.set('--theme-bg-tertiary', resolvedTokens.backgrounds.card);
    newProps.set('--theme-bg-chat', resolvedTokens.backgrounds.chat);
    newProps.set('--theme-bg-card', resolvedTokens.backgrounds.card);
    newProps.set('--theme-bg-popup', resolvedTokens.backgrounds.popup);
    newProps.set('--theme-bg-dialog', resolvedTokens.backgrounds.dialog);
    newProps.set('--theme-titlebar-bg', resolvedTokens.navigation?.serverList || resolvedTokens.backgrounds.sidebar || resolvedTokens.backgrounds.window);
    newProps.set('--theme-glass-bg', mode === 'dark' ? `${resolvedTokens.backgrounds.sidebar}E6` : `${resolvedTokens.backgrounds.sidebar}F5`);
    
    // Explicitly update root & body background and text colors to prevent stale defaults
    if (hasWallpaper) {
      root.style.backgroundColor = 'transparent';
      if (document.body) {
        document.body.style.backgroundColor = 'transparent';
      }
    } else {
      root.style.backgroundColor = resolvedTokens.backgrounds.window;
      if (document.body) {
        document.body.style.backgroundColor = resolvedTokens.backgrounds.window;
      }
    }
  }

  // Text
  if (resolvedTokens.text) {
    newProps.set('--theme-text-primary', resolvedTokens.text.primary);
    newProps.set('--theme-text-secondary', resolvedTokens.text.secondary);
    newProps.set('--theme-text-muted', resolvedTokens.text.muted);
    newProps.set('--theme-text-link', resolvedTokens.text.link);
    root.style.color = resolvedTokens.text.primary;
    if (document.body) {
      document.body.style.color = resolvedTokens.text.primary;
    }
  }

  // Buttons
  if (resolvedTokens.buttons) {
    newProps.set('--theme-btn-normal', resolvedTokens.buttons.normal);
    newProps.set('--theme-btn-hover', resolvedTokens.buttons.hover);
    newProps.set('--theme-btn-pressed', resolvedTokens.buttons.pressed);
    newProps.set('--theme-btn-disabled', resolvedTokens.buttons.disabled);
  }

  // Navigation
  if (resolvedTokens.navigation) {
    newProps.set('--theme-server-list-bg', resolvedTokens.navigation.serverList);
    newProps.set('--theme-channel-list-bg', resolvedTokens.navigation.channelList);
    newProps.set('--theme-channel-hover-bg', resolvedTokens.navigation.hoverState);
    newProps.set('--theme-channel-active-bg', resolvedTokens.navigation.selectedChannel);
  }

  // Inputs
  if (resolvedTokens.inputs) {
    newProps.set('--theme-input-bg', resolvedTokens.inputs.background);
    newProps.set('--theme-input-border', resolvedTokens.inputs.border);
    newProps.set('--theme-input-placeholder', resolvedTokens.inputs.placeholder);
    newProps.set('--theme-input-focus', resolvedTokens.inputs.focus);
  }

  // Messages
  if (resolvedTokens.messages) {
    newProps.set('--theme-msg-own', resolvedTokens.messages.ownMessage);
    newProps.set('--theme-msg-other', resolvedTokens.messages.otherMessages);
    newProps.set('--theme-msg-mentions', resolvedTokens.messages.mentions);
    newProps.set('--theme-msg-reply', resolvedTokens.messages.replyHighlights);
    newProps.set('--theme-msg-reactions', resolvedTokens.messages.reactions);
    newProps.set('--theme-message-hover-bg', mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)');
  }

  // Borders
  if (resolvedTokens.borders) {
    newProps.set('--theme-border', resolvedTokens.borders.borderColors);
    newProps.set('--theme-separator', resolvedTokens.borders.separators);
    newProps.set('--theme-shadow', resolvedTokens.borders.shadows);
    newProps.set('--theme-glass-border', resolvedTokens.borders.borderColors);
  }

  // Member Status Indicators & Roles
  if (resolvedTokens.members) {
    if (resolvedTokens.members.memberList) newProps.set('--theme-member-list-bg', resolvedTokens.members.memberList);
    if (resolvedTokens.members.roleColors) newProps.set('--theme-role-color', resolvedTokens.members.roleColors);
    if (resolvedTokens.members.presenceOnline) newProps.set('--status-online', resolvedTokens.members.presenceOnline);
    if (resolvedTokens.members.presenceAway) newProps.set('--status-away', resolvedTokens.members.presenceAway);
    if (resolvedTokens.members.presenceDnd) newProps.set('--status-dnd', resolvedTokens.members.presenceDnd);
    if (resolvedTokens.members.presenceOffline) newProps.set('--status-offline', resolvedTokens.members.presenceOffline);
  }

  // Media
  if (resolvedTokens.media) {
    if (resolvedTokens.media.videoControls) newProps.set('--media-video-controls', resolvedTokens.media.videoControls);
    if (resolvedTokens.media.imageViewer) newProps.set('--media-image-viewer', resolvedTokens.media.imageViewer);
    if (resolvedTokens.media.attachmentCards) newProps.set('--media-attachment-cards', resolvedTokens.media.attachmentCards);
  }

  // Background Wallpaper Image and Overlay Settings (supports 2 images per theme)
  const effectiveBgUrl = (theme?.activeImageIndex === 1 && theme?.backgroundImage2)
    ? theme.backgroundImage2
    : (theme?.backgroundImage || theme?.backgroundImage2 || '');
  const bgImgUrl = hasWallpaper ? effectiveBgUrl : '';
  const bgImgCss = bgImgUrl ? `url("${bgImgUrl}")` : 'none';
  const defaultOpacity = mode === 'light' ? 0.75 : 0.55;
  const rawOpacity = hasWallpaper ? (theme?.backgroundConfig?.opacity ?? defaultOpacity) : 0;
  const minOpacity = mode === 'light' ? 0.55 : 0.35;
  const bgOpacity = hasWallpaper ? Math.max(minOpacity, rawOpacity) : 0;
  const bgBlur = hasWallpaper ? (theme?.backgroundConfig?.blur ?? 0) : 0;
  const bgFit = hasWallpaper ? (theme?.backgroundConfig?.fit ?? 'cover') : 'cover';
  const bgPos = hasWallpaper ? (theme?.backgroundConfig?.position ?? 'center center') : 'center center';
  const defaultOverlay = mode === 'dark' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.10)';
  const bgOverlay = hasWallpaper ? (theme?.backgroundConfig?.overlayColor ?? defaultOverlay) : 'transparent';

  newProps.set('--theme-bg-image', bgImgCss);
  newProps.set('--theme-bg-image-opacity', String(bgOpacity));
  newProps.set('--theme-bg-image-blur', `${bgBlur}px`);
  newProps.set('--theme-bg-image-fit', bgFit);
  newProps.set('--theme-bg-image-pos', bgPos);
  newProps.set('--theme-bg-image-overlay', bgOverlay);

  if (hasWallpaper) {
    root.classList.add('has-theme-wallpaper');
  } else {
    root.classList.remove('has-theme-wallpaper');
  }

  // Layout Properties & Universal Typography
  if (layout) {
    if (layout.profileCards) {
      newProps.set('--profile-card-width', `${layout.profileCards.width}px`);
      newProps.set('--profile-card-height', `${layout.profileCards.height}px`);
      newProps.set('--profile-card-radius', `${layout.profileCards.cornerRadius}px`);
      newProps.set('--profile-avatar-size', `${layout.profileCards.avatarSize}px`);
    }
    if (layout.chat) {
      newProps.set('--chat-message-spacing', `${layout.chat.messageSpacing}px`);
      newProps.set('--chat-bubble-radius', `${layout.chat.bubbleRadius}px`);
      newProps.set('--chat-bubble-padding', `${layout.chat.bubblePadding}px`);
    }
    if (layout.sidebar) {
      newProps.set('--sidebar-width', `${layout.sidebar.width}px`);
      newProps.set('--sidebar-icon-size', `${layout.sidebar.iconSize}px`);
    }
    if (layout.channels) {
      newProps.set('--channel-row-height', `${layout.channels.rowHeight}px`);
      newProps.set('--channel-font-size', `${layout.channels.fontSize}px`);
    }
    if (layout.serverList) {
      newProps.set('--server-icon-size', `${layout.serverList.iconSize}px`);
    }
    if (layout.animations) {
      newProps.set('--anim-duration', `${layout.animations.duration}ms`);
      newProps.set('--anim-easing', layout.animations.easing);
      if (layout.animations.components) {
        Object.entries(layout.animations.components).forEach(([compKey, compAnim]) => {
          if (compAnim) {
            newProps.set(`--anim-${compKey}-duration`, `${compAnim.duration || 250}ms`);
            newProps.set(`--anim-${compKey}-delay`, `${compAnim.delay || 0}ms`);
            newProps.set(`--anim-${compKey}-easing`, compAnim.easing || 'ease-in-out');
            newProps.set(`--anim-${compKey}-preset`, compAnim.preset || 'fade');
          }
        });
      }
    }
    if (layout.typography) {
      // Ensure high quality Arabic font companion exists in the stack
      const ensureArabicFallback = (stack: string) => {
        if (!stack) return 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif';
        if (stack.includes('Cairo') || stack.includes('Tajawal') || stack.includes('Almarai') || stack.includes('Alexandria') || stack.includes('Readex Pro') || stack.includes('El Messiri')) {
          return stack;
        }
        if (stack.includes('serif') && !stack.includes('sans-serif')) {
          return `${stack.replace(/,\s*serif/g, '')}, "El Messiri", Cairo, serif`;
        }
        if (stack.includes('monospace')) {
          return `${stack.replace(/,\s*monospace/g, '')}, Cairo, monospace`;
        }
        return `${stack.replace(/,\s*sans-serif/g, '')}, Cairo, Tajawal, sans-serif`;
      };

      const selectedCustomFont = (fontOverride && fontOverride !== 'theme' && fontOverride !== 'default')
        ? fontOverride
        : layout.typography.fontFamily;

      const family = ensureArabicFallback(selectedCustomFont || 'Plus Jakarta Sans, Cairo, Tajawal, sans-serif');
      const headings = ensureArabicFallback(
        (fontOverride && fontOverride !== 'theme' && fontOverride !== 'default')
          ? fontOverride
          : (layout.typography.fontHeadings || family)
      );
      const chat = ensureArabicFallback(
        (fontOverride && fontOverride !== 'theme' && fontOverride !== 'default')
          ? fontOverride
          : (layout.typography.fontChat || family)
      );

      newProps.set('--font-family', family);
      newProps.set('--font-family-headings', headings);
      newProps.set('--font-family-chat', chat);
      newProps.set('--base-font-size', `${layout.typography.baseFontSize || 13}px`);
      // Allow CSS variable cascade to control font family
      if (document.body) {
        document.body.style.removeProperty('font-family');
      }
    }
  }

  // Efficiently clean up stale properties only and batch set new properties
  for (const oldProp of appliedThemeCssProps) {
    if (!newProps.has(oldProp)) {
      root.style.removeProperty(oldProp);
    }
  }
  const nextApplied = new Set<string>();
  for (const [k, v] of newProps.entries()) {
    if (root.style.getPropertyValue(k) !== v) {
      root.style.setProperty(k, v);
    }
    nextApplied.add(k);
  }
  appliedThemeCssProps = nextApplied;

  // Broadcast event locally
  window.dispatchEvent(new CustomEvent('admin-theme-applied', { detail: { theme, mode, resolvedTokens } }));
}

export function getCachedPublishedTheme(): ThemeDefinition | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PUBLISHED_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}
  return null;
}

export function saveCachedPublishedTheme(theme: ThemeDefinition) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_PUBLISHED_KEY, JSON.stringify(theme));
  } catch (e) {}
}

export function getCachedDraftThemes(): ThemeDefinition[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DRAFTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function saveCachedDraftThemes(drafts: ThemeDefinition[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_DRAFTS_KEY, JSON.stringify(drafts));
  } catch (e) {}
}

export const LOCAL_STORAGE_THEME_IMAGE_OVERRIDES_KEY = 'sirver_theme_image_overrides_v1';

export interface ThemeImageOverride {
  image1?: string | null;
  image2?: string | null;
  activeSlot?: 0 | 1;
  backgroundConfig?: ThemeBackgroundConfig;
}

export function getThemeImageOverrides(): Record<string, ThemeImageOverride> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_THEME_IMAGE_OVERRIDES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}

export function saveThemeImageOverrides(overrides: Record<string, ThemeImageOverride>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_THEME_IMAGE_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {}
}

export function setThemeImageOverride(
  themeId: string,
  override: Partial<ThemeImageOverride>
) {
  const all = getThemeImageOverrides();
  all[themeId] = {
    ...(all[themeId] || {}),
    ...override,
  };
  saveThemeImageOverrides(all);
}

export function clearThemeImageOverride(themeId: string) {
  const all = getThemeImageOverrides();
  delete all[themeId];
  saveThemeImageOverrides(all);
}

export function getCachedAllThemes(): ThemeDefinition[] {
  let raw = '';
  if (typeof localStorage !== 'undefined') {
    try {
      raw = localStorage.getItem(LOCAL_STORAGE_ALL_THEMES_KEY) || '';
    } catch (e) {}
  }

  if (cachedAllThemesMemory && raw === lastThemesRawString) {
    return cachedAllThemesMemory;
  }

  let userList: ThemeDefinition[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) userList = parsed;
    } catch (e) {}
  }

  const overrides = getThemeImageOverrides();

  let finalMerged: ThemeDefinition[];
  if (userList.length > 0) {
    const merged = [...userList];
    for (const builtin of DEFAULT_BUILTIN_THEMES) {
      const existingIdx = merged.findIndex(t => t.id === builtin.id);
      if (existingIdx === -1) {
        const ovr = overrides[builtin.id];
        merged.push({
          ...builtin,
          backgroundImage: ovr?.image1 !== undefined ? (ovr.image1 || undefined) : builtin.backgroundImage,
          backgroundImage2: ovr?.image2 !== undefined ? (ovr.image2 || undefined) : builtin.backgroundImage2,
          activeImageIndex: ovr?.activeSlot !== undefined ? ovr.activeSlot : (builtin.activeImageIndex ?? 0),
          backgroundConfig: ovr?.backgroundConfig || builtin.backgroundConfig,
        });
      } else {
        // KEEP user customizations! Never overwrite user's custom images with default builtins
        const existing = merged[existingIdx];
        const ovr = overrides[builtin.id];
        merged[existingIdx] = {
          ...builtin,
          ...existing,
          backgroundImage: ovr?.image1 !== undefined ? (ovr.image1 || undefined) : (existing.backgroundImage ?? builtin.backgroundImage),
          backgroundImage2: ovr?.image2 !== undefined ? (ovr.image2 || undefined) : (existing.backgroundImage2 ?? builtin.backgroundImage2),
          activeImageIndex: ovr?.activeSlot !== undefined ? ovr.activeSlot : (existing.activeImageIndex ?? builtin.activeImageIndex ?? 0),
          backgroundConfig: ovr?.backgroundConfig || existing.backgroundConfig || builtin.backgroundConfig,
          variants: existing.variants || builtin.variants,
          layout: existing.layout || builtin.layout,
        };
      }
    }

    finalMerged = merged.map((t) => {
      const ovr = overrides[t.id];
      if (!ovr) return t;
      return {
        ...t,
        backgroundImage: ovr.image1 !== undefined ? (ovr.image1 || undefined) : t.backgroundImage,
        backgroundImage2: ovr.image2 !== undefined ? (ovr.image2 || undefined) : t.backgroundImage2,
        activeImageIndex: ovr.activeSlot !== undefined ? ovr.activeSlot : (t.activeImageIndex ?? 0),
        backgroundConfig: ovr.backgroundConfig || t.backgroundConfig,
      };
    });
  } else {
    // If no user cache yet, load defaults with overrides applied
    finalMerged = DEFAULT_BUILTIN_THEMES.map((builtin) => {
      const ovr = overrides[builtin.id];
      if (!ovr) return builtin;
      return {
        ...builtin,
        backgroundImage: ovr.image1 !== undefined ? (ovr.image1 || undefined) : builtin.backgroundImage,
        backgroundImage2: ovr.image2 !== undefined ? (ovr.image2 || undefined) : builtin.backgroundImage2,
        activeImageIndex: ovr.activeSlot !== undefined ? ovr.activeSlot : (builtin.activeImageIndex ?? 0),
        backgroundConfig: ovr.backgroundConfig || builtin.backgroundConfig,
      };
    });
  }

  cachedAllThemesMemory = finalMerged;
  lastThemesRawString = raw;
  return finalMerged;
}

export function saveCachedAllThemes(themes: ThemeDefinition[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = JSON.stringify(themes);
    localStorage.setItem(LOCAL_STORAGE_ALL_THEMES_KEY, raw);
    cachedAllThemesMemory = themes;
    lastThemesRawString = raw;
  } catch (e) {}
}

/**
 * Updates images for a specific theme, saves to local overrides, cache, and syncs to DB.
 */
export function updateThemeImages(
  themeId: string,
  updates: {
    image1?: string | null;
    image2?: string | null;
    activeSlot?: 0 | 1;
    backgroundConfig?: ThemeBackgroundConfig;
  }
): ThemeDefinition | null {
  const allThemes = getCachedAllThemes();
  const targetIdx = allThemes.findIndex((t) => t.id === themeId);
  if (targetIdx === -1) return null;

  const current = allThemes[targetIdx];
  const newBg1 = updates.image1 !== undefined ? (updates.image1 || undefined) : current.backgroundImage;
  const newBg2 = updates.image2 !== undefined ? (updates.image2 || undefined) : current.backgroundImage2;
  const newActiveSlot = updates.activeSlot !== undefined ? updates.activeSlot : (current.activeImageIndex ?? 0);
  const newBgConfig = updates.backgroundConfig ? { ...current.backgroundConfig, ...updates.backgroundConfig } : current.backgroundConfig;

  const updated: ThemeDefinition = {
    ...current,
    backgroundImage: newBg1,
    backgroundImage2: newBg2,
    activeImageIndex: newActiveSlot,
    backgroundConfig: newBgConfig,
    updatedAt: new Date().toISOString(),
  };

  allThemes[targetIdx] = updated;
  saveCachedAllThemes(allThemes);

  // Save to persistent overrides
  setThemeImageOverride(themeId, {
    image1: newBg1,
    image2: newBg2,
    activeSlot: newActiveSlot as 0 | 1,
    backgroundConfig: newBgConfig,
  });

  // Notify listeners
  window.dispatchEvent(new CustomEvent('themes-updated', { detail: { themes: allThemes, updatedThemeId: themeId } }));

  // Asynchronously sync to PocketBase admin settings if available
  try {
    const publishedList = allThemes.filter((t) => t.isPublished);
    pbService.saveAdminAppSettings({
      themes: allThemes,
      publishedThemeIds: publishedList.map((t) => t.id),
      publishedThemeId: themeId,
      themeVersion: Date.now(),
      layoutSettings: updated.layout as LayoutSettings,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  } catch (e) {}

  return updated;
}

export const LOCAL_STORAGE_EDITOR_SESSION_KEY = 'sirver_theme_editor_session_v1';

export interface ThemeEditorSession {
  activeThemeId: string;
  activeThemeDraft: ThemeDefinition;
  activeTab: 'tokens' | 'layout' | 'animations' | 'text';
  activeTokenCat?: string;
  activeLayoutCat?: string;
  previewView?: string;
  previewDevice?: 'desktop' | 'tablet' | 'mobile';
  previewMode?: 'dark' | 'light';
  expandedCategories?: Record<string, boolean>;
  searchQuery?: string;
  timestamp: number;
}

export function getCachedThemeEditorSession(): ThemeEditorSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EDITOR_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.activeThemeDraft) return parsed;
    }
  } catch (e) {}
  return null;
}

export function saveCachedThemeEditorSession(session: ThemeEditorSession) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_EDITOR_SESSION_KEY, JSON.stringify(session));
  } catch (e) {}
}

export function clearCachedThemeEditorSession() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LOCAL_STORAGE_EDITOR_SESSION_KEY);
  } catch (e) {}
}

// ============================================================================
// CUSTOM WALLPAPERS & SERVER ATTACHMENT PERSISTENCE
// ============================================================================

export const LOCAL_STORAGE_CUSTOM_WALLPAPERS_KEY = 'sirver_custom_wallpapers_v1';

export function getCustomWallpapers(): WallpaperPreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_WALLPAPERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function saveCustomWallpaper(preset: WallpaperPreset) {
  if (typeof localStorage === 'undefined') return;
  try {
    const existing = getCustomWallpapers();
    const filtered = existing.filter((w) => w.id !== preset.id && w.url !== preset.url);
    const updated = [preset, ...filtered];
    localStorage.setItem(LOCAL_STORAGE_CUSTOM_WALLPAPERS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('custom-wallpapers-updated', { detail: { wallpapers: updated } }));
  } catch (e) {}
}

/**
 * Deletes a wallpaper preset from the app and completely removes its attachment record from the database.
 * Also cleans up any theme that references this image.
 */
export function deleteCustomWallpaper(idOrUrl: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    const existing = getCustomWallpapers();
    const target = existing.find((w) => w.id === idOrUrl || w.url === idOrUrl);
    
    // 1. Force delete from PocketBase database attachments collection
    if (target?.attachmentId) {
      pbService.deleteAttachmentRecord(target.attachmentId, false, true).catch(() => {});
    }

    // 2. Remove from custom wallpapers localStorage
    const updated = existing.filter((w) => w.id !== idOrUrl && w.url !== idOrUrl);
    localStorage.setItem(LOCAL_STORAGE_CUSTOM_WALLPAPERS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('custom-wallpapers-updated', { detail: { wallpapers: updated } }));

    // 3. Remove image from any cached theme using this URL as backgroundImage or backgroundImage2
    const allThemes = getCachedAllThemes();
    let themesChanged = false;
    const targetUrl = target?.url || idOrUrl;

    const cleanedThemes = allThemes.map((t) => {
      let changed = false;
      let newBg1 = t.backgroundImage;
      let newBg2 = t.backgroundImage2;

      if (t.backgroundImage === targetUrl || t.backgroundImage === idOrUrl) {
        newBg1 = undefined;
        changed = true;
      }
      if (t.backgroundImage2 === targetUrl || t.backgroundImage2 === idOrUrl) {
        newBg2 = undefined;
        changed = true;
      }

      if (changed) {
        themesChanged = true;
        setThemeImageOverride(t.id, {
          image1: newBg1 || null,
          image2: newBg2 || null,
        });
        return {
          ...t,
          backgroundImage: newBg1,
          backgroundImage2: newBg2,
          activeImageIndex: newBg1 ? 0 : (newBg2 ? 1 : 0),
        };
      }
      return t;
    });

    if (themesChanged) {
      saveCachedAllThemes(cleanedThemes);
      window.dispatchEvent(new CustomEvent('themes-updated', { detail: { themes: cleanedThemes } }));
      pbService.saveAdminAppSettings({
        themes: cleanedThemes,
        publishedThemeIds: cleanedThemes.filter(t => t.isPublished).map(t => t.id),
        themeVersion: Date.now(),
        layoutSettings: DEFAULT_LAYOUT_SETTINGS,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  } catch (e) {}
}

export function getAllWallpaperPresets(): WallpaperPreset[] {
  const custom = getCustomWallpapers();
  return [...custom, ...PRESET_WALLPAPERS];
}

/**
 * Uploads a local image file directly to PocketBase attachments collection
 * and adds it to the High-Res Wallpaper Presets library.
 */
export async function uploadWallpaperFileToServer(
  file: File,
  name?: string,
  nameAr?: string
): Promise<WallpaperPreset> {
  const att = await pbService.uploadAttachment('', file);
  const serverUrl = getAttachmentUrl(att) || (att.file ? `${pbService.getServerUrl()}/api/files/${att.collectionName || 'attachments'}/${att.id}/${att.file}` : '');
  const cleanName = name || file.name.replace(/\.[^/.]+$/, '');
  const preset: WallpaperPreset = {
    id: `custom-wp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    nameAr: nameAr || cleanName,
    category: 'custom',
    url: serverUrl || URL.createObjectURL(file),
    attachmentId: att.id,
    isCustom: true,
    uploadedAt: new Date().toISOString(),
  };
  saveCustomWallpaper(preset);
  return preset;
}

/**
 * Ingests an image URL by fetching it as a blob and saving as a permanent
 * PocketBase attachment record, adding it to High-Res Wallpaper Presets.
 */
export async function saveWallpaperUrlToServer(
  url: string,
  name?: string,
  nameAr?: string
): Promise<WallpaperPreset> {
  let fileToUpload: File | null = null;
  const urlWithoutQuery = url.split('?')[0];
  const urlFilename = urlWithoutQuery.split('/').pop() || 'wallpaper.jpg';
  const cleanName = name || urlFilename.replace(/\.[^/.]+$/, '') || 'Custom Wallpaper';

  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      const detectedType = blob.type || 'image/jpeg';
      const finalFileName = urlFilename.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)
        ? urlFilename
        : `wallpaper-${Date.now()}.jpg`;
      fileToUpload = new File([blob], finalFileName, { type: detectedType });
    }
  } catch (err) {
    console.warn('Direct image fetch blocked by CORS or network, saving reference URL:', err);
  }

  if (fileToUpload) {
    try {
      const att = await pbService.uploadAttachment('', fileToUpload);
      const serverUrl = getAttachmentUrl(att) || (att.file ? `${pbService.getServerUrl()}/api/files/${att.collectionName || 'attachments'}/${att.id}/${att.file}` : '');
      const preset: WallpaperPreset = {
        id: `custom-wp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: cleanName,
        nameAr: nameAr || cleanName,
        category: 'custom',
        url: serverUrl || url,
        attachmentId: att.id,
        isCustom: true,
        uploadedAt: new Date().toISOString(),
      };
      saveCustomWallpaper(preset);
      return preset;
    } catch (uploadErr) {
      console.warn('Server attachment upload failed, falling back to direct URL preset:', uploadErr);
    }
  }

  // Fallback if CORS or direct upload was prevented: save URL preset
  const fallbackPreset: WallpaperPreset = {
    id: `custom-wp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    nameAr: nameAr || cleanName,
    category: 'custom',
    url: url,
    isCustom: true,
    uploadedAt: new Date().toISOString(),
  };
  saveCustomWallpaper(fallbackPreset);
  return fallbackPreset;
}

