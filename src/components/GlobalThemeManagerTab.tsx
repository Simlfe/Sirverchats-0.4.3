import React, { useState, useEffect, useRef } from 'react';
import {
  Palette,
  Sparkles,
  Sliders,
  CheckCircle2,
  Copy,
  Trash2,
  Save,
  Globe,
  RotateCcw,
  Plus,
  Edit3,
  Eye,
  EyeOff,
  Shield,
  Layout,
  Type,
  MessageSquare,
  Users,
  Video,
  Box,
  Layers,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Zap,
  Search,
  Monitor,
  X,
  Play,
  Languages,
  Check,
  AlertTriangle,
  Bell,
  MoreVertical,
  Smile,
  Paperclip,
  Send,
  PhoneCall,
  Volume2,
  FileText,
  UserCheck,
  HelpCircle,
  Hash,
  ArrowLeft,
  Download,
  RefreshCw,
  FileCode,
  Gamepad2,
  Film,
  Image as ImageIcon,
  Upload,
  CloudUpload,
  Loader2,
  FolderPlus,
  Link as LinkIcon
} from 'lucide-react';
import {
  ThemeDefinition,
  ThemeTokens,
  LayoutSettings,
  DEFAULT_DARK_TOKENS,
  DEFAULT_LIGHT_TOKENS,
  DEFAULT_LAYOUT_SETTINGS,
  DEFAULT_BUILTIN_THEMES,
  applyThemeTokensAndLayout,
  resolveFinalThemeTokens,
  deepMerge,
  getCachedAllThemes,
  saveCachedAllThemes,
  saveCachedPublishedTheme,
  saveCachedDraftThemes,
  getCachedDraftThemes,
  getCachedPublishedTheme,
  ThemeEditorSession,
  getCachedThemeEditorSession,
  saveCachedThemeEditorSession,
  clearCachedThemeEditorSession,
  AVAILABLE_FONTS,
  PRESET_WALLPAPERS,
  WallpaperPreset,
  getCustomWallpapers,
  saveCustomWallpaper,
  deleteCustomWallpaper,
  uploadWallpaperFileToServer,
  saveWallpaperUrlToServer
} from '../theme/adminThemeService';
import {
  Translation,
  defaultTranslations
} from '../services/localization';
import { pbService } from '../pocketbase';
import { useTheme } from '../context/ThemeContext';

interface GlobalThemeManagerTabProps {
  currentUser: any;
  lang: 'ar' | 'en';
}

type EditorSubTab = 'tokens' | 'layout';

type TokenCategoryKey =
  | 'general'
  | 'backgrounds'
  | 'text'
  | 'buttons'
  | 'inputs'
  | 'navigation'
  | 'messages'
  | 'members'
  | 'media'
  | 'borders';

type LayoutCategoryKey =
  | 'backgroundArt'
  | 'profileCards'
  | 'chat'
  | 'sidebar'
  | 'channels'
  | 'serverList'
  | 'titleBar'
  | 'typography';

type AnimationComponentKey =
  | 'profileCardOpen'
  | 'messageHover'
  | 'serverSwitch'
  | 'contextMenuOpen'
  | 'modalOpen'
  | 'tooltip'
  | 'settingsPage'
  | 'channelSwitch'
  | 'memberList'
  | 'notification';

type PreviewViewKey =
  | 'general'
  | 'chat'
  | 'serverList'
  | 'channelList'
  | 'memberList'
  | 'profile'
  | 'composer'
  | 'menus'
  | 'notifications'
  | 'media'
  | 'titleBar'
  | 'animation'
  | 'text';

const ANIMATION_PRESETS = [
  { id: 'fade', nameEn: 'Fade In / Out', nameAr: 'تلاشي تدريجي (Fade)', cssClass: 'animate-none' },
  { id: 'scale', nameEn: 'Scale / Zoom', nameAr: 'تأثير التكبير (Zoom/Scale)', cssClass: 'animate-none' },
  { id: 'slide-up', nameEn: 'Slide Up', nameAr: 'انزلاق للأعلى (Slide Up)', cssClass: 'animate-none' },
  { id: 'slide-down', nameEn: 'Slide Down', nameAr: 'انزلاق للأسفل (Slide Down)', cssClass: 'animate-none' },
  { id: 'slide-left', nameEn: 'Slide Left', nameAr: 'انزلاق لليصار (Slide Left)', cssClass: 'animate-none' },
  { id: 'slide-right', nameEn: 'Slide Right', nameAr: 'انزلاق لليمين (Slide Right)', cssClass: 'animate-none' },
  { id: 'bounce', nameEn: 'Bounce Elastic', nameAr: 'ارتداد مرن (Bounce)', cssClass: 'animate-none' },
  { id: 'pulse', nameEn: 'Soft Pulse', nameAr: 'نبض ناعم (Pulse)', cssClass: 'animate-none' },
  { id: 'spin', nameEn: 'Smooth Spin', nameAr: 'دوران ناعم (Spin)', cssClass: 'animate-none' },
];

const ANIMATION_COMPONENTS: {
  key: AnimationComponentKey;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  icon: any;
}[] = [
  {
    key: 'profileCardOpen',
    nameEn: 'Profile Card Open',
    nameAr: 'فتح بطاقة الملف الشخصي',
    descEn: 'Opening transition for user profile modals & popups',
    descAr: 'تأثير ظهور نافذة الملف الشخصي للأعضاء',
    icon: UserCheck
  },
  {
    key: 'messageHover',
    nameEn: 'Message Hover',
    nameAr: 'تحويم أسطر الرسائل',
    descEn: 'Hover and highlight state on chat message bubbles',
    descAr: 'تفاعل التحويم والتحفيز على فقاعات الرسائل',
    icon: MessageSquare
  },
  {
    key: 'serverSwitch',
    nameEn: 'Server Switch',
    nameAr: 'التنقل بين السيرفرات',
    descEn: 'Selection indicator and hover bounce on server icons',
    descAr: 'تأثير الانتقال والتحديد على أيقونات السيرفرات',
    icon: Layers
  },
  {
    key: 'contextMenuOpen',
    nameEn: 'Context Menu Open',
    nameAr: 'فتح القوائم المنسدلة',
    descEn: 'Dropdown animation for right-click context menus',
    descAr: 'حركة ظهور قوائم النقر الأيمن المنسدلة',
    icon: MoreVertical
  },
  {
    key: 'modalOpen',
    nameEn: 'Modal / Dialog Open',
    nameAr: 'فتح النوافذ المنبثقة',
    descEn: 'Entrance animation for workspace dialogs and modals',
    descAr: 'تأثير ظهور النوافذ العامة ومربعات الحوار',
    icon: Box
  },
  {
    key: 'tooltip',
    nameEn: 'Tooltip Hover',
    nameAr: 'تولتيب الإرشادات',
    descEn: 'Hover popup tooltips over buttons and badges',
    descAr: 'تأثير ظهور الملاحظات التوضيحية عند التحويم',
    icon: HelpCircle
  },
  {
    key: 'settingsPage',
    nameEn: 'Settings Page Transition',
    nameAr: 'انتقال صفحة الإعدادات',
    descEn: 'Transition when launching system settings workspace',
    descAr: 'حركة فتح شاشة الإعدادات العامة',
    icon: Sliders
  },
  {
    key: 'channelSwitch',
    nameEn: 'Channel Switch',
    nameAr: 'التنقل بين القنوات',
    descEn: 'Highlight transition when selecting text or voice channels',
    descAr: 'تأثير التحديد والانتقال بين قنوات المحادثة',
    icon: Hash
  },
  {
    key: 'memberList',
    nameEn: 'Member List Hover',
    nameAr: 'تحويم قائمة الأعضاء',
    descEn: 'Hover highlight transition on online member rows',
    descAr: 'تأثير التحويم على أسطر الأعضاء في القائمة',
    icon: Users
  },
  {
    key: 'notification',
    nameEn: 'Notification Toast',
    nameAr: 'إشعارات التوست',
    descEn: 'Slide and glow animation for floating alert toasts',
    descAr: 'حركة انزلاق إشعارات التنبيه المنبثقة',
    icon: Bell
  }
];

