import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import {
  applyThemeTokensAndLayout,
  getCachedAllThemes,
  saveCachedAllThemes,
  getCachedDraftThemes,
  saveCachedDraftThemes,
  ThemeDefinition,
  DEFAULT_BUILTIN_THEMES,
  getThemeImageOverrides,
} from '../theme/adminThemeService';
import { pbService } from '../pocketbase';
import {
  getCachedUserSettings,
  saveCachedUserSettings,
  applySettingsToDocument,
  resolveEffectiveTheme,
  UserSettings,
} from '../lib/userSettings';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  appearanceMode: ThemeMode;
  setAppearanceMode: (mode: ThemeMode) => void;
  toggleAppearanceMode: () => void;

  useThemes: boolean;
  setUseThemes: (enabled: boolean) => void;

  selectedThemeId: string;
  setSelectedThemeId: (id: string) => void;
  selectTheme: (themeId: string, enableThemes?: boolean) => void;

  selectedTheme: ThemeDefinition | null;
  setSelectedTheme: (theme: ThemeDefinition | null) => void;

  publishedThemes: ThemeDefinition[];
  allThemes: ThemeDefinition[];

  previewedTheme: ThemeDefinition | null;
  previewMode: ThemeMode | null;
  previewTheme: (theme: ThemeDefinition | null, mode?: ThemeMode | null) => void;
  resetPreview: () => void;
  isPreviewing: boolean;

  publishTheme: (themeId: string) => Promise<boolean>;
  unpublishTheme: (themeId: string) => Promise<boolean>;
  saveTheme: (theme: ThemeDefinition) => Promise<boolean>;
  deleteTheme: (themeId: string) => Promise<boolean>;
  refreshThemes: () => Promise<void>;

  // Backward compatibility aliases
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isDark: boolean;
  publishedTheme: ThemeDefinition | null;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function mergeWithBuiltinThemes(themes: ThemeDefinition[] = []): ThemeDefinition[] {
  const map = new Map<string, ThemeDefinition>();
  const overrides = getThemeImageOverrides();
  
  // 1. Initialize with all latest built-in system themes
  for (const b of DEFAULT_BUILTIN_THEMES) {
    const ovr = overrides[b.id];
    map.set(b.id, {
      ...b,
      backgroundImage: ovr?.image1 !== undefined ? (ovr.image1 || undefined) : b.backgroundImage,
      backgroundImage2: ovr?.image2 !== undefined ? (ovr.image2 || undefined) : b.backgroundImage2,
      activeImageIndex: ovr?.activeSlot !== undefined ? ovr.activeSlot : (b.activeImageIndex ?? 0),
      backgroundConfig: ovr?.backgroundConfig || b.backgroundConfig,
    });
  }

  // 2. Overlay any custom/admin themes from DB or cache
  if (Array.isArray(themes)) {
    for (const t of themes) {
      if (!t || !t.id) continue;
      const ovr = overrides[t.id];
      const existing = map.get(t.id);
      if (existing) {
        map.set(t.id, {
          ...existing,
          ...t,
          backgroundImage: ovr?.image1 !== undefined
            ? (ovr.image1 || undefined)
            : (t.backgroundImage !== undefined ? t.backgroundImage : existing.backgroundImage),
          backgroundImage2: ovr?.image2 !== undefined
            ? (ovr.image2 || undefined)
            : (t.backgroundImage2 !== undefined ? t.backgroundImage2 : existing.backgroundImage2),
          activeImageIndex: ovr?.activeSlot !== undefined
            ? ovr.activeSlot
            : (t.activeImageIndex !== undefined ? t.activeImageIndex : (existing.activeImageIndex ?? 0)),
          backgroundConfig: ovr?.backgroundConfig || t.backgroundConfig || existing.backgroundConfig,
          variants: existing.variants || t.variants,
          layout: existing.layout || t.layout,
        });
      } else {
        map.set(t.id, {
          ...t,
          backgroundImage: ovr?.image1 !== undefined ? (ovr.image1 || undefined) : t.backgroundImage,
          backgroundImage2: ovr?.image2 !== undefined ? (ovr.image2 || undefined) : t.backgroundImage2,
          activeImageIndex: ovr?.activeSlot !== undefined ? ovr.activeSlot : (t.activeImageIndex ?? 0),
          backgroundConfig: ovr?.backgroundConfig || t.backgroundConfig,
        });
      }
    }
  }

  return Array.from(map.values());
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Appearance Mode State
  const [appearanceMode, setAppearanceModeState] = useState<ThemeMode>(() => {
    try {
      const savedSettings = localStorage.getItem('sirver_user_settings_cache_v2');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed?.appearance?.theme) {
          const t = parsed.appearance.theme;
          if (t === 'light' || t === 'dark') return t;
          if (t === 'system') {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
        }
      }
    } catch (e) {}

    const saved = localStorage.getItem('sirver_theme_mode');
    if (saved === 'light' || saved === 'dark') return saved;

    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    return 'dark';
  });

  // 2. Use Themes Toggle State
  const [useThemes, setUseThemesState] = useState<boolean>(() => {
    try {
      const savedSettings = localStorage.getItem('sirver_user_settings_cache_v2');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed?.appearance?.useThemes === 'boolean') {
          return parsed.appearance.useThemes;
        }
      }
    } catch (e) {}

    const val = localStorage.getItem('sirver_use_themes_enabled');
    if (val !== null) {
      return val === 'true';
    }
    return false; // Default OFF to ensure protected Light/Dark theme is single source of truth
  });

  // 3. Selected Theme ID State
  const [selectedThemeId, setSelectedThemeIdState] = useState<string>(() => {
    try {
      const savedSettings = localStorage.getItem('sirver_user_settings_cache_v2');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed?.appearance?.selectedThemeId) {
          return parsed.appearance.selectedThemeId;
        }
      }
    } catch (e) {}

    const savedId = localStorage.getItem('sirver_selected_theme_id');
    if (savedId) return savedId;

    return 'none'; // Default to 'none' if no theme selected
  });

  // 4. Themes Collection State
  const [allThemes, setAllThemes] = useState<ThemeDefinition[]>(() => {
    const cached = getCachedAllThemes();
    return mergeWithBuiltinThemes(cached);
  });

  // 5. Admin Preview State
  const [previewedTheme, setPreviewedTheme] = useState<ThemeDefinition | null>(null);
  const [previewMode, setPreviewMode] = useState<ThemeMode | null>(null);

  const lastAdminSettingsVersionRef = React.useRef<string>('');

  // Helper: Filter Published Themes (hides unlisted themes from normal selection)
  const publishedThemes = React.useMemo(() => {
    return allThemes.filter(t => (t.isPublished || t.isSystem) && !t.isUnlisted);
  }, [allThemes]);

  // Helper: Resolved Selected Theme (only matches valid published/system themes)
  const selectedTheme = React.useMemo(() => {
    return selectedThemeId && selectedThemeId !== 'none'
      ? (publishedThemes.find(t => t.id === selectedThemeId) || null)
      : null;
  }, [selectedThemeId, publishedThemes]);

  // Validate selected theme against currently available published themes
  useEffect(() => {
    if (!selectedThemeId || selectedThemeId === 'none') return;
    const isValid = publishedThemes.some(t => t.id === selectedThemeId);
    if (!isValid) {
      console.warn(`Selected theme ${selectedThemeId} is unlisted or unpublished. Reverting user to default theme.`);
      setSelectedThemeIdState('none');
      localStorage.setItem('sirver_selected_theme_id', 'none');
      syncAndSaveUserSettings({ selectedThemeId: 'none' });
    }
  }, [selectedThemeId, publishedThemes]);

  // Sync / Refresh Themes from PocketBase `app_settings_admin`
  const refreshThemes = useCallback(async () => {
    try {
      const data = await pbService.getAdminAppSettings().catch(() => null);
      if (data && Array.isArray(data.themes) && data.themes.length > 0) {
        const payloadHash = JSON.stringify(data.themes);
        if (lastAdminSettingsVersionRef.current === payloadHash) return; // Skip identical updates!
        lastAdminSettingsVersionRef.current = payloadHash;

        const pubIds: string[] = data.publishedThemeIds || (data.publishedThemeId ? [data.publishedThemeId] : []);
        const remoteThemes: ThemeDefinition[] = data.themes.map((t: ThemeDefinition) => ({
          ...t,
          isPublished: t.isPublished || pubIds.includes(t.id),
        }));

        const merged = mergeWithBuiltinThemes(remoteThemes);
        setAllThemes(merged);
        saveCachedAllThemes(merged);
      } else {
        const defaults = mergeWithBuiltinThemes([]);
        setAllThemes(defaults);
        saveCachedAllThemes(defaults);
      }
    } catch (e) {
      console.warn('Failed refreshing admin app settings from PocketBase:', e);
    }
  }, []);

  // On Mount: Initial Load & PocketBase Realtime Subscription
  useEffect(() => {
    refreshThemes();

    const unsub = pbService.subscribeAdminAppSettings((data: any) => {
      if (data && Array.isArray(data.themes) && data.themes.length > 0) {
        const payloadHash = JSON.stringify(data.themes);
        if (lastAdminSettingsVersionRef.current === payloadHash) return; // Skip identical updates!
        lastAdminSettingsVersionRef.current = payloadHash;

        const pubIds: string[] = data.publishedThemeIds || (data.publishedThemeId ? [data.publishedThemeId] : []);
        const updatedList: ThemeDefinition[] = data.themes.map((t: ThemeDefinition) => ({
          ...t,
          isPublished: t.isPublished || pubIds.includes(t.id),
        }));

        const merged = mergeWithBuiltinThemes(updatedList);
        setAllThemes(merged);
        saveCachedAllThemes(merged);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [refreshThemes]);

  // Listen for local and remote theme list updates & wallpaper updates
  useEffect(() => {
    const handleThemesUpdated = (e: any) => {
      const rawList = e?.detail?.themes || e?.detail;
      if (Array.isArray(rawList) && rawList.length > 0) {
        const merged = mergeWithBuiltinThemes(rawList);
        setAllThemes(merged);
        saveCachedAllThemes(merged);
      } else {
        const currentCached = getCachedAllThemes();
        const merged = mergeWithBuiltinThemes(currentCached);
        setAllThemes(merged);
      }
    };

    const handleWallpapersUpdated = () => {
      const currentCached = getCachedAllThemes();
      const merged = mergeWithBuiltinThemes(currentCached);
      setAllThemes(merged);
    };

    window.addEventListener('themes-updated', handleThemesUpdated);
    window.addEventListener('custom-wallpapers-updated', handleWallpapersUpdated);
    return () => {
      window.removeEventListener('themes-updated', handleThemesUpdated);
      window.removeEventListener('custom-wallpapers-updated', handleWallpapersUpdated);
    };
  }, [refreshThemes]);
  useEffect(() => {
    const handleUserSettingsChanged = (e: any) => {
      const settings = e?.detail;
      if (settings?.appearance) {
        if (settings.appearance.theme) {
          const effective = resolveEffectiveTheme(settings.appearance.theme);
          setAppearanceModeState(effective);
        }
        if (typeof settings.appearance.useThemes === 'boolean') {
          setUseThemesState(settings.appearance.useThemes);
        }
        if (settings.appearance.selectedThemeId !== undefined) {
          setSelectedThemeIdState(settings.appearance.selectedThemeId || 'none');
        }
      }
    };

    window.addEventListener('user-settings-changed', handleUserSettingsChanged);
    return () => window.removeEventListener('user-settings-changed', handleUserSettingsChanged);
  }, []);

  const profileUpdateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounceSaveProfileSettings = useCallback((settings: UserSettings) => {
    if (profileUpdateTimerRef.current) {
      clearTimeout(profileUpdateTimerRef.current);
    }
    profileUpdateTimerRef.current = setTimeout(() => {
      const currentUser = pbService.getCurrentUser();
      if (currentUser?.id) {
        pbService.updateProfile(currentUser.id, { settings }).catch((err) => {
          console.warn('Failed to save user theme settings to PocketBase profile:', err);
        });
      }
    }, 450);
  }, []);

  // Sync and save user theme settings to localStorage, document root, and PocketBase user profile
  const syncAndSaveUserSettings = useCallback((updates: Partial<UserSettings['appearance']>) => {
    try {
      const current = getCachedUserSettings();
      const updated: UserSettings = {
        ...current,
        appearance: {
          ...current.appearance,
          ...updates,
        },
      };
      saveCachedUserSettings(updated);
      applySettingsToDocument(updated);
      debounceSaveProfileSettings(updated);
    } catch (e) {
      console.warn('Error syncing user settings:', e);
    }
  }, [debounceSaveProfileSettings]);

  // Set Appearance Mode
  const setAppearanceMode = useCallback((newMode: ThemeMode) => {
    setAppearanceModeState(newMode);
    localStorage.setItem('sirver_theme_mode', newMode);
    syncAndSaveUserSettings({ theme: newMode });
  }, [syncAndSaveUserSettings]);

  const toggleAppearanceMode = useCallback(() => {
    setAppearanceModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('sirver_theme_mode', next);
      syncAndSaveUserSettings({ theme: next });
      return next;
    });
  }, [syncAndSaveUserSettings]);

  // Set Use Themes Toggle
  const setUseThemes = useCallback((enabled: boolean) => {
    setUseThemesState(enabled);
    localStorage.setItem('sirver_use_themes_enabled', enabled ? 'true' : 'false');
    if (!enabled) {
      setPreviewedTheme(null);
      setPreviewMode(null);
    }
    syncAndSaveUserSettings({ useThemes: enabled });
  }, [syncAndSaveUserSettings]);

  // Set Selected Theme ID
  const setSelectedThemeId = useCallback((id: string) => {
    const targetId = id || 'none';
    setSelectedThemeIdState(targetId);
    localStorage.setItem('sirver_selected_theme_id', targetId);
    syncAndSaveUserSettings({ selectedThemeId: targetId });
  }, [syncAndSaveUserSettings]);

  // Atomic, instantaneous theme selection
  const selectTheme = useCallback((themeId: string, enableThemes = true) => {
    const targetId = themeId || 'none';
    setSelectedThemeIdState(targetId);
    if (enableThemes) {
      setUseThemesState(true);
      localStorage.setItem('sirver_use_themes_enabled', 'true');
    }
    localStorage.setItem('sirver_selected_theme_id', targetId);
    syncAndSaveUserSettings({
      selectedThemeId: targetId,
      ...(enableThemes ? { useThemes: true } : {}),
    });
  }, [syncAndSaveUserSettings]);

  // Set Selected Theme Object directly
  const setSelectedTheme = useCallback((theme: ThemeDefinition | null) => {
    if (theme) {
      setSelectedThemeId(theme.id);
    } else {
      setSelectedThemeId('none');
    }
  }, [setSelectedThemeId]);

  // Preview Theme
  const previewTheme = useCallback((theme: ThemeDefinition | null, mode?: ThemeMode | null) => {
    setPreviewedTheme(theme);
    if (mode) setPreviewMode(mode);
  }, []);

  const resetPreview = useCallback(() => {
    setPreviewedTheme(null);
    setPreviewMode(null);
  }, []);

  // Save Theme (Admin)
  const saveTheme = useCallback(async (themeToSave: ThemeDefinition): Promise<boolean> => {
    const updatedTheme = {
      ...themeToSave,
      updatedAt: new Date().toISOString(),
    };

    setAllThemes((prev) => {
      const updatedList = prev.map(t => t.id === updatedTheme.id ? updatedTheme : t);
      if (!updatedList.some(t => t.id === updatedTheme.id)) {
        updatedList.unshift(updatedTheme);
      }
      saveCachedAllThemes(updatedList);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('themes-updated', { detail: updatedList }));

      const publishedIds = updatedList.filter(t => t.isPublished).map(t => t.id);

      const payload = {
        themes: updatedList,
        publishedThemeIds: publishedIds,
        layoutSettings: updatedTheme.layout || {},
        themeVersion: 1,
        updatedAt: new Date().toISOString(),
      };

      pbService.saveAdminAppSettings(payload);
      return updatedList;
    });

    return true;
  }, []);

  // Publish Theme (Admin)
  const publishTheme = useCallback(async (themeId: string): Promise<boolean> => {
    setAllThemes((prev) => {
      const updatedList = prev.map(t => {
        if (t.id === themeId) {
          return { ...t, isPublished: true, isDraft: false, updatedAt: new Date().toISOString() };
        }
        return t;
      });

      saveCachedAllThemes(updatedList);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('themes-updated', { detail: updatedList }));

      const publishedIds = updatedList.filter(t => t.isPublished).map(t => t.id);

      const payload = {
        themes: updatedList,
        publishedThemeIds: publishedIds,
        layoutSettings: {},
        themeVersion: 1,
        updatedAt: new Date().toISOString(),
      };

      pbService.saveAdminAppSettings(payload);
      return updatedList;
    });

    return true;
  }, []);

  // Unpublish Theme (Admin)
  const unpublishTheme = useCallback(async (themeId: string): Promise<boolean> => {
    setAllThemes((prev) => {
      const updatedList = prev.map(t => {
        if (t.id === themeId) {
          return { ...t, isPublished: false, updatedAt: new Date().toISOString() };
        }
        return t;
      });

      saveCachedAllThemes(updatedList);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('themes-updated', { detail: updatedList }));

      const publishedIds = updatedList.filter(t => t.isPublished).map(t => t.id);

      const payload = {
        themes: updatedList,
        publishedThemeIds: publishedIds,
        layoutSettings: {},
        themeVersion: 1,
        updatedAt: new Date().toISOString(),
      };

      pbService.saveAdminAppSettings(payload);
      return updatedList;
    });

    return true;
  }, []);

  // Delete Theme (Admin)
  const deleteTheme = useCallback(async (themeId: string): Promise<boolean> => {
    const cached = getCachedAllThemes();
    const sourceList = (cached && cached.length > 0) ? cached : allThemes;
    const target = sourceList.find(t => t.id === themeId);
    if (target?.isSystem) {
      console.warn('Cannot delete protected system theme');
      return false;
    }
    const filteredList = sourceList.filter(t => t.id !== themeId);

    setAllThemes(filteredList);
    saveCachedAllThemes(filteredList);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('themes-updated', { detail: filteredList }));

    const remainingDrafts = getCachedDraftThemes().filter(t => t.id !== themeId);
    saveCachedDraftThemes(remainingDrafts);

    if (selectedThemeId === themeId) {
      setSelectedThemeId('none');
    }

    const pubTheme = filteredList.find(t => t.isPublished);
    const pubId = pubTheme ? pubTheme.id : 'theme-default';
    const publishedIds = filteredList.filter(t => t.isPublished).map(t => t.id);

    const payload = {
      key: 'admin_settings',
      themes: filteredList,
      publishedThemeId: pubId,
      publishedThemeIds: publishedIds,
      draftThemes: remainingDrafts,
      layoutSettings: {},
      themeVersion: 1,
      updatedAt: new Date().toISOString(),
    };

    return await pbService.saveAdminAppSettings(payload);
  }, [allThemes, selectedThemeId, setSelectedThemeId]);

  // Main Effect: Apply final theme tokens and layout synchronously to document root before paint
  useLayoutEffect(() => {
    const activeMode = previewMode || appearanceMode;
    const isPreview = previewedTheme !== null;
    const activeTheme = isPreview ? previewedTheme : (useThemes ? selectedTheme : null);
    const activeUseThemes = isPreview ? true : useThemes;

    applyThemeTokensAndLayout(activeTheme, activeMode, activeUseThemes);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('theme-sync-completed', {
        detail: { theme: activeTheme, mode: activeMode, useThemes: activeUseThemes }
      }));
    }
  }, [appearanceMode, useThemes, selectedTheme, previewedTheme, previewMode]);

  const value: ThemeContextType = React.useMemo(() => ({
    appearanceMode,
    setAppearanceMode,
    toggleAppearanceMode,

    useThemes,
    setUseThemes,

    selectedThemeId,
    setSelectedThemeId,
    selectTheme,

    selectedTheme,
    setSelectedTheme,

    publishedThemes,
    allThemes,

    previewedTheme,
    previewMode,
    previewTheme,
    resetPreview,
    isPreviewing: previewedTheme !== null,

    publishTheme,
    unpublishTheme,
    saveTheme,
    deleteTheme,
    refreshThemes,

    // Aliases
    theme: appearanceMode,
    setTheme: setAppearanceMode,
    toggleTheme: toggleAppearanceMode,
    isDark: appearanceMode === 'dark',
    publishedTheme: selectedTheme || publishedThemes[0] || null,
  }), [
    appearanceMode,
    setAppearanceMode,
    toggleAppearanceMode,
    useThemes,
    setUseThemes,
    selectedThemeId,
    setSelectedThemeId,
    selectTheme,
    selectedTheme,
    setSelectedTheme,
    publishedThemes,
    allThemes,
    previewedTheme,
    previewMode,
    previewTheme,
    resetPreview,
    publishTheme,
    unpublishTheme,
    saveTheme,
    deleteTheme,
    refreshThemes,
  ]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