export const GlobalThemeManagerTab: React.FC<GlobalThemeManagerTabProps> = ({ currentUser, lang }) => {
  const isAr = lang === 'ar';
  const isAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'half-admin' ||
    (currentUser as any)?.isAdmin === true ||
    currentUser?.is_admin === true;

  const { previewTheme, resetPreview, isPreviewing, previewedTheme, appearanceMode, deleteTheme } = useTheme();

  // Theme Collections State
  const [themesList, setThemesList] = useState<ThemeDefinition[]>(() => getCachedAllThemes());
  const [publishedId, setPublishedId] = useState<string>(() => getCachedPublishedTheme()?.id || 'theme-default');
  const [librarySearch, setLibrarySearch] = useState<string>('');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<'all' | 'anime' | 'games' | 'action' | 'core' | 'aesthetic'>('all');

  // Workspace Theme Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [activeEditingTheme, setActiveEditingTheme] = useState<ThemeDefinition | null>(null);
  const [editorTab, setEditorTab] = useState<EditorSubTab>('tokens');
  const [activeTokenCat, setActiveTokenCat] = useState<TokenCategoryKey>('general');
  const [activeLayoutCat, setActiveLayoutCat] = useState<LayoutCategoryKey>('profileCards');
  const [activeAnimComp, setActiveAnimComp] = useState<AnimationComponentKey>('profileCardOpen');
  const [editorPreviewMode, setEditorPreviewMode] = useState<'light' | 'dark'>(appearanceMode || 'dark');
  const [previewView, setPreviewView] = useState<PreviewViewKey>('general');
  const [syncBothModes, setSyncBothModes] = useState<boolean>(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [tokenSearchQuery, setTokenSearchQuery] = useState<string>('');
  const [showOverflowMenu, setShowOverflowMenu] = useState<boolean>(false);

  // Animation Testing State
  const [animationPlayKey, setAnimationPlayKey] = useState<number>(Date.now());

  // Deletion State
  const [themeToDelete, setThemeToDelete] = useState<ThemeDefinition | null>(null);

  // Custom Wallpaper Presets & Upload State
  const [customWallpapers, setCustomWallpapers] = useState<WallpaperPreset[]>(() => getCustomWallpapers());
  const [wallpaperCatFilter, setWallpaperCatFilter] = useState<'all' | 'custom' | 'anime' | 'games' | 'action' | 'aesthetic'>('all');
  const [wallpaperSearch, setWallpaperSearch] = useState<string>('');
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState<boolean>(false);
  const [isSavingWallpaperUrl, setIsSavingWallpaperUrl] = useState<boolean>(false);
  const [wallpaperActionMessage, setWallpaperActionMessage] = useState<string>('');
  const [customWallpaperUrlInput, setCustomWallpaperUrlInput] = useState<string>('');
  const [editorWallpaperSlot, setEditorWallpaperSlot] = useState<1 | 2>(1);
  const wallpaperFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleCustomWallpapersUpdated = () => {
      setCustomWallpapers(getCustomWallpapers());
    };
    window.addEventListener('custom-wallpapers-updated', handleCustomWallpapersUpdated);
    return () => {
      window.removeEventListener('custom-wallpapers-updated', handleCustomWallpapersUpdated);
    };
  }, []);

  // Synchronize CSS custom properties on document root whenever editing active theme in editor
  useEffect(() => {
    if (isEditorOpen && activeEditingTheme) {
      applyThemeTokensAndLayout(activeEditingTheme, editorPreviewMode, true);
    }
  }, [isEditorOpen, activeEditingTheme, editorPreviewMode]);

  // AUTOMATIC PREVIEW SYNCHRONIZATION
  // Whenever active tab, token category, layout category, or animation component changes,
  // automatically set the preview view to the most relevant view!
  useEffect(() => {
    if (!isEditorOpen) return;

    if (editorTab === 'tokens') {
      switch (activeTokenCat) {
        case 'general':
          setPreviewView('general');
          break;
        case 'backgrounds':
        case 'borders':
          setPreviewView('general');
          break;
        case 'text':
          setPreviewView('general');
          break;
        case 'buttons':
          setPreviewView('general');
          break;
        case 'inputs':
          setPreviewView('composer');
          break;
        case 'navigation':
          setPreviewView('channelList');
          break;
        case 'messages':
          setPreviewView('chat');
          break;
        case 'members':
          setPreviewView('memberList');
          break;
        case 'media':
          setPreviewView('media');
          break;
        default:
          setPreviewView('general');
      }
    } else if (editorTab === 'layout') {
      switch (activeLayoutCat) {
        case 'profileCards':
          setPreviewView('profile');
          break;
        case 'chat':
          setPreviewView('chat');
          break;
        case 'sidebar':
        case 'channels':
          setPreviewView('channelList');
          break;
        case 'serverList':
          setPreviewView('serverList');
          break;
        case 'titleBar':
          setPreviewView('titleBar');
          break;
        case 'typography':
          setPreviewView('general');
          break;
        default:
          setPreviewView('general');
      }
    } else if (editorTab === 'animations') {
      setPreviewView('animation');
      setAnimationPlayKey(Date.now());
    }
  }, [editorTab, activeTokenCat, activeLayoutCat, activeAnimComp, isEditorOpen]);

  // Remote Sync Load
  useEffect(() => {
    let isMounted = true;
    const fetchRemoteSettings = async () => {
      try {
        const records = await pbService.getAdminAppSettings().catch(() => null);
        if (records && records.themes && Array.isArray(records.themes) && records.themes.length > 0) {
          if (isMounted) {
            saveCachedAllThemes(records.themes);
            const all = getCachedAllThemes();
            setThemesList(all);
            if (records.publishedThemeId) {
              setPublishedId(records.publishedThemeId);
              const pub = all.find((t: ThemeDefinition) => t.id === records.publishedThemeId);
              if (pub) {
                saveCachedPublishedTheme(pub);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Failed fetching remote admin app settings:', e);
      }
    };

    fetchRemoteSettings();

    const unsubscribe = pbService.subscribeAdminAppSettings((data: any) => {
      if (data && data.themes && Array.isArray(data.themes)) {
        saveCachedAllThemes(data.themes);
        const all = getCachedAllThemes();
        setThemesList(all);
        if (data.publishedThemeId) {
          setPublishedId(data.publishedThemeId);
          const pub = all.find((t: ThemeDefinition) => t.id === data.publishedThemeId);
          if (pub) {
            saveCachedPublishedTheme(pub);
          }
        }
      }
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-3">
        <Shield className="w-12 h-12 mx-auto text-rose-500 animate-pulse" />
        <h3 className="text-lg font-black">{isAr ? 'غير مصرح بالوصول' : 'Access Denied'}</h3>
        <p className="text-xs opacity-80">
          {isAr
            ? 'هذا القسم مخصص فقط لمدراء النظام (Administrators). ليس لديك الصلاحيات الكافية لتعديل ثيمات التطبيق العامة.'
            : 'This section is strictly restricted to application Administrators. You do not have permissions to modify global app themes.'}
        </p>
      </div>
    );
  }

  // Handlers for Theme Actions
  const handleSelectThemeForPreview = (theme: ThemeDefinition) => {
    previewTheme(theme);
    showStatus(isAr ? `جاري معاينة "${theme.name}" مؤقتاً` : `Previewing "${theme.name}" temporarily`);
  };

  const handleOpenThemeEditor = (theme: ThemeDefinition) => {
    const themeToEdit = JSON.parse(JSON.stringify(theme)) as ThemeDefinition;

    if (!themeToEdit.variants) {
      themeToEdit.variants = { light: {}, dark: {} };
    }
    themeToEdit.variants.light = deepMerge(
      JSON.parse(JSON.stringify(DEFAULT_LIGHT_TOKENS)),
      themeToEdit.variants.light || {}
    );
    themeToEdit.variants.dark = deepMerge(
      JSON.parse(JSON.stringify(DEFAULT_DARK_TOKENS)),
      themeToEdit.variants.dark || {}
    );
    themeToEdit.layout = deepMerge(
      JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SETTINGS)),
      themeToEdit.layout || {}
    );

    setActiveEditingTheme(themeToEdit);
    setIsEditorOpen(true);
    setHasUnsavedChanges(false);
    previewTheme(themeToEdit, editorPreviewMode);
  };

  // Back Button Behavior:
  // - Pressing Back exits Theme Editor and returns to Global Theme page.
  // - Clears cached session so reopening App Settings will NOT automatically force reopen the editor modal!
  const handleBackToGlobalThemes = () => {
    clearCachedThemeEditorSession();
    setIsEditorOpen(false);
    setActiveEditingTheme(null);
    resetPreview();
    setShowOverflowMenu(false);
    showStatus(isAr ? 'تم الخروج من محرر الثيم والعودة لقائمة الثيمات' : 'Exited theme editor to Global Themes page');
  };

  const handleCreateNewTheme = async () => {
    const newId = `theme-custom-${Date.now()}`;
    const newTheme: ThemeDefinition = {
      id: newId,
      name: isAr ? `ثيم مخصص جديد` : `New Custom Theme`,
      description: isAr ? 'ثيم مخصص جديد مع توكنات وألوان قابلة للتعديل' : 'New custom theme with editable tokens and properties',
      isSystem: false,
      isPublished: false,
      isDraft: true,
      authorId: currentUser?.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      overrides: {
        general: { accent: '#7BAE37' },
      },
      variants: {
        dark: JSON.parse(JSON.stringify(DEFAULT_DARK_TOKENS)),
        light: JSON.parse(JSON.stringify(DEFAULT_LIGHT_TOKENS)),
      },
      layout: JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SETTINGS)),
    };

    const updatedList = [newTheme, ...themesList];
    setThemesList(updatedList);
    saveCachedAllThemes(updatedList);

    const currentDrafts = getCachedDraftThemes();
    const updatedDrafts = [newTheme, ...currentDrafts.filter((d) => d.id !== newId)];
    saveCachedDraftThemes(updatedDrafts);

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      themes: updatedList,
      publishedThemeId: publishedId,
      publishedThemeIds: [publishedId],
      draftThemes: updatedDrafts,
      updatedAt: new Date().toISOString(),
      version: 1,
    }).catch((err) => console.warn('Failed saving created theme to PocketBase:', err));

    handleOpenThemeEditor(newTheme);
    showStatus(isAr ? 'تم إنشاء المسودة الجديدة وفتح المحرر' : 'Created new draft theme & opened editor');
  };

  const handleDuplicateTheme = async (theme: ThemeDefinition) => {
    const newId = `theme-copy-${Date.now()}`;
    const copyTheme: ThemeDefinition = {
      ...JSON.parse(JSON.stringify(theme)),
      id: newId,
      name: `${theme.name} (${isAr ? 'نسخة' : 'Copy'})`,
      isSystem: false,
      isPublished: false,
      isDraft: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedList = [copyTheme, ...themesList];
    setThemesList(updatedList);
    saveCachedAllThemes(updatedList);

    const currentDrafts = getCachedDraftThemes();
    const updatedDrafts = [copyTheme, ...currentDrafts.filter((d) => d.id !== newId)];
    saveCachedDraftThemes(updatedDrafts);

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      themes: updatedList,
      publishedThemeId: publishedId,
      publishedThemeIds: [publishedId],
      draftThemes: updatedDrafts,
      updatedAt: new Date().toISOString(),
      version: 1,
    }).catch((err) => console.warn('Failed saving duplicated theme to PocketBase:', err));

    showStatus(isAr ? 'تم نسخ الثيم بنجاح' : 'Duplicated theme successfully');
  };

  const handleToggleUnlist = async (themeId: string) => {
    const target = themesList.find((t) => t.id === themeId);
    if (!target) return;

    const nextUnlisted = !target.isUnlisted;
    const updatedList = themesList.map((t) => {
      if (t.id === themeId) {
        return { ...t, isUnlisted: nextUnlisted, updatedAt: new Date().toISOString() };
      }
      return t;
    });

    setThemesList(updatedList);
    saveCachedAllThemes(updatedList);

    const publishedIds = updatedList.filter((t) => t.isPublished).map((t) => t.id);

    await pbService.saveAdminAppSettings({
      themes: updatedList,
      publishedThemeIds: publishedIds,
      layoutSettings: {},
      themeVersion: 1,
      updatedAt: new Date().toISOString(),
    });

    showStatus(
      nextUnlisted
        ? (isAr ? `تم إخفاء الثيم "${target.name}"` : `Unlisted theme "${target.name}"`)
        : (isAr ? `تمت إعادة إظهار الثيم "${target.name}"` : `Relisted theme "${target.name}"`)
    );
  };

  const handleConfirmDelete = async () => {
    if (!themeToDelete) return;
    const target = themeToDelete;
    const themeId = target.id;

    if (themeId === publishedId) {
      alert(isAr ? 'لا يمكن حذف الثيم النشط المنشور حالياً' : 'Cannot delete active published theme');
      setThemeToDelete(null);
      return;
    }

    const filtered = themesList.filter((t) => t.id !== themeId);
    setThemesList(filtered);
    saveCachedAllThemes(filtered);

    const remainingDrafts = getCachedDraftThemes().filter((t) => t.id !== themeId);
    saveCachedDraftThemes(remainingDrafts);

    await deleteTheme(themeId);

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      themes: filtered,
      publishedThemeId: publishedId,
      publishedThemeIds: filtered.filter((t) => t.isPublished).map((t) => t.id),
      draftThemes: remainingDrafts,
      updatedAt: new Date().toISOString(),
      version: 1,
    }).catch((err) => console.warn('Failed saving deleted theme state to PocketBase:', err));

    if (activeEditingTheme?.id === themeId) {
      clearCachedThemeEditorSession();
      setIsEditorOpen(false);
      setActiveEditingTheme(null);
      resetPreview();
    }

    setThemeToDelete(null);
    showStatus(isAr ? `تم حذف الثيم "${target.name}" بنجاح` : `Successfully deleted theme "${target.name}"`);
  };

  const handleUpdateActiveToken = (category: TokenCategoryKey, key: string, value: string) => {
    if (!activeEditingTheme) return;
    const updated = JSON.parse(JSON.stringify(activeEditingTheme)) as ThemeDefinition;

    if (!updated.variants) updated.variants = { light: {}, dark: {} };
    if (!updated.variants.light) updated.variants.light = {};
    if (!updated.variants.dark) updated.variants.dark = {};

    if (syncBothModes) {
      if (!updated.variants.light[category]) updated.variants.light[category] = {};
      if (!updated.variants.dark[category]) updated.variants.dark[category] = {};
      (updated.variants.light[category] as any)[key] = value;
      (updated.variants.dark[category] as any)[key] = value;
    } else {
      if (!updated.variants[editorPreviewMode]) updated.variants[editorPreviewMode] = {};
      if (!updated.variants[editorPreviewMode][category]) updated.variants[editorPreviewMode][category] = {};
      (updated.variants[editorPreviewMode][category] as any)[key] = value;
    }

    updated.updatedAt = new Date().toISOString();

    setActiveEditingTheme(updated);
    setHasUnsavedChanges(true);
    previewTheme(updated, editorPreviewMode);
  };

  const handleUpdateActiveLayout = (category: LayoutCategoryKey | 'animations', key: string, value: any) => {
    if (!activeEditingTheme) return;
    const updated = JSON.parse(JSON.stringify(activeEditingTheme)) as ThemeDefinition;
    if (!updated.layout) updated.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SETTINGS));
    if (!(updated.layout as any)[category]) (updated.layout as any)[category] = {};
    (updated.layout as any)[category][key] = value;
    updated.updatedAt = new Date().toISOString();

    setActiveEditingTheme(updated);
    setHasUnsavedChanges(true);
    previewTheme(updated, editorPreviewMode);
  };

  const handleUpdateComponentAnimation = (compKey: AnimationComponentKey, field: string, value: any) => {
    if (!activeEditingTheme) return;
    const updated = JSON.parse(JSON.stringify(activeEditingTheme)) as ThemeDefinition;
    if (!updated.layout) updated.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SETTINGS));
    if (!updated.layout.animations) updated.layout.animations = JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SETTINGS.animations));
    if (!updated.layout.animations.components) updated.layout.animations.components = {};

    if (!updated.layout.animations.components[compKey]) {
      updated.layout.animations.components[compKey] = {
        preset: 'fade',
        duration: 250,
        delay: 0,
        easing: 'ease-in-out',
        direction: 'normal',
        speed: 1,
        enabled: true
      };
    }

    (updated.layout.animations.components[compKey] as any)[field] = value;
    updated.updatedAt = new Date().toISOString();

    setActiveEditingTheme(updated);
    setHasUnsavedChanges(true);
    previewTheme(updated, editorPreviewMode);
    setAnimationPlayKey(Date.now());
  };

  const handleSaveDraft = async () => {
    if (!activeEditingTheme) return;

    const updatedTheme = {
      ...activeEditingTheme,
      isDraft: true,
      updatedAt: new Date().toISOString(),
    };

    const updatedList = themesList.map((t) => (t.id === updatedTheme.id ? updatedTheme : t));
    if (!updatedList.some((t) => t.id === updatedTheme.id)) {
      updatedList.unshift(updatedTheme);
    }

    setThemesList(updatedList);
    saveCachedAllThemes(updatedList);

    const drafts = getCachedDraftThemes().filter((d) => d.id !== updatedTheme.id);
    drafts.unshift(updatedTheme);
    saveCachedDraftThemes(drafts);

    await pbService.saveAdminAppSettings({
      key: 'admin_settings',
      themes: updatedList,
      publishedThemeId: publishedId,
      publishedThemeIds: [publishedId],
      draftThemes: drafts,
      updatedAt: new Date().toISOString(),
      version: 1,
    }).catch((err) => console.warn('Failed saving draft theme to PocketBase:', err));

    setHasUnsavedChanges(false);
    showStatus(isAr ? 'تم حفظ المسودة بنجاح' : 'Draft saved successfully');
  };

  const handleFinalExecutePublish = async () => {
    if (!activeEditingTheme) return;

    const publishedTheme: ThemeDefinition = {
      ...activeEditingTheme,
      isPublished: true,
      isDraft: false,
      updatedAt: new Date().toISOString(),
    };

    const updatedList = themesList.map((t) => {
      if (t.id === publishedTheme.id) return publishedTheme;
      return { ...t, isPublished: false };
    });

    if (!updatedList.some((t) => t.id === publishedTheme.id)) {
      updatedList.unshift(publishedTheme);
    }

    setThemesList(updatedList);
    setPublishedId(publishedTheme.id);
    saveCachedAllThemes(updatedList);
    saveCachedPublishedTheme(publishedTheme);
    clearCachedThemeEditorSession();

    setHasUnsavedChanges(false);

    // Sync with PocketBase
    const payload = {
      key: 'admin_settings',
      themes: updatedList,
      publishedThemeId: publishedTheme.id,
      draftThemes: getCachedDraftThemes(),
      layoutSettings: publishedTheme.layout,
      themeTokens: publishedTheme.tokens,
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await pbService.saveAdminAppSettings(payload).catch((err) => {
      console.warn('PocketBase admin app settings save fallback:', err);
    });

    resetPreview();
    showStatus(isAr ? 'تم نشر الثيم لجميع المستخدمين بحدث مباشر!' : 'Published theme globally to all users!');
  };

  const handleRevertChanges = () => {
    if (!activeEditingTheme) return;
    const original = themesList.find((t) => t.id === activeEditingTheme.id);
    if (original) {
      setActiveEditingTheme(JSON.parse(JSON.stringify(original)));
      previewTheme(original, editorPreviewMode);
      setHasUnsavedChanges(false);
      showStatus(isAr ? 'تم إلغاء التغييرات واستعادة النسخة المحفوظة' : 'Reverted unsaved changes.');
    }
  };

  const handleExportThemeJSON = () => {
    if (!activeEditingTheme) return;
    const jsonStr = JSON.stringify(activeEditingTheme, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeEditingTheme.id || 'theme'}_config.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus(isAr ? 'تم تصدير ملف الثيم بنجاح' : 'Exported theme JSON successfully');
  };

  const handleResetToBuiltinDefaults = () => {
    if (!activeEditingTheme) return;
    const resetTheme: ThemeDefinition = {
      ...activeEditingTheme,
      variants: {
        dark: JSON.parse(JSON.stringify(DEFAULT_DARK_TOKENS)),
        light: JSON.parse(JSON.stringify(DEFAULT_LIGHT_TOKENS))
      },
      layout: JSON.parse(JSON.stringify(DEFAULT_LAYOUT_SETTINGS))
    };

    setActiveEditingTheme(resetTheme);
    previewTheme(resetTheme, editorPreviewMode);
    setHasUnsavedChanges(true);
    showStatus(isAr ? 'تم إعادة ضبط الثيم إلى القيم الافتراضية' : 'Reset theme tokens & layout to built-in defaults');
  };

  const handleResetLayoutSection = () => {
    if (!activeEditingTheme) return;
    const catName = layoutCatNames[activeLayoutCat]?.[lang === 'ar' ? 'ar' : 'en'] || activeLayoutCat;
    const confirmMsg = isAr
      ? `هل أنت أكتد من إعادة تعيين تخطيط قسم "${catName}" إلى الإعدادات الافتراضية؟`
      : `Are you sure you want to reset layout settings for "${catName}" to defaults?`;

    if (window.confirm(confirmMsg)) {
      const defaultCatLayout = DEFAULT_LAYOUT_SETTINGS[activeLayoutCat];
      if (defaultCatLayout) {
        const updatedLayout = {
          ...(activeEditingTheme.layout || DEFAULT_LAYOUT_SETTINGS),
          [activeLayoutCat]: JSON.parse(JSON.stringify(defaultCatLayout)),
        };
        const updatedTheme = {
          ...activeEditingTheme,
          layout: updatedLayout,
        };
        setActiveEditingTheme(updatedTheme);
        previewTheme(updatedTheme, editorPreviewMode);
        setHasUnsavedChanges(true);
        showStatus(isAr ? `تمت إعادة تعيين تخطيط ${catName} بنجاح` : `Reset ${catName} layout section to defaults`);
      }
    }
  };



  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(''), 3500);
  };

  const tokenCatNames: Record<TokenCategoryKey, { ar: string; en: string; icon: any }> = {
    general: { ar: 'الألوان العامة والتمييز', en: 'General & Accent', icon: Palette },
    backgrounds: { ar: 'الخلفيات والنوافذ', en: 'Backgrounds', icon: Layers },
    text: { ar: 'النصوص والعناوين', en: 'Text & Labels', icon: Type },
    buttons: { ar: 'الأزرار والتفاعلات', en: 'Buttons', icon: Box },
    inputs: { ar: 'حقول المدخلات', en: 'Inputs', icon: Edit3 },
    navigation: { ar: 'القنوات والقوائم', en: 'Navigation', icon: Sliders },
    messages: { ar: 'الرسائل والردود', en: 'Messages', icon: MessageSquare },
    members: { ar: 'الأعضاء والرتب', en: 'Members', icon: Users },
    media: { ar: 'الوسائط والمرفقات', en: 'Media Controls', icon: Video },
    borders: { ar: 'الحدود والظلال', en: 'Borders & Shadows', icon: Layout },
  };

  const layoutCatNames: Record<LayoutCategoryKey, { ar: string; en: string }> = {
    backgroundArt: { ar: 'الخلفيات والفن الجداري', en: 'Wallpapers & Art' },
    profileCards: { ar: 'بطاقات الملف الشخصي', en: 'Profile Cards' },
    chat: { ar: 'منطقة الدردشة', en: 'Chat Layout' },
    sidebar: { ar: 'الشريط الجانبي', en: 'Sidebar' },
    channels: { ar: 'قائمة القنوات', en: 'Channels Row' },
    serverList: { ar: 'قائمة السيرفرات', en: 'Server Icons' },
    titleBar: { ar: 'شريط العنوان العلوي', en: 'Title Bar' },
    typography: { ar: 'الخطوط والأحجام', en: 'Typography' },
  };

  // Filter themes for Vertical List with Category + Search
  const filteredThemes = themesList.filter((t) => {
    if (adminCategoryFilter !== 'all') {
      if (adminCategoryFilter === 'core') {
        if (t.category && t.category !== 'core' && t.category !== 'aesthetic') return false;
      } else if (t.category !== adminCategoryFilter) {
        return false;
      }
    }
    if (!librarySearch.trim()) return true;
    const q = librarySearch.toLowerCase();
    const matchName = t.name.toLowerCase().includes(q);
    const matchNameAr = (t.nameAr || '').toLowerCase().includes(q);
    const matchDesc = (t.description || '').toLowerCase().includes(q);
    const matchDescAr = (t.descriptionAr || '').toLowerCase().includes(q);
    const matchId = t.id.toLowerCase().includes(q);
    const matchTags = (t.tags || []).some((tag) => tag.toLowerCase().includes(q));
    return matchName || matchNameAr || matchDesc || matchDescAr || matchId || matchTags;
  });

  // Calculate current token values for active theme
  const currentTokens = activeEditingTheme
    ? resolveFinalThemeTokens(editorPreviewMode, activeEditingTheme)
    : DEFAULT_DARK_TOKENS;

  const currentLayout: LayoutSettings = deepMerge(
    DEFAULT_LAYOUT_SETTINGS,
    activeEditingTheme?.layout || {}
  );

  // Active Component Animation Configuration
  const currentCompAnim =
    currentLayout.animations?.components?.[activeAnimComp] || {
      preset: 'fade',
      duration: 250,
      delay: 0,
      easing: 'ease-in-out',
      direction: 'normal',
      speed: 1,
      enabled: true
    };

  return (
    <div className="space-y-5 text-[var(--theme-text-primary)] select-none pb-10">
      {/* Top Notification Toast */}
      {statusMessage && (
        <div className="p-3.5 rounded-2xl bg-accent/20 border border-accent/40 text-accent font-bold text-xs flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="p-5 rounded-3xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black flex items-center gap-2 text-[var(--theme-text-primary)]">
              <Sliders className="w-5 h-5 text-accent" />
              <span>{isAr ? 'إدارة ومحرر ثيمات التطبيق' : 'Global Theme & Design Workspace'}</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-accent/20 text-accent border border-accent/30">
              Admin Only
            </span>
          </div>
          <p className="text-xs text-[var(--theme-text-muted)]">
            {isAr
              ? 'تصفح ثيمات التطبيق، أو افتح مساحة العمل الشاملة لتخصيص التوكنات، الأحجام، التأثيرات والنصوص لحظياً.'
              : 'Browse application themes or launch the full-screen design workspace with instant live synchronization.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isPreviewing && (
            <button
              type="button"
              onClick={() => {
                resetPreview();
                showStatus(isAr ? 'تم إيقاف المعاينة واستعادة الثيم النشط' : 'Preview disabled. Restored active theme.');
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-2 border-0 shadow-lg cursor-pointer transition-all active:scale-95"
            >
              <EyeOff className="w-4 h-4" />
              <span>{isAr ? 'إيقاف المعاينة' : 'Disable Preview'}</span>
            </button>
          )}

          {getCachedThemeEditorSession() && (
            <button
              type="button"
              onClick={() => {
                const sess = getCachedThemeEditorSession();
                if (sess?.activeThemeDraft) handleOpenThemeEditor(sess.activeThemeDraft);
              }}
              className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-extrabold text-xs flex items-center gap-1.5 border border-amber-500/30 cursor-pointer transition-all"
            >
              <Zap className="w-4 h-4" />
              <span>{isAr ? 'استئناف المسودة' : 'Resume Saved Session'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCreateNewTheme}
            className="px-4 py-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-bg-primary)] font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer border-0 shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إنشاء ثيم جديد' : 'New Custom Theme'}</span>
          </button>
        </div>
      </div>

      {/* ================= REDESIGNED VERTICAL THEME LIST VIEW ================= */}
      <div className="space-y-3">
        {/* Category Tabs & Search Filter Bar */}
        <div className="space-y-2.5 p-3 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'all', label: isAr ? 'الكل' : 'All', icon: Layers },
              { id: 'anime', label: isAr ? 'أنمي (Anime)' : 'Anime', icon: Film },
              { id: 'games', label: isAr ? 'ألعاب (Games)' : 'Games', icon: Gamepad2 },
              { id: 'action', label: isAr ? 'أكشن وسينث' : 'Action & Neon', icon: Zap },
              { id: 'core', label: isAr ? 'أساسي وجمالي' : 'Core & Aesthetic', icon: Palette },
            ].map((cat) => {
              const IconComp = cat.icon;
              const isActive = adminCategoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setAdminCategoryFilter(cat.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border ${
                    isActive
                      ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] border-accent shadow-sm'
                      : 'bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder={isAr ? 'بحث عن ثيم (مثال: AOT, Zero Two, Valorant, Cyberpunk)...' : 'Search themes by name or ID (e.g. AOT, Valorant)...'}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-accent"
              />
            </div>
            <span className="text-xs font-mono font-bold text-[var(--theme-text-muted)] px-2 shrink-0">
              {filteredThemes.length} / {themesList.length} {isAr ? 'ثيم' : 'Themes'}
            </span>
          </div>
        </div>

        {/* Clean Discord / VS Code Style Vertical List */}
        <div className="space-y-2">
          {filteredThemes.map((themeItem) => {
            const isPublished = themeItem.id === publishedId;
            const isDraft = themeItem.isDraft;
            const isSystem = themeItem.isSystem;

            const accentColor =
              themeItem.variants?.dark?.general?.accent ||
              themeItem.variants?.light?.general?.accent ||
              themeItem.overrides?.general?.accent ||
              '#7BAE37';

            const displayName = isAr && themeItem.nameAr ? themeItem.nameAr : themeItem.name;
            const displayDesc = isAr && themeItem.descriptionAr ? themeItem.descriptionAr : themeItem.description;

            return (
              <div
                key={themeItem.id}
                className={`p-4 rounded-2xl bg-[var(--theme-bg-card)] border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden ${
                  isPublished
                    ? 'border-accent shadow-md shadow-accent/10 ring-1 ring-accent/30'
                    : 'border-[var(--theme-border)] hover:border-[var(--theme-text-muted)]'
                }`}
              >
                {themeItem.backgroundImage && (
                  <div
                    className="absolute inset-0 opacity-10 pointer-events-none bg-cover bg-center"
                    style={{ backgroundImage: `url(${themeItem.backgroundImage})` }}
                  />
                )}

                <div className="flex items-center gap-3.5 min-w-0 relative z-10">
                  <div
                    style={{ backgroundColor: accentColor }}
                    className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-black text-black shadow-md text-sm"
                  >
                    {themeItem.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-[var(--theme-text-primary)] truncate">{displayName}</h4>
                      {isPublished && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-accent text-black flex items-center gap-1 shadow-xs">
                          <Check className="w-3 h-3" />
                          <span>{isAr ? 'المنشور حالياً' : 'Active Published'}</span>
                        </span>
                      )}
                      {themeItem.backgroundImage && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>{isAr ? 'خلفية جدارية' : 'Wallpaper'}</span>
                        </span>
                      )}
                      {themeItem.category && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider bg-accent/15 text-accent">
                          {themeItem.category}
                        </span>
                      )}
                      {isDraft && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {isAr ? 'مسودة' : 'Draft'}
                        </span>
                      )}
                      {isSystem && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {isAr ? 'نظامي' : 'System'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--theme-text-muted)] truncate">{displayDesc || themeItem.id}</p>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleSelectThemeForPreview(themeItem)}
                    className="px-3 py-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-xs font-bold transition-all cursor-pointer border border-[var(--theme-border)]"
                  >
                    <Eye className="w-3.5 h-3.5 inline mr-1" />
                    <span>{isAr ? 'معاينة' : 'Preview'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenThemeEditor(themeItem)}
                    className="px-3.5 py-1.5 rounded-xl bg-accent text-[var(--theme-accent-contrast,#000000)] font-extrabold text-xs transition-all shadow-sm cursor-pointer hover:opacity-90 active:scale-95"
                  >
                    <Edit3 className="w-3.5 h-3.5 inline mr-1" />
                    <span>{isAr ? 'تعديل بالكامل' : 'Edit Theme'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDuplicateTheme(themeItem)}
                    className="p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-all cursor-pointer border border-[var(--theme-border)]"
                    title={isAr ? 'نسخ' : 'Duplicate'}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleUnlist(themeItem.id)}
                    className={`p-2 rounded-xl transition-all cursor-pointer border ${
                      themeItem.isUnlisted
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-secondary)] border-[var(--theme-border)]'
                    }`}
                    title={themeItem.isUnlisted ? (isAr ? 'إعادة إظهار' : 'Relist') : (isAr ? 'إخفاء' : 'Unlist')}
                  >
                    {themeItem.isUnlisted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  {!isPublished && !isSystem && (
                    <button
                      type="button"
                      onClick={() => setThemeToDelete(themeItem)}
                      className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 transition-all cursor-pointer border border-rose-500/30"
                      title={isAr ? 'حذف الثيم' : 'Delete Theme'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {themeToDelete && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#09090b] border border-rose-500/30 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 font-extrabold text-base">
              <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0" />
              <span>{isAr ? 'تأكيد حذف الثيم' : 'Confirm Delete Theme'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isAr
                ? `هل أنت متأكد من رغبتك بالحذف النهائياً للثيم "${themeToDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
                : `Are you sure you want to permanently delete theme "${themeToDelete.name}"? This action cannot be undone.`}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setThemeToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs transition-all cursor-pointer shadow-lg"
              >
                {isAr ? 'حذف نهائياً' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 3. REDESIGNED DEDICATED FULL-SCREEN THEME EDITOR WORKSPACE ================= */}
      {isEditorOpen && activeEditingTheme && (
        <div className="fixed inset-0 z-[99999] bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] flex flex-col font-sans select-none overflow-hidden">
          {/* ================= REDESIGNED CLEAN TOP BAR ================= */}
          <div className="h-14 px-4 bg-[var(--theme-bg-secondary)] border-b border-[var(--theme-border)] flex items-center justify-between gap-3 shrink-0 shadow-lg">
            {/* Left Group: Proper Back Button & Theme Name */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleBackToGlobalThemes}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border border-[var(--theme-border)] shadow-xs"
                title={isAr ? 'رجوع إلى قائمة الثيمات' : 'Back to Global Themes'}
              >
                <ArrowLeft className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                <span>{isAr ? 'رجوع' : 'Back'}</span>
              </button>

              <div className="h-5 w-px bg-[var(--theme-border)] hidden sm:block" />

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={activeEditingTheme.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setActiveEditingTheme((prev) => (prev ? { ...prev, name: val } : null));
                    setHasUnsavedChanges(true);
                  }}
                  className="text-xs sm:text-sm font-black bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] rounded-xl px-3 py-1.5 text-[var(--theme-text-primary)] focus:outline-none focus:border-accent w-36 sm:w-56"
                  placeholder="Theme Name..."
                />
                {hasUnsavedChanges && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-500 dark:text-amber-300 border border-amber-500/30">
                    {isAr ? 'غير محفوظ' : 'Unsaved'}
                  </span>
                )}
              </div>
            </div>

            {/* Middle Group: Clean Mode, Sync, & Device Pills */}
            <div className="hidden lg:flex items-center gap-3 bg-[var(--theme-bg-tertiary)] p-1 rounded-2xl border border-[var(--theme-border)]">
              {/* Dark / Light Mode Toggle */}
              <div className="flex items-center gap-1 bg-[var(--theme-bg-card)] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setEditorPreviewMode('dark');
                    applyThemeTokensAndLayout(activeEditingTheme, 'dark');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    editorPreviewMode === 'dark' ? 'bg-blue-600 text-white font-black shadow-xs' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorPreviewMode('light');
                    applyThemeTokensAndLayout(activeEditingTheme, 'light');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    editorPreviewMode === 'light' ? 'bg-amber-500 text-black font-black shadow-xs' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
              </div>

              {/* Sync Both Modes Toggle */}
              <button
                type="button"
                onClick={() => setSyncBothModes(!syncBothModes)}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all border ${
                  syncBothModes
                    ? 'bg-accent/20 border-accent text-accent'
                    : 'bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                }`}
                title={isAr ? 'تزامن التعديلات للوضعين' : 'Sync both light/dark modes'}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isAr ? 'تزامن الوضعين' : 'Sync Both'}</span>
              </button>

            </div>

            {/* Right Group: Action Buttons & Overflow Menu */}
            <div className="flex items-center gap-2 shrink-0 relative">
              {isPreviewing && (
                <button
                  type="button"
                  onClick={() => {
                    resetPreview();
                    showStatus(isAr ? 'تم إيقاف المعاينة' : 'Preview disabled');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إيقاف المعاينة' : 'Disable Preview'}</span>
                </button>
              )}

              {hasUnsavedChanges && (
                <button
                  type="button"
                  onClick={handleRevertChanges}
                  className="hidden sm:flex px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 font-bold text-xs border border-rose-500/30 cursor-pointer transition-all items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إلغاء' : 'Revert'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveDraft}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-300 font-extrabold text-xs border border-amber-500/30 cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isAr ? 'حفظ مسودة' : 'Save Draft'}</span>
              </button>

              <button
                type="button"
                onClick={handleFinalExecutePublish}
                className="px-4 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#000000)] font-black text-xs transition-all shadow-md shadow-accent/20 cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{isAr ? 'نشر للجميع' : 'Publish'}</span>
              </button>

              {/* Overflow Menu Dropdown Toggle */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowOverflowMenu(!showOverflowMenu)}
                  className="p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] transition-all cursor-pointer border border-[var(--theme-border)]"
                  title="More Options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showOverflowMenu && (
                  <div className="absolute right-0 top-11 w-52 p-2 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-2xl z-[100000] space-y-1 text-xs font-bold animate-in zoom-in-95">
                    <button
                      type="button"
                      onClick={() => {
                        setShowOverflowMenu(false);
                        handleExportThemeJSON();
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-[var(--theme-bg-tertiary)] flex items-center gap-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-left transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-accent" />
                      <span>{isAr ? 'تصدير كملف JSON' : 'Export JSON Config'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowOverflowMenu(false);
                        handleResetToBuiltinDefaults();
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-[var(--theme-bg-tertiary)] flex items-center gap-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-left transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 text-amber-500" />
                      <span>{isAr ? 'استعادة القيم الأصلية' : 'Reset to Built-in Defaults'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowOverflowMenu(false);
                        handleRevertChanges();
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-[var(--theme-bg-tertiary)] flex items-center gap-2 text-rose-500 text-left transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>{isAr ? 'التراجع عن التغييرات' : 'Revert All Changes'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Workspace Main 3-Panel Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* PANEL 1: LEFT NAVIGATION & CATEGORIES SIDEBAR */}
            <div className="w-60 bg-[var(--theme-bg-secondary)] border-r border-[var(--theme-border)] flex flex-col shrink-0 overflow-y-auto">
              {/* Filter Search */}
              <div className="p-3 border-b border-[var(--theme-border)]">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" />
                  <input
                    type="text"
                    value={tokenSearchQuery}
                    onChange={(e) => setTokenSearchQuery(e.target.value)}
                    placeholder={isAr ? 'تصفية العناصر...' : 'Filter items...'}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Sub-Tabs Selector */}
              <div className="p-2 space-y-1 border-b border-[var(--theme-border)]">
                <button
                  type="button"
                  onClick={() => setEditorTab('tokens')}
                  className={`w-full px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer ${
                    editorTab === 'tokens' ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] font-black shadow-xs' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    <span>{isAr ? 'توكنات الألوان' : 'Theme Tokens'}</span>
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setEditorTab('layout')}
                  className={`w-full px-3 py-2 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer ${
                    editorTab === 'layout' ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] font-black shadow-xs' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Layout className="w-4 h-4" />
                    <span>{isAr ? 'التنسيق والأبعاد' : 'Global Layout'}</span>
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 ${isAr ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Categories / Items Menu List */}
              <div className="p-2 space-y-1 overflow-y-auto flex-1">
                {editorTab === 'tokens' && (
                  <>
                    <div className="px-3 py-2 text-[10px] font-black uppercase text-[var(--theme-text-muted)] tracking-wider">
                      {isAr ? 'فئات توكنات الألوان' : 'Color Categories'}
                    </div>
                    {(Object.keys(tokenCatNames) as TokenCategoryKey[]).map((catKey) => {
                      const CatIcon = tokenCatNames[catKey].icon;
                      const isActive = activeTokenCat === catKey;
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => setActiveTokenCat(catKey)}
                          className={`w-full px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-2.5 transition-all cursor-pointer text-left ${
                            isActive
                              ? 'bg-[var(--theme-bg-tertiary)] text-accent font-extrabold border-l-2 border-accent'
                              : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                          }`}
                        >
                          <CatIcon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{tokenCatNames[catKey][lang]}</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {editorTab === 'layout' && (
                  <>
                    <div className="px-3 py-2 text-[10px] font-black uppercase text-[var(--theme-text-muted)] tracking-wider">
                      {isAr ? 'فئات التنسيق العام' : 'Layout Sections'}
                    </div>
                    {(Object.keys(layoutCatNames) as LayoutCategoryKey[]).map((catKey) => {
                      const isActive = activeLayoutCat === catKey;
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => setActiveLayoutCat(catKey)}
                          className={`w-full px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-2.5 transition-all cursor-pointer text-left ${
                            isActive
                              ? 'bg-[var(--theme-bg-tertiary)] text-accent font-extrabold border-l-2 border-accent'
                              : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                          }`}
                        >
                          <Layout className="w-4 h-4 shrink-0" />
                          <span className="truncate">{layoutCatNames[catKey][lang]}</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {/* PANEL 2: CENTER CONTROLS PANEL */}
            <div className="w-80 md:w-96 bg-[var(--theme-bg-secondary)] border-r border-[var(--theme-border)] p-5 overflow-y-auto shrink-0 space-y-5">
              {/* TOKENS EDITOR */}
              {editorTab === 'tokens' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black flex items-center gap-2 text-[var(--theme-text-primary)] border-b border-[var(--theme-border)] pb-3">
                    <Palette className="w-4 h-4 text-accent" />
                    <span>{tokenCatNames[activeTokenCat][lang]}</span>
                  </h3>

                  <div className="space-y-3">
                    {Object.entries(currentTokens[activeTokenCat] || {}).map(([key, val]) => {
                      if (tokenSearchQuery && !key.toLowerCase().includes(tokenSearchQuery.toLowerCase())) return null;
                      return (
                        <div key={key} className="p-3 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-[var(--theme-text-secondary)]">
                            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                            <span className="font-mono text-[10px] text-[var(--theme-text-muted)]">{String(val)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={String(val).startsWith('#') ? String(val) : '#7BAE37'}
                              onChange={(e) => handleUpdateActiveToken(activeTokenCat, key, e.target.value)}
                              className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                            />
                            <input
                              type="text"
                              value={String(val)}
                              onChange={(e) => handleUpdateActiveToken(activeTokenCat, key, e.target.value)}
                              className="flex-1 px-3 py-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs font-mono text-[var(--theme-text-primary)] focus:outline-none focus:border-accent"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LAYOUT & TYPOGRAPHY EDITOR */}
              {editorTab === 'layout' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-3">
                    <h3 className="text-sm font-black flex items-center gap-2 text-[var(--theme-text-primary)]">
                      <Layout className="w-4 h-4 text-accent" />
                      <span>{layoutCatNames[activeLayoutCat][lang]}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={handleResetLayoutSection}
                      className="px-3 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                      <span>{isAr ? 'إعادة تعيين الهيكل' : 'Reset Layout'}</span>
                    </button>
                  </div>

                  {activeLayoutCat === 'backgroundArt' ? (
                    <div className="space-y-4">
                      {/* Theme Category Selector */}
                      <div className="space-y-2 p-3.5 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                        <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center justify-between">
                          <span>{isAr ? 'تصنيف الثيم' : 'Theme Category'}</span>
                          <span className="text-[10px] uppercase font-bold text-accent px-1.5 py-0.5 rounded-md bg-accent/15">
                            {activeEditingTheme?.category || 'core'}
                          </span>
                        </label>
                        <select
                          value={activeEditingTheme?.category || 'core'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            setActiveEditingTheme((prev) => (prev ? { ...prev, category: val } : null));
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full p-2.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-accent cursor-pointer"
                        >
                          <option value="anime">{isAr ? 'أنمي (Anime)' : 'Anime'}</option>
                          <option value="games">{isAr ? 'ألعاب (Games)' : 'Games'}</option>
                          <option value="action">{isAr ? 'أكشن وسينث (Action & Neon)' : 'Action & Neon'}</option>
                          <option value="aesthetic">{isAr ? 'جمالي وهادئ (Aesthetic)' : 'Aesthetic'}</option>
                          <option value="core">{isAr ? 'أساسي (Core)' : 'Core'}</option>
                        </select>
                      </div>

                      {/* Bilingual Name & Description */}
                      <div className="space-y-3 p-3.5 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                        <label className="text-xs font-bold text-[var(--theme-text-secondary)]">
                          {isAr ? 'الاسم والوصف باللغة العربية' : 'Arabic Name & Description'}
                        </label>
                        <input
                          type="text"
                          value={activeEditingTheme?.nameAr || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setActiveEditingTheme((prev) => (prev ? { ...prev, nameAr: val } : null));
                            setHasUnsavedChanges(true);
                          }}
                          placeholder="الاسم بالعربية (مثال: هجوم العمالقة)..."
                          className="w-full p-2 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-accent"
                          dir="rtl"
                        />
                        <textarea
                          rows={2}
                          value={activeEditingTheme?.descriptionAr || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setActiveEditingTheme((prev) => (prev ? { ...prev, descriptionAr: val } : null));
                            setHasUnsavedChanges(true);
                          }}
                          placeholder="الوصف بالعربية..."
                          className="w-full p-2 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-accent"
                          dir="rtl"
                        />
                      </div>

                      {/* Background Wallpaper System */}
                      <div className="space-y-4">
                        {/* Status Message */}
                        {wallpaperActionMessage && (
                          <div className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-accent text-xs font-bold flex items-center gap-2 animate-fadeIn">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{wallpaperActionMessage}</span>
                          </div>
                        )}

                        {/* Dual Wallpaper Slot Selector & Active Toggle */}
                        {activeEditingTheme && (
                          <div className="p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-[var(--theme-text-primary)] flex items-center gap-2">
                                <ImageIcon className="w-4 h-4 text-accent" />
                                <span>{isAr ? 'إدارة صور الثيم (صورتين لكل ثيم)' : 'Dual Theme Wallpapers (2 Images per Theme)'}</span>
                              </label>
                              <span className="text-[10px] font-bold text-accent px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
                                {isAr ? `تعديل فتحة ${editorWallpaperSlot}` : `Editing Slot ${editorWallpaperSlot}`}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                              {/* Slot 1 Box */}
                              <div
                                onClick={() => setEditorWallpaperSlot(1)}
                                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative ${
                                  editorWallpaperSlot === 1
                                    ? 'border-accent bg-accent/10 ring-2 ring-accent shadow-md'
                                    : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:border-accent/40'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-[var(--theme-text-primary)] flex items-center gap-1.5">
                                    <span>{isAr ? 'الصورة 1' : 'Image 1'}</span>
                                    {(!activeEditingTheme.activeImageIndex || activeEditingTheme.activeImageIndex === 0) && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent text-[var(--theme-accent-contrast,#000000)] font-black">
                                        {isAr ? 'نشط' : 'Active'}
                                      </span>
                                    )}
                                  </span>
                                  {activeEditingTheme.backgroundImage && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updated: ThemeDefinition = {
                                          ...activeEditingTheme,
                                          backgroundImage: undefined,
                                        };
                                        setActiveEditingTheme(updated);
                                        setHasUnsavedChanges(true);
                                        previewTheme(updated, editorPreviewMode);
                                      }}
                                      className="p-1 rounded-md text-[var(--theme-text-muted)] hover:text-rose-400 hover:bg-rose-500/10"
                                      title={isAr ? 'حذف الصورة 1' : 'Remove Image 1'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div
                                  className="w-full h-16 rounded-lg bg-cover bg-center border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] flex items-center justify-center overflow-hidden relative"
                                  style={{
                                    backgroundImage: activeEditingTheme.backgroundImage ? `url(${activeEditingTheme.backgroundImage})` : 'none',
                                  }}
                                >
                                  {!activeEditingTheme.backgroundImage && (
                                    <span className="text-[10px] text-[var(--theme-text-muted)] font-bold">
                                      {isAr ? 'فارغ' : 'Empty'}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated: ThemeDefinition = {
                                      ...activeEditingTheme,
                                      activeImageIndex: 0,
                                    };
                                    setActiveEditingTheme(updated);
                                    setHasUnsavedChanges(true);
                                    previewTheme(updated, editorPreviewMode);
                                  }}
                                  className={`w-full py-1 rounded-lg text-[10px] font-bold transition-all ${
                                    (!activeEditingTheme.activeImageIndex || activeEditingTheme.activeImageIndex === 0)
                                      ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-xs'
                                      : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] border border-[var(--theme-border)]'
                                  }`}
                                >
                                  {(!activeEditingTheme.activeImageIndex || activeEditingTheme.activeImageIndex === 0)
                                    ? (isAr ? 'الخلفية المعروضة حالياً' : 'Currently Active')
                                    : (isAr ? 'تعيين كخلفية معروضة' : 'Set as Active')}
                                </button>
                              </div>

                              {/* Slot 2 Box */}
                              <div
                                onClick={() => setEditorWallpaperSlot(2)}
                                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative ${
                                  editorWallpaperSlot === 2
                                    ? 'border-accent bg-accent/10 ring-2 ring-accent shadow-md'
                                    : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:border-accent/40'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-[var(--theme-text-primary)] flex items-center gap-1.5">
                                    <span>{isAr ? 'الصورة 2' : 'Image 2'}</span>
                                    {activeEditingTheme.activeImageIndex === 1 && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent text-[var(--theme-accent-contrast,#000000)] font-black">
                                        {isAr ? 'نشط' : 'Active'}
                                      </span>
                                    )}
                                  </span>
                                  {activeEditingTheme.backgroundImage2 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updated: ThemeDefinition = {
                                          ...activeEditingTheme,
                                          backgroundImage2: undefined,
                                        };
                                        setActiveEditingTheme(updated);
                                        setHasUnsavedChanges(true);
                                        previewTheme(updated, editorPreviewMode);
                                      }}
                                      className="p-1 rounded-md text-[var(--theme-text-muted)] hover:text-rose-400 hover:bg-rose-500/10"
                                      title={isAr ? 'حذف الصورة 2' : 'Remove Image 2'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div
                                  className="w-full h-16 rounded-lg bg-cover bg-center border border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] flex items-center justify-center overflow-hidden relative"
                                  style={{
                                    backgroundImage: activeEditingTheme.backgroundImage2 ? `url(${activeEditingTheme.backgroundImage2})` : 'none',
                                  }}
                                >
                                  {!activeEditingTheme.backgroundImage2 && (
                                    <span className="text-[10px] text-[var(--theme-text-muted)] font-bold">
                                      {isAr ? 'فارغ' : 'Empty'}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const updated: ThemeDefinition = {
                                      ...activeEditingTheme,
                                      activeImageIndex: 1,
                                    };
                                    setActiveEditingTheme(updated);
                                    setHasUnsavedChanges(true);
                                    previewTheme(updated, editorPreviewMode);
                                  }}
                                  className={`w-full py-1 rounded-lg text-[10px] font-bold transition-all ${
                                    activeEditingTheme.activeImageIndex === 1
                                      ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-xs'
                                      : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] border border-[var(--theme-border)]'
                                  }`}
                                >
                                  {activeEditingTheme.activeImageIndex === 1
                                    ? (isAr ? 'الخلفية المعروضة حالياً' : 'Currently Active')
                                    : (isAr ? 'تعيين كخلفية معروضة' : 'Set as Active')}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Direct Local File Upload */}
                        <div className="p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-2">
                              <FolderPlus className="w-4 h-4 text-accent" />
                              <span>
                                {isAr
                                  ? `رفع خلفية من الجهاز (للصورة ${editorWallpaperSlot})`
                                  : `Upload Local Wallpaper (for Image ${editorWallpaperSlot})`}
                              </span>
                            </label>
                            <span className="text-[10px] text-[var(--theme-text-muted)] font-mono">PNG, JPG, WEBP, GIF</span>
                          </div>

                          <input
                            ref={wallpaperFileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (!file.type.startsWith('image/')) {
                                setWallpaperActionMessage(isAr ? 'يرجى اختيار ملف صورة صالح' : 'Please select a valid image file');
                                return;
                              }
                              try {
                                setIsUploadingWallpaper(true);
                                setWallpaperActionMessage(isAr ? 'جاري رفع الصورة إلى مرفقات السيرفر...' : 'Uploading image to server attachments...');
                                const preset = await uploadWallpaperFileToServer(file);
                                if (activeEditingTheme) {
                                  const updated: ThemeDefinition = {
                                    ...activeEditingTheme,
                                    backgroundImage: editorWallpaperSlot === 1 ? preset.url : activeEditingTheme.backgroundImage,
                                    backgroundImage2: editorWallpaperSlot === 2 ? preset.url : activeEditingTheme.backgroundImage2,
                                    activeImageIndex: editorWallpaperSlot === 1 ? 0 : 1,
                                    backgroundConfig: {
                                      ...activeEditingTheme.backgroundConfig,
                                      opacity: activeEditingTheme.backgroundConfig?.opacity || 0.25,
                                      blur: activeEditingTheme.backgroundConfig?.blur || 0,
                                      fit: activeEditingTheme.backgroundConfig?.fit || 'cover',
                                    },
                                  };
                                  setActiveEditingTheme(updated);
                                  setHasUnsavedChanges(true);
                                  previewTheme(updated, editorPreviewMode);
                                }
                                setWallpaperActionMessage(
                                  isAr
                                    ? `تم رفع الخلفية وتعيينها للصورة ${editorWallpaperSlot} وحفظها في المرفقات والنماذج بنجاح!`
                                    : `Wallpaper uploaded and set to Image ${editorWallpaperSlot} successfully!`
                                );
                                setTimeout(() => setWallpaperActionMessage(''), 4000);
                              } catch (err: any) {
                                console.error('Upload failed:', err);
                                setWallpaperActionMessage(isAr ? `فشل الرفع: ${err?.message || 'خطأ'}` : `Upload failed: ${err?.message || 'Error'}`);
                              } finally {
                                setIsUploadingWallpaper(false);
                                if (wallpaperFileInputRef.current) wallpaperFileInputRef.current.value = '';
                              }
                            }}
                            className="hidden"
                          />

                          <button
                            type="button"
                            disabled={isUploadingWallpaper}
                            onClick={() => wallpaperFileInputRef.current?.click()}
                            className="w-full py-3 px-4 rounded-xl border border-dashed border-accent/40 bg-accent/5 hover:bg-accent/15 hover:border-accent transition-all flex items-center justify-center gap-2.5 text-xs font-bold text-accent cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isUploadingWallpaper ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                                <span>{isAr ? 'جاري رفع الملف وحفظه بالمرفقات...' : 'Uploading & saving to attachments...'}</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
                                <span>
                                  {isAr
                                    ? `اختر صورة من جهازك لحفظها للصورة ${editorWallpaperSlot}`
                                    : `Choose Local Image for Slot ${editorWallpaperSlot}`}
                                </span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Custom Wallpaper URL with Server Ingestion */}
                        <div className="p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-1.5">
                              <LinkIcon className="w-3.5 h-3.5 text-accent" />
                              <span>
                                {isAr
                                  ? `لصق رابط صورة (للصورة ${editorWallpaperSlot})`
                                  : `Paste Image URL (for Image ${editorWallpaperSlot})`}
                              </span>
                            </label>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={
                                  customWallpaperUrlInput ||
                                  (editorWallpaperSlot === 1
                                    ? activeEditingTheme?.backgroundImage || ''
                                    : activeEditingTheme?.backgroundImage2 || '')
                                }
                                onChange={(e) => {
                                  const url = e.target.value;
                                  setCustomWallpaperUrlInput(url);
                                  if (activeEditingTheme) {
                                    const updated: ThemeDefinition = {
                                      ...activeEditingTheme,
                                      backgroundImage: editorWallpaperSlot === 1 ? url : activeEditingTheme.backgroundImage,
                                      backgroundImage2: editorWallpaperSlot === 2 ? url : activeEditingTheme.backgroundImage2,
                                    };
                                    setActiveEditingTheme(updated);
                                    setHasUnsavedChanges(true);
                                    previewTheme(updated, editorPreviewMode);
                                  }
                                }}
                                placeholder="https://images.unsplash.com/..."
                                className="w-full p-2.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-accent font-mono"
                              />
                              {(customWallpaperUrlInput ||
                                (editorWallpaperSlot === 1
                                  ? activeEditingTheme?.backgroundImage
                                  : activeEditingTheme?.backgroundImage2)) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomWallpaperUrlInput('');
                                    if (activeEditingTheme) {
                                      const updated: ThemeDefinition = {
                                        ...activeEditingTheme,
                                        backgroundImage: editorWallpaperSlot === 1 ? undefined : activeEditingTheme.backgroundImage,
                                        backgroundImage2: editorWallpaperSlot === 2 ? undefined : activeEditingTheme.backgroundImage2,
                                      };
                                      setActiveEditingTheme(updated);
                                      setHasUnsavedChanges(true);
                                      previewTheme(updated, editorPreviewMode);
                                    }
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--theme-text-muted)] hover:text-rose-400 hover:bg-rose-500/10"
                                  title={isAr ? 'مسح الرابط' : 'Clear URL'}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={
                                isSavingWallpaperUrl ||
                                (!customWallpaperUrlInput &&
                                  !(editorWallpaperSlot === 1
                                    ? activeEditingTheme?.backgroundImage
                                    : activeEditingTheme?.backgroundImage2))
                              }
                              onClick={async () => {
                                const url = (
                                  customWallpaperUrlInput ||
                                  (editorWallpaperSlot === 1
                                    ? activeEditingTheme?.backgroundImage || ''
                                    : activeEditingTheme?.backgroundImage2 || '')
                                ).trim();
                                if (!url) return;
                                try {
                                  setIsSavingWallpaperUrl(true);
                                  setWallpaperActionMessage(isAr ? 'جاري حفظ الصورة في مرفقات السيرفر...' : 'Saving image to server attachments...');
                                  const preset = await saveWallpaperUrlToServer(url);
                                  if (activeEditingTheme) {
                                    const updated: ThemeDefinition = {
                                      ...activeEditingTheme,
                                      backgroundImage: editorWallpaperSlot === 1 ? preset.url : activeEditingTheme.backgroundImage,
                                      backgroundImage2: editorWallpaperSlot === 2 ? preset.url : activeEditingTheme.backgroundImage2,
                                      activeImageIndex: editorWallpaperSlot === 1 ? 0 : 1,
                                      backgroundConfig: {
                                        ...activeEditingTheme.backgroundConfig,
                                        opacity: activeEditingTheme.backgroundConfig?.opacity || 0.25,
                                        blur: activeEditingTheme.backgroundConfig?.blur || 0,
                                        fit: activeEditingTheme.backgroundConfig?.fit || 'cover',
                                      },
                                    };
                                    setActiveEditingTheme(updated);
                                    setHasUnsavedChanges(true);
                                    previewTheme(updated, editorPreviewMode);
                                  }
                                  setWallpaperActionMessage(
                                    isAr
                                      ? `تم حفظ الرابط للصورة ${editorWallpaperSlot} في مرفقات السيرفر وقائمة النماذج بنجاح!`
                                      : `Saved to Slot ${editorWallpaperSlot} & presets!`
                                  );
                                  setTimeout(() => setWallpaperActionMessage(''), 4000);
                                } catch (err: any) {
                                  console.error('Save URL failed:', err);
                                  setWallpaperActionMessage(isAr ? `فشل الحفظ: ${err?.message || 'خطأ'}` : `Save failed: ${err?.message || 'Error'}`);
                                } finally {
                                  setIsSavingWallpaperUrl(false);
                                }
                              }}
                              className="px-3.5 py-2.5 rounded-xl bg-accent text-[var(--theme-accent-contrast,#000000)] hover:brightness-110 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
                            >
                              {isSavingWallpaperUrl ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                                </>
                              ) : (
                                <>
                                  <CloudUpload className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'حفظ بالمرفقات والنماذج' : 'Save to Attachments & Presets'}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* High-Res Wallpaper Presets & Attachments Gallery */}
                        <div className="space-y-3 p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-1.5">
                                <ImageIcon className="w-4 h-4 text-accent" />
                                <span>
                                  {isAr
                                    ? `مكتبة نماذج الخلفيات (اختر للصورة ${editorWallpaperSlot})`
                                    : `Wallpaper Presets Gallery (Select for Image ${editorWallpaperSlot})`}
                                </span>
                              </label>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[var(--theme-text-muted)] font-bold">
                                {[...customWallpapers, ...PRESET_WALLPAPERS].length} {isAr ? 'خلفية' : 'wallpapers'}
                              </span>
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {[
                                { id: 'all', labelEn: 'All', labelAr: 'الكل' },
                                { id: 'custom', labelEn: `Uploaded (${customWallpapers.length})`, labelAr: `المرفوعة والمخصصة (${customWallpapers.length})` },
                                { id: 'anime', labelEn: 'Anime', labelAr: 'أنمي' },
                                { id: 'games', labelEn: 'Games', labelAr: 'ألعاب' },
                                { id: 'action', labelEn: 'Action & Neon', labelAr: 'أكشن ونيون' },
                                { id: 'aesthetic', labelEn: 'Aesthetic', labelAr: 'جمالي' },
                              ].map((tab) => {
                                const isActive = wallpaperCatFilter === tab.id;
                                return (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setWallpaperCatFilter(tab.id as any)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                      isActive
                                        ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-xs'
                                        : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] border border-[var(--theme-border)]'
                                    }`}
                                  >
                                    {isAr ? tab.labelAr : tab.labelEn}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Wallpaper Search */}
                            <div className="relative pt-1">
                              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
                              <input
                                type="text"
                                value={wallpaperSearch}
                                onChange={(e) => setWallpaperSearch(e.target.value)}
                                placeholder={isAr ? 'ابحث عن خلفية بالاسم...' : 'Search wallpapers by name...'}
                                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-accent"
                              />
                            </div>
                          </div>

                          {/* Presets Grid */}
                          {(() => {
                            const allList = [...customWallpapers, ...PRESET_WALLPAPERS];
                            const filtered = allList.filter((wp) => {
                              if (wallpaperCatFilter !== 'all') {
                                if (wallpaperCatFilter === 'custom') {
                                  if (!wp.isCustom && wp.category !== 'custom') return false;
                                } else if (wp.category !== wallpaperCatFilter) {
                                  return false;
                                }
                              }
                              if (wallpaperSearch.trim()) {
                                const q = wallpaperSearch.toLowerCase();
                                const matchName = wp.name.toLowerCase().includes(q);
                                const matchNameAr = (wp.nameAr || '').toLowerCase().includes(q);
                                return matchName || matchNameAr;
                              }
                              return true;
                            });

                            if (filtered.length === 0) {
                              return (
                                <div className="py-8 text-center text-xs text-[var(--theme-text-muted)] bg-[var(--theme-bg-tertiary)] rounded-xl border border-[var(--theme-border)]">
                                  {isAr ? 'لا توجد خلفيات مطابقة للبحث' : 'No wallpapers found matching your filter'}
                                </div>
                              );
                            }

                            const currentSlotUrl = editorWallpaperSlot === 1
                              ? activeEditingTheme?.backgroundImage
                              : activeEditingTheme?.backgroundImage2;

                            return (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1 scrollbar-thin">
                                {filtered.map((wp) => {
                                  const isCurrent = currentSlotUrl === wp.url;
                                  return (
                                    <div
                                      key={wp.id}
                                      className={`p-2 rounded-xl border text-start flex flex-col gap-1.5 transition-all relative overflow-hidden group cursor-pointer ${
                                        isCurrent
                                          ? 'border-accent bg-accent/20 ring-2 ring-accent shadow-md'
                                          : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:border-accent/60'
                                      }`}
                                      onClick={() => {
                                        if (!activeEditingTheme) return;
                                        const updated: ThemeDefinition = {
                                          ...activeEditingTheme,
                                          backgroundImage: editorWallpaperSlot === 1 ? wp.url : activeEditingTheme.backgroundImage,
                                          backgroundImage2: editorWallpaperSlot === 2 ? wp.url : activeEditingTheme.backgroundImage2,
                                          activeImageIndex: editorWallpaperSlot === 1 ? 0 : 1,
                                          backgroundConfig: {
                                            ...activeEditingTheme.backgroundConfig,
                                            opacity: activeEditingTheme.backgroundConfig?.opacity || 0.25,
                                            blur: activeEditingTheme.backgroundConfig?.blur || 0,
                                            fit: activeEditingTheme.backgroundConfig?.fit || 'cover',
                                          },
                                        };
                                        setActiveEditingTheme(updated);
                                        setHasUnsavedChanges(true);
                                        previewTheme(updated, editorPreviewMode);
                                      }}
                                    >
                                      <div
                                        className="w-full h-16 rounded-lg bg-cover bg-center border border-white/10 relative overflow-hidden shadow-xs"
                                        style={{ backgroundImage: `url(${wp.url})` }}
                                      >
                                        {isCurrent && (
                                          <div className="absolute inset-0 bg-accent/25 flex items-center justify-center">
                                            <div className="p-1 rounded-full bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-md">
                                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                                            </div>
                                          </div>
                                        )}
                                        {wp.isCustom && (
                                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-accent text-[var(--theme-accent-contrast,#000000)] text-[9px] font-black tracking-wider uppercase shadow-xs">
                                            {isAr ? 'مرفق' : 'Custom'}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-between gap-1 w-full">
                                        <span className="text-[11px] font-bold text-[var(--theme-text-primary)] truncate">
                                          {isAr ? wp.nameAr : wp.name}
                                        </span>
                                        {wp.isCustom && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteCustomWallpaper(wp.id);
                                            }}
                                            className="p-1 rounded-md text-[var(--theme-text-muted)] hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title={isAr ? 'حذف من النماذج وقاعدة البيانات' : 'Delete from presets & database'}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Active Wallpaper Fine-Tuning Controls */}
                        {(activeEditingTheme?.backgroundImage || activeEditingTheme?.backgroundImage2) && (
                          <div className="space-y-3.5 p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                            <div className="flex items-center justify-between pb-2 border-b border-[var(--theme-border)]">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)] flex items-center gap-1.5">
                                <Sliders className="w-3.5 h-3.5 text-accent" />
                                <span>{isAr ? 'ضبط وتخصيص تفاصيل الخلفية' : 'Wallpaper Display Controls'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!activeEditingTheme) return;
                                  const updated = {
                                    ...activeEditingTheme,
                                    backgroundImage: undefined,
                                    backgroundImage2: undefined,
                                  };
                                  setActiveEditingTheme(updated);
                                  setHasUnsavedChanges(true);
                                  previewTheme(updated, editorPreviewMode);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                                <span>{isAr ? 'إزالة الخلفيات' : 'Remove Wallpapers'}</span>
                              </button>
                            </div>

                            {/* Wallpaper Opacity Slider */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold text-[var(--theme-text-secondary)]">
                                <span>{isAr ? 'شفافية الخلفية (Opacity)' : 'Wallpaper Opacity'}</span>
                                <span className="font-mono text-accent">
                                  {Math.round((activeEditingTheme.backgroundConfig?.opacity ?? 0.25) * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.05"
                                max="0.85"
                                step="0.01"
                                value={activeEditingTheme.backgroundConfig?.opacity ?? 0.25}
                                onChange={(e) => {
                                  const opacity = parseFloat(e.target.value);
                                  if (!activeEditingTheme) return;
                                  const updated = {
                                    ...activeEditingTheme,
                                    backgroundConfig: {
                                      ...activeEditingTheme.backgroundConfig,
                                      opacity,
                                    },
                                  };
                                  setActiveEditingTheme(updated);
                                  setHasUnsavedChanges(true);
                                  previewTheme(updated, editorPreviewMode);
                                }}
                                className="w-full accent-accent cursor-pointer"
                              />
                            </div>

                            {/* Wallpaper Blur Slider */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold text-[var(--theme-text-secondary)]">
                                <span>{isAr ? 'ضبابية الخلفية (Blur)' : 'Wallpaper Blur'}</span>
                                <span className="font-mono text-accent">
                                  {activeEditingTheme.backgroundConfig?.blur ?? 0}px
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="20"
                                step="1"
                                value={activeEditingTheme.backgroundConfig?.blur ?? 0}
                                onChange={(e) => {
                                  const blur = parseInt(e.target.value, 10);
                                  if (!activeEditingTheme) return;
                                  const updated = {
                                    ...activeEditingTheme,
                                    backgroundConfig: {
                                      ...activeEditingTheme.backgroundConfig,
                                      blur,
                                    },
                                  };
                                  setActiveEditingTheme(updated);
                                  setHasUnsavedChanges(true);
                                  previewTheme(updated, editorPreviewMode);
                                }}
                                className="w-full accent-accent cursor-pointer"
                              />
                            </div>

                            {/* Wallpaper Fit Mode */}
                            <div className="space-y-1.5 pt-1">
                              <label className="text-xs font-bold text-[var(--theme-text-secondary)] block">
                                {isAr ? 'نمط احتواء الصورة (Fit Mode)' : 'Background Fit Mode'}
                              </label>
                              <div className="grid grid-cols-3 gap-2">
                                {[
                                  { id: 'cover', labelEn: 'Cover (Fill)', labelAr: 'تغطية كاملة' },
                                  { id: 'contain', labelEn: 'Contain', labelAr: 'احتواء كامل' },
                                  { id: 'fill', labelEn: 'Stretch', labelAr: 'تمدد' },
                                ].map((fitOption) => {
                                  const isSelected = (activeEditingTheme.backgroundConfig?.fit || 'cover') === fitOption.id;
                                  return (
                                    <button
                                      key={fitOption.id}
                                      type="button"
                                      onClick={() => {
                                        if (!activeEditingTheme) return;
                                        const updated = {
                                          ...activeEditingTheme,
                                          backgroundConfig: {
                                            ...activeEditingTheme.backgroundConfig,
                                            fit: fitOption.id as any,
                                          },
                                        };
                                        setActiveEditingTheme(updated);
                                        setHasUnsavedChanges(true);
                                        previewTheme(updated, editorPreviewMode);
                                      }}
                                      className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                        isSelected
                                          ? 'border-accent bg-accent/20 text-accent ring-1 ring-accent'
                                          : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                                      }`}
                                    >
                                      {isAr ? fitOption.labelAr : fitOption.labelEn}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : activeLayoutCat === 'typography' ? (
                    <div className="space-y-4">
                      {/* Font Selector */}
                      <div className="space-y-2 p-3 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                        <label className="text-xs font-bold text-[var(--theme-text-secondary)]">{isAr ? 'نوع الخط الرئيسي' : 'Primary Font Family'}</label>
                        <select
                          value={currentLayout.typography.fontFamily}
                          onChange={(e) => handleUpdateActiveLayout('typography', 'fontFamily', e.target.value)}
                          className="w-full p-2.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-accent cursor-pointer"
                        >
                          {AVAILABLE_FONTS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {isAr ? f.nameAr : f.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Font Scale */}
                      <div className="space-y-2 p-3 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)]">
                        <div className="flex justify-between text-xs font-bold text-[var(--theme-text-secondary)]">
                          <span>{isAr ? 'حجم الخط المرجعي' : 'Base Font Size'}</span>
                          <span className="font-mono text-accent">{currentLayout.typography.baseFontSize}px</span>
                        </div>
                        <input
                          type="range"
                          min="11"
                          max="18"
                          value={currentLayout.typography.baseFontSize}
                          onChange={(e) => handleUpdateActiveLayout('typography', 'baseFontSize', Number(e.target.value))}
                          className="w-full accent-accent cursor-pointer"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeLayoutCat === 'profileCards' && (
                        <p className="text-[11px] font-medium text-[var(--theme-text-muted)] bg-[var(--theme-bg-tertiary)] p-2.5 rounded-xl border border-[var(--theme-border)]">
                          {isAr
                            ? 'ملاحظة: خيار حجم بطاقة الملف الشخصي (Profile Card Scale) موجود الآن في قسم منفصل داخل إعدادات المظهر (Appearance).'
                            : 'Note: Profile Card Scale option is now in a separate independent section in Appearance settings.'}
                        </p>
                      )}
                      {Object.entries(currentLayout[activeLayoutCat] || {}).map(([key, val]) => {
                        if (key === 'scale') return null;
                        if (typeof val === 'number') {
                          const minVal = 2;
                          const maxVal = 600;
                          const displayVal = `${val}px`;
                          const labelText = key.replace(/([A-Z])/g, ' $1');

                          return (
                            <div key={key} className="p-3 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-[var(--theme-text-secondary)] capitalize">
                                <span>{labelText}</span>
                                <span className="font-mono text-accent">{displayVal}</span>
                              </div>
                              <input
                                type="range"
                                min={minVal}
                                max={maxVal}
                                step={1}
                                value={val}
                                onChange={(e) => handleUpdateActiveLayout(activeLayoutCat, key, Number(e.target.value))}
                                className="w-full accent-accent cursor-pointer"
                              />
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* COMPONENT-SPECIFIC ANIMATION EDITOR */}
              {editorTab === 'animations' && (
                <div className="space-y-5">
                  <div className="border-b border-[var(--theme-border)] pb-3 space-y-1">
                    <h3 className="text-sm font-black flex items-center gap-2 text-[var(--theme-text-primary)]">
                      <Sparkles className="w-4 h-4 text-accent" />
                      <span>{isAr ? ANIMATION_COMPONENTS.find(c => c.key === activeAnimComp)?.nameAr : ANIMATION_COMPONENTS.find(c => c.key === activeAnimComp)?.nameEn}</span>
                    </h3>
                    <p className="text-[11px] text-[var(--theme-text-muted)] leading-tight">
                      {isAr ? ANIMATION_COMPONENTS.find(c => c.key === activeAnimComp)?.descAr : ANIMATION_COMPONENTS.find(c => c.key === activeAnimComp)?.descEn}
                    </p>
                  </div>

                  {/* Test & Replay Animation Control Box */}
                  <div className="p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-accent/30 space-y-3 flex flex-col items-center justify-center text-center shadow-lg">
                    <span className="text-[10px] font-extrabold text-accent uppercase tracking-wider">
                      {isAr ? 'اختبار تجربة الحركة الفورية' : 'Live Motion Preview Test'}
                    </span>

                    <button
                      type="button"
                      onClick={() => setAnimationPlayKey(Date.now())}
                      className="w-full py-2.5 rounded-xl bg-accent text-[var(--theme-accent-contrast,#000000)] font-extrabold text-xs flex items-center justify-center gap-2 shadow-md hover:opacity-90 active:scale-95 cursor-pointer transition-all"
                    >
                      <Play className="w-4 h-4" />
                      <span>{isAr ? 'إعادة تشغيل الحركة الآن' : 'Trigger & Replay Animation'}</span>
                    </button>
                  </div>

                  {/* Preset Dropdown */}
                  <div className="p-3.5 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2">
                    <label className="text-xs font-bold text-[var(--theme-text-secondary)]">{isAr ? 'نوع الحركة (Preset)' : 'Animation Type / Preset'}</label>
                    <select
                      value={currentCompAnim.preset || 'fade'}
                      onChange={(e) => handleUpdateComponentAnimation(activeAnimComp, 'preset', e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-accent cursor-pointer"
                    >
                      {ANIMATION_PRESETS.map((anim) => (
                        <option key={anim.id} value={anim.id}>
                          {isAr ? anim.nameAr : anim.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Duration Slider */}
                  <div className="p-3 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2">
                    <div className="flex justify-between text-xs font-bold text-[var(--theme-text-secondary)]">
                      <span>{isAr ? 'مدة الحركة (Duration)' : 'Duration'}</span>
                      <span className="font-mono text-accent">{currentCompAnim.duration || 250}ms</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="1500"
                      step="25"
                      value={currentCompAnim.duration || 250}
                      onChange={(e) => handleUpdateComponentAnimation(activeAnimComp, 'duration', Number(e.target.value))}
                      className="w-full accent-accent cursor-pointer"
                    />
                  </div>

                  {/* Delay Slider */}
                  <div className="p-3 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2">
                    <div className="flex justify-between text-xs font-bold text-[var(--theme-text-secondary)]">
                      <span>{isAr ? 'تأخير الظهور (Delay)' : 'Delay'}</span>
                      <span className="font-mono text-accent">{currentCompAnim.delay || 0}ms</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="25"
                      value={currentCompAnim.delay || 0}
                      onChange={(e) => handleUpdateComponentAnimation(activeAnimComp, 'delay', Number(e.target.value))}
                      className="w-full accent-accent cursor-pointer"
                    />
                  </div>

                  {/* Easing Dropdown */}
                  <div className="p-3.5 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-2">
                    <label className="text-xs font-bold text-[var(--theme-text-secondary)]">{isAr ? 'منحنى الحركة (Easing)' : 'Easing Function'}</label>
                    <select
                      value={currentCompAnim.easing || 'ease-in-out'}
                      onChange={(e) => handleUpdateComponentAnimation(activeAnimComp, 'easing', e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="ease-in-out">ease-in-out (Smooth Start & End)</option>
                      <option value="ease-out">ease-out (Fast Start, Soft Landing)</option>
                      <option value="ease-in">ease-in (Accelerating)</option>
                      <option value="linear">linear (Uniform Speed)</option>
                      <option value="cubic-bezier(0.34, 1.56, 0.64, 1)">spring-bounce (Elastic Spring)</option>
                    </select>
                  </div>
                </div>
              )}


            </div>

            {/* PANEL 3: RIGHT AUTOMATIC LIVE INTERACTIVE APPLICATION PREVIEW PANEL */}
            <div className="flex-1 bg-[var(--theme-bg-primary)] p-6 flex flex-col items-center justify-start overflow-y-auto">
              {/* Dynamic Device Frame Container */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '1000px',
                  fontFamily: currentLayout.typography.fontFamily || 'inherit'
                }}
                className="transition-all duration-300 rounded-3xl overflow-hidden border border-white/20 shadow-2xl bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] w-full"
              >
                {/* Simulated App Title Bar */}
                <div className="h-10 px-4 bg-[var(--theme-bg-secondary)] border-b border-[var(--theme-border)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    <span className="text-xs font-bold text-[var(--theme-text-muted)] ml-2">SirverData Live Automatic Preview</span>
                  </div>
                  <span className="text-[10px] font-mono text-accent">Realtime Tokens Synchronized</span>
                </div>

                {/* AUTOMATIC LIVE PREVIEW CONTENT SWITCHER */}
                <div className="p-6 min-h-[460px] flex flex-col justify-center">
                  {/* REALISTIC APPLICATION SAMPLE PREVIEW (FOR GENERAL / BUTTONS / CARDS / INPUTS) */}
                  {previewView === 'general' && (
                    <div className="space-y-6">
                      {/* Realistic App Header Card */}
                      <div className="p-5 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-md space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-black text-[var(--theme-text-primary)]">
                            Sirver Workspace Sample Component
                          </h3>
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--theme-accent)] text-black">
                            Active Accent
                          </span>
                        </div>
                        <p className="text-xs text-[var(--theme-text-secondary)]">
                          This live preview reflects your custom theme tokens, typography, borders, and margins in real time.
                        </p>
                      </div>

                      {/* Interactive Buttons Group */}
                      <div className="p-4 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] space-y-3">
                        <span className="text-xs font-extrabold text-[var(--theme-text-muted)] uppercase tracking-wider block">
                          Interactive Button States
                        </span>
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            className="px-4 py-2 rounded-xl bg-[var(--theme-btn-normal)] text-black font-extrabold text-xs shadow-md hover:bg-[var(--theme-btn-hover)] active:bg-[var(--theme-btn-pressed)] transition-all cursor-pointer"
                          >
                            Primary Accent Button
                          </button>

                          <button
                            type="button"
                            className="px-4 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] font-bold text-xs hover:border-[var(--theme-accent)] transition-all cursor-pointer"
                          >
                            Secondary Border Button
                          </button>

                          <button
                            type="button"
                            className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/30 cursor-pointer"
                          >
                            Danger Action
                          </button>
                        </div>
                      </div>

                      {/* Form Inputs & Select Preview */}
                      <div className="p-4 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] space-y-3">
                        <span className="text-xs font-extrabold text-[var(--theme-text-muted)] uppercase tracking-wider block">
                          Form Inputs & Focus States
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="text"
                            placeholder="Type something here..."
                            defaultValue="Editable text input value"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-input-focus)]"
                          />
                          <select className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--theme-input-bg)] border border-[var(--theme-input-border)] text-xs font-bold text-[var(--theme-text-primary)] focus:outline-none focus:border-[var(--theme-input-focus)]">
                            <option>Selected Option Dropdown</option>
                            <option>Option 2</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CHAT PREVIEW */}
                  {previewView === 'chat' && (
                    <div className="space-y-4">
                      {/* Received Message Bubble */}
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] flex items-center justify-center font-black text-xs text-[var(--theme-text-primary)]">
                          SR
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-[var(--theme-text-primary)]">Sirver Support</span>
                            <span className="text-[10px] text-[var(--theme-text-muted)]">12:45 PM</span>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-[var(--theme-msg-other)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] max-w-md shadow-xs">
                            Hello! Welcome to SirverData Chat. This live preview reflects your current theme tokens automatically!
                          </div>
                        </div>
                      </div>

                      {/* Sent Message Bubble */}
                      <div className="flex items-start gap-3 flex-row-reverse">
                        <div className="w-9 h-9 rounded-2xl bg-[var(--theme-accent)] text-black font-black text-xs flex items-center justify-center">
                          ME
                        </div>
                        <div className="space-y-1 items-end flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-[var(--theme-text-muted)]">12:46 PM</span>
                            <span className="text-xs font-extrabold text-[var(--theme-text-primary)]">You</span>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-[var(--theme-msg-own)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] max-w-md shadow-md">
                            Looks awesome! The message bubble colors, margins, and radii update seamlessly.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SERVER LIST PREVIEW */}
                  {previewView === 'serverList' && (
                    <div className="flex items-center justify-center gap-4 p-8 bg-[var(--theme-bg-secondary)] rounded-3xl border border-[var(--theme-border)]">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--theme-accent)] text-black font-black flex items-center justify-center shadow-lg cursor-pointer">
                        SD
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] font-black flex items-center justify-center cursor-pointer hover:border-[var(--theme-accent)]">
                        DEV
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] font-black flex items-center justify-center cursor-pointer hover:border-[var(--theme-accent)]">
                        HQ
                      </div>
                      <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-[var(--theme-border)] text-[var(--theme-accent)] font-black flex items-center justify-center cursor-pointer">
                        <Plus className="w-5 h-5" />
                      </div>
                    </div>
                  )}

                  {/* CHANNEL LIST PREVIEW */}
                  {previewView === 'channelList' && (
                    <div className="w-full max-w-sm mx-auto p-4 rounded-3xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)] px-2">
                        {isAr ? 'القنوات النصية' : 'Text Channels'}
                      </div>
                      <div className="p-2.5 rounded-xl bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] font-black text-xs flex items-center justify-between border border-[var(--theme-accent)]/40">
                        <span className="flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          <span>general-chat</span>
                        </span>
                        <span className="w-2 h-2 rounded-full bg-[var(--theme-accent)]" />
                      </div>
                      <div className="p-2.5 rounded-xl text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] font-bold text-xs flex items-center gap-2 cursor-pointer">
                        <Hash className="w-4 h-4 text-[var(--theme-text-muted)]" />
                        <span>announcements</span>
                      </div>
                    </div>
                  )}

                  {/* MEMBER LIST PREVIEW */}
                  {previewView === 'memberList' && (
                    <div className="w-full max-w-sm mx-auto p-4 rounded-3xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] space-y-3">
                      <div className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)] px-1">
                        {isAr ? 'الأعضاء المتصلون — 3' : 'Online Members — 3'}
                      </div>
                      <div className="flex items-center gap-3 p-2 rounded-2xl hover:bg-[var(--theme-bg-tertiary)] cursor-pointer">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-xl bg-[var(--theme-accent)] text-black font-black text-xs flex items-center justify-center">
                            AD
                          </div>
                          <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-black absolute -bottom-0.5 -right-0.5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-extrabold text-[var(--theme-text-primary)]">Admin Boss</span>
                          <span className="text-[10px] text-[var(--theme-accent)] font-bold">Owner</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* USER PROFILE PREVIEW */}
                  {previewView === 'profile' && (
                    <div className="w-full flex justify-center py-4 overflow-x-auto">
                      <div
                        style={{
                          width: `${currentLayout.profileCards?.width || 380}px`,
                          maxWidth: '100%',
                          minHeight: `${currentLayout.profileCards?.height || 'auto'}px`,
                          borderRadius: `${currentLayout.profileCards?.cornerRadius || 24}px`,
                          padding: `${(currentLayout.profileCards as any)?.padding || 16}px`,
                          boxShadow: (currentLayout.profileCards as any)?.shadow || '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                          border: (currentLayout.profileCards as any)?.border || '1px solid rgba(255, 255, 255, 0.15)',
                          backgroundColor: currentTokens.backgrounds?.card || 'var(--theme-bg-card)',
                          backgroundImage: (currentTokens as any)?.cardGradient,
                          color: currentTokens.text?.primary || 'var(--theme-text-primary)',
                          transform: `scale(${(currentLayout.profileCards?.scale ?? 100) / 100})`,
                          transformOrigin: 'top center',
                        }}
                        className="relative text-start flex flex-col gap-3 overflow-hidden transition-all duration-200"
                        dir={isAr ? 'rtl' : 'ltr'}
                      >
                        {/* Banner */}
                        <div 
                          className="h-24 -mx-4 -mt-4 relative bg-cover bg-center flex items-start justify-end p-2.5 overflow-hidden"
                          style={{
                            borderRadius: `${Math.max(0, (currentLayout.profileCards?.cornerRadius || 24) - 4)}px ${Math.max(0, (currentLayout.profileCards?.cornerRadius || 24) - 4)}px 0 0`,
                            background: (currentTokens as any)?.cardGradient || `linear-gradient(135deg, ${currentTokens.general?.accent || '#7BAE37'} 0%, #10B981 100%)`,
                          }}
                        >
                          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-full text-[10px] font-extrabold text-white border border-white/20">
                            <Shield className="w-3 h-3 text-[var(--theme-accent,#7BAE37)]" />
                            <span>{isAr ? 'حساب موثق' : 'Verified Owner'}</span>
                          </div>
                        </div>

                        {/* Avatar & Status Row */}
                        <div className="flex items-end justify-between -mt-10 relative z-10 px-1">
                          <div className="relative">
                            <div 
                              style={{
                                width: `${currentLayout.profileCards?.avatarSize || 64}px`,
                                height: `${currentLayout.profileCards?.avatarSize || 64}px`,
                                borderRadius: `${Math.max(12, (currentLayout.profileCards?.cornerRadius || 24) - 8)}px`,
                              }}
                              className="bg-[var(--theme-accent,#7BAE37)] text-black font-black text-xl flex items-center justify-center border-4 border-[var(--theme-bg-card)] shadow-xl overflow-hidden"
                            >
                              AV
                            </div>
                            <span 
                              className="w-4 h-4 rounded-full border-2 border-[var(--theme-bg-card)] absolute bottom-0 end-0 shadow-md"
                              style={{ backgroundColor: currentTokens.members?.presenceOnline || '#22C55E' }}
                              title="Online"
                            />
                          </div>

                          {/* Badges Row */}
                          <div className="flex items-center gap-1.5 pb-1">
                            <span className="px-2 py-0.5 rounded-lg bg-[var(--theme-bg-tertiary)] text-[10px] font-black border border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                              PRO
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-[var(--theme-accent)]/20 text-[var(--theme-accent)] text-[10px] font-black border border-[var(--theme-accent)]/30">
                              ADMIN
                            </span>
                          </div>
                        </div>

                        {/* Identity & About */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-base font-black text-[var(--theme-text-primary)] leading-tight">Alexander Vance</h4>
                            <span className="text-[10px] font-bold text-[var(--theme-text-muted)]">#0001</span>
                          </div>
                          <p className="text-xs font-semibold text-[var(--theme-text-secondary)]">@alex_vance</p>
                          <p className="text-xs text-[var(--theme-text-muted)] pt-1 leading-relaxed border-t border-[var(--theme-border)] mt-2">
                            {isAr
                              ? 'مطور واجهات ومصمم نظم تفاعلية. مهتم بتخصيص الثيمات والمحاكاة الفورية.'
                              : 'UI Architect & Interactive Systems Designer. Crafting real-time themed experiences.'}
                          </p>
                        </div>

                        {/* Roles Chips */}
                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--theme-text-muted)]">
                            {isAr ? 'الرتب والمسؤوليات' : 'Roles & Badges'}
                          </span>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {['Core Developer', 'Theme Designer', 'Server Admin'].map((role, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-[10px] font-bold text-[var(--theme-text-primary)]"
                              >
                                • {role}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t border-[var(--theme-border)] mt-1">
                          <button
                            type="button"
                            className="flex-1 py-2.5 rounded-xl bg-[var(--theme-accent)] text-black font-black text-xs shadow-md border-0 cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{isAr ? 'إرسال رسالة' : 'Send Message'}</span>
                          </button>
                          <button
                            type="button"
                            className="p-2.5 rounded-xl bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border border-[var(--theme-border)] hover:bg-[var(--theme-bg-tertiary)] cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* COMPOSER PREVIEW */}
                  {previewView === 'composer' && (
                    <div className="w-full max-w-md mx-auto p-3 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] flex items-center gap-2 shadow-lg">
                      <button type="button" className="p-2 rounded-xl text-[var(--theme-text-muted)] hover:text-[var(--theme-accent)]">
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <input
                        type="text"
                        placeholder={isAr ? 'اكتب رسالة هنا...' : 'Type a message here...'}
                        className="flex-1 bg-transparent text-xs text-[var(--theme-text-primary)] focus:outline-none placeholder-[var(--theme-text-muted)]"
                      />
                      <button type="button" className="p-2.5 rounded-xl bg-[var(--theme-accent)] text-black font-black cursor-pointer">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* MEDIA PREVIEW */}
                  {previewView === 'media' && (
                    <div className="w-full max-w-md mx-auto p-4 rounded-3xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-3">
                      <span className="text-xs font-black text-[var(--theme-text-primary)] block">Attachment Card Sample</span>
                      <div className="p-4 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] flex items-center gap-3">
                        <Video className="w-8 h-8 text-[var(--theme-accent)]" />
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-[var(--theme-text-primary)] truncate">recorded_demo_video.mp4</h5>
                          <p className="text-[10px] text-[var(--theme-text-muted)]">14.2 MB • HD Video</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* COMPONENT ANIMATION LIVE PREVIEW */}
                  {previewView === 'animation' && (
                    <div className="w-full max-w-md mx-auto p-6 rounded-3xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] flex flex-col items-center justify-center space-y-4">
                      <span className="text-xs font-extrabold text-[var(--theme-accent)] uppercase tracking-wider">
                        {isAr ? ANIMATION_COMPONENTS.find(c => c.key === activeAnimComp)?.nameAr : ANIMATION_COMPONENTS.find(c => c.key === activeAnimComp)?.nameEn}
                      </span>

                      {/* Animated Element Container */}
                      <div
                        className="w-full max-w-sm animate-none"
                      >
                        {activeAnimComp === 'profileCardOpen' && (
                          <div className="p-4 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-accent)] shadow-xl space-y-2">
                            <div className="w-10 h-10 rounded-xl bg-[var(--theme-accent)] text-black font-black flex items-center justify-center">
                              PC
                            </div>
                            <h4 className="text-xs font-black text-[var(--theme-text-primary)]">Profile Modal Animated</h4>
                            <p className="text-[10px] text-[var(--theme-text-muted)]">Live profile card entrance animation</p>
                          </div>
                        )}

                        {activeAnimComp === 'messageHover' && (
                          <div className="p-3 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] shadow-md">
                            Chat message bubble hover animation preview.
                          </div>
                        )}

                        {activeAnimComp === 'serverSwitch' && (
                          <div className="flex items-center justify-center gap-3 p-4 bg-[var(--theme-bg-secondary)] rounded-2xl border border-[var(--theme-border)]">
                            <div className="w-12 h-12 rounded-2xl bg-[var(--theme-accent)] text-black font-black flex items-center justify-center shadow-lg">
                              SV
                            </div>
                          </div>
                        )}

                        {activeAnimComp === 'contextMenuOpen' && (
                          <div className="w-48 p-2 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-2xl space-y-1 text-xs font-bold text-[var(--theme-text-primary)]">
                            <div className="px-3 py-1.5 rounded-xl hover:bg-[var(--theme-bg-tertiary)] cursor-pointer">Option Item 1</div>
                            <div className="px-3 py-1.5 rounded-xl hover:bg-[var(--theme-bg-tertiary)] cursor-pointer">Option Item 2</div>
                          </div>
                        )}

                        {activeAnimComp === 'modalOpen' && (
                          <div className="p-5 rounded-3xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-2xl space-y-2">
                            <h4 className="text-sm font-black text-[var(--theme-text-primary)]">Dialog Modal Entrance</h4>
                            <p className="text-xs text-[var(--theme-text-muted)]">Modal window opening transition</p>
                          </div>
                        )}

                        {activeAnimComp === 'tooltip' && (
                          <div className="px-3 py-1.5 rounded-xl bg-black text-accent text-xs font-bold border border-accent/40 shadow-xl inline-block">
                            Tooltip Hint Animated
                          </div>
                        )}

                        {activeAnimComp === 'settingsPage' && (
                          <div className="p-4 rounded-3xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] shadow-xl space-y-2">
                            <h4 className="text-xs font-black text-[var(--theme-text-primary)]">Settings Page Transition</h4>
                            <p className="text-[10px] text-[var(--theme-text-muted)]">Smooth page switch animation preview</p>
                          </div>
                        )}

                        {activeAnimComp === 'channelSwitch' && (
                          <div className="p-3 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-accent)] shadow-md flex items-center justify-between text-xs font-bold text-[var(--theme-accent)]">
                            <span># general-chat</span>
                            <span className="w-2 h-2 rounded-full bg-[var(--theme-accent)]" />
                          </div>
                        )}

                        {activeAnimComp === 'memberList' && (
                          <div className="p-3 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] shadow-md flex items-center gap-3 text-xs font-bold">
                            <div className="w-8 h-8 rounded-xl bg-[var(--theme-accent)] text-black font-black text-xs flex items-center justify-center">
                              MB
                            </div>
                            <span>Member List Item Hover</span>
                          </div>
                        )}

                        {activeAnimComp === 'notification' && (
                          <div className="p-3.5 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-accent)] shadow-xl flex items-center gap-2 text-xs font-bold">
                            <Bell className="w-4 h-4 text-[var(--theme-accent)]" />
                            <span>Notification Toast Animated</span>
                          </div>
                        )}

                        {!['profileCardOpen', 'messageHover', 'serverSwitch', 'contextMenuOpen', 'modalOpen', 'tooltip', 'notification'].includes(activeAnimComp) && (
                          <div className="p-4 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs font-bold text-[var(--theme-text-primary)]">
                            Animated UI Component Sample
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
