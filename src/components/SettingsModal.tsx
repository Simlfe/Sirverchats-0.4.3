import React, { useState, useEffect, Suspense } from 'react';
import APP_URLS from '../config/urls';
import { useTheme } from '../context/ThemeContext';
import { User, Server, Channel, ServerRole, ServerOptionInvite, ServerMember } from '../types';
import { pbService, getServerIconUrl, getServerMemberAvatarUrl, getServerMemberBannerUrl, getServerMemberDisplayName } from '../pocketbase';
import { setServerPassword, getServerPassword } from '../lib/serverPassword';
import { safeLocalStorageSet, safeLocalStorageGet } from '../lib/storageManager';
import { notificationService } from '../services/notificationService';
import {
  X,
  Save,
  Upload,
  Shield,
  Info,
  Settings,
  Sparkles,
  Sliders,
  Languages,
  Type,
  Palette,
  Moon,
  Sun,
  Monitor,
  Globe,
  MessageSquare,
  Bell,
  Eye,
  EyeOff,
  Lock,
  Database,
  User as UserIcon,
  Trash2,
  Key,
  Smartphone,
  Check,
  RefreshCw,
  Volume2,
  HardDrive,
  CheckCircle,
  AlertCircle,
  LogOut,
  Zap,
  Server as ServerIcon,
  Hash,
  Plus,
  Image as ImageIcon,
  Camera,
  Users,
  UserPlus,
  Edit3,
  Clock,
  Award,
  Film,
  Gamepad2,
  Search,
  Layers,
  Mail,
  UserX,
  Video,
  ShieldCheck,
  Download,
  Folder,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ArrowRight,
  FolderPlus,
  CloudUpload,
  Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserSettings, resolveEffectiveTheme, applySettingsToDocument, saveCachedUserSettings, DEFAULT_USER_SETTINGS, calculateActualStorageUsage, formatBytes } from '../lib/userSettings';
import { optimizeImage } from '../lib/imageOptimizer';
import {
  ThemeDefinition,
  PRESET_WALLPAPERS,
  WallpaperPreset,
  getCustomWallpapers,
  saveCustomWallpaper,
  deleteCustomWallpaper,
  uploadWallpaperFileToServer,
  saveWallpaperUrlToServer,
  saveCachedDraftThemes,
  getCachedDraftThemes,
  saveCachedAllThemes,
  getCachedAllThemes,
  applyThemeTokensAndLayout,
  updateThemeImages,
  setThemeImageOverride,
  getThemeImageOverrides,
  AVAILABLE_FONTS,
  FontOption,
} from '../theme/adminThemeService';
import { getDownloadDirectory, openDownloadDirectory, getCustomDownloadDirSetting, setCustomDownloadDirSetting, ensureDownloadDirectoryExists } from '../lib/nativePlatform';
import DownloadsTabContent from './DownloadsTabContent';
import { useBackHandler } from '../services/backStackManager';

const GlobalThemeManagerTab = React.lazy(() => import('./GlobalThemeManagerTab').then(m => ({ default: m.GlobalThemeManagerTab })));
const TextTokensManagerTab = React.lazy(() => import('./TextTokensManagerTab').then(m => ({ default: m.TextTokensManagerTab })));
const CameraQualitySettings = React.lazy(() => import('./CameraQualitySettings'));

interface SettingsModalProps {
  isMobilePage?: boolean;
  currentUser: User;
  onUpdateUser: (updatedUser: User) => void;
  onClose: () => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  lang: 'en' | 'ar';
  setLang: (l: 'en' | 'ar') => void;
  t: (key: string) => string;
  userSettings: UserSettings;
  onUpdateUserSettings: (newSettings: UserSettings) => void;
  onLogout: () => void;
  servers?: Server[];
  activeServer?: Server | null;
  channels?: Channel[];
  onChannelCreated?: (channel: Channel) => void;
  onChannelUpdated?: (channel: Channel) => void;
  onDeleteChannel?: (channelId: string) => void;
  onDeleteServer?: (serverId: string) => void;
  onOpenServerSettings?: (server: Server) => void;
  onServerUpdated?: (server: Server) => void;
}

type TabType =
  | 'appearance'
  | 'voice_video'
  | 'servers'
  | 'language'
  | 'text_tokens'
  | 'chat'
  | 'notifications'
  | 'accessibility'
  | 'privacy'
  | 'storage'
  | 'downloads'
  | 'account'
  | 'admin_db'
  | 'global_theme';

export default function SettingsModal({
  isMobilePage = false,
  currentUser,
  onUpdateUser,
  onClose,
  serverUrl,
  setServerUrl,
  lang,
  setLang,
  t,
  userSettings,
  onUpdateUserSettings,
  onLogout,
  servers = [],
  activeServer,
  channels = [],
  onChannelCreated,
  onChannelUpdated,
  onDeleteChannel,
  onDeleteServer,
  onOpenServerSettings,
  onServerUpdated
}: SettingsModalProps) {
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'half-admin' || (currentUser as any)?.isAdmin === true;
  const { useThemes, setUseThemes, selectedThemeId, setSelectedThemeId, selectTheme, publishedThemes, resetPreview, isPreviewing, previewedTheme, previewTheme } = useTheme();
  const [themeCategoryFilter, setThemeCategoryFilter] = useState<'all' | 'anime' | 'games' | 'action' | 'core' | 'aesthetic'>('all');
  const [themeSearchQuery, setThemeSearchQuery] = useState('');

  const allMatchingThemes = React.useMemo(() => {
    return publishedThemes.filter((t) => {
      if (themeCategoryFilter !== 'all') {
        if (themeCategoryFilter === 'core') {
          if (t.category && t.category !== 'core' && t.category !== 'aesthetic') return false;
        } else if (t.category !== themeCategoryFilter) {
          return false;
        }
      }
      if (themeSearchQuery.trim()) {
        const q = themeSearchQuery.toLowerCase();
        const matchName = t.name.toLowerCase().includes(q);
        const matchNameAr = (t.nameAr || '').toLowerCase().includes(q);
        const matchDesc = (t.description || '').toLowerCase().includes(q);
        const matchDescAr = (t.descriptionAr || '').toLowerCase().includes(q);
        const matchTags = (t.tags || []).some((tag) => tag.toLowerCase().includes(q));
        return matchName || matchNameAr || matchDesc || matchDescAr || matchTags;
      }
      return true;
    });
  }, [publishedThemes, themeCategoryFilter, themeSearchQuery]);
  
  // Custom Wallpaper Presets & Server Attachment State
  const [customWallpapers, setCustomWallpapers] = useState<WallpaperPreset[]>(() => getCustomWallpapers());
  const [wallpaperCatFilter, setWallpaperCatFilter] = useState<'all' | 'custom' | 'anime' | 'games' | 'action' | 'aesthetic'>('all');
  const [wallpaperSearchQuery, setWallpaperSearchQuery] = useState('');
  const [wallpaperTargetSlot, setWallpaperTargetSlot] = useState<1 | 2>(1);
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);
  const [isSavingWallpaperUrl, setIsSavingWallpaperUrl] = useState(false);
  const [customWallpaperUrlInput, setCustomWallpaperUrlInput] = useState('');
  const [wallpaperStatusMsg, setWallpaperStatusMsg] = useState<string | null>(null);
  const settingsWallpaperFileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleCustomWallpapersUpdated = () => {
      setCustomWallpapers(getCustomWallpapers());
    };
    window.addEventListener('custom-wallpapers-updated', handleCustomWallpapersUpdated);
    return () => {
      window.removeEventListener('custom-wallpapers-updated', handleCustomWallpapersUpdated);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('appearance');
  const [mobileView, setMobileView] = useState<'categories' | 'detail'>('categories');

  // Back stack handler for mobile category detail view
  useBackHandler('settings-detail-view', (isMobilePage || (typeof window !== 'undefined' && window.innerWidth < 768)) && mobileView === 'detail', () => {
    setMobileView('categories');
  });

  // Server Settings State
  const [selectedServerId, setSelectedServerId] = useState<string>(activeServer?.id || servers[0]?.id || '');
  const [serverSubTab, setServerSubTab] = useState<'channels' | 'banner_icon' | 'roles' | 'server_ui'>('channels');

  const [showAddChannelForm, setShowAddChannelForm] = useState(false);
  const [newChanName, setNewChanName] = useState('');
  const [newChanTopic, setNewChanTopic] = useState('');
  const [creatingChan, setCreatingChan] = useState(false);

  const selectedServer = servers.find(s => s.id === selectedServerId) || activeServer || servers[0];
  const isServerOwner = selectedServer ? (selectedServer.owner === currentUser.id || (selectedServer as any).created_by === currentUser.id || currentUser.role === 'admin') : false;
  const serverChannels = selectedServer ? channels.filter(c => c.server === selectedServer.id) : [];

  // Server Branding Editing
  const [serverEditName, setServerEditName] = useState(selectedServer?.name || '');
  const [serverEditDesc, setServerEditDesc] = useState(selectedServer?.description || '');
  const [serverEditPassword, setServerEditPassword] = useState(() => getServerPassword(selectedServer?.description) || '');
  const [serverIconFile, setServerIconFile] = useState<File | null>(null);
  const [serverIconPreview, setServerIconPreview] = useState<string | null>(null);
  const [serverBannerFile, setServerBannerFile] = useState<File | null>(null);
  const [serverBannerPreview, setServerBannerPreview] = useState<string | null>(null);
  const [serverSaving, setServerSaving] = useState(false);
  const [serverSuccessMsg, setServerSuccessMsg] = useState<string | null>(null);

  // Server Roles
  const [rolesList, setRolesList] = useState<ServerRole[]>([]);
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([]);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole, setEditingRole] = useState<ServerRole | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleEmoji, setRoleEmoji] = useState('🛡️');
  const [roleColor, setRoleColor] = useState('#3b82f6');
  const [rolePerms, setRolePerms] = useState({
    send_messages: true,
    manage_channels: false,
    manage_roles: false,
    manage_server: false,
    kick_members: false,
    pin_messages: true
  });

  // Server User Invites / Options
  const [serverOptions, setServerOptions] = useState<ServerOptionInvite[]>([]);
  const [inviteSearchUser, setInviteSearchUser] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Server Member Profile Overrides State (for non-owners or members without manage server permissions)
  const [memberNickname, setMemberNickname] = useState('');
  const [memberAvatarFile, setMemberAvatarFile] = useState<File | null>(null);
  const [memberAvatarPreview, setMemberAvatarPreview] = useState<string | null>(null);
  const [memberBannerFile, setMemberBannerFile] = useState<File | null>(null);
  const [memberBannerPreview, setMemberBannerPreview] = useState<string | null>(null);
  const defaultMainColor1 = userSettings?.appearance?.cardColor || localStorage.getItem('user_card_color1') || (currentUser as any)?.cardColor || (currentUser as any)?.color1 || '#1e293b';
  const defaultMainColor2 = userSettings?.appearance?.cardColor2 || localStorage.getItem('user_card_color2') || (currentUser as any)?.cardColor2 || (currentUser as any)?.color2 || '#0f172a';
  const defaultMainFrame = userSettings?.appearance?.avatarFrameColor || localStorage.getItem('user_frame_color') || (currentUser as any)?.avatarFrameColor || (currentUser as any)?.frameColor || defaultMainColor1;

  const [memberColor1, setMemberColor1] = useState(defaultMainColor1);
  const [memberColor2, setMemberColor2] = useState(defaultMainColor2);
  const [memberFrameColor, setMemberFrameColor] = useState(defaultMainFrame);
  const [memberBio, setMemberBio] = useState('');

  useEffect(() => {
    if (selectedServer && activeTab === 'servers') {
      setServerEditName(selectedServer.name || '');
      setServerEditDesc(selectedServer.description || '');
      setServerEditPassword(getServerPassword(selectedServer.description) || '');
      setServerIconFile(null);
      setServerIconPreview(null);
      setServerBannerFile(null);
      setServerBannerPreview(null);

      // Load roles, members & options
      loadServerRolesAndMembers(selectedServer.id);
      loadServerOptions(selectedServer.id);
    }
  }, [selectedServerId, activeTab]);

  useEffect(() => {
    if (selectedServer && currentUser) {
      const myMem = serverMembers.find(m => m.user === currentUser.id || m.id === currentUser.id);
      if (myMem) {
        setMemberNickname(myMem.member_name || myMem.nickname || '');
        setMemberAvatarPreview(myMem.server_avatar ? (myMem.server_avatar.startsWith('http') || myMem.server_avatar.startsWith('data:') || myMem.server_avatar.startsWith('blob:') ? myMem.server_avatar : `${pbService.getServerUrl()}/api/files/server_members/${myMem.id}/${myMem.server_avatar}`) : null);
        setMemberBannerPreview(myMem.server_banner ? (myMem.server_banner.startsWith('http') || myMem.server_banner.startsWith('data:') || myMem.server_banner.startsWith('blob:') ? myMem.server_banner : `${pbService.getServerUrl()}/api/files/server_members/${myMem.id}/${myMem.server_banner}`) : null);
        
        let sSettings: any = {};
        if (myMem.server_profile_settings) {
          if (typeof myMem.server_profile_settings === 'string') {
            try { sSettings = JSON.parse(myMem.server_profile_settings); } catch {}
          } else if (typeof myMem.server_profile_settings === 'object') {
            sSettings = myMem.server_profile_settings;
          }
        }
        const cachedS = localStorage.getItem(`server_profile_settings_${selectedServer.id}_${currentUser.id}`);
        if (cachedS) {
          try { sSettings = { ...sSettings, ...JSON.parse(cachedS) }; } catch {}
        }

        const defCol1 = userSettings?.appearance?.cardColor || localStorage.getItem('user_card_color1') || (currentUser as any)?.cardColor || (currentUser as any)?.color1 || '#1e293b';
        const defCol2 = userSettings?.appearance?.cardColor2 || localStorage.getItem('user_card_color2') || (currentUser as any)?.cardColor2 || (currentUser as any)?.color2 || '#0f172a';
        const defFrame = userSettings?.appearance?.avatarFrameColor || localStorage.getItem('user_frame_color') || (currentUser as any)?.avatarFrameColor || (currentUser as any)?.frameColor || defCol1;

        setMemberColor1(sSettings.cardColor || localStorage.getItem(`server_color1_${selectedServer.id}_${currentUser.id}`) || defCol1);
        setMemberColor2(sSettings.cardColor2 || localStorage.getItem(`server_color2_${selectedServer.id}_${currentUser.id}`) || defCol2);
        setMemberFrameColor(sSettings.avatarFrameColor || localStorage.getItem(`server_frame_color_${selectedServer.id}_${currentUser.id}`) || defFrame);
        setMemberBio(sSettings.bio || localStorage.getItem(`server_bio_${selectedServer.id}_${currentUser.id}`) || '');
      } else {
        const defCol1 = userSettings?.appearance?.cardColor || localStorage.getItem('user_card_color1') || (currentUser as any)?.cardColor || (currentUser as any)?.color1 || '#1e293b';
        const defCol2 = userSettings?.appearance?.cardColor2 || localStorage.getItem('user_card_color2') || (currentUser as any)?.cardColor2 || (currentUser as any)?.color2 || '#0f172a';
        const defFrame = userSettings?.appearance?.avatarFrameColor || localStorage.getItem('user_frame_color') || (currentUser as any)?.avatarFrameColor || (currentUser as any)?.frameColor || defCol1;

        setMemberNickname('');
        setMemberAvatarPreview(null);
        setMemberBannerPreview(null);
        setMemberColor1(defCol1);
        setMemberColor2(defCol2);
        setMemberFrameColor(defFrame);
        setMemberBio('');
      }
    }
  }, [selectedServerId, serverMembers, currentUser]);

  const handleSaveMemberServerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer || !currentUser) return;
    setServerSaving(true);
    setServerSuccessMsg(null);

    try {
      let avatarVal: File | string | null = memberAvatarFile;
      if (!avatarVal) {
        if (memberAvatarPreview === 'REMOVE') {
          avatarVal = null;
        } else if (memberAvatarPreview) {
          avatarVal = memberAvatarPreview;
        }
      }

      let bannerVal: File | string | null = memberBannerFile;
      if (!bannerVal) {
        if (memberBannerPreview === 'REMOVE') {
          bannerVal = null;
        } else if (memberBannerPreview) {
          bannerVal = memberBannerPreview;
        }
      }

      const serverProfileSettingsObj = {
        cardColor: memberColor1,
        cardColor2: memberColor2,
        avatarFrameColor: memberFrameColor,
        bio: memberBio.trim()
      };

      await pbService.updateServerMemberProfile(selectedServer.id, currentUser.id, {
        member_name: memberNickname.trim(),
        server_avatar: avatarVal,
        server_banner: bannerVal,
        server_profile_settings: serverProfileSettingsObj
      });

      setServerSuccessMsg(lang === 'ar' ? 'تم حفظ بروفايلك الخاص بالسيرفر بنجاح!' : 'Server member profile updated successfully!');
      await loadServerRolesAndMembers(selectedServer.id);
    } catch (err: any) {
      console.error('Failed to update server member profile', err);
    } finally {
      setServerSaving(false);
    }
  };

  const handleResetMemberServerProfile = async () => {
    if (!selectedServer || !currentUser) return;
    setServerSaving(true);
    setServerSuccessMsg(null);

    try {
      localStorage.removeItem(`server_name_${selectedServer.id}_${currentUser.id}`);
      localStorage.removeItem(`server_avatar_${selectedServer.id}_${currentUser.id}`);
      localStorage.removeItem(`server_banner_${selectedServer.id}_${currentUser.id}`);
      localStorage.removeItem(`server_color1_${selectedServer.id}_${currentUser.id}`);
      localStorage.removeItem(`server_color2_${selectedServer.id}_${currentUser.id}`);
      localStorage.removeItem(`server_frame_color_${selectedServer.id}_${currentUser.id}`);
      localStorage.removeItem(`server_bio_${selectedServer.id}_${currentUser.id}`);
      localStorage.removeItem(`server_profile_settings_${selectedServer.id}_${currentUser.id}`);

      await pbService.updateServerMemberProfile(selectedServer.id, currentUser.id, {
        member_name: '',
        server_avatar: null,
        server_banner: null,
        server_profile_settings: null
      });

      setMemberNickname('');
      setMemberAvatarPreview(null);
      setMemberBannerPreview(null);
      setMemberAvatarFile(null);
      setMemberBannerFile(null);
      const defCol1 = userSettings?.appearance?.cardColor || localStorage.getItem('user_card_color1') || (currentUser as any)?.cardColor || (currentUser as any)?.color1 || '#1e293b';
      const defCol2 = userSettings?.appearance?.cardColor2 || localStorage.getItem('user_card_color2') || (currentUser as any)?.cardColor2 || (currentUser as any)?.color2 || '#0f172a';
      const defFrame = userSettings?.appearance?.avatarFrameColor || localStorage.getItem('user_frame_color') || (currentUser as any)?.avatarFrameColor || (currentUser as any)?.frameColor || defCol1;
      setMemberColor1(defCol1);
      setMemberColor2(defCol2);
      setMemberFrameColor(defFrame);
      setMemberBio('');

      setServerSuccessMsg(lang === 'ar' ? 'تمت إزالة التعديلات واستعادة بروفايلك الافتراضي بنجاح!' : 'Server profile reset to default successfully!');
      await loadServerRolesAndMembers(selectedServer.id);
    } catch (err: any) {
      console.error('Failed to reset server profile:', err);
    } finally {
      setServerSaving(false);
    }
  };

  const loadServerRolesAndMembers = async (serverId: string) => {
    try {
      const [rList, mList] = await Promise.all([
        pbService.fetchServerRoles(serverId),
        pbService.fetchServerMembers(serverId)
      ]);
      setRolesList(rList);
      setServerMembers(mList);
    } catch (e) {
      console.warn('Failed to load server roles/members', e);
    }
  };

  const loadServerOptions = async (serverId: string) => {
    try {
      const opts = await pbService.fetchServerOptions(serverId);
      setServerOptions(opts);
    } catch (e) {
      console.warn('Failed to load server options', e);
    }
  };

  const handleSaveServerBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer || !serverEditName.trim()) return;
    setServerSaving(true);
    setServerSuccessMsg(null);

    try {
      if (serverIconFile) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            safeLocalStorageSet(`server_icon_${selectedServer.id}`, reader.result);
          }
        };
        reader.readAsDataURL(serverIconFile);
      }

      if (serverBannerFile) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            safeLocalStorageSet(`server_banner_${selectedServer.id}`, reader.result);
          }
        };
        reader.readAsDataURL(serverBannerFile);
      }

      const finalDesc = setServerPassword(serverEditDesc.trim(), serverEditPassword.trim() || undefined);
      const updated = await pbService.updateServer(selectedServer.id, {
        name: serverEditName.trim(),
        description: finalDesc
      });

      if (serverIconFile || serverBannerFile) {
        try {
          const formData = new FormData();
          if (serverIconFile) formData.append('icon', serverIconFile);
          if (serverBannerFile) formData.append('banner', serverBannerFile);
          await pbService.getPbInstance().collection('servers').update(selectedServer.id, formData);
        } catch (e) {
          console.warn('PocketBase server update notice:', e);
        }
      }

      let fresh: Server = updated;
      try {
        const fetched = await pbService.getPbInstance().collection('servers').getOne(selectedServer.id);
        if (fetched) fresh = fetched as any as Server;
      } catch (e) {}

      if (onServerUpdated) onServerUpdated(fresh);
      setServerSuccessMsg(lang === 'ar' ? 'تم حفظ التغييرات بنجاح!' : 'Server details saved!');
      setTimeout(() => setServerSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
    } finally {
      setServerSaving(false);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer || !roleName.trim()) return;
    setServerSaving(true);
    try {
      if (editingRole) {
        const updated = await pbService.updateServerRole(selectedServer.id, editingRole.id, {
          name: roleName.trim(),
          emoji: roleEmoji,
          color: roleColor,
          permissions: rolePerms
        });
        setRolesList((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setEditingRole(null);
      } else {
        const created = await pbService.createServerRole(selectedServer.id, {
          name: roleName.trim(),
          emoji: roleEmoji,
          color: roleColor,
          permissions: rolePerms
        });
        setRolesList((prev) => [created, ...prev]);
        setShowCreateRole(false);
      }
      setRoleName('');
    } catch (err) {
      console.error(err);
    } finally {
      setServerSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!selectedServer) return;
    try {
      await pbService.deleteServerRole(selectedServer.id, roleId);
      setRolesList((prev) => prev.filter((r) => r.id !== roleId));
    } catch (e) {
      console.warn(e);
    }
  };

  const handleAssignRoleToMember = async (memberUserId: string, roleIdOrName: string) => {
    if (!selectedServer) return;
    try {
      await pbService.updateMemberRole(selectedServer.id, memberUserId, roleIdOrName);
      setServerMembers((prev) =>
        prev.map((m) => (m.user === memberUserId || m.id === memberUserId ? { ...m, role: roleIdOrName, role_id: roleIdOrName } : m))
      );
    } catch (e) {
      console.warn(e);
    }
  };

  const handleUserSearchForInvite = async (q: string) => {
    setInviteSearchUser(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const users = await pbService.fetchAllUsers();
      const filtered = users.filter((u) => u.id !== currentUser.id && (u.username.toLowerCase().includes(q.toLowerCase()) || (u.display_name && u.display_name.toLowerCase().includes(q.toLowerCase()))));
      setSearchResults(filtered.slice(0, 5));
    } catch (e) {
      console.warn(e);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSendServerInviteOption = async (targetUser: User) => {
    if (!selectedServer) return;
    try {
      const created = await pbService.createServerOptionInvite(
        selectedServer.id,
        targetUser.id,
        targetUser.username,
        currentUser?.id || 'admin',
        targetUser.display_name
      );
      setServerOptions((prev) => [created, ...prev]);
      setInviteSearchUser('');
      setSearchResults([]);
    } catch (e) {
      console.warn(e);
    }
  };

  const getChannelCooldownValue = (ch: Channel): number => {
    if (typeof ch.cooldown === 'number') return ch.cooldown;
    if (ch.topic) {
      const match = ch.topic.match(/\[cooldown:(\d+)\]/);
      if (match) return parseInt(match[1], 10);
    }
    return 0;
  };

  const handleUpdateChannelCooldownSetting = async (ch: Channel, seconds: number) => {
    try {
      let cleanTopic = (ch.topic || '').replace(/\s*\[cooldown:\d+\]/g, '').trim();
      const updatedTopic = seconds > 0 ? `${cleanTopic} [cooldown:${seconds}]`.trim() : cleanTopic;
      const updated = await pbService.updateChannel(ch.id, {
        topic: updatedTopic,
        cooldown: seconds
      } as any);
      if (onChannelUpdated) onChannelUpdated(updated);
    } catch (err) {
      console.error('Failed to update channel cooldown:', err);
    }
  };

  const handleCreateNewChannelSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChanName.trim() || !selectedServer) return;
    setCreatingChan(true);
    try {
      const created = await pbService.createChannel(selectedServer.id, newChanName.trim(), 'text', newChanTopic.trim());
      if (onChannelCreated) onChannelCreated(created);
      setNewChanName('');
      setNewChanTopic('');
      setShowAddChannelForm(false);
    } catch (err) {
      console.error('Failed to create channel:', err);
    } finally {
      setCreatingChan(false);
    }
  };

  // Local settings clone state
  const [localSettings, setLocalSettings] = useState<UserSettings>(userSettings);

  useEffect(() => {
    setLocalSettings(userSettings);
  }, [userSettings]);

  // Admin DB URL State
  const [adminDbUrl, setAdminDbUrl] = useState(serverUrl || pbService.getServerUrl());
  const [savingDbUrl, setSavingDbUrl] = useState(false);
  const [dbUrlSuccess, setDbUrlSuccess] = useState(false);

  const handleSaveAdminDbUrl = async () => {
    if (!adminDbUrl.trim() || currentUser?.role !== 'admin') return;
    setSavingDbUrl(true);
    setDbUrlSuccess(false);

    try {
      const cleanUrl = adminDbUrl.trim();
      pbService.setServerUrl(cleanUrl);
      setServerUrl(cleanUrl);
      await pbService.updateAppConfigDatabaseUrl(cleanUrl);
      setDbUrlSuccess(true);
      setTimeout(() => setDbUrlSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to update DB URL:', e);
    } finally {
      setSavingDbUrl(false);
    }
  };

  // Profile Edit Local states
  const [displayName, setDisplayName] = useState(currentUser.display_name || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [status, setStatus] = useState<'online' | 'offline' | 'away' | 'dnd'>(currentUser.status || 'online');
  const [pendingPreferredLanguage, setPendingPreferredLanguage] = useState<string>(
    (currentUser as any).preferred_language || (currentUser as any).preferredLanguage || 'English'
  );
  const [pendingCardColor, setPendingCardColor] = useState<string>(userSettings.appearance.cardColor || '#1e293b');
  const [pendingCardColor2, setPendingCardColor2] = useState<string>(userSettings.appearance.cardColor2 || '#0f172a');
  const [pendingAvatarFrameColor, setPendingAvatarFrameColor] = useState<string>(userSettings.appearance.avatarFrameColor || '#7BAE37');

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  // Single Active Edit Field state (displayName | bio | status | preferredLanguage | null)
  const [activeEditField, setActiveEditField] = useState<'displayName' | 'bio' | 'status' | 'preferredLanguage' | null>(null);

  const COLOR_PRESETS = [
    { name: 'Avocado', c1: '#7BAE37', c2: '#3F5E1B', frame: '#7BAE37' },
    { name: 'Midnight', c1: '#1e293b', c2: '#0f172a', frame: '#38bdf8' },
    { name: 'Violet', c1: '#6d28d9', c2: '#3b0764', frame: '#a855f7' },
    { name: 'Sunset', c1: '#ea580c', c2: '#7c2d12', frame: '#f97316' },
    { name: 'Emerald', c1: '#059669', c2: '#064e3b', frame: '#10b981' },
  ];

  // Security / Password states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Status & Notifications
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  // Keep local settings state updated during editing; only sync to server on Save Settings click
  const updatePartialSettings = (section: keyof UserSettings, updates: any) => {
    const updated: UserSettings = {
      ...localSettings,
      appearance: {
        ...localSettings.appearance,
        useThemes,
        selectedThemeId,
        ...(section === 'appearance' ? updates : {})
      },
      ...(section !== 'appearance' ? { [section]: { ...(localSettings as any)[section], ...updates } } : {})
    };
    setLocalSettings(updated);
    applySettingsToDocument(updated);
    saveCachedUserSettings(updated);
    onUpdateUserSettings(updated);
    if (currentUser?.id) {
      pbService.updateProfile(currentUser.id, { settings: updated }).catch((err) => {
        console.warn('Failed to instantly save settings to server:', err);
      });
    }
  };

  const effectiveTheme = resolveEffectiveTheme(localSettings.appearance.theme);
  const isLight = effectiveTheme === 'light';

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const optimized = await optimizeImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.85 });
      setAvatarFile(optimized);
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        try { URL.revokeObjectURL(avatarPreview); } catch (e) {}
      }
      setAvatarPreview(URL.createObjectURL(optimized));
    }
  };

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const optimized = await optimizeImage(file, { maxWidth: 1280, maxHeight: 720, quality: 0.85 });
      setBannerFile(optimized);
      if (bannerPreview && bannerPreview.startsWith('blob:')) {
        try { URL.revokeObjectURL(bannerPreview); } catch (e) {}
      }
      setBannerPreview(URL.createObjectURL(optimized));
    }
  };

  const [storageStats, setStorageStats] = useState<{
    cacheUsage: string;
    downloadedMedia: string;
    cacheBytes: number;
    mediaBytes: number;
    mediaCount: number;
  }>({
    cacheUsage: '0 KB',
    downloadedMedia: '0 files',
    cacheBytes: 0,
    mediaBytes: 0,
    mediaCount: 0,
  });
  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);

  const [downloadDirectoryPath, setDownloadDirectoryPath] = useState<string>('');
  const [isEditingDownloadDir, setIsEditingDownloadDir] = useState<boolean>(false);
  const [customDirInput, setCustomDirInput] = useState<string>('');

  useEffect(() => {
    if (activeTab === 'storage') {
      setStorageStats(calculateActualStorageUsage());
      getDownloadDirectory().then(setDownloadDirectoryPath);
    }
  }, [activeTab]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const updatedSettings: UserSettings = {
        ...localSettings,
        appearance: {
          ...localSettings.appearance,
          useThemes,
          selectedThemeId,
          cardColor: pendingCardColor,
          cardColor2: pendingCardColor2,
          avatarFrameColor: pendingAvatarFrameColor
        }
      };

      const updateData: any = {
        display_name: displayName.trim(),
        bio: bio.trim(),
        status: status,
        preferred_language: pendingPreferredLanguage,
        settings: updatedSettings
      };

      if (avatarPreview === 'REMOVE') {
        updateData.avatar = 'REMOVE';
      }
      if (bannerPreview === 'REMOVE') {
        updateData.banner = 'REMOVE';
      }

      // Update profile record in PocketBase
      const updated = await pbService.updateProfile(
        currentUser.id,
        updateData,
        avatarFile || undefined,
        bannerFile || undefined
      );

      setLocalSettings(updatedSettings);
      saveCachedUserSettings(updatedSettings);
      onUpdateUserSettings(updatedSettings);
      applySettingsToDocument(updatedSettings);

      onUpdateUser(updated);
      setActiveEditField(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to update user profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError(lang === 'ar' ? 'كلمة المرور يجب أن لا تقل عن 6 أحرف.' : 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(lang === 'ar' ? 'كلمات المرور غير متطابقة.' : 'Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await pbService.updateProfile(currentUser.id, {
        password: newPassword,
        oldPassword: oldPassword
      } as any);
      setPasswordSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(err?.message || (lang === 'ar' ? 'فشل تغيير كلمة المرور.' : 'Failed to update password.'));
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = () => {
    try {
      const keysToPreserve = [
        'pocketbase_auth',
        'demo_user',
        'sirver_pb_url',
        'app_lang',
        'user_settings',
        'sirver_user_settings_cache_v2',
        'sirver_theme_mode',
      ];

      const isPreserved = (key: string) => {
        if (keysToPreserve.includes(key)) return true;
        if (
          key.startsWith('server_icon_') ||
          key.startsWith('server_banner_') ||
          key.startsWith('server_avatar_') ||
          key.startsWith('downloaded_media_') ||
          key.startsWith('member_avatar_') ||
          key.startsWith('member_banner_') ||
          key.startsWith('user_card_color') ||
          key.startsWith('user_frame_color')
        ) {
          return true;
        }
        return false;
      };

      const keysToRemove: string[] = [];
      let freedBytes = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !isPreserved(key)) {
          keysToRemove.push(key);
          const val = localStorage.getItem(key) || '';
          freedBytes += (key.length + val.length) * 2;
        }
      }

      if (keysToRemove.length === 0 || freedBytes === 0) {
        setCacheClearMessage(
          lang === 'ar' ? 'الذاكرة المؤقتة فارغة بالفعل!' : 'Cache is already clean!'
        );
        setCacheCleared(true);
        setTimeout(() => {
          setCacheCleared(false);
          setCacheClearMessage(null);
        }, 3500);
        return;
      }

      keysToRemove.forEach((k) => localStorage.removeItem(k));

      const newStats = calculateActualStorageUsage();
      setStorageStats(newStats);
      setCacheCleared(true);

      const freedStr = formatBytes(freedBytes);
      const successMsg =
        lang === 'ar'
          ? `تم مسح الذاكرة المؤقتة بنجاح! (تم تحرير ${freedStr})`
          : `Cache cleared successfully! (${freedStr} freed)`;
      setCacheClearMessage(successMsg);

      updatePartialSettings('storageData', {
        cacheUsage: newStats.cacheUsage,
        downloadedMedia: newStats.downloadedMedia,
      });

      setTimeout(() => {
        setCacheCleared(false);
        setCacheClearMessage(null);
      }, 4000);
    } catch (e) {
      console.warn('Clear cache error:', e);
    }
  };

  const getAvatarUrl = () => {
    if (avatarPreview === 'REMOVE') return '';
    if (avatarPreview) return avatarPreview;
    if (currentUser.avatar) {
      if (currentUser.avatar.startsWith('blob:') || currentUser.avatar.startsWith('http')) {
        return currentUser.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`;
    }
    return '';
  };

  const getBannerUrl = () => {
    if (bannerPreview === 'REMOVE') return '';
    if (bannerPreview) return bannerPreview;
    if (currentUser.banner) {
      if (currentUser.banner.startsWith('blob:') || currentUser.banner.startsWith('http')) {
        return currentUser.banner;
      }
      return `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.banner}`;
    }
    return '';
  };

  const tabsNav = [
    { id: 'appearance', label: lang === 'ar' ? 'المظهر والسمات' : 'Appearance', icon: Palette },
    { id: 'voice_video', label: lang === 'ar' ? 'الكاميرا وجودة الفيديو' : 'Camera & Video Quality', icon: Video },
    { id: 'servers', label: lang === 'ar' ? 'السيرفرات والقنوات' : 'Servers', icon: ServerIcon },
    { id: 'language', label: lang === 'ar' ? 'اللغة والمنطقة' : 'Language & Region', icon: Globe },
    { id: 'chat', label: lang === 'ar' ? 'إعدادات الدردشة' : 'Chat', icon: MessageSquare },
    { id: 'notifications', label: lang === 'ar' ? 'الإشعارات' : 'Notifications', icon: Bell },
    { id: 'accessibility', label: lang === 'ar' ? 'إمكانية الوصول' : 'Accessibility', icon: Sparkles },
    { id: 'privacy', label: lang === 'ar' ? 'الخصوصية والأمان' : 'Privacy & Safety', icon: Shield },
    { id: 'storage', label: lang === 'ar' ? 'التخزين والبيانات' : 'Storage & Data', icon: Database },
    { id: 'downloads', label: lang === 'ar' ? 'التنزيلات والتنزيلات المحلية' : 'Downloads Manager', icon: Download },
    { id: 'account', label: lang === 'ar' ? 'الحساب والملف الشخصي' : 'Account', icon: UserIcon },
    ...(isAdmin
      ? [
          { id: 'global_theme', label: lang === 'ar' ? 'ثيمات التطبيق العامة' : 'Global App Theme', icon: Sliders },
          { id: 'text_tokens', label: lang === 'ar' ? 'رمزية النصوص والترجمة' : 'Text Tokens', icon: Languages },
          { id: 'admin_db', label: lang === 'ar' ? 'عنوان قاعدة البيانات' : 'Database URL', icon: HardDrive }
        ]
      : [])
  ];

  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className={isMobilePage ? "w-full h-full fixed inset-0 z-50 flex flex-col bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] overflow-hidden select-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]" : "fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 select-none"}>
      {!isMobilePage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.08 : 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 bg-black/80 z-0"
          onClick={onClose}
        />
      )}
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: isMobilePage ? 1 : 0.98, y: isMobilePage ? 0 : 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: isMobilePage ? 1 : 0.98, y: isMobilePage ? 0 : 6 }}
        transition={{ duration: prefersReducedMotion ? 0.08 : 0.16, ease: [0.22, 1, 0.36, 1] }}
        className={isMobilePage ? "w-full h-full flex flex-col md:flex-row bg-[var(--theme-bg-primary)] border-0 text-[var(--theme-text-primary)] z-10 overflow-hidden" : "w-full h-full md:h-[92vh] md:w-[95vw] md:max-w-6xl lg:max-w-7xl xl:max-w-[1420px] rounded-none md:rounded-3xl border-0 md:border shadow-2xl overflow-hidden flex flex-col md:flex-row bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] z-10"}
      >
        {/* Sidebar Navigation Tabs */}
        <div className={`w-full md:w-72 lg:w-80 min-w-[270px] border-b md:border-b-0 md:border-r shrink-0 flex flex-col p-4 gap-2 overflow-y-auto bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] ${mobileView === 'categories' ? 'flex h-full' : 'hidden md:flex'}`}>
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-2 mb-2 gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {isMobilePage && (
                <button
                  type="button"
                  onClick={onClose}
                  className="md:hidden p-2 rounded-xl bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:opacity-80 active:scale-95 transition-all cursor-pointer border-0 flex items-center justify-center shrink-0"
                  aria-label={lang === 'ar' ? 'رجوع للدردشة' : 'Back to Chat'}
                  title={lang === 'ar' ? 'رجوع للدردشة' : 'Back to Chat'}
                >
                  {lang === 'ar' ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
                </button>
              )}
              <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                <Settings className="w-5 h-5 animate-spin-slow" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-xs sm:text-sm text-[var(--theme-text-primary)] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                  {lang === 'ar' ? 'مركز الإعدادات' : 'Settings Center'}
                </h2>
                <span className="text-[10px] text-[var(--theme-text-muted)] font-medium truncate block">
                  {currentUser.display_name || currentUser.username}
                </span>
              </div>
            </div>
            {/* Mobile Close Button on Category view */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] cursor-pointer border-0 shrink-0"
              aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div role="tablist" aria-label={lang === 'ar' ? 'أقسام الإعدادات' : 'Settings Categories'} className="flex flex-col gap-1.5 overflow-y-auto pb-4 scrollbar-none">
            {tabsNav.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tab.label}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setMobileView('detail');
                  }}
                  className={`flex items-center justify-between px-3.5 py-3 rounded-2xl font-bold text-xs transition-all cursor-pointer w-full shrink-0 border-0 ${
                    isActive
                      ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-lg shadow-accent/25 font-black'
                      : 'text-[var(--theme-text-muted)] bg-[var(--theme-bg-tertiary)]/50 hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-xl ${isActive ? 'bg-black/10' : 'bg-accent/10 text-accent'}`}>
                      <Icon className="w-4 h-4 shrink-0" />
                    </div>
                    <span className="text-xs font-extrabold">{tab.label}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-70">
                    {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-4">
            <button
              onClick={onLogout}
              className="w-full py-2.5 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs transition-all flex items-center justify-center md:justify-start gap-2 cursor-pointer border-0"
            >
              <LogOut className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Log Out'}</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden relative bg-[var(--theme-bg-primary)] ${mobileView === 'detail' ? 'flex' : 'hidden md:flex'}`}>
          {/* Top Close Bar */}
          <div className="p-4 bg-[var(--theme-bg-primary)] border-b border-[var(--theme-border)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile Back Button */}
              <button
                type="button"
                onClick={() => setMobileView('categories')}
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] text-xs font-black text-accent cursor-pointer border-0 hover:opacity-80 active:scale-95 transition-all shrink-0"
              >
                {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                <span>{lang === 'ar' ? 'الأقسام' : 'Categories'}</span>
              </button>

              <h3 className="font-extrabold text-base flex items-center gap-2 text-[var(--theme-text-primary)] truncate">
                <span>{tabsNav.find((t) => t.id === activeTab)?.label}</span>
              </h3>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl transition-all cursor-pointer border-0 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-none">
            {/* VOICE & CAMERA QUALITY TAB */}
            {activeTab === 'voice_video' && (
              <Suspense fallback={<div className="p-8 flex items-center justify-center text-accent"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                <CameraQualitySettings lang={lang} />
              </Suspense>
            )}

            {/* 1. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                {/* Theme Mode Selector (Dark / Light) */}
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                    <Palette className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'نمط المظهر (Dark / Light)' : 'Appearance Mode'}</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { id: 'dark', name: lang === 'ar' ? 'الوضع الداكن' : 'Dark Mode', desc: lang === 'ar' ? 'الوضع الداكن الموحد' : 'Monochrome Dark Mode', icon: Moon },
                      { id: 'light', name: lang === 'ar' ? 'الوضع الفاتح' : 'Light Mode', desc: lang === 'ar' ? 'المظهر الفاتح الناصع' : 'Clean Light Mode', icon: Sun },
                      { id: 'system', name: lang === 'ar' ? 'تلقائي (حسب النظام)' : 'System Default', desc: lang === 'ar' ? 'مطابقة الجهاز' : 'Match System Preference', icon: Monitor },
                    ].map((t) => {
                      const isSel = localSettings.appearance.theme === t.id;
                      const IconComp = t.icon;
                      return (
                        <button
                          key={t.id}
                          onClick={() => updatePartialSettings('appearance', { theme: t.id })}
                          className={`p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all cursor-pointer relative overflow-hidden ${
                            isSel
                              ? 'border-accent ring-2 ring-accent/50 bg-accent/10 shadow-lg'
                              : 'border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)]'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                              <IconComp className="w-4 h-4 text-accent" />
                              <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">{t.name}</span>
                            </div>
                            {isSel && <CheckCircle className="w-4 h-4 text-accent" />}
                          </div>
                          <span className="text-[10px] text-[var(--theme-text-muted)]">{t.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Family Selection (Independent Theme Font Customization) */}
                <div className="space-y-3 pt-4 border-t border-[var(--theme-border)]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                      <Type className="w-4 h-4 text-accent" />
                      <span className="text-[var(--theme-text-primary)]">
                        {lang === 'ar' ? 'نوع الخط في التطبيق (Font Family)' : 'App Typography & Font'}
                      </span>
                    </label>
                    {(localSettings.appearance.selectedFontId && localSettings.appearance.selectedFontId !== 'theme') && (
                      <button
                        type="button"
                        onClick={() => {
                          updatePartialSettings('appearance', { selectedFontId: 'theme', fontFamily: 'theme', customFontFamily: 'theme' });
                        }}
                        className="text-[10px] font-bold text-accent hover:underline bg-transparent border-0 cursor-pointer p-0"
                      >
                        {lang === 'ar' ? 'استعادة خط الثيم التلقائي' : 'Reset to Theme Font'}
                      </button>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-3">
                    <div className="flex flex-col">
                      <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                        {lang === 'ar' ? 'اختيار خط مخصص بشكل مستقل عن الثيم' : 'Choose Independent Font Family'}
                      </span>
                      <span className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                        {lang === 'ar'
                          ? 'يمكنك استخدام أي سمة/ثيم ولكن مع خط من ثيم آخر أو اختيار أحد الخطوط المخصصة المدعومة'
                          : 'Use your favorite theme while applying any typography font from other themes or custom font stacks'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <select
                        value={localSettings.appearance.selectedFontId || 'theme'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updatePartialSettings('appearance', { selectedFontId: val, fontFamily: val, customFontFamily: val });
                        }}
                        className="w-full p-3 rounded-xl border text-xs font-medium focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] cursor-pointer"
                      >
                        <option value="theme">
                          {lang === 'ar' ? '✨ خط الثيم التلقائي (Theme Default Font)' : '✨ Active Theme Default Font'}
                        </option>
                        {Array.from(new Set(AVAILABLE_FONTS.map((f) => f.category))).map((cat) => (
                          <optgroup key={cat} label={`─── ${cat} ───`}>
                            {AVAILABLE_FONTS.filter((f) => f.category === cat).map((font) => (
                              <option key={font.id} value={font.id}>
                                {lang === 'ar' ? `${font.nameAr} (${font.name})` : `${font.name} — ${font.nameAr}`}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>

                      {/* Live Typography Preview Pill */}
                      <div
                        className="p-3 rounded-xl border bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 transition-all"
                        style={{
                          fontFamily: (localSettings.appearance.selectedFontId && localSettings.appearance.selectedFontId !== 'theme')
                            ? localSettings.appearance.selectedFontId
                            : 'var(--font-family)'
                        }}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-extrabold text-[var(--theme-text-primary)]">
                            SirverData Chat • The quick brown fox jumps over the lazy dog
                          </span>
                          <span className="text-[11px] font-medium text-[var(--theme-text-muted)] mt-0.5">
                            سيرفر داتا شات • أبجد هوز حطي كلمن سعفص قرشت ثخذ ضظغ 0123456789
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-accent/15 text-accent border border-accent/20 shrink-0">
                          {(localSettings.appearance.selectedFontId && localSettings.appearance.selectedFontId !== 'theme')
                            ? (lang === 'ar' ? 'خط مخصص نشط' : 'Custom Font')
                            : (lang === 'ar' ? 'خط الثيم النشط' : 'Theme Font')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Font Size & Density */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-[var(--theme-text-primary)]">
                      {lang === 'ar' ? 'حجم الخط' : 'Font Size'}
                    </label>
                    <select
                      value={localSettings.appearance.fontSize}
                      onChange={(e) => updatePartialSettings('appearance', { fontSize: e.target.value })}
                      className="w-full p-3 rounded-xl border text-xs font-medium focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    >
                      <option value="small">{lang === 'ar' ? 'صغير' : 'Small'}</option>
                      <option value="medium">{lang === 'ar' ? 'متوسط (قياسي)' : 'Medium (Standard)'}</option>
                      <option value="large">{lang === 'ar' ? 'كبير' : 'Large'}</option>
                      <option value="xlarge">{lang === 'ar' ? 'كبير جداً' : 'Extra Large'}</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-[var(--theme-text-primary)]">
                      {lang === 'ar' ? 'كثافة الرسائل' : 'Message Density'}
                    </label>
                    <select
                      value={localSettings.appearance.messageDensity}
                      onChange={(e) => updatePartialSettings('appearance', { messageDensity: e.target.value })}
                      className="w-full p-3 rounded-xl border text-xs font-medium focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    >
                      <option value="compact">{lang === 'ar' ? 'مضغوط (Compact)' : 'Compact'}</option>
                      <option value="comfortable">{lang === 'ar' ? 'مريح (Comfortable)' : 'Comfortable'}</option>
                      <option value="spacious">{lang === 'ar' ? 'واسع (Spacious)' : 'Spacious'}</option>
                    </select>
                  </div>
                </div>

                {/* Independent Profile Card Scale Section */}
                <div className="space-y-3 pt-4 border-t border-[var(--theme-border)]">
                  <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                    <UserIcon className="w-4 h-4 text-accent" />
                    <span className="text-[var(--theme-text-primary)]">{lang === 'ar' ? 'حجم بطاقات البروفايل (Profile Card Scale)' : 'Profile Card Scale'}</span>
                  </label>
                  <div className="p-4 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                          {lang === 'ar' ? 'مستوى التكبير/التصغير لبطاقة الملف الشخصي' : 'Profile Card Display Scale'}
                        </span>
                        <span className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                          {lang === 'ar'
                            ? 'التحكم في مقاس وحجم ظهور بطاقة البروفايل بشكل مستقل وغير مرتبط بالثيمات'
                            : 'Adjust profile card popout display size independently from active themes'}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-accent px-2.5 py-1 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] shrink-0">
                        {localSettings.appearance.profileCardScale ?? 100}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="70"
                      max="130"
                      step="1"
                      value={localSettings.appearance.profileCardScale ?? 100}
                      onChange={(e) => updatePartialSettings('appearance', { profileCardScale: Number(e.target.value) })}
                      className="w-full cursor-pointer"
                      style={{ accentColor: 'var(--accent-color, #7bae37)' }}
                    />
                  </div>
                </div>

                {/* Global UI Scale (UI Zoom) Section */}
                <div className="space-y-3 pt-4 border-t border-[var(--theme-border)]">
                  <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                    <Maximize2 className="w-4 h-4 text-accent" />
                    <span className="text-[var(--theme-text-primary)]">{lang === 'ar' ? 'مقياس الواجهة (UI Scale)' : 'UI Scale'}</span>
                  </label>
                  <div className="p-4 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                          {lang === 'ar' ? 'حجم واجهة المستخدم والتكبير العام' : 'Global Interface Zoom Level'}
                        </span>
                        <span className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                          {lang === 'ar'
                            ? 'التحكم في حجم عناصر واجهة المستخدم مع الحفاظ على تخطيط التطبيق ومواضعه'
                            : 'Scale interface text, icons, and spacing while preserving overall app layout and anchors'}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-accent px-2.5 py-1 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] shrink-0">
                        {localSettings.appearance.uiScale ?? 100}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <ZoomOut className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
                      <input
                        type="range"
                        min="75"
                        max="130"
                        step="5"
                        value={localSettings.appearance.uiScale ?? 100}
                        onChange={(e) => updatePartialSettings('appearance', { uiScale: Number(e.target.value) })}
                        className="w-full cursor-pointer"
                        style={{ accentColor: 'var(--accent-color, #7bae37)' }}
                      />
                      <ZoomIn className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
                    </div>

                    {/* Quick Preset Scale Buttons */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      {[80, 90, 100, 110, 120].map((scaleVal) => {
                        const isCur = (localSettings.appearance.uiScale ?? 100) === scaleVal;
                        return (
                          <button
                            key={scaleVal}
                            type="button"
                            onClick={() => updatePartialSettings('appearance', { uiScale: scaleVal })}
                            className={`flex-1 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                              isCur
                                ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] border-accent shadow-sm'
                                : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border-[var(--theme-border)] hover:bg-[var(--theme-channel-hover-bg)]'
                            }`}
                          >
                            {scaleVal}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* GIF Avatar & Banner Playback Setting */}
                <div className="space-y-3 pt-4 border-t border-[var(--theme-border)]">
                  <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                    <Film className="w-4 h-4 text-accent" />
                    <span className="text-[var(--theme-text-primary)]">
                      {lang === 'ar' ? 'تشغيل الصور المتحركة GIF (الأفتار والغلاف)' : 'GIF Avatar & Banner Playback'}
                    </span>
                  </label>
                  <div className="p-4 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)] space-y-3">
                    <div className="flex flex-col">
                      <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                        {lang === 'ar' ? 'طريقة تشغيل صور GIF المتحركة' : 'GIF Animation Playback Behavior'}
                      </span>
                      <span className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                        {lang === 'ar'
                          ? 'اختر متى يتم تشغيل صور GIF المتحركة لصور الحساب والأغلفة في التطبيق'
                          : 'Choose when GIF avatars and profile banners should animate in the user interface'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      {[
                        {
                          id: 'always',
                          title: lang === 'ar' ? 'تشغيل دائماً' : 'Always Play',
                          desc: lang === 'ar' ? 'تشغيل الصور المتحركة تلقائياً وبشكل مستمر' : 'Animate automatically and continuously',
                        },
                        {
                          id: 'hover',
                          title: lang === 'ar' ? 'التشغيل عند التمرير' : 'Play on Hover',
                          desc: lang === 'ar' ? 'تجميد الصورة وتشغيلها فقط عند تمرير الماوس' : 'Freeze frame until mouse hovers over image',
                        },
                        {
                          id: 'never',
                          title: lang === 'ar' ? 'عدم التشغيل (إطار ثابت)' : 'Never Play (Static)',
                          desc: lang === 'ar' ? 'تجميد كافة صور GIF كإطار ثابت دائم' : 'Always display a still freeze frame',
                        },
                      ].map((item) => {
                        const isSel = (localSettings.appearance.gifPlayback || 'always') === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => updatePartialSettings('appearance', { gifPlayback: item.id as any })}
                            className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                              isSel
                                ? 'border-accent bg-accent/10 ring-1 ring-accent text-[var(--theme-text-primary)]'
                                : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-channel-hover-bg)]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">{item.title}</span>
                              {isSel && <CheckCircle className="w-3.5 h-3.5 text-accent" />}
                            </div>
                            <span className="text-[10px] text-[var(--theme-text-muted)]">{item.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Use Themes Toggle & Theme Selection */}
                <div className="space-y-4 pt-4 border-t border-[var(--theme-border)]">
                  <div className="flex items-center justify-between p-4 rounded-2xl border bg-[var(--theme-bg-card)] border-[var(--theme-border)]">
                    <div>
                      <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                        {lang === 'ar' ? 'تفعيل السمات المخصصة' : 'Enable Custom Themes'}
                      </h4>
                      <p className="text-[10px] text-[var(--theme-text-muted)] mt-0.5">
                        {lang === 'ar' ? 'عند إيقاف هذا الخيار، سيتم تطبيق مظهر النظام الأساسي الفاتح أو الداكن دون أي تعديلات سمات.' : 'When turned off, the default clean Light or Dark theme is used.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      dir="ltr"
                      onClick={() => {
                        const nextVal = !useThemes;
                        setUseThemes(nextVal);
                        updatePartialSettings('appearance', { useThemes: nextVal });
                      }}
                      className={`ui-toggle-switch ${useThemes ? 'is-on' : 'is-off'}`}
                    >
                      <span className="ui-toggle-thumb" />
                    </button>
                  </div>

                  {/* Preview Banner if active */}
                  {isPreviewing && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-between gap-3 shadow-md">
                      <div className="flex items-center gap-2 text-xs font-black">
                        <Eye className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                        <span>
                          {lang === 'ar'
                            ? `أنت تقوم بلمعاينة حالياً ثيم: ${previewedTheme?.name || 'مؤقت'}`
                            : `Currently previewing theme: ${previewedTheme?.name || 'Temporary'}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => resetPreview()}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all border-0 shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'إيقاف المعاينة' : 'Disable Preview'}</span>
                      </button>
                    </div>
                  )}

                  {/* Themes Grid (Always Visible & Interactive) */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                        <Sparkles className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'السمات المتاحة للاختيار' : 'Available Themes'}</span>
                      </label>
                      <span className="text-[10px] text-[var(--theme-text-muted)] font-mono">
                        {publishedThemes.length} {lang === 'ar' ? 'سمة متاحة' : 'themes available'}
                      </span>
                    </div>

                    {/* Category Filter Tabs & Search Bar */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                        {[
                          { id: 'all', label: lang === 'ar' ? 'الكل' : 'All', icon: Layers },
                          { id: 'anime', label: lang === 'ar' ? 'أنمي' : 'Anime', icon: Film },
                          { id: 'games', label: lang === 'ar' ? 'ألعاب' : 'Games', icon: Gamepad2 },
                          { id: 'action', label: lang === 'ar' ? 'أكشن وسينث' : 'Action & Neon', icon: Zap },
                          { id: 'core', label: lang === 'ar' ? 'أساسي وجمالي' : 'Core & Aesthetic', icon: Palette },
                        ].map((cat) => {
                          const IconComp = cat.icon;
                          const isActive = themeCategoryFilter === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setThemeCategoryFilter(cat.id as any)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border ${
                                isActive
                                  ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] border-accent shadow-sm'
                                  : 'bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                              }`}
                            >
                              <IconComp className="w-3.5 h-3.5" />
                              <span>{cat.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Theme Search Input */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 text-[var(--theme-text-muted)] pointer-events-none" />
                        <input
                          type="text"
                          value={themeSearchQuery}
                          onChange={(e) => setThemeSearchQuery(e.target.value)}
                          placeholder={lang === 'ar' ? 'ابحث عن سمة (مثال: AOT, Zero Two, Valorant, Cyberpunk)...' : 'Search themes (e.g., AOT, Zero Two, Valorant, Cyberpunk)...'}
                          className="w-full ps-9 pe-8 py-2 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent"
                        />
                        {themeSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setThemeSearchQuery('')}
                            className="absolute top-1/2 -translate-y-1/2 end-2.5 p-1 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Themes Listing by Category */}
                    {(() => {
                      const allMatching = allMatchingThemes;

                      const renderThemeCard = (t: ThemeDefinition) => {
                        const isSelected = useThemes && selectedThemeId === t.id;
                        const lightAcc = t.variants?.light?.general?.accent || '#7BAE37';
                        const darkAcc = t.variants?.dark?.general?.accent || lightAcc;
                        const darkBg = t.variants?.dark?.backgrounds?.window || '#0F1117';
                        const fontName = t.layout?.typography?.fontFamily?.split(',')[0]?.replace(/['"]/g, '') || 'Default';
                        const displayName = lang === 'ar' && t.nameAr ? t.nameAr : t.name;
                        const displayDesc = lang === 'ar' && t.descriptionAr ? t.descriptionAr : t.description;

                        const activeSlot = t.activeImageIndex ?? 0;
                        const effectiveBg = activeSlot === 1 && t.backgroundImage2 ? t.backgroundImage2 : (t.backgroundImage || t.backgroundImage2);
                        const hasImage1 = Boolean(t.backgroundImage);
                        const hasImage2 = Boolean(t.backgroundImage2);
                        const hasDualImages = hasImage1 && hasImage2;

                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              selectTheme(t.id, true);
                              setLocalSettings((prev) => ({
                                ...prev,
                                appearance: {
                                  ...prev.appearance,
                                  useThemes: true,
                                  selectedThemeId: t.id,
                                },
                              }));
                            }}
                            className={`p-3.5 rounded-2xl border text-start flex flex-col justify-between gap-2.5 transition-all cursor-pointer group relative overflow-hidden ${
                              isSelected
                                ? 'border-accent ring-2 ring-accent/50 bg-accent/10 shadow-lg'
                                : 'border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)] hover:border-accent/40'
                            }`}
                          >
                            {effectiveBg && (
                              <img
                                src={effectiveBg}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 w-full h-full object-cover opacity-15 group-hover:opacity-25 transition-opacity pointer-events-none"
                              />
                            )}

                            <div className="flex items-center justify-between w-full relative z-10">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-5 h-5 rounded-full shrink-0 border border-white/20 shadow-xs flex items-center justify-center overflow-hidden"
                                  style={{ background: darkBg }}
                                >
                                  <div
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ background: darkAcc }}
                                  />
                                </div>
                                <span className="font-extrabold text-xs text-[var(--theme-text-primary)] truncate">{displayName}</span>
                              </div>
                              
                              <div className="flex items-center gap-1.5 shrink-0">
                                {effectiveBg && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-[9px] font-bold text-purple-300 flex items-center gap-1">
                                    <ImageIcon className="w-2.5 h-2.5" />
                                    <span>{lang === 'ar' ? (activeSlot === 1 ? 'خلفية 2' : 'خلفية 1') : (activeSlot === 1 ? 'Art 2' : 'Art 1')}</span>
                                  </span>
                                )}
                                {isSelected && <CheckCircle className="w-4 h-4 text-accent shrink-0" />}
                              </div>
                            </div>

                            {displayDesc && (
                              <span className="text-[10px] text-[var(--theme-text-muted)] line-clamp-2 leading-snug relative z-10">{displayDesc}</span>
                            )}

                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--theme-border)]/50 relative z-10">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] truncate max-w-[100px]">
                                  {fontName}
                                </span>
                                {t.category && (
                                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-accent/15 text-accent">
                                    {t.category}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {hasDualImages && isAdmin && (
                                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--theme-bg-card)] border border-[var(--theme-border)]" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      title={lang === 'ar' ? 'الخلفية 1 (الأساسية)' : 'Wallpaper 1 (Primary)'}
                                      onClick={() => {
                                        updateThemeImages(t.id, { activeSlot: 0 });
                                      }}
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-black transition-all cursor-pointer ${
                                        activeSlot === 0
                                          ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-xs'
                                          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                                      }`}
                                    >
                                      1
                                    </button>
                                    <button
                                      type="button"
                                      title={lang === 'ar' ? 'الخلفية 2 (البديلة)' : 'Wallpaper 2 (Secondary)'}
                                      onClick={() => {
                                        updateThemeImages(t.id, { activeSlot: 1 });
                                      }}
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-black transition-all cursor-pointer ${
                                        activeSlot === 1
                                          ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-xs'
                                          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                                      }`}
                                    >
                                      2
                                    </button>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="w-2 h-2 rounded-full border border-black/20" style={{ background: lightAcc }} title="Light Accent" />
                                  <span className="w-2 h-2 rounded-full border border-white/20" style={{ background: darkAcc }} title="Dark Accent" />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      };

                      const renderDefaultNoneCard = () => (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedThemeId('none');
                            updatePartialSettings('appearance', { selectedThemeId: 'none' });
                          }}
                          className={`p-4 rounded-2xl border text-start flex flex-col gap-1.5 transition-all cursor-pointer ${
                            !useThemes || selectedThemeId === 'none'
                              ? 'border-accent ring-2 ring-accent/50 bg-accent/10 shadow-lg'
                              : 'border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)]'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                              {lang === 'ar' ? 'بدون سمة (الافتراضي)' : 'None (System Default)'}
                            </span>
                            {(!useThemes || selectedThemeId === 'none') && <CheckCircle className="w-4 h-4 text-accent" />}
                          </div>
                          <span className="text-[10px] text-[var(--theme-text-muted)]">
                            {lang === 'ar' ? 'السمة الأساسية النظيفة بدون تخصيصات أو خلفيات' : 'Standard theme without color overlays or wallpapers'}
                          </span>
                        </button>
                      );

                      // If user is searching or viewing a single category tab, show directly
                      if (themeCategoryFilter !== 'all' || themeSearchQuery.trim()) {
                        return (
                          <div className="space-y-3">
                            {allMatching.length === 0 ? (
                              <div className="p-8 text-center rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-muted)]">
                                {lang === 'ar' ? 'لم يتم العثور على سمات مطابقة' : 'No matching themes found'}
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {themeCategoryFilter === 'core' && !themeSearchQuery && renderDefaultNoneCard()}
                                {allMatching.map(renderThemeCard)}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Group into categories when 'All' is active
                      const categoryGroups = [
                        {
                          id: 'anime',
                          label: lang === 'ar' ? 'أنمي ومانجا' : 'Anime & Manga',
                          icon: Film,
                          themes: publishedThemes.filter((t) => t.category === 'anime'),
                        },
                        {
                          id: 'games',
                          label: lang === 'ar' ? 'ألعاب وفيديو جيمز' : 'Gaming & Esports',
                          icon: Gamepad2,
                          themes: publishedThemes.filter((t) => t.category === 'games'),
                        },
                        {
                          id: 'action',
                          label: lang === 'ar' ? 'أكشن وسينث ونيون' : 'Action & Neon',
                          icon: Zap,
                          themes: publishedThemes.filter((t) => t.category === 'action'),
                        },
                        {
                          id: 'core',
                          label: lang === 'ar' ? 'المظهر الأساسي والجمالي' : 'Core & Aesthetic',
                          icon: Palette,
                          themes: publishedThemes.filter((t) => !t.category || t.category === 'core' || t.category === 'aesthetic'),
                        },
                      ];

                      return (
                        <div className="space-y-6">
                          {categoryGroups.map((group) => {
                            const GroupIcon = group.icon;
                            if (group.themes.length === 0 && group.id !== 'core') return null;

                            return (
                              <div key={group.id} className="space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-[var(--theme-border)]">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-lg bg-accent/15 text-accent">
                                      <GroupIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <h5 className="font-extrabold text-xs text-[var(--theme-text-primary)]">{group.label}</h5>
                                  </div>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--theme-bg-secondary)] text-[var(--theme-text-muted)] border border-[var(--theme-border)]">
                                    {group.themes.length} {lang === 'ar' ? 'سمة' : 'themes'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {group.id === 'core' && renderDefaultNoneCard()}
                                  {group.themes.map(renderThemeCard)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* High-Res Wallpaper Presets & Dual-Slot Management (Admin Only) */}
                {isAdmin && (
                  <div className="space-y-4 pt-6 border-t border-[var(--theme-border)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-xl bg-accent/20 text-accent">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm text-[var(--theme-text-primary)]">
                              {lang === 'ar' ? 'خلفيات الثيم (صورتين لكل ثيم) ومكتبة الصور' : 'Theme Wallpapers (2 Images Per Theme) & Presets'}
                            </h4>
                            <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-full bg-accent/15 text-accent border border-accent/25">
                              {lang === 'ar' ? 'مسؤول فقط' : 'Admin Only'}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--theme-text-muted)]">
                            {lang === 'ar'
                              ? 'يمكنك تعيين صورتين (أساسية وبديلة) لكل ثيم والتبديل بينهما، وحذف الصور التي لا ترغب بها من التطبيق وقاعدة البيانات نهائياً'
                              : 'Set 2 images (primary & secondary) for each theme, switch active art, and delete unwanted wallpapers permanently'}
                          </p>
                        </div>
                      </div>
                    </div>

                  {wallpaperStatusMsg && (
                    <div className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-accent text-xs font-bold flex items-center gap-2 animate-fadeIn">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>{wallpaperStatusMsg}</span>
                    </div>
                  )}

                  {/* Active Theme Dual-Slot Selector Box */}
                  {(() => {
                    const allThemes = getCachedAllThemes();
                    const activeTheme = allThemes.find(t => t.id === selectedThemeId) || allThemes[0];
                    if (!activeTheme) return null;

                    const activeSlot = activeTheme.activeImageIndex ?? 0;
                    const img1 = activeTheme.backgroundImage;
                    const img2 = activeTheme.backgroundImage2;
                    const themeDisplayName = lang === 'ar' && activeTheme.nameAr ? activeTheme.nameAr : activeTheme.name;

                    return (
                      <div className="p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-3.5 shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--theme-border)] pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[var(--theme-text-primary)]">
                              {lang === 'ar' ? `خانات صور الثيم الحالي: ${themeDisplayName}` : `Current Theme Image Slots: ${themeDisplayName}`}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-bold">
                              {lang === 'ar' ? (activeSlot === 1 ? 'النشطة حالياً: الصورة 2' : 'النشطة حالياً: الصورة 1') : (activeSlot === 1 ? 'Active: Image 2' : 'Active: Image 1')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-[var(--theme-text-secondary)]">
                              {lang === 'ar' ? 'الخانة المستهدفة للتعيين:' : 'Target Slot for Upload/Select:'}
                            </span>
                            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
                              <button
                                type="button"
                                onClick={() => setWallpaperTargetSlot(1)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  wallpaperTargetSlot === 1
                                    ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-xs'
                                    : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                                }`}
                              >
                                {lang === 'ar' ? 'الصورة 1 (الأساسية)' : 'Slot 1 (Primary)'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setWallpaperTargetSlot(2)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  wallpaperTargetSlot === 2
                                    ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-xs'
                                    : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
                                }`}
                              >
                                {lang === 'ar' ? 'الصورة 2 (البديلة)' : 'Slot 2 (Secondary)'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Two Image Slots Preview Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Slot 1 */}
                          <div
                            className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                              wallpaperTargetSlot === 1 ? 'border-accent bg-accent/5 ring-1 ring-accent/30' : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-black text-xs flex items-center justify-center">1</span>
                                <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                                  {lang === 'ar' ? 'الصورة الأولى (الرئيسية)' : 'Image 1 (Primary)'}
                                </span>
                              </div>
                              {activeSlot === 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>{lang === 'ar' ? 'معروضة حالياً' : 'Displayed'}</span>
                                </span>
                              )}
                            </div>

                            <div className="w-full h-24 rounded-lg bg-cover bg-center border border-white/10 relative overflow-hidden bg-black/20 flex items-center justify-center">
                              {img1 ? (
                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${img1})` }} />
                              ) : (
                                <div className="text-center p-2 text-[var(--theme-text-muted)] flex flex-col items-center gap-1">
                                  <ImageIcon className="w-6 h-6 opacity-40" />
                                  <span className="text-[10px]">{lang === 'ar' ? 'لا توجد صورة أولى' : 'No primary image'}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-1.5 pt-1">
                              <button
                                type="button"
                                disabled={!img1 || activeSlot === 0}
                                onClick={() => {
                                  updateThemeImages(activeTheme.id, { activeSlot: 0 });
                                  setWallpaperStatusMsg(lang === 'ar' ? 'تم تفعيل الصورة الأولى كخلفية نشطة!' : 'Switched to Image 1!');
                                  setTimeout(() => setWallpaperStatusMsg(null), 3000);
                                }}
                                className="flex-1 py-1.5 px-2 rounded-lg bg-accent/20 hover:bg-accent hover:text-[var(--theme-accent-contrast,#000000)] text-accent text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-center"
                              >
                                {activeSlot === 0 ? (lang === 'ar' ? 'الخلفية النشطة' : 'Active') : (lang === 'ar' ? 'تفعيل كخلفية' : 'Make Active')}
                              </button>

                              {img1 && (
                                <button
                                  type="button"
                                  title={lang === 'ar' ? 'إزالة الصورة من هذا الثيم' : 'Remove image from theme'}
                                  onClick={() => {
                                    updateThemeImages(activeTheme.id, { image1: '', activeSlot: img2 ? 1 : 0 });
                                    setWallpaperStatusMsg(lang === 'ar' ? 'تمت إزالة الصورة الأولى من الثيم' : 'Removed Image 1 from theme');
                                    setTimeout(() => setWallpaperStatusMsg(null), 3000);
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Slot 2 */}
                          <div
                            className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all ${
                              wallpaperTargetSlot === 2 ? 'border-accent bg-accent/5 ring-1 ring-accent/30' : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-black text-xs flex items-center justify-center">2</span>
                                <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                                  {lang === 'ar' ? 'الصورة الثانية (البديلة)' : 'Image 2 (Secondary)'}
                                </span>
                              </div>
                              {activeSlot === 1 && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>{lang === 'ar' ? 'معروضة حالياً' : 'Displayed'}</span>
                                </span>
                              )}
                            </div>

                            <div className="w-full h-24 rounded-lg bg-cover bg-center border border-white/10 relative overflow-hidden bg-black/20 flex items-center justify-center">
                              {img2 ? (
                                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${img2})` }} />
                              ) : (
                                <div className="text-center p-2 text-[var(--theme-text-muted)] flex flex-col items-center gap-1">
                                  <ImageIcon className="w-6 h-6 opacity-40" />
                                  <span className="text-[10px]">{lang === 'ar' ? 'لا توجد صورة ثانية' : 'No secondary image'}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-1.5 pt-1">
                              <button
                                type="button"
                                disabled={!img2 || activeSlot === 1}
                                onClick={() => {
                                  updateThemeImages(activeTheme.id, { activeSlot: 1 });
                                  setWallpaperStatusMsg(lang === 'ar' ? 'تم تفعيل الصورة الثانية كخلفية نشطة!' : 'Switched to Image 2!');
                                  setTimeout(() => setWallpaperStatusMsg(null), 3000);
                                }}
                                className="flex-1 py-1.5 px-2 rounded-lg bg-accent/20 hover:bg-accent hover:text-[var(--theme-accent-contrast,#000000)] text-accent text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-center"
                              >
                                {activeSlot === 1 ? (lang === 'ar' ? 'الخلفية النشطة' : 'Active') : (lang === 'ar' ? 'تفعيل كخلفية' : 'Make Active')}
                              </button>

                              {img2 && (
                                <button
                                  type="button"
                                  title={lang === 'ar' ? 'إزالة الصورة من هذا الثيم' : 'Remove image from theme'}
                                  onClick={() => {
                                    updateThemeImages(activeTheme.id, { image2: '', activeSlot: 0 });
                                    setWallpaperStatusMsg(lang === 'ar' ? 'تمت إزالة الصورة الثانية من الثيم' : 'Removed Image 2 from theme');
                                    setTimeout(() => setWallpaperStatusMsg(null), 3000);
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Upload & Paste URL Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Local File Upload */}
                    <div className="p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-3 flex flex-col justify-between">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-1.5">
                          <FolderPlus className="w-4 h-4 text-accent" />
                          <span>
                            {lang === 'ar'
                              ? `رفع صورة وحفظها في (الصورة ${wallpaperTargetSlot})`
                              : `Upload Image to (Slot ${wallpaperTargetSlot})`}
                          </span>
                        </label>
                        <p className="text-[11px] text-[var(--theme-text-muted)]">
                          {lang === 'ar' ? 'يتم حفظ الملف في مرفقات السيرفر لتتمكن من استخدامه دائماً' : 'Saved directly as a server attachment record for permanent access'}
                        </p>
                      </div>

                      <input
                        ref={settingsWallpaperFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!file.type.startsWith('image/')) {
                            setWallpaperStatusMsg(lang === 'ar' ? 'يرجى اختيار ملف صورة صالح' : 'Please select a valid image file');
                            return;
                          }
                          try {
                            setIsUploadingWallpaper(true);
                            setWallpaperStatusMsg(lang === 'ar' ? 'جاري رفع الصورة إلى مرفقات السيرفر...' : 'Uploading image to server attachments...');
                            const preset = await uploadWallpaperFileToServer(file);

                            // Apply to active theme and target slot
                            const allThemes = getCachedAllThemes();
                            const targetTheme = allThemes.find(t => t.id === selectedThemeId) || allThemes[0];
                            if (targetTheme) {
                              updateThemeImages(targetTheme.id, {
                                [wallpaperTargetSlot === 1 ? 'image1' : 'image2']: preset.url,
                                activeSlot: wallpaperTargetSlot === 1 ? 0 : 1,
                              });
                              if (!useThemes) {
                                setUseThemes(true);
                                setSelectedThemeId(targetTheme.id);
                                updatePartialSettings('appearance', { useThemes: true, selectedThemeId: targetTheme.id });
                              }
                            }

                            setWallpaperStatusMsg(lang === 'ar' ? `تم رفع الصورة وحفظها في (الخانة ${wallpaperTargetSlot}) بنجاح!` : `Wallpaper uploaded & set to Slot ${wallpaperTargetSlot}!`);
                            setTimeout(() => setWallpaperStatusMsg(null), 4000);
                          } catch (err: any) {
                            console.error('Settings wallpaper upload failed:', err);
                            setWallpaperStatusMsg(lang === 'ar' ? `فشل الرفع: ${err?.message || 'خطأ'}` : `Upload failed: ${err?.message || 'Error'}`);
                          } finally {
                            setIsUploadingWallpaper(false);
                            if (settingsWallpaperFileInputRef.current) settingsWallpaperFileInputRef.current.value = '';
                          }
                        }}
                        className="hidden"
                      />

                      <button
                        type="button"
                        disabled={isUploadingWallpaper}
                        onClick={() => settingsWallpaperFileInputRef.current?.click()}
                        className="w-full py-2.5 px-3 rounded-xl border border-dashed border-accent/40 bg-accent/5 hover:bg-accent/15 hover:border-accent transition-all flex items-center justify-center gap-2 text-xs font-bold text-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUploadingWallpaper ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-accent" />
                            <span>{lang === 'ar' ? 'جاري الرفع والحفظ...' : 'Uploading & saving...'}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-accent" />
                            <span>{lang === 'ar' ? `اختيار ملف وتعيينه للصورة ${wallpaperTargetSlot}` : `Choose Local Image for Slot ${wallpaperTargetSlot}`}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Image URL Ingestion */}
                    <div className="p-4 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] space-y-3 flex flex-col justify-between">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-1.5">
                          <LinkIcon className="w-4 h-4 text-accent" />
                          <span>
                            {lang === 'ar'
                              ? `لصق رابط صورة وتعيينها لـ (الصورة ${wallpaperTargetSlot})`
                              : `Paste Image URL to (Slot ${wallpaperTargetSlot})`}
                          </span>
                        </label>
                        <p className="text-[11px] text-[var(--theme-text-muted)]">
                          {lang === 'ar' ? 'يتم سحب الصورة وحفظها كمرفق في السيرفر وإضافتها لنماذجك' : 'Fetched and persisted to server attachments & wallpaper gallery'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customWallpaperUrlInput}
                          onChange={(e) => setCustomWallpaperUrlInput(e.target.value)}
                          placeholder="https://images.unsplash.com/..."
                          className="flex-1 p-2 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-accent font-mono"
                        />
                        <button
                          type="button"
                          disabled={isSavingWallpaperUrl || !customWallpaperUrlInput.trim()}
                          onClick={async () => {
                            const url = customWallpaperUrlInput.trim();
                            if (!url) return;
                            try {
                              setIsSavingWallpaperUrl(true);
                              setWallpaperStatusMsg(lang === 'ar' ? 'جاري حفظ الصورة في مرفقات السيرفر...' : 'Saving image to server attachments...');
                              const preset = await saveWallpaperUrlToServer(url);

                              // Apply to active theme and target slot
                              const allThemes = getCachedAllThemes();
                              const targetTheme = allThemes.find(t => t.id === selectedThemeId) || allThemes[0];
                              if (targetTheme) {
                                updateThemeImages(targetTheme.id, {
                                  [wallpaperTargetSlot === 1 ? 'image1' : 'image2']: preset.url,
                                  activeSlot: wallpaperTargetSlot === 1 ? 0 : 1,
                                });
                                if (!useThemes) {
                                  setUseThemes(true);
                                  setSelectedThemeId(targetTheme.id);
                                  updatePartialSettings('appearance', { useThemes: true, selectedThemeId: targetTheme.id });
                                }
                              }

                              setCustomWallpaperUrlInput('');
                              setWallpaperStatusMsg(lang === 'ar' ? `تم حفظ الرابط وتعيينه لـ (الخانة ${wallpaperTargetSlot}) بنجاح!` : `Saved to attachments & set to Slot ${wallpaperTargetSlot}!`);
                              setTimeout(() => setWallpaperStatusMsg(null), 4000);
                            } catch (err: any) {
                              console.error('Save URL failed:', err);
                              setWallpaperStatusMsg(lang === 'ar' ? `فشل الحفظ: ${err?.message || 'خطأ'}` : `Save failed: ${err?.message || 'Error'}`);
                            } finally {
                              setIsSavingWallpaperUrl(false);
                            }
                          }}
                          className="px-3 py-2 rounded-xl bg-accent text-[var(--theme-accent-contrast,#000000)] hover:brightness-110 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isSavingWallpaperUrl ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CloudUpload className="w-3.5 h-3.5" />
                          )}
                          <span>{lang === 'ar' ? 'حفظ' : 'Save'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Filter Tabs & Search */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'all', labelEn: 'All', labelAr: 'الكل' },
                        { id: 'custom', labelEn: `Uploaded (${customWallpapers.length})`, labelAr: `المرفوعة (${customWallpapers.length})` },
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
                                : 'bg-[var(--theme-bg-card)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] border border-[var(--theme-border)]'
                            }`}
                          >
                            {lang === 'ar' ? tab.labelAr : tab.labelEn}
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative min-w-[200px]">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
                      <input
                        type="text"
                        value={wallpaperSearchQuery}
                        onChange={(e) => setWallpaperSearchQuery(e.target.value)}
                        placeholder={lang === 'ar' ? 'بحث بالاسم...' : 'Search presets...'}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  {/* Wallpapers Presets Grid */}
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
                      if (wallpaperSearchQuery.trim()) {
                        const q = wallpaperSearchQuery.toLowerCase();
                        const matchName = wp.name.toLowerCase().includes(q);
                        const matchNameAr = (wp.nameAr || '').toLowerCase().includes(q);
                        return matchName || matchNameAr;
                      }
                      return true;
                    });

                    const allThemes = getCachedAllThemes();
                    const activeCurrentTheme = allThemes.find(t => t.id === selectedThemeId) || allThemes[0];
                    const activeSlot = activeCurrentTheme?.activeImageIndex ?? 0;
                    const currentEffectiveBg = activeSlot === 1 && activeCurrentTheme?.backgroundImage2
                      ? activeCurrentTheme.backgroundImage2
                      : activeCurrentTheme?.backgroundImage;

                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-72 overflow-y-auto p-1 scrollbar-thin">
                        {filtered.map((wp) => {
                          const isCurrent = currentEffectiveBg === wp.url;
                          const isSlot1 = activeCurrentTheme?.backgroundImage === wp.url;
                          const isSlot2 = activeCurrentTheme?.backgroundImage2 === wp.url;

                          return (
                            <div
                              key={wp.id}
                              className={`p-2 rounded-xl border text-start flex flex-col gap-1.5 transition-all relative overflow-hidden group cursor-pointer ${
                                isCurrent
                                  ? 'border-accent bg-accent/15 ring-2 ring-accent shadow-md'
                                  : isSlot1 || isSlot2
                                  ? 'border-accent/50 bg-accent/5'
                                  : 'border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:border-accent/60'
                              }`}
                              onClick={() => {
                                if (activeCurrentTheme) {
                                  updateThemeImages(activeCurrentTheme.id, {
                                    [wallpaperTargetSlot === 1 ? 'image1' : 'image2']: wp.url,
                                    activeSlot: wallpaperTargetSlot === 1 ? 0 : 1,
                                  });
                                  if (!useThemes) {
                                    setUseThemes(true);
                                    setSelectedThemeId(activeCurrentTheme.id);
                                    updatePartialSettings('appearance', { useThemes: true, selectedThemeId: activeCurrentTheme.id });
                                  }
                                  setWallpaperStatusMsg(lang === 'ar' ? `تم تعيين الصورة لـ (الخانة ${wallpaperTargetSlot}) وتفعيلها!` : `Applied to Slot ${wallpaperTargetSlot}!`);
                                  setTimeout(() => setWallpaperStatusMsg(null), 3000);
                                }
                              }}
                            >
                              <div
                                className="w-full h-20 rounded-lg bg-cover bg-center border border-white/10 relative overflow-hidden shadow-xs"
                                style={{ backgroundImage: `url(${wp.url})` }}
                              >
                                {isCurrent && (
                                  <div className="absolute inset-0 bg-accent/25 flex items-center justify-center">
                                    <div className="p-1 rounded-full bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-md">
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </div>
                                  </div>
                                )}
                                <div className="absolute top-1 left-1 flex items-center gap-1">
                                  {wp.isCustom && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-accent text-[var(--theme-accent-contrast,#000000)] text-[9px] font-black uppercase shadow-xs">
                                      {lang === 'ar' ? 'مرفق' : 'Custom'}
                                    </span>
                                  )}
                                  {isSlot1 && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-blue-500 text-white text-[9px] font-black shadow-xs">
                                      1
                                    </span>
                                  )}
                                  {isSlot2 && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-purple-500 text-white text-[9px] font-black shadow-xs">
                                      2
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-1 w-full">
                                <span className="text-[11px] font-bold text-[var(--theme-text-primary)] truncate">
                                  {lang === 'ar' ? wp.nameAr : wp.name}
                                </span>
                                {wp.isCustom && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        setWallpaperStatusMsg(lang === 'ar' ? 'جاري حذف الصورة من المرفقات والتطبيق...' : 'Deleting wallpaper from app & database...');
                                        await deleteCustomWallpaper(wp.id);
                                        setWallpaperStatusMsg(lang === 'ar' ? 'تم حذف الصورة من قاعدة البيانات والتطبيق بنجاح!' : 'Wallpaper deleted from app & server database!');
                                        setTimeout(() => setWallpaperStatusMsg(null), 3000);
                                      } catch (err: any) {
                                        setWallpaperStatusMsg(lang === 'ar' ? `فشل الحذف: ${err?.message || 'خطأ'}` : `Delete failed: ${err?.message || 'Error'}`);
                                      }
                                    }}
                                    className="p-1 rounded-md text-[var(--theme-text-muted)] hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    title={lang === 'ar' ? 'حذف من التطبيق وقاعدة البيانات' : 'Delete from app & database'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
              )}
            </div>
          )}

            {/* SERVERS & CHANNELS TAB */}
            {activeTab === 'servers' && (
              <div className="space-y-6">
                {/* Server Selector */}
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                    <ServerIcon className="w-4 h-4 text-accent" />
                    <span>{lang === 'ar' ? 'اختر السيرفر' : 'Select Server'}</span>
                  </label>
                  
                  {servers.length === 0 ? (
                    <p className="text-xs text-[var(--theme-text-muted)]">{lang === 'ar' ? 'لا يوجد سيرفرات متاحة' : 'No servers available'}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {servers.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedServerId(s.id)}
                          className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                            selectedServerId === s.id
                              ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] border-accent shadow-md'
                              : 'bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                          }`}
                        >
                          <ServerIcon className="w-3.5 h-3.5" />
                          <span>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedServer && (() => {
                  const isServerOwner = selectedServer.owner === currentUser?.id;
                  const myMemRecord = serverMembers.find(m => m.user === currentUser?.id || m.id === currentUser?.id);
                  const myMemRoleId = myMemRecord?.role || myMemRecord?.role_id;
                  const myMemRoleObj = rolesList.find(r => r.id === myMemRoleId || r.name === myMemRoleId);
                  const hasServerManagePermission = isServerOwner || Boolean(
                    myMemRoleObj?.permissions?.manage_server ||
                    myMemRoleObj?.permissions?.manage_channels ||
                    myMemRoleObj?.permissions?.manage_roles
                  );

                  if (!hasServerManagePermission) {
                    return (
                      <div className="p-4 rounded-2xl border space-y-4 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                        <form onSubmit={handleSaveMemberServerProfile} className="space-y-5">
                          <div className="flex items-start gap-3 pb-4 border-b border-white/10">
                            <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                              <UserIcon className="w-5 h-5 text-accent" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <h4 className="font-extrabold text-base text-[var(--theme-text-primary)]">
                                {lang === 'ar' ? 'تعديل بروفايل الأعضاء بالسيرفر' : 'Server Member Profile Overrides'}
                              </h4>
                              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                                {lang === 'ar' ? 'يمكنك تغيير اسمك المستعار، صورتك الشخصية، وغلافك لهذا السيرفر. الخيارات أدناه خيارات إضافية فقط؛ إذا لم تعينها فستعتمد على بيانات حسابك الرئيسية.' : 'Customize your nickname, avatar, and banner for this server. Defaults to your global profile if empty.'}
                              </p>
                            </div>
                          </div>

                          {serverSuccessMsg && (
                            <div className="p-3 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-accent text-xs font-bold flex items-center gap-2">
                              <Check className="w-4 h-4" />
                              <span>{serverSuccessMsg}</span>
                            </div>
                          )}

                          {/* Live Vertical Server Profile Card Preview */}
                          <div className="space-y-3 pt-2">
                            <label className="text-xs font-bold text-slate-400 block tracking-wide">
                              {lang === 'ar' ? 'معاينة بطاقة بروفايلك في السيرفر:' : 'Server Profile Card Preview:'}
                            </label>
                            <div 
                              className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-5 flex flex-col gap-4 text-white"
                              style={{
                                background: `linear-gradient(180deg, ${memberColor1}, ${memberColor2})`
                              }}
                            >
                              {/* Banner */}
                              <div className="relative h-28 w-full rounded-2xl overflow-hidden shadow-md">
                                {memberBannerPreview && memberBannerPreview !== 'REMOVE' ? (
                                  <img src={memberBannerPreview} alt="Banner" className="w-full h-full object-cover" />
                                ) : currentUser?.banner ? (
                                  <img src={currentUser.banner.startsWith('http') || currentUser.banner.startsWith('blob:') ? currentUser.banner : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.banner}`} alt="Banner" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-black/20 flex items-center justify-center text-xs font-bold text-white/60">
                                    {lang === 'ar' ? 'غلاف افتراضي' : 'Default Banner'}
                                  </div>
                                )}
                              </div>

                              {/* Avatar */}
                              <div className="flex items-end justify-between -mt-10 px-2 relative z-10">
                                <div 
                                  style={{ background: memberFrameColor }}
                                  className="p-[3px] rounded-2xl shadow-2xl relative shrink-0"
                                >
                                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)]">
                                    {memberAvatarPreview && memberAvatarPreview !== 'REMOVE' ? (
                                      <img src={memberAvatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : currentUser?.avatar ? (
                                      <img src={currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('blob:') ? currentUser.avatar : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center font-black text-slate-400">
                                        {(memberNickname || currentUser?.display_name || currentUser?.username || 'U').substring(0, 2).toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-white/10 text-xs font-extrabold flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-online)] animate-pulse" />
                                  <span>{lang === 'ar' ? 'بروفايل السيرفر' : 'Server Profile'}</span>
                                </div>
                              </div>

                              {/* Names (1. Server Nickname/Name, 2. @username, 3. Default Name) */}
                              <div className="px-2 space-y-1 bg-black/25 p-3 rounded-2xl border border-white/10">
                                <h3 className="font-black text-lg text-white drop-shadow-sm">
                                  {memberNickname.trim() || currentUser?.display_name || currentUser?.username}
                                </h3>
                                <p className="text-xs font-mono text-white/80">@{currentUser?.username}</p>
                                {memberNickname.trim() && currentUser?.display_name && memberNickname.trim() !== currentUser.display_name && (
                                  <p className="text-[11px] font-bold text-[var(--theme-text-secondary)] pt-1 border-t border-white/10 mt-1">
                                    <span className="opacity-75">{lang === 'ar' ? 'الاسم الأصلي: ' : 'Default Name: '}</span>
                                    <span>{currentUser.display_name}</span>
                                  </p>
                                )}
                              </div>

                              {/* Server Bio */}
                              <div className="px-2">
                                <p className="text-xs text-white/90 bg-black/25 p-3 rounded-2xl border border-white/10 font-medium">
                                  {memberBio.trim() || currentUser?.bio || (lang === 'ar' ? 'لا توجد نبذة شخصية مخصصة للسيرفر.' : 'No server-specific bio set.')}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Member Nickname */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)]">
                              {lang === 'ar' ? 'الاسم المستعار بالسيرفر' : 'Server Nickname'}
                            </label>
                            <input
                              type="text"
                              value={memberNickname}
                              onChange={(e) => setMemberNickname(e.target.value)}
                              placeholder={currentUser?.display_name || currentUser?.username}
                              className="w-full rounded-xl px-3.5 py-2 text-xs font-bold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                            />
                          </div>

                          {/* Server Profile Colors Customization */}
                          <div className="space-y-2">
                            <label className="text-xs font-bold flex items-center gap-1.5 text-[var(--theme-text-secondary)]">
                              <Palette className="w-3.5 h-3.5 text-accent" />
                              <span>{lang === 'ar' ? 'ألوان بطاقة بروفايل السيرفر' : 'Server Profile Colors'}</span>
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                              {/* Color 1 */}
                              <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2 bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)]">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-[11px] font-extrabold truncate text-[var(--theme-text-primary)]">
                                    {lang === 'ar' ? 'بداية التدرج' : 'Color 1'}
                                  </span>
                                  <span className="text-[9px] font-mono uppercase text-[var(--theme-text-muted)]">{memberColor1}</span>
                                </div>
                                <input
                                  type="color"
                                  value={memberColor1}
                                  onChange={(e) => setMemberColor1(e.target.value)}
                                  className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent shrink-0"
                                />
                              </div>

                              {/* Color 2 */}
                              <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2 bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)]">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-[11px] font-extrabold truncate text-[var(--theme-text-primary)]">
                                    {lang === 'ar' ? 'نهاية التدرج' : 'Color 2'}
                                  </span>
                                  <span className="text-[9px] font-mono uppercase text-[var(--theme-text-muted)]">{memberColor2}</span>
                                </div>
                                <input
                                  type="color"
                                  value={memberColor2}
                                  onChange={(e) => setMemberColor2(e.target.value)}
                                  className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent shrink-0"
                                />
                              </div>

                              {/* Frame Color */}
                              <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2 bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)]">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-[11px] font-extrabold truncate text-[var(--theme-text-primary)]">
                                    {lang === 'ar' ? 'إطار الصورة' : 'Avatar Frame'}
                                  </span>
                                  <span className="text-[9px] font-mono uppercase text-[var(--theme-text-muted)]">{memberFrameColor}</span>
                                </div>
                                <input
                                  type="color"
                                  value={memberFrameColor}
                                  onChange={(e) => setMemberFrameColor(e.target.value)}
                                  className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent shrink-0"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Member Custom Server Bio */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)]">
                              {lang === 'ar' ? 'نبذة شخصية خاصة بالسيرفر (Server Bio)' : 'Server Custom Bio'}
                            </label>
                            <textarea
                              rows={2}
                              value={memberBio}
                              onChange={(e) => setMemberBio(e.target.value)}
                              maxLength={500}
                              placeholder={currentUser?.bio || (lang === 'ar' ? 'اكتب نبذة خاصة بهذا السيرفر...' : 'Write a bio for this server...')}
                              className="w-full rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] resize-none"
                            />
                          </div>

                          {/* Member Avatar */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)]">
                              {lang === 'ar' ? 'صورة الشخصية بالسيرفر' : 'Server Avatar'}
                            </label>
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl bg-[var(--theme-bg-tertiary)] overflow-hidden border border-[var(--theme-border)] shrink-0">
                                {memberAvatarPreview && memberAvatarPreview !== 'REMOVE' ? (
                                  <img
                                    src={memberAvatarPreview}
                                    alt="Avatar"
                                    className="w-full h-full object-cover"
                                  />
                                ) : currentUser?.avatar ? (
                                  <img
                                    src={currentUser.avatar?.startsWith('http') || currentUser.avatar?.startsWith('blob:') ? currentUser.avatar : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`}
                                    alt="Avatar"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <UserIcon className="w-6 h-6 m-3 text-[var(--theme-text-muted)]" />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="px-3.5 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-primary)] text-xs font-bold cursor-pointer transition-all border border-[var(--theme-border)] flex items-center gap-1.5">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>{lang === 'ar' ? 'تغيير صورة السيرفر' : 'Upload Server Avatar'}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      if (e.target.files?.[0]) {
                                        const file = e.target.files[0];
                                        setMemberAvatarFile(file);
                                        setMemberAvatarPreview(URL.createObjectURL(file));
                                      }
                                    }}
                                  />
                                </label>
                                {(memberAvatarPreview || memberAvatarFile) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMemberAvatarFile(null);
                                      setMemberAvatarPreview('REMOVE');
                                    }}
                                    className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold cursor-pointer border border-rose-500/20"
                                  >
                                    {lang === 'ar' ? 'إزالة الصورة' : 'Remove Avatar'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Member Banner */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)]">
                              {lang === 'ar' ? 'غلاف الشخصي بالسيرفر' : 'Server Banner'}
                            </label>
                            <div className="space-y-2">
                              <div className="w-full h-16 rounded-xl bg-[var(--theme-bg-tertiary)] overflow-hidden border border-[var(--theme-border)] relative">
                                {memberBannerPreview && memberBannerPreview !== 'REMOVE' ? (
                                  <img
                                    src={memberBannerPreview}
                                    alt="Banner"
                                    className="w-full h-full object-cover"
                                  />
                                ) : currentUser?.banner ? (
                                  <img
                                    src={currentUser.banner?.startsWith('http') || currentUser.banner?.startsWith('blob:') ? currentUser.banner : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.banner}`}
                                    alt="Banner"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-r from-accent to-accent opacity-60 flex items-center justify-center text-[10px] text-white font-bold">
                                    {lang === 'ar' ? 'غلاف افتراضي' : 'Default Banner'}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="w-full px-3.5 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-primary)] text-xs font-bold cursor-pointer transition-all border border-[var(--theme-border)] flex items-center justify-center gap-1.5">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>{lang === 'ar' ? 'تغيير غلاف السيرفر' : 'Upload Server Banner'}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      if (e.target.files?.[0]) {
                                        const file = e.target.files[0];
                                        setMemberBannerFile(file);
                                        setMemberBannerPreview(URL.createObjectURL(file));
                                      }
                                    }}
                                  />
                                </label>
                                {(memberBannerPreview || memberBannerFile) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMemberBannerFile(null);
                                      setMemberBannerPreview('REMOVE');
                                    }}
                                    className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold cursor-pointer border border-rose-500/20 shrink-0"
                                  >
                                    {lang === 'ar' ? 'إزالة الغلاف' : 'Remove Banner'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <button
                              type="button"
                              onClick={handleResetMemberServerProfile}
                              disabled={serverSaving}
                              className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 text-red-300 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>{lang === 'ar' ? 'إزالة التعديلات واستعادة الافتراضي' : 'Reset Server Profile'}</span>
                            </button>
                            <button
                              type="submit"
                              disabled={serverSaving}
                              className="px-5 py-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-bg-primary,#000000)] text-xs font-extrabold flex items-center gap-2 shadow-md cursor-pointer border-0 transition-all"
                            >
                              <Save className="w-4 h-4" />
                              <span>{serverSaving ? '...' : (lang === 'ar' ? 'حفظ البروفايل' : 'Save Profile Overrides')}</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    );
                  }

                  return (
                    <div className="p-4 rounded-2xl border space-y-4 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                      {/* Launch Advanced Server Settings Button */}
                      {onOpenServerSettings && (
                        <button
                          onClick={() => onOpenServerSettings(selectedServer)}
                          className="w-full p-3.5 rounded-2xl bg-accent/15 hover:bg-accent/25 border border-accent/30 flex items-center justify-between transition-all cursor-pointer shadow-xs mb-2 group"
                        >
                          <div className="flex items-center gap-3">
                            <Shield className="w-5 h-5 text-accent shrink-0" />
                            <div className="text-left rtl:text-right">
                              <span className="font-extrabold text-xs block text-[var(--theme-text-primary)] group-hover:text-accent transition-colors">
                                {lang === 'ar' ? 'فتح إعدادات السيرفر الشاملة (الرتب، الغلاف، الأيقونة)' : 'Open Full Server Settings (Roles, Banner, Icon)'}
                              </span>
                              <span className="text-[10px] text-[var(--theme-text-muted)] font-medium">
                                {lang === 'ar' ? 'إدارة الرتب والصلاحيات، تغيير الغلاف والأيقونة، ودعوات المستخدمين' : 'Manage roles, permissions, server banner, server icon, and invites'}
                              </span>
                            </div>
                          </div>
                          <Sparkles className="w-4 h-4 text-accent shrink-0" />
                        </button>
                      )}

                    {/* Server Header & Delete Server */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/10">
                      <div>
                        <h4 className="font-extrabold text-sm flex items-center gap-2">
                          <ServerIcon className="w-4 h-4 text-accent" />
                          <span>{selectedServer.name}</span>
                        </h4>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {lang === 'ar' ? `القنوات (${serverChannels.length})` : `Channels (${serverChannels.length})`}
                        </span>
                      </div>

                      <button
                        onClick={async () => {
                          if (window.confirm(lang === 'ar' 
                            ? `هل أنت متأكد من حذف السيرفر "${selectedServer.name}"؟ سيتم إخطار جميع الأعضاء بأنه تم حذفه بواسطة مسؤول ولن يكون متاحاً بعد الآن.` 
                            : `Are you sure you want to delete server "${selectedServer.name}"? All users will be notified that it was deleted by an admin and won't be accessible anymore.`)) {
                            await pbService.notifyServerUsersDeleted(selectedServer.id, selectedServer.name, currentUser?.id, lang);
                            if (onDeleteServer) {
                              await onDeleteServer(selectedServer.id);
                            } else {
                              await pbService.deleteServer(selectedServer.id);
                            }
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-500 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                        title={lang === 'ar' ? 'حذف السيرفر وإخطار الأعضاء' : 'Delete server & notify members'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'حذف السيرفر' : 'Delete Server'}</span>
                      </button>
                    </div>

                    {/* SUB-TABS NAVIGATION: channels | banner_icon | roles | server_ui */}
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] overflow-x-auto scrollbar-none">
                      <button
                        onClick={() => setServerSubTab('channels')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 whitespace-nowrap ${
                          serverSubTab === 'channels'
                            ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-sm'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                        }`}
                      >
                        <Hash className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'القنوات والتباطؤ' : 'Channels'}</span>
                      </button>

                      <button
                        onClick={() => setServerSubTab('banner_icon')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 whitespace-nowrap ${
                          serverSubTab === 'banner_icon'
                            ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-sm'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'الغلاف والأيقونة' : 'Banner & Icon'}</span>
                      </button>

                      <button
                        onClick={() => setServerSubTab('roles')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 whitespace-nowrap ${
                          serverSubTab === 'roles'
                            ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-sm'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'الرتب والصلاحيات' : 'Roles & Perms'}</span>
                      </button>

                      <button
                        onClick={() => setServerSubTab('server_ui')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 flex items-center gap-1.5 whitespace-nowrap ${
                          serverSubTab === 'server_ui'
                            ? 'bg-accent text-[var(--theme-accent-contrast,#000000)] shadow-sm'
                            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-channel-hover-bg)]'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'واجهة ودعوات السيرفر' : 'Server UI & Invites'}</span>
                      </button>
                    </div>

                    {/* SUB-TAB 1: CHANNELS */}
                    {serverSubTab === 'channels' && (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-extrabold text-[var(--theme-text-secondary)]">{lang === 'ar' ? 'إدارة قنوات السيرفر والتباطؤ' : 'Manage Server Channels & Cooldowns'}</span>
                          <button
                            onClick={() => setShowAddChannelForm(!showAddChannelForm)}
                            className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#000000)] font-bold text-xs flex items-center gap-1.5 cursor-pointer border-0 shadow-md transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'إضافة قناة' : 'Add Channel'}</span>
                          </button>
                        </div>

                        {/* Inline Add Channel Form */}
                        {showAddChannelForm && (
                          <form onSubmit={handleCreateNewChannelSetting} className="p-3.5 rounded-xl border space-y-3 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold">{lang === 'ar' ? 'إضافة قناة جديدة (نصية)' : 'Add New Channel (Text)'}</span>
                              <button type="button" onClick={() => setShowAddChannelForm(false)} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] border-0 bg-transparent cursor-pointer">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder={lang === 'ar' ? 'اسم القناة' : 'Channel Name'}
                                value={newChanName}
                                onChange={(e) => setNewChanName(e.target.value)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                                required
                              />
                              <input
                                type="text"
                                placeholder={lang === 'ar' ? 'الوصف / الموضوع (اختياري)' : 'Topic (optional)'}
                                value={newChanTopic}
                                onChange={(e) => setNewChanTopic(e.target.value)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setShowAddChannelForm(false)}
                                className="px-3 py-1 rounded-lg text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer border-0"
                              >
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                              </button>
                              <button
                                type="submit"
                                disabled={creatingChan}
                                className="px-4 py-1 rounded-lg bg-accent text-[var(--theme-accent-contrast,#000000)] text-xs font-bold cursor-pointer border-0 shadow-md"
                              >
                                {creatingChan ? '...' : (lang === 'ar' ? 'إنشاء' : 'Create')}
                              </button>
                            </div>
                          </form>
                        )}

                        {/* Channels List */}
                        <div className="space-y-2">
                          {serverChannels.length === 0 ? (
                            <p className="text-xs text-[var(--theme-text-muted)] italic p-2">{lang === 'ar' ? 'لا توجد قنوات في هذا السيرفر' : 'No channels in this server'}</p>
                          ) : (
                            serverChannels.map((ch) => {
                              const cooldown = getChannelCooldownValue(ch);
                              return (
                                <div
                                  key={ch.id}
                                  className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Hash className="w-4 h-4 text-accent shrink-0" />
                                    <div className="truncate">
                                      <span className="font-bold text-xs block truncate text-[var(--theme-text-primary)]">{ch.name}</span>
                                      {ch.topic && <span className="text-[10px] text-[var(--theme-text-muted)] block truncate">{ch.topic}</span>}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {isServerOwner ? (
                                      <div className="flex items-center gap-2">
                                        <label className="text-[11px] font-extrabold text-[var(--theme-text-secondary)] whitespace-nowrap">
                                          {lang === 'ar' ? 'فترة الانتظار:' : 'Cooldown:'}
                                        </label>
                                        <select
                                          value={cooldown}
                                          onChange={(e) => handleUpdateChannelCooldownSetting(ch, Number(e.target.value))}
                                          className="text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none border bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                        >
                                          <option value={0}>{lang === 'ar' ? 'معطل' : 'Off'}</option>
                                          <option value={1}>1 {lang === 'ar' ? 'ثانية' : 'sec'}</option>
                                          <option value={2}>2 {lang === 'ar' ? 'ثانيتين' : 'secs'}</option>
                                          <option value={5}>5 {lang === 'ar' ? 'ثواني' : 'secs'}</option>
                                          <option value={10}>10 {lang === 'ar' ? 'ثواني' : 'secs'}</option>
                                          <option value={30}>30 {lang === 'ar' ? 'ثانية' : 'secs'}</option>
                                        </select>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 italic">
                                        {cooldown > 0 ? `${cooldown}s cooldown` : ''}
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (window.confirm(lang === 'ar' ? `هل أنت متاكد من حذف قناة #${ch.name} بجميع رسائلها والمرفقات؟` : `Are you sure you want to delete #${ch.name} and all its messages and attachments?`)) {
                                          if (onDeleteChannel) {
                                            onDeleteChannel(ch.id);
                                          } else {
                                            await pbService.deleteChannel(ch.id);
                                          }
                                        }
                                      }}
                                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer"
                                      title={lang === 'ar' ? 'حذف القناة' : 'Delete Channel'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 2: BANNER & ICON */}
                    {serverSubTab === 'banner_icon' && (
                      <form onSubmit={handleSaveServerBranding} className="space-y-4">
                        {serverSuccessMsg && (
                          <div className="p-3 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-accent text-xs font-bold flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            <span>{serverSuccessMsg}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Server Icon Upload & Preview */}
                          <div className="p-4 rounded-xl border space-y-3 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-accent" />
                              <span>{lang === 'ar' ? 'أيقونة السيرفر (Server Icon)' : 'Server Icon'}</span>
                            </label>
                            <div className="flex items-center gap-3">
                              <div className="w-16 h-16 rounded-2xl bg-[var(--theme-bg-tertiary)] overflow-hidden border border-[var(--theme-border)] flex items-center justify-center shrink-0">
                                {serverIconPreview || getServerIconUrl(selectedServer) ? (
                                  <img src={serverIconPreview || getServerIconUrl(selectedServer)} alt="Icon" className="w-full h-full object-cover" />
                                ) : (
                                  <ServerIcon className="w-8 h-8 text-[var(--theme-text-muted)]" />
                                )}
                              </div>
                              <label className="px-3.5 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-primary)] text-xs font-bold transition-all cursor-pointer border border-[var(--theme-border)] flex items-center gap-1.5">
                                <Upload className="w-3.5 h-3.5" />
                                <span>{lang === 'ar' ? 'تغيير الأيقونة' : 'Upload Icon'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                      const file = e.target.files[0];
                                      setServerIconFile(file);
                                      setServerIconPreview(URL.createObjectURL(file));
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          </div>

                          {/* Server Banner Upload & Preview */}
                          <div className="p-4 rounded-xl border space-y-3 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-2">
                              <ImageIcon className="w-4 h-4 text-accent" />
                              <span>{lang === 'ar' ? 'غلاف السيرفر (Server Banner)' : 'Server Banner'}</span>
                            </label>
                            <div className="space-y-2">
                              <div className="w-full h-20 rounded-xl bg-[var(--theme-bg-tertiary)] overflow-hidden border border-[var(--theme-border)] relative flex items-center justify-center">
                                {serverBannerPreview || selectedServer.banner ? (
                                  <img src={serverBannerPreview || (selectedServer.banner?.startsWith('http') ? selectedServer.banner : `${pbService.getServerUrl()}/api/files/servers/${selectedServer.id}/${selectedServer.banner}`)} alt="Banner" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] text-[var(--theme-text-muted)]">{lang === 'ar' ? 'لا يوجد غلاف' : 'No banner set'}</span>
                                )}
                              </div>
                              <label className="w-full px-3.5 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-primary)] text-xs font-bold transition-all cursor-pointer border border-[var(--theme-border)] flex items-center justify-center gap-1.5">
                                <Upload className="w-3.5 h-3.5" />
                                <span>{lang === 'ar' ? 'تغيير غلاف السيرفر' : 'Upload Banner'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                      const file = e.target.files[0];
                                      setServerBannerFile(file);
                                      setServerBannerPreview(URL.createObjectURL(file));
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Name & Description */}
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)] block mb-1">{lang === 'ar' ? 'اسم السيرفر:' : 'Server Name:'}</label>
                            <input
                              type="text"
                              value={serverEditName}
                              onChange={(e) => setServerEditName(e.target.value)}
                              className="w-full rounded-xl px-3.5 py-2 text-xs font-bold border focus:outline-none focus:border-accent bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                              required
                            />
                          </div>

                          <div>
                            <label className="text-xs font-bold text-[var(--theme-text-secondary)] block mb-1">{lang === 'ar' ? 'وصف السيرفر:' : 'Description:'}</label>
                            <textarea
                              rows={2}
                              value={serverEditDesc}
                              onChange={(e) => setServerEditDesc(e.target.value)}
                              className="w-full rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="submit"
                            disabled={serverSaving}
                            className="px-5 py-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] text-xs font-extrabold flex items-center gap-2 shadow-md cursor-pointer border-0 transition-all"
                          >
                            <Save className="w-4 h-4" />
                            <span>{serverSaving ? '...' : (lang === 'ar' ? 'حفظ الأيقونة والغلاف' : 'Save Banner & Icon')}</span>
                          </button>
                        </div>
                      </form>
                    )}

                    {/* SUB-TAB 3: ROLES & PERMISSIONS */}
                    {serverSubTab === 'roles' && (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-400">{lang === 'ar' ? 'إدارة رتب السيرفر والصلاحيات' : 'Server Roles & Permissions'}</span>
                            <span className="text-[10px] text-slate-500">{lang === 'ar' ? 'أنشئ رتباً مخصصة مع ألوان ورموز تعبيرية وصلاحيات محددة' : 'Create roles with emojis, colors, and permissions'}</span>
                          </div>
                          <button
                            onClick={() => {
                              setEditingRole(null);
                              setRoleName('');
                              setRoleEmoji('🛡️');
                              setRoleColor('#3b82f6');
                              setShowCreateRole(true);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-0 shadow-md"
                          >
                            <Plus className="w-4 h-4" />
                            <span>{lang === 'ar' ? 'إضافة رتبة جديدة' : 'Create Role'}</span>
                          </button>
                        </div>

                        {/* Role Form */}
                        {(showCreateRole || editingRole) && (
                          <form onSubmit={handleSaveRole} className="p-4 rounded-2xl border space-y-4 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-xs flex items-center gap-2">
                                <Shield className="w-4 h-4 text-accent" />
                                <span>{editingRole ? (lang === 'ar' ? `تعديل رتبة: ${editingRole.name}` : `Edit Role: ${editingRole.name}`) : (lang === 'ar' ? 'إنشاء رتبة جديدة' : 'New Role Details')}</span>
                              </span>
                              <button type="button" onClick={() => { setShowCreateRole(false); setEditingRole(null); }} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer border-0 bg-transparent">
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-[var(--theme-text-secondary)] block mb-1">{lang === 'ar' ? 'اسم الرتبة' : 'Role Name'}</label>
                                <input
                                  type="text"
                                  value={roleName}
                                  onChange={(e) => setRoleName(e.target.value)}
                                  className="w-full rounded-xl px-3 py-1.5 text-xs font-bold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                  required
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-[var(--theme-text-secondary)] block mb-1">{lang === 'ar' ? 'الرمز التعبيري' : 'Role Emoji'}</label>
                                <input
                                  type="text"
                                  value={roleEmoji}
                                  onChange={(e) => setRoleEmoji(e.target.value)}
                                  className="w-full rounded-xl px-3 py-1.5 text-xs font-bold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-[var(--theme-text-secondary)] block mb-1">
                                  {lang === 'ar' ? 'لون اسم المستخدم لهذه الرتبة' : 'Role & Username Color'}
                                </label>
                                <p className="text-[10px] text-[var(--theme-text-muted)] mb-1.5 leading-tight">
                                  {lang === 'ar'
                                    ? 'اختر لون اسم المستخدم لأعضاء هذه الرتبة. الرتبة المطبقة أخيراً تحدد لون اسم العضو.'
                                    : 'Select the color for member usernames with this role. The last applied role defines the username color.'}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#777777', '#64748b'].map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => setRoleColor(c)}
                                      style={{ backgroundColor: c }}
                                      className={`w-6 h-6 rounded-lg cursor-pointer border-2 transition-all ${
                                        roleColor === c ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                                      }`}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    value={roleColor}
                                    onChange={(e) => setRoleColor(e.target.value)}
                                    className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent"
                                    title={lang === 'ar' ? 'اختر لون مخصص لاسم المستخدم' : 'Choose custom username color'}
                                  />
                                  <span className="text-[10px] font-mono text-[var(--theme-text-muted)]">{roleColor}</span>
                                </div>
                              </div>
                            </div>

                            {/* Permissions Checkboxes */}
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider block">{lang === 'ar' ? 'صلاحيات الرتبة:' : 'Role Permissions:'}</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer text-[var(--theme-text-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.send_messages}
                                    onChange={(e) => setRolePerms({ ...rolePerms, send_messages: e.target.checked })}
                                  />
                                  <span>{lang === 'ar' ? 'إرسال الرسائل' : 'Send Messages'}</span>
                                </label>
                                <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer text-[var(--theme-text-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.manage_channels}
                                    onChange={(e) => setRolePerms({ ...rolePerms, manage_channels: e.target.checked })}
                                  />
                                  <span>{lang === 'ar' ? 'إدارة القنوات' : 'Manage Channels'}</span>
                                </label>
                                <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer text-[var(--theme-text-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.manage_roles}
                                    onChange={(e) => setRolePerms({ ...rolePerms, manage_roles: e.target.checked })}
                                  />
                                  <span>{lang === 'ar' ? 'إدارة الرتب' : 'Manage Roles'}</span>
                                </label>
                                <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer text-[var(--theme-text-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.manage_server}
                                    onChange={(e) => setRolePerms({ ...rolePerms, manage_server: e.target.checked })}
                                  />
                                  <span>{lang === 'ar' ? 'إدارة السيرفر' : 'Manage Server'}</span>
                                </label>
                                <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer text-[var(--theme-text-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.kick_members}
                                    onChange={(e) => setRolePerms({ ...rolePerms, kick_members: e.target.checked })}
                                  />
                                  <span>{lang === 'ar' ? 'طرد الأعضاء' : 'Kick Members'}</span>
                                </label>
                                <label className="flex items-center gap-2 p-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] cursor-pointer text-[var(--theme-text-primary)]">
                                  <input
                                    type="checkbox"
                                    checked={rolePerms.pin_messages}
                                    onChange={(e) => setRolePerms({ ...rolePerms, pin_messages: e.target.checked })}
                                  />
                                  <span>{lang === 'ar' ? 'تثبيت الرسائل' : 'Pin Messages'}</span>
                                </label>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => { setShowCreateRole(false); setEditingRole(null); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 cursor-pointer border-0"
                              >
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                              </button>
                              <button
                                type="submit"
                                disabled={serverSaving}
                                className="px-4 py-1.5 rounded-lg bg-accent text-[var(--theme-accent-contrast,#000000)] text-xs font-bold cursor-pointer border-0 shadow-md"
                              >
                                {lang === 'ar' ? 'حفظ الرتبة' : 'Save Role'}
                              </button>
                            </div>
                          </form>
                        )}

                        {/* Roles List */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{lang === 'ar' ? 'الرتب الحالية:' : 'Current Roles:'}</span>
                          {rolesList.length === 0 ? (
                            <p className="text-xs text-slate-500 italic p-2">{lang === 'ar' ? 'لا توجد رتب مخصصة بعد' : 'No custom roles created yet'}</p>
                          ) : (
                            rolesList.map((role) => (
                              <div
                                key={role.id}
                                className="p-3 rounded-xl border flex items-center justify-between transition-all bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-base">{role.emoji || '🛡️'}</span>
                                  <div className="flex flex-col">
                                    <span className="font-extrabold text-xs" style={{ color: role.color || '#3b82f6' }}>{role.name}</span>
                                    <span className="text-[10px] text-slate-500">
                                      {Object.entries(role.permissions || {}).filter(([_, v]) => v).map(([k]) => k).join(', ')}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingRole(role);
                                      setRoleName(role.name);
                                      setRoleEmoji(role.emoji || '🛡️');
                                      setRoleColor(role.color || '#3b82f6');
                                      setRolePerms({
                                        send_messages: true,
                                        manage_channels: false,
                                        manage_roles: false,
                                        manage_server: false,
                                        kick_members: false,
                                        pin_messages: true,
                                        ...role.permissions
                                      });
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer border-0"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRole(role.id)}
                                    className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-600 cursor-pointer border-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Assign Roles to Members */}
                        <div className="space-y-3 pt-4 border-t border-white/5">
                          <span className="text-xs font-extrabold text-slate-400 flex items-center gap-2">
                            <Users className="w-4 h-4 text-accent" />
                            <span>{lang === 'ar' ? 'تعيين الرتب لأعضاء السيرفر:' : 'Assign Roles to Server Members:'}</span>
                          </span>

                          <div className="space-y-2">
                            {serverMembers.map((m) => {
                              const memberRoles = (m.role || m.role_id || localStorage.getItem(`member_role_${selectedServer.id}_${m.user || m.id}`) || '').split(',').map((s) => s.trim()).filter(Boolean);

                              return (
                                <div
                                  key={m.id || m.user}
                                  className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-medium bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-extrabold text-xs truncate">
                                      {m.expand?.user?.display_name || m.expand?.user?.username || m.user || 'Member'}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                                    {rolesList.length === 0 ? (
                                      <span className="text-[10px] text-slate-500 italic">
                                        {lang === 'ar' ? 'أنشئ رتبة أولاً' : 'Create a role first'}
                                      </span>
                                    ) : (
                                      rolesList.map((r) => {
                                        const isSelected = memberRoles.includes(r.id) || memberRoles.includes(r.name);
                                        return (
                                          <button
                                            key={r.id}
                                            type="button"
                                            onClick={async () => {
                                              let nextRoles: string[];
                                              if (isSelected) {
                                                nextRoles = memberRoles.filter((tok) => tok !== r.id && tok !== r.name);
                                              } else {
                                                nextRoles = [...memberRoles, r.name];
                                              }
                                              const newRoleStr = nextRoles.join(',');
                                              await handleAssignRoleToMember(m.user || m.id, newRoleStr);
                                            }}
                                            style={{
                                              backgroundColor: isSelected ? (r.color ? `${r.color}30` : 'var(--accent-glow)') : 'transparent',
                                              borderColor: isSelected ? (r.color || 'var(--accent-color)') : (isLight ? '#cbd5e1' : 'rgba(255,255,255,0.1)'),
                                              color: isSelected ? (r.color || 'var(--accent-color)') : 'inherit'
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-all ${
                                              isSelected ? 'shadow-xs ring-1 ring-accent' : 'opacity-60 hover:opacity-100'
                                            }`}
                                          >
                                            <span>{r.emoji || '🛡️'}</span>
                                            <span>{r.name}</span>
                                            {isSelected && <Check className="w-3 h-3 text-accent" />}
                                          </button>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* SUB-TAB 4: SERVER UI & USER INVITES */}
                    {serverSubTab === 'server_ui' && (
                      <div className="space-y-6">
                        {/* Server Password Lock */}
                        <div className="p-4 rounded-xl border space-y-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-accent" />
                            <span className="font-extrabold text-xs">{lang === 'ar' ? 'قفل السيرفر وكلمة المرور' : 'Server Lock & Password'}</span>
                          </div>
                          <p className="text-[10px] text-[var(--theme-text-muted)]">
                            {lang === 'ar' ? 'السيرفرات الخاصة التي لها كلمة مرور تكون مخفية ومغلقة لا تظهر في الاستكشاف العام.' : 'Private locked servers require a password to join.'}
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder={lang === 'ar' ? 'كلمة مرور السيرفر (اتركه فارغاً للسيرفرات العامة)' : 'Server Password (leave empty for public)'}
                              value={serverEditPassword}
                              onChange={(e) => setServerEditPassword(e.target.value)}
                              className="flex-1 rounded-xl px-3.5 py-2 text-xs font-bold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                            />
                            <button
                              type="button"
                              onClick={handleSaveServerBranding}
                              disabled={serverSaving}
                              className="px-4 py-2 rounded-xl bg-accent text-[var(--theme-accent-contrast,#000000)] text-xs font-bold cursor-pointer border-0 shadow-md"
                            >
                              {lang === 'ar' ? 'حفظ' : 'Save'}
                            </button>
                          </div>
                        </div>

                        {/* Direct User Invites System */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-accent" />
                            <span className="font-extrabold text-xs">{lang === 'ar' ? 'دعوة مستخدم محدد بالاسم' : 'Direct User Invites'}</span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            {lang === 'ar' ? 'إرسال دعوة خاصة لمستخدم محدد بـ User ID، مع متابعة حالة الانتظار الانضمام.' : 'Send exclusive direct invite to a specific user and track waiting status.'}
                          </p>

                          {/* User Search Input */}
                          <div className="relative">
                            <input
                              type="text"
                              placeholder={lang === 'ar' ? 'ابحث عن اسم المستخدم لإرسال دعوة خاصة...' : 'Search username to send invite...'}
                              value={inviteSearchUser}
                              onChange={(e) => handleUserSearchForInvite(e.target.value)}
                              className="w-full rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                            />
                            {searchResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-xl overflow-hidden shadow-2xl z-20">
                                {searchResults.map((u) => (
                                  <button
                                    key={u.id}
                                    onClick={() => handleSendServerInviteOption(u)}
                                    className="w-full p-2.5 text-left hover:bg-[var(--theme-bg-tertiary)] flex items-center justify-between text-xs cursor-pointer border-0 text-[var(--theme-text-primary)]"
                                  >
                                    <span className="font-bold">{u.display_name || u.username} (@{u.username})</span>
                                    <span className="text-[10px] text-accent font-bold">{lang === 'ar' ? 'إرسال دعوة' : 'Send Invite'}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Existing Invites List */}
                          <div className="space-y-2 pt-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{lang === 'ar' ? 'سجل الدعوات المرسلة:' : 'Sent Invites:'}</span>
                            {serverOptions.length === 0 ? (
                              <p className="text-xs text-slate-500 italic p-2">{lang === 'ar' ? 'لا توجد دعوات قائمة حالياً' : 'No active invites'}</p>
                            ) : (
                              serverOptions.map((opt) => (
                                <div
                                  key={opt.id}
                                  className="p-3 rounded-xl border flex items-center justify-between bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                                >
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-amber-400" />
                                    <span className="font-bold text-xs">
                                      {lang === 'ar' ? `دعوة للمستخدم: ${opt.invited_user_id}` : `Invite for user: ${opt.invited_user_id}`}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                      opt.status === 'joined' ? 'bg-[var(--theme-bg-tertiary)] text-accent' : 'bg-amber-500/20 text-amber-400'
                                    }`}>
                                      {opt.status === 'waiting' ? (lang === 'ar' ? 'في انتظار انضمام الشريك' : 'Waiting for user to join') : (lang === 'ar' ? 'تم الانضمام' : 'Joined')}
                                    </span>

                                    <button
                                      onClick={async () => {
                                        try {
                                          await pbService.deleteServerOptionInvite(opt.id);
                                          setServerOptions((prev) => prev.filter((o) => o.id !== opt.id));
                                        } catch (e) {
                                          console.warn(e);
                                        }
                                      }}
                                      className="p-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-600 cursor-pointer border-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              </div>
            )}

            {/* 2. LANGUAGE & REGION TAB */}
            {activeTab === 'language' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-accent" />
                    <span className="text-[var(--theme-text-primary)]">{lang === 'ar' ? 'لغة التطبيق والواجهة' : 'Application Language'}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'ar', label: 'العربية (Arabic)', flag: '🇸🇾' },
                      { id: 'en', label: 'English (US)', flag: '🇺🇸' }
                    ].map((l) => (
                      <button
                        key={l.id}
                        onClick={() => {
                          setLang(l.id as 'en' | 'ar');
                          updatePartialSettings('languageRegion', { appLanguage: l.id });
                        }}
                        className={`p-4 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          localSettings.languageRegion.appLanguage === l.id
                            ? 'border-accent bg-accent-subtle ring-2 ring-accent/30'
                            : 'border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-channel-hover-bg)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">{l.flag}</span>
                          <span className="font-extrabold text-xs text-[var(--theme-text-primary)]">{l.label}</span>
                        </div>
                        {localSettings.languageRegion.appLanguage === l.id && <Check className="w-4 h-4 text-accent" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-[var(--theme-text-secondary)]">
                      {lang === 'ar' ? 'تنسيق التاريخ' : 'Date Format'}
                    </label>
                    <select
                      value={localSettings.languageRegion.dateFormat}
                      onChange={(e) => updatePartialSettings('languageRegion', { dateFormat: e.target.value })}
                      className="w-full p-3 rounded-xl border text-xs font-medium bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD (2026-07-23)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (07/23/2026)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (23/07/2026)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-[var(--theme-text-secondary)]">
                      {lang === 'ar' ? 'تنسيق الوقت' : 'Time Format'}
                    </label>
                    <select
                      value={localSettings.languageRegion.timeFormat}
                      onChange={(e) => updatePartialSettings('languageRegion', { timeFormat: e.target.value })}
                      className="w-full p-3 rounded-xl border text-xs font-medium bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    >
                      <option value="12h">{lang === 'ar' ? '12 ساعة (AM/PM)' : '12-hour (AM/PM)'}</option>
                      <option value="24h">{lang === 'ar' ? '24 ساعة' : '24-hour'}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 3. CHAT TAB */}
            {activeTab === 'chat' && (
              <div className="space-y-4">
                {[
                  { key: 'enterToSend', title: lang === 'ar' ? 'مفتاح Enter للإرسال' : 'Enter to Send', desc: lang === 'ar' ? 'اضغط Enter لإرسال الرسالة مباشرة' : 'Press Enter to submit messages immediately' },
                  { key: 'showScrollInChats', title: lang === 'ar' ? 'إظهار شريط التمرير في المحادثات' : 'Show scroll in chats', desc: lang === 'ar' ? 'إظهار شريط Scroll للماوس لتسهيل التصفح بدون عجلة الماوس' : 'Show visible scrollbar in chat feeds for users with broken mouse wheel' },
                  { key: 'readReceipts', title: lang === 'ar' ? 'إيصالات القراءة' : 'Read Receipts', desc: lang === 'ar' ? 'إظهار علامة القراءة على الرسائل' : 'Send read receipts when viewing channels' },
                  { key: 'linkPreviews', title: lang === 'ar' ? 'معاينة الروابط تلقائياً' : 'Link Previews', desc: lang === 'ar' ? 'توليد بطاقات معاينة للروابط المدرجة' : 'Automatically generate cards for URLs' },
                  { key: 'mediaAutoplay', title: lang === 'ar' ? 'تشغيل وسائط GIF والصوت تلقائياً' : 'Media Autoplay', desc: lang === 'ar' ? 'تشغيل الصور المتحركة فور ظهورها' : 'Autoplay GIFs and voice notes' },
                  { key: 'notificationSounds', title: lang === 'ar' ? 'أصوات التنبيه للدردشة' : 'Chat Sound FX', desc: lang === 'ar' ? 'تشغيل نغمة عند وصول أو إرسال الرسائل' : 'Play audio effects on message received' },
                ].map((item) => (
                  <div key={item.key} className="p-4 rounded-2xl border flex items-center justify-between gap-4 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                    <div>
                      <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">{item.title}</h4>
                      <p className="text-[10px] mt-0.5 text-[var(--theme-text-muted)]">{item.desc}</p>
                    </div>
                    <button
                      dir="ltr"
                      onClick={() => updatePartialSettings('chat', { [item.key]: !(localSettings.chat as any)[item.key] })}
                      className={`ui-toggle-switch ${(localSettings.chat as any)[item.key] ? 'is-on' : 'is-off'}`}
                    >
                      <div className="ui-toggle-thumb" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 4. NOTIFICATIONS TAB */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                {/* System Notification Permission Status Banner */}
                <div className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-accent/10 border-accent/30 text-[var(--theme-text-primary)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center shrink-0 border border-accent/30">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                        {lang === 'ar' ? 'صلاحية إشعارات النظام والنظام الأندرويد' : 'Android & System Notification Permission'}
                      </h4>
                      <p className="text-[10px] mt-0.5 text-[var(--theme-text-muted)]">
                        {lang === 'ar'
                          ? 'تفعيل استقبال التنبيهات في شريط الإشعارات للنظام والأندرويد لطلبات الصداقة والرسائل'
                          : 'Allow system & Android tray alerts for friend requests, direct messages, and mentions'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      const granted = await notificationService.requestPermission();
                      if (granted) {
                        alert(lang === 'ar' ? 'تم منح صلاحيات الإشعارات بنجاح! 🎉' : 'Notification permissions granted successfully! 🎉');
                      } else {
                        alert(lang === 'ar' ? 'صلاحية الإشعارات غير مفعلة في إعدادات جهازك. يرجى تفعيلها من إعدادات أندرويد.' : 'Notification permission is denied. Please enable it in Android app settings.');
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs transition-all border-0 cursor-pointer shrink-0 shadow-sm"
                  >
                    {lang === 'ar' ? 'تفعيل / طلب الصلاحية' : 'Request Permission'}
                  </button>
                </div>

                {(() => {
                  const isMobile = typeof window !== 'undefined' && (
                    'ontouchstart' in window ||
                    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
                    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
                  );

                  const generalItems = [
                    { key: 'pushNotifications', title: lang === 'ar' ? 'إشعارات المنبثقة (Push Notifications)' : 'Push Notifications', desc: lang === 'ar' ? 'تلقي إشعارات على سطح المكتب والمتصفح' : 'Receive system push popups' },
                    { key: 'serverNotifications', title: lang === 'ar' ? 'إشعارات السيرفرات والقنوات' : 'Server Alerts', desc: lang === 'ar' ? 'تلقي تنبيهات للرسائل الجديدة في السيرفر' : 'Notify on new channel activity' },
                    ...(isMobile ? [{ key: 'vibration', title: lang === 'ar' ? 'اهتزاز الجهاز' : 'Vibration Feedback', desc: lang === 'ar' ? 'تفعيل اهتزاز الهاتف عند التنبيهات' : 'Vibrate device on incoming pings' }] : []),
                    { key: 'badgeCount', title: lang === 'ar' ? 'عداد الرسائل غير المقروءة' : 'Unread Badge Counter', desc: lang === 'ar' ? 'إظهار شارة الأرقام العامة على القنوات' : 'Show red unread counter chips' },
                  ];

                  const mentionItems = [
                    { key: 'mentionNotifications', title: lang === 'ar' ? 'إشعارات الإشارة (@Mentions)' : 'Mention Notifications', desc: lang === 'ar' ? 'تفعيل وتلقي التنبيهات عند الإشارة إليك (@اسمك)' : 'Enable notifications for @mentions' },
                    { key: 'replyNotifications', title: lang === 'ar' ? 'إشعارات الردود (Replies)' : 'Reply Notifications', desc: lang === 'ar' ? 'تفعيل وتلقي التنبيهات عندما يرد شخص على رسالتك' : 'Enable notifications when someone replies to you' },
                    { key: 'mentionBadges', title: lang === 'ar' ? 'شارات الإشارة للسيرفر والقناة' : 'Server & Channel Mention Badges', desc: lang === 'ar' ? 'إظهار شارة الإشارات الحمراء على السيرفر والقناة' : 'Show red mention badges on servers and channels' },
                    { key: 'mentionBlinking', title: lang === 'ar' ? 'مؤشرات الإشارة المضيئة/المتحركة' : 'Blinking Mention Indicators', desc: lang === 'ar' ? 'وميض وحركة التنبيهات عند وجود إشارة غير مقروءة' : 'Animate and pulse mention indicators' },
                    { key: 'mentionHighlight', title: lang === 'ar' ? 'تمييز الرسالة المؤقت في المحادثة' : 'Temporary Mention Message Highlight', desc: lang === 'ar' ? 'تظليل الرسالة المشار إليها مؤقتاً عند فتح القناة (3-5 ثوانٍ)' : 'Temporarily highlight mentioned messages in chat' },
                    { key: 'mentionSounds', title: lang === 'ar' ? 'أصوات الإشارة والردود' : 'Mention Sounds', desc: lang === 'ar' ? 'تشغيل نغمة تنبيه عند تلقي إشارة أو رد' : 'Play audio ping when mentioned or replied to' },
                    { key: 'desktopMentions', title: lang === 'ar' ? 'إشعارات سطح المكتب للإشارات' : 'Desktop Notifications for Mentions', desc: lang === 'ar' ? 'إرسال إشعارات النظام على المتصفح عند الإشارة' : 'Send system popups for mentions' },
                  ];

                  const renderToggleList = (items: typeof generalItems) => items.map((item) => (
                    <div key={item.key} className="p-4 rounded-2xl border flex items-center justify-between gap-4 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                      <div>
                        <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">{item.title}</h4>
                        <p className="text-[10px] mt-0.5 text-[var(--theme-text-muted)]">{item.desc}</p>
                      </div>
                      <button
                        dir="ltr"
                        onClick={() => updatePartialSettings('notifications', { [item.key]: !(localSettings.notifications as any)[item.key] })}
                        className={`ui-toggle-switch ${(localSettings.notifications as any)[item.key] ? 'is-on' : 'is-off'}`}
                      >
                        <div className="ui-toggle-thumb" />
                      </button>
                    </div>
                  ));

                  return (
                    <>
                      {/* General Notifications Section */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--theme-text-secondary)]">
                          {lang === 'ar' ? 'الإشعارات العامة' : 'General Notifications'}
                        </h3>
                        <div className="space-y-3">
                          {renderToggleList(generalItems)}
                        </div>
                      </div>

                      {/* Mentions & Replies Section */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500" />
                          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--theme-text-primary)]">
                            {lang === 'ar' ? 'الإشارات والردود (Mentions & Replies)' : 'Mentions & Replies'}
                          </h3>
                        </div>
                        <div className="space-y-3">
                          {renderToggleList(mentionItems)}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* 5. ACCESSIBILITY TAB */}
            {activeTab === 'accessibility' && (
              <div className="space-y-4">
                {[
                  { key: 'highContrast', title: lang === 'ar' ? 'وضع التباين العالي (High Contrast)' : 'High Contrast UI', desc: lang === 'ar' ? 'إبراز الحدود والنصوص بتباين شديد للرؤية الفائقة' : 'Enhance borders and contrast across all controls' },
                  { key: 'reducedMotion', title: lang === 'ar' ? 'تقليل الحركة والأنيميشن' : 'Reduced Motion', desc: lang === 'ar' ? 'إيقاف وتعطيل الانتقالات الحركية لتوفير أداء سلس ومريح' : 'Disable bouncy transitions and non-essential animations' },
                  { key: 'screenReader', title: lang === 'ar' ? 'تحسينات قارئ الشاشة (Screen Reader)' : 'Screen Reader Optimized', desc: lang === 'ar' ? 'تضمين علامات ARIA وإرشادات القراءة الصوتية لعناصر التحكم' : 'Expose explicit ARIA labels and speech navigation prompts' },
                ].map((item) => (
                  <div key={item.key} className="p-4 rounded-2xl border flex items-center justify-between gap-4 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                    <div>
                      <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">{item.title}</h4>
                      <p className="text-[10px] mt-0.5 text-[var(--theme-text-muted)]">{item.desc}</p>
                    </div>
                    <button
                      dir="ltr"
                      role="switch"
                      aria-checked={Boolean((localSettings.accessibility as any)[item.key])}
                      aria-label={item.title}
                      onClick={() => updatePartialSettings('accessibility', { [item.key]: !(localSettings.accessibility as any)[item.key] })}
                      className={`ui-toggle-switch ${(localSettings.accessibility as any)[item.key] ? 'is-on' : 'is-off'}`}
                    >
                      <div className="ui-toggle-thumb" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 6. PRIVACY TAB */}
            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-[var(--theme-text-secondary)]">
                    {lang === 'ar' ? 'من يمكنه رؤية حالتك عبر الإنترنت؟' : 'Who can see your online status?'}
                  </label>
                  <select
                    value={localSettings.privacy.onlineStatus}
                    onChange={(e) => updatePartialSettings('privacy', { onlineStatus: e.target.value })}
                    className="w-full p-3 rounded-xl border text-xs font-medium bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                  >
                    <option value="everyone">{lang === 'ar' ? 'الجميع' : 'Everyone'}</option>
                    <option value="friends">{lang === 'ar' ? 'الأصدقاء والسيرفرات المشتركة' : 'Friends & Server Members'}</option>
                    <option value="nobody">{lang === 'ar' ? 'لا أحد (مخفي)' : 'Nobody (Invisible)'}</option>
                  </select>
                </div>

                <div className="p-4 rounded-2xl border flex items-center justify-between gap-4 opacity-80 cursor-not-allowed bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-amber-500/80 shrink-0" />
                      <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                        {lang === 'ar' ? 'المصادقة الثنائية (Two-Factor Authentication)' : 'Two-Factor Authentication'}
                      </h4>
                    </div>
                    <p className="text-[10px] mt-0.5 text-[var(--theme-text-muted)]">
                      {lang === 'ar' ? 'ستكون خيارات المصادقة الثنائية (2FA) متاحة في التحديث القادم.' : 'Two-Factor Authentication (2FA) will be available in an upcoming update.'}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 font-bold text-[10px] border border-amber-500/20 shrink-0">
                    {lang === 'ar' ? 'قريباً' : 'Coming Soon'}
                  </span>
                </div>
              </div>
            )}

            {/* 7. STORAGE & DATA TAB */}
            {activeTab === 'storage' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl border bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--theme-text-secondary)]">{lang === 'ar' ? 'حجم الذاكرة المؤقتة' : 'Cache Usage'}</span>
                      <HardDrive className="w-4 h-4 text-accent" />
                    </div>
                    <div className="font-black text-2xl mt-2 text-[var(--theme-text-primary)]">
                      {storageStats.cacheUsage}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--theme-text-secondary)]">{lang === 'ar' ? 'الوسائط المحملة' : 'Downloaded Media'}</span>
                      <Database className="w-4 h-4 text-accent" />
                    </div>
                    <div className="font-black text-xl mt-2 text-[var(--theme-text-primary)]">
                      {storageStats.downloadedMedia}
                    </div>
                  </div>
                </div>

                {/* DOWNLOAD DIRECTORY LOCATION CARD */}
                <div className="p-4 rounded-2xl border bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Download className="w-5 h-5 text-accent shrink-0" />
                      <div>
                        <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                          {lang === 'ar' ? 'مجلد التنزيلات المحدد' : 'Download Storage Directory'}
                        </h4>
                        <p className="text-[10px] text-[var(--theme-text-muted)]">
                          {lang === 'ar' ? 'مسار تخزين الملفات المحملة والوسائط محلياً' : 'Local folder path where downloaded files and media are stored'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ms-auto">
                      <button
                        type="button"
                        onClick={async () => {
                          const opened = await openDownloadDirectory();
                          if (!opened) {
                            alert(lang === 'ar' ? `المجلد: ${downloadDirectoryPath}` : `Folder: ${downloadDirectoryPath}`);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)] text-xs font-bold text-[var(--theme-text-primary)] transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Folder className="w-3.5 h-3.5 text-accent" />
                        <span>{lang === 'ar' ? 'فتح المجلد' : 'Open Directory'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomDirInput(getCustomDownloadDirSetting() || downloadDirectoryPath);
                          setIsEditingDownloadDir(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-accent text-[var(--theme-accent-contrast,#000000)] font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer border-0 shadow-md flex items-center gap-1.5"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'تغيير المسار' : 'Change Location'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] font-mono text-xs text-accent font-bold truncate">
                    {downloadDirectoryPath || 'SirverData/Downloads'}
                  </div>

                  {isEditingDownloadDir && (
                    <div className="p-3.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] space-y-3 animate-fadeIn">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[var(--theme-text-primary)] block">
                          {lang === 'ar' ? 'إدخال مسار التخزين الجديد:' : 'Enter New Download Path:'}
                        </label>
                        <input
                          type="text"
                          value={customDirInput}
                          onChange={(e) => setCustomDirInput(e.target.value)}
                          placeholder="e.g. D:\Downloads\SirverData"
                          className="w-full px-3 py-2 rounded-lg border text-xs font-mono bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)] outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={async () => {
                            setCustomDownloadDirSetting(null);
                            setCustomDirInput('');
                            await ensureDownloadDirectoryExists();
                            const defaultPath = await getDownloadDirectory();
                            setDownloadDirectoryPath(defaultPath);
                            setIsEditingDownloadDir(false);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[var(--theme-border)] text-[11px] font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] cursor-pointer"
                        >
                          {lang === 'ar' ? 'استعادة الافتراضي' : 'Reset to Default'}
                        </button>

                        <div className="flex items-center gap-2 ms-auto">
                          <button
                            type="button"
                            onClick={() => setIsEditingDownloadDir(false)}
                            className="px-3 py-1.5 rounded-lg border border-[var(--theme-border)] text-[11px] font-bold text-[var(--theme-text-muted)] cursor-pointer"
                          >
                            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const trimmed = customDirInput.trim();
                              setCustomDownloadDirSetting(trimmed || null);
                              await ensureDownloadDirectoryExists();
                              const newPath = await getDownloadDirectory();
                              setDownloadDirectoryPath(newPath);
                              setIsEditingDownloadDir(false);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-accent text-[var(--theme-accent-contrast,#000000)] font-bold text-[11px] cursor-pointer border-0 shadow-md"
                          >
                            {lang === 'ar' ? 'حفظ' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                  isLight ? 'bg-accent/10 border-accent/20' : 'bg-accent/15 border-accent/30'
                }`}>
                  <div>
                    <h4 className={`font-extrabold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {lang === 'ar' ? 'تنظيف الذاكرة المؤقتة (Clear Cache)' : 'Clear Temporary Cache'}
                    </h4>
                    <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                      {lang === 'ar' ? 'مسح البيانات المؤقتة المخزنة لزيادة السرعة وتحرير المساحة' : 'Free local storage space instantly by clearing temporary app caches'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="px-4 py-2.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#000000)] font-bold text-xs transition-all cursor-pointer border-0 shadow-md flex items-center gap-1.5 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{cacheCleared ? (lang === 'ar' ? 'تم الفحص!' : 'Done!') : (lang === 'ar' ? 'مسح الآن' : 'Clear Cache')}</span>
                  </button>
                </div>

                {cacheClearMessage && (
                  <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 text-accent text-xs font-bold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{cacheClearMessage}</span>
                  </div>
                )}

                {/* ATTACHMENT OPTIMIZATION & COMPRESSION SECTION */}
                <div className="space-y-4 pt-4 border-t border-[var(--theme-border)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-accent shrink-0" />
                      <div>
                        <h4 className="font-extrabold text-xs text-[var(--theme-text-primary)]">
                          {lang === 'ar' ? 'نظام ضغط وتطوير المرفقات' : 'Attachment Optimization & Compression'}
                        </h4>
                        <p className="text-[10px] text-[var(--theme-text-muted)]">
                          {lang === 'ar'
                            ? 'تقليل حجم الصور والفيديوهات والصوتيات تلقائياً قبل الرفع لتسريع الإرسال وتوفير المساحة'
                            : 'Compress media files before upload to save bandwidth and speed up delivery'}
                        </p>
                      </div>
                    </div>

                    <button
                      dir="ltr"
                      type="button"
                      onClick={() => {
                        const currentComp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                        updatePartialSettings('attachmentCompression', {
                          enableCompression: !currentComp.enableCompression
                        });
                      }}
                      className={`w-12 h-6 rounded-full transition-all relative cursor-pointer border-0 p-0.5 shrink-0 ${
                        (localSettings.attachmentCompression?.enableCompression ?? true)
                          ? 'bg-accent'
                          : 'bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transition-all transform ${
                          (localSettings.attachmentCompression?.enableCompression ?? true) ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {(localSettings.attachmentCompression?.enableCompression ?? true) && (
                    <div className="space-y-3.5 pl-1">
                      <div className="text-[10px] font-extrabold text-accent uppercase tracking-wider px-1">
                        {lang === 'ar' ? 'خيارات الضغط والتحسين المتقدمة' : 'Advanced Optimization Options'}
                      </div>

                      {/* 1. Image Settings Card */}
                      <div className="p-4 rounded-2xl border space-y-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-accent" />
                            <span className="font-bold text-xs text-[var(--theme-text-primary)]">
                              {lang === 'ar' ? 'تحسين وضغط الصور' : 'Image Optimization'}
                            </span>
                          </div>
                          <button
                            dir="ltr"
                            type="button"
                            onClick={() => {
                              const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                              updatePartialSettings('attachmentCompression', {
                                images: { ...comp.images, enabled: !comp.images.enabled }
                              });
                            }}
                            className={`w-10 h-5 rounded-full transition-all relative cursor-pointer border-0 p-0.5 shrink-0 ${
                              (localSettings.attachmentCompression?.images?.enabled ?? true)
                                ? 'bg-accent'
                                : 'bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white transition-all transform ${
                                (localSettings.attachmentCompression?.images?.enabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {(localSettings.attachmentCompression?.images?.enabled ?? true) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {/* Convert to WebP */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] gap-2">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)]">{lang === 'ar' ? 'تحويل إلى WebP' : 'Convert to WebP'}</span>
                              <button
                                dir="ltr"
                                type="button"
                                onClick={() => {
                                  const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                                  updatePartialSettings('attachmentCompression', {
                                    images: { ...comp.images, convertToWebP: !comp.images.convertToWebP }
                                  });
                                }}
                                className={`w-9 h-5 rounded-full transition-all relative cursor-pointer border-0 p-0.5 shrink-0 ${
                                  (localSettings.attachmentCompression?.images?.convertToWebP ?? true) ? 'bg-accent' : 'bg-[var(--theme-bg-secondary)]'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-full bg-white transition-all transform ${
                                    (localSettings.attachmentCompression?.images?.convertToWebP ?? true) ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>

                            {/* Max Resolution Dropdown */}
                            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)]">{lang === 'ar' ? 'أقصى دقة للصور' : 'Max Image Resolution'}</span>
                              <select
                                value={localSettings.attachmentCompression?.images?.maxResolution || 2048}
                                onChange={(e) => {
                                  const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                                  updatePartialSettings('attachmentCompression', {
                                    images: { ...comp.images, maxResolution: Number(e.target.value) }
                                  });
                                }}
                                className="w-full p-2.5 rounded-xl text-xs font-bold border transition-all bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                              >
                                <option value={1080}>1080p (Full HD)</option>
                                <option value={2048}>2048p (2K - Balanced)</option>
                                <option value={3840}>3840p (4K Ultra)</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 2. Video Settings Card */}
                      <div className="p-4 rounded-2xl border space-y-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-accent" />
                            <span className="font-bold text-xs text-[var(--theme-text-primary)]">
                              {lang === 'ar' ? 'تحسين وضغط الفيديوهات' : 'Video Optimization'}
                            </span>
                          </div>
                          <button
                            dir="ltr"
                            type="button"
                            onClick={() => {
                              const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                              updatePartialSettings('attachmentCompression', {
                                videos: { ...comp.videos, enabled: !comp.videos.enabled }
                              });
                            }}
                            className={`w-10 h-5 rounded-full transition-all relative cursor-pointer border-0 p-0.5 shrink-0 ${
                              (localSettings.attachmentCompression?.videos?.enabled ?? true)
                                ? 'bg-accent'
                                : 'bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white transition-all transform ${
                                (localSettings.attachmentCompression?.videos?.enabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {(localSettings.attachmentCompression?.videos?.enabled ?? true) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                            {/* Threshold */}
                            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] min-w-0">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)] leading-tight">
                                {lang === 'ar' ? 'الحد الأدنى لحجم الضغط' : 'Compression Threshold'}
                              </span>
                              <select
                                value={localSettings.attachmentCompression?.videos?.compressAboveMB ?? localSettings.attachmentCompression?.videos?.maxSizeMBThreshold ?? 5}
                                onChange={(e) => {
                                  const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                                  const val = Number(e.target.value);
                                  updatePartialSettings('attachmentCompression', {
                                    videos: { ...comp.videos, compressAboveMB: val, maxSizeMBThreshold: val }
                                  });
                                }}
                                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer outline-none focus:ring-2 focus:ring-accent bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                              >
                                <option value={0}>{lang === 'ar' ? 'دائمًا (0 ميجابايت)' : 'Always (0 MB)'}</option>
                                <option value={2}>&gt; 2 MB</option>
                                <option value={5}>&gt; 5 MB ({lang === 'ar' ? 'موصى به' : 'Recommended'})</option>
                                <option value={10}>&gt; 10 MB</option>
                                <option value={25}>&gt; 25 MB</option>
                                <option value={50}>&gt; 50 MB</option>
                              </select>
                            </div>

                            {/* Target Resolution */}
                            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] min-w-0">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)] leading-tight">
                                {lang === 'ar' ? 'دقة الفيديو المستهدفة' : 'Target Resolution'}
                              </span>
                              <select
                                value={localSettings.attachmentCompression?.videos?.maxResolution || 720}
                                onChange={(e) => {
                                  const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                                  updatePartialSettings('attachmentCompression', {
                                    videos: { ...comp.videos, maxResolution: Number(e.target.value) }
                                  });
                                }}
                                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer outline-none focus:ring-2 focus:ring-accent bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                              >
                                <option value={480}>480p (SD)</option>
                                <option value={720}>720p (HD - {lang === 'ar' ? 'متوازن' : 'Balanced'})</option>
                                <option value={1080}>1080p (Full HD)</option>
                                <option value={1440}>1440p (2K)</option>
                              </select>
                            </div>

                            {/* Speed Preset */}
                            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] min-w-0">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)] leading-tight">
                                {lang === 'ar' ? 'سرعة الضغط والجودة' : 'Speed & Quality Preset'}
                              </span>
                              <select
                                value={localSettings.attachmentCompression?.videos?.preset || 'fastest'}
                                onChange={(e) => {
                                  const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                                  const val = e.target.value as 'fastest' | 'balanced' | 'quality';
                                  updatePartialSettings('attachmentCompression', {
                                    videos: { ...comp.videos, preset: val, quality: val === 'fastest' ? 'fast' : val === 'quality' ? 'high' : 'balanced' }
                                  });
                                }}
                                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer outline-none focus:ring-2 focus:ring-accent bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                              >
                                <option value="fastest">{lang === 'ar' ? 'ضغط سريع (حجم أصغر)' : 'Fast (Small Size)'}</option>
                                <option value="balanced">{lang === 'ar' ? 'متوازن' : 'Balanced'}</option>
                                <option value="quality">{lang === 'ar' ? 'جودة أعلى' : 'High Quality'}</option>
                              </select>
                            </div>

                            {/* Bitrate */}
                            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] min-w-0">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)] leading-tight">
                                {lang === 'ar' ? 'حد معدل البت (Bitrate)' : 'Bitrate Limit'}
                              </span>
                              <select
                                value={localSettings.attachmentCompression?.videos?.bitrateMbps ?? 2.5}
                                onChange={(e) => {
                                  const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                                  updatePartialSettings('attachmentCompression', {
                                    videos: { ...comp.videos, bitrateMbps: Number(e.target.value) }
                                  });
                                }}
                                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer outline-none focus:ring-2 focus:ring-accent bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                              >
                                <option value={0}>{lang === 'ar' ? 'تلقائي' : 'Auto'}</option>
                                <option value={1}>1.0 Mbps ({lang === 'ar' ? 'منخفض' : 'Low'})</option>
                                <option value={2.5}>2.5 Mbps ({lang === 'ar' ? 'قياسي' : 'Standard'})</option>
                                <option value={5}>5.0 Mbps ({lang === 'ar' ? 'عالي' : 'High'})</option>
                                <option value={8}>8.0 Mbps ({lang === 'ar' ? 'فائق' : 'Ultra'})</option>
                              </select>
                            </div>

                            {/* FPS Limit */}
                            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] min-w-0 md:col-span-2 lg:col-span-1">
                              <span className="text-xs font-bold text-[var(--theme-text-primary)] leading-tight">
                                {lang === 'ar' ? 'معدل الإطارات (FPS)' : 'FPS Limit'}
                              </span>
                              <select
                                value={localSettings.attachmentCompression?.videos?.fpsLimit || 30}
                                onChange={(e) => {
                                  const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                                  updatePartialSettings('attachmentCompression', {
                                    videos: { ...comp.videos, fpsLimit: Number(e.target.value) }
                                  });
                                }}
                                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer outline-none focus:ring-2 focus:ring-accent bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                              >
                                <option value={24}>24 FPS</option>
                                <option value={30}>30 FPS ({lang === 'ar' ? 'موصى به' : 'Standard'})</option>
                                <option value={60}>60 FPS</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 3. Audio Settings Card */}
                      <div className="p-4 rounded-2xl border flex items-center justify-between bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-amber-400" />
                          <div>
                            <span className="font-bold text-xs block text-[var(--theme-text-primary)]">
                              {lang === 'ar' ? 'تحسين الملفات الصوتية' : 'Audio Optimization'}
                            </span>
                            <span className="text-[10px] text-[var(--theme-text-muted)]">
                              {lang === 'ar' ? 'إعادة ترميز التسجيلات الصوتية الكبيرة بترميز Opus الخفيف' : 'Re-encode large audio files with Opus codec'}
                            </span>
                          </div>
                        </div>
                        <button
                          dir="ltr"
                          type="button"
                          onClick={() => {
                            const comp = localSettings.attachmentCompression || DEFAULT_USER_SETTINGS.attachmentCompression;
                            updatePartialSettings('attachmentCompression', {
                              audio: { ...comp.audio, enabled: !comp.audio.enabled }
                            });
                          }}
                          className={`w-10 h-5 rounded-full transition-all relative cursor-pointer border-0 p-0.5 shrink-0 ${
                            (localSettings.attachmentCompression?.audio?.enabled ?? true)
                              ? 'bg-amber-500'
                              : 'bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)]'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-all transform ${
                              (localSettings.attachmentCompression?.audio?.enabled ?? true) ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 4. Document Protection Notice */}
                      <div className="p-3.5 rounded-2xl bg-accent/10 border border-accent/20 flex items-center gap-2.5 text-xs">
                        <ShieldCheck className="w-5 h-5 text-accent shrink-0" />
                        <span className="leading-relaxed text-[11px]">
                          {lang === 'ar'
                            ? 'المستندات والملفات (مثل PDF و DOCX و ZIP و XLSX) تبقى دائماً بأحجامها وصيغها الأصلية دون أي تعديل لحفظ البيانات.'
                            : 'Document files (PDF, DOCX, ZIP, XLSX) are strictly preserved in their original format and bit-exact data without modification.'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DOWNLOADS TAB */}
            {activeTab === 'downloads' && (
              <DownloadsTabContent lang={lang} isLight={isLight} />
            )}

            {/* 8. ACCOUNT TAB */}
            {activeTab === 'account' && (
              <form onSubmit={handleSaveProfile} className="flex flex-col items-center gap-4 max-w-xl mx-auto w-full py-1">
                {/* Helper Info Header */}
                <div className="w-full flex items-center justify-between px-1">
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-accent">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span>{lang === 'ar' ? 'بطاقة الملف الشخصي التفاعلية (انقر على أي عنصر للتعديل المباشر)' : 'Interactive Profile Card (Click any element to edit)'}</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">
                    {lang === 'ar' ? 'معاينة فورية' : 'Live Preview'}
                  </span>
                </div>

                {/* The Interactive Profile Card */}
                <div
                  className="relative w-full rounded-3xl border border-white/10 shadow-2xl transition-all p-4 sm:p-5 flex flex-col gap-3.5 text-white overflow-visible"
                  style={{
                    backgroundColor: pendingCardColor,
                    backgroundImage: `linear-gradient(180deg, ${pendingCardColor}, ${pendingCardColor2})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'top left',
                    backgroundSize: '100% 100%'
                  }}
                >
                  {/* 1. Header Banner (Click to upload) */}
                  <div className="relative h-28 sm:h-32 w-full rounded-2xl overflow-hidden group cursor-pointer shadow-md border border-white/10 shrink-0">
                    {getBannerUrl() ? (
                      <img
                        src={getBannerUrl()}
                        alt="Profile Banner"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-black/60 flex items-center justify-center">
                        <span className="text-xs font-bold text-white/60 flex items-center gap-1.5">
                          <Camera className="w-4 h-4 opacity-75" />
                          <span>{lang === 'ar' ? 'انقر لإضافة غلاف' : 'Click to add a banner'}</span>
                        </span>
                      </div>
                    )}

                    {/* Hover Camera Overlay */}
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 cursor-pointer text-white">
                      <Camera className="w-6 h-6 animate-bounce" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'تغيير الغلاف' : 'Change Banner'}</span>
                      <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                    </label>

                    {/* Remove Banner Button */}
                    {getBannerUrl() && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBannerFile(null);
                          setBannerPreview('REMOVE');
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white z-20 shadow-md cursor-pointer border-0 flex items-center gap-1 transition-all"
                        title={lang === 'ar' ? 'إزالة الغلاف' : 'Remove Banner'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 2. Avatar & Status Badge Header Row */}
                  <div className="flex items-end justify-between -mt-10 sm:-mt-12 px-1 relative z-10">
                    {/* Avatar with Custom Frame Color */}
                    <div className="flex items-end gap-2">
                      <label
                        style={{ background: pendingAvatarFrameColor }}
                        className="p-[3px] rounded-2xl shadow-2xl relative group/avatar cursor-pointer shrink-0 block"
                        title={lang === 'ar' ? 'انقر لتغيير الصورة الشخصية' : 'Click to change avatar'}
                      >
                        <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl overflow-hidden relative">
                          <img
                            src={getAvatarUrl() || APP_URLS.UNSPLASH_AVATAR_PLACEHOLDER}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                            <Camera className="w-4 h-4" />
                            <span className="text-[9px] font-black">{lang === 'ar' ? 'تغيير' : 'Edit'}</span>
                          </div>
                        </div>
                        <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                      </label>

                      {/* Remove Avatar Button */}
                      {getAvatarUrl() && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAvatarFile(null);
                            setAvatarPreview('REMOVE');
                          }}
                          className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold cursor-pointer transition-all shadow-xs mb-1"
                          title={lang === 'ar' ? 'إزالة الصورة الشخصية' : 'Remove Avatar'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Status Badge Selector */}
                    <div className="relative z-30">
                      <button
                        type="button"
                        onClick={() => setActiveEditField(activeEditField === 'status' ? null : 'status')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-sm active:scale-95 border ${
                          activeEditField === 'status'
                            ? 'bg-black/70 border-accent text-accent ring-1 ring-accent/30 shadow-md'
                            : 'bg-black/60 hover:bg-black/80 border-white/20 text-white'
                        }`}
                        title={lang === 'ar' ? 'انقر لتغيير الحالة' : 'Click to change status'}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          status === 'online' ? 'bg-[var(--status-online)] animate-pulse' :
                          status === 'away' ? 'bg-[var(--status-away)]' :
                          status === 'dnd' ? 'bg-[var(--status-dnd)]' :
                          'bg-[var(--status-offline)]'
                        }`} />
                        <span className="capitalize">{
                          status === 'online' ? (lang === 'ar' ? 'متصل' : 'Online') :
                          status === 'away' ? (lang === 'ar' ? 'بعيد' : 'Away') :
                          status === 'dnd' ? (lang === 'ar' ? 'عدم الإزعاج' : 'Do Not Disturb') :
                          (lang === 'ar' ? 'مخفي' : 'Invisible')
                        }</span>
                        <Edit3 className="w-3 h-3 text-white/70 ms-1" />
                      </button>

                      {/* Floating Status Dropdown Menu */}
                      {activeEditField === 'status' && (
                        <div className="absolute right-0 top-10 z-50 w-44 rounded-2xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] shadow-2xl p-1.5 flex flex-col gap-1 text-[var(--theme-text-primary)]">
                          <button
                            type="button"
                            onClick={() => { setStatus('online'); setActiveEditField(null); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                              status === 'online' ? 'bg-accent/20 text-accent font-black' : 'hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-online)]" />
                            <span>{lang === 'ar' ? 'متصل (Online)' : 'Online'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStatus('away'); setActiveEditField(null); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                              status === 'away' ? 'bg-accent/20 text-accent font-black' : 'hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-away)]" />
                            <span>{lang === 'ar' ? 'بعيد (Away)' : 'Away'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStatus('dnd'); setActiveEditField(null); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                              status === 'dnd' ? 'bg-accent/20 text-accent font-black' : 'hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-dnd)]" />
                            <span>{lang === 'ar' ? 'عدم الإزعاج (DND)' : 'Do Not Disturb'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { setStatus('offline'); setActiveEditField(null); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                              status === 'offline' ? 'bg-accent/20 text-accent font-black' : 'hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-offline)]" />
                            <span>{lang === 'ar' ? 'مخفي (Invisible)' : 'Invisible'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Display Name & Username (Inline Editable Display Name) */}
                  <div className="px-1 flex flex-col gap-1">
                    {activeEditField === 'displayName' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={displayName}
                          autoFocus
                          onChange={(e) => setDisplayName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); setActiveEditField(null); }
                            if (e.key === 'Escape') { setActiveEditField(null); }
                          }}
                          className="w-full text-base sm:text-lg font-black bg-black/50 border border-accent ring-1 ring-accent/30 rounded-xl px-3 py-1.5 text-white focus:outline-none"
                          placeholder={lang === 'ar' ? 'أدخل اسمك المستعار...' : 'Enter display name...'}
                        />
                        <button
                          type="button"
                          onClick={() => setActiveEditField(null)}
                          className="p-2 rounded-xl bg-accent text-[var(--theme-accent-contrast,#000000)] cursor-pointer shadow-md border-0 shrink-0"
                          title={lang === 'ar' ? 'حفظ' : 'Done'}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => setActiveEditField('displayName')}
                        className="group/name flex items-center gap-2 cursor-pointer p-1.5 -ml-1.5 rounded-xl hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
                        title={lang === 'ar' ? 'انقر لتغيير الاسم المستعار' : 'Click to edit display name'}
                      >
                        <h3 className="font-black text-lg sm:text-xl text-white drop-shadow-xs">
                          {displayName || currentUser.username}
                        </h3>
                        <Edit3 className="w-3.5 h-3.5 text-white/50 group-hover/name:text-accent transition-colors" />
                      </div>
                    )}
                    <span className="text-xs font-mono text-white/75 px-1">@{currentUser.username}</span>
                  </div>

                  {/* 4. Biography / About Me Section (Inline Editable) */}
                  <div
                    onClick={() => { if (activeEditField !== 'bio') setActiveEditField('bio'); }}
                    className={`p-3 rounded-2xl bg-black/40 border transition-all flex flex-col gap-1.5 ${
                      activeEditField === 'bio' ? 'border-accent ring-1 ring-accent/30 bg-black/60 shadow-md' : 'border-white/10 hover:border-white/30 cursor-pointer group/bio'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-secondary)] flex items-center gap-1">
                        <Award className="w-3 h-3 text-accent" />
                        <span>{lang === 'ar' ? 'النبذة الشخصية' : 'Biography / About'}</span>
                      </span>
                      {activeEditField !== 'bio' && (
                        <Edit3 className="w-3 h-3 text-white/50 group-hover/bio:text-accent transition-colors" />
                      )}
                    </div>

                    {activeEditField === 'bio' ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={bio}
                          autoFocus
                          rows={2}
                          maxLength={500}
                          onChange={(e) => setBio(e.target.value)}
                          className="w-full text-xs font-medium bg-black/40 border border-white/20 rounded-xl p-2.5 text-white focus:outline-none focus:border-accent resize-none"
                          placeholder={lang === 'ar' ? 'اكتب نبذة عنك...' : 'Write something about yourself...'}
                        />
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-white/50">{bio.length}/500</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setActiveEditField(null); }}
                            className="px-3 py-1 rounded-lg bg-accent text-[var(--theme-accent-contrast,#000000)] font-bold cursor-pointer border-0 shadow-xs flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>{lang === 'ar' ? 'تم' : 'Done'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-xs font-medium leading-relaxed ${bio ? 'text-white/90' : 'text-white/50 italic'}`}>
                        {bio || (lang === 'ar' ? 'انقر هنا لإضافة نبذة شخصية عنك...' : 'Click here to add a biography...')}
                      </p>
                    )}
                  </div>

                  {/* 5. Metadata & Preferred Language Row */}
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-white/80 relative z-20">
                    <div className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="truncate max-w-[180px]">{currentUser.email || 'Protected Email'}</span>
                    </div>

                    {/* Interactive Preferred Language Selector (Profile Information Only) */}
                    <div className="relative z-30">
                      <button
                        type="button"
                        onClick={() => setActiveEditField(activeEditField === 'preferredLanguage' ? null : 'preferredLanguage')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all cursor-pointer border text-xs font-bold ${
                          activeEditField === 'preferredLanguage'
                            ? 'bg-accent/20 border-accent text-accent ring-1 ring-accent/30 shadow-md'
                            : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                        }`}
                        title={lang === 'ar' ? 'لغة التواصل المفضلة للملف الشخصي' : 'Preferred communication language'}
                      >
                        <Globe className="w-3.5 h-3.5 text-accent" />
                        <span className="font-black">{pendingPreferredLanguage}</span>
                        <Edit3 className="w-3 h-3 opacity-60 ms-0.5" />
                      </button>

                      {activeEditField === 'preferredLanguage' && (
                        <div className="absolute right-0 top-9 z-50 w-36 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl p-1.5 flex flex-col gap-1">
                          {['English', 'العربية', 'Español', 'Français', 'Deutsch'].map((langOpt) => (
                            <button
                              key={langOpt}
                              type="button"
                              onClick={() => {
                                setPendingPreferredLanguage(langOpt);
                                setActiveEditField(null);
                              }}
                              className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                                pendingPreferredLanguage === langOpt
                                  ? 'bg-accent/20 text-accent font-black'
                                  : 'hover:bg-white/10 text-white'
                              }`}
                            >
                              <span>{langOpt}</span>
                              {pendingPreferredLanguage === langOpt && <Check className="w-3 h-3 text-accent" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 6. Card Colors & Preset Palette Bar */}
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/10 flex flex-col gap-2 relative z-10">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-white/70">
                      <span className="flex items-center gap-1">
                        <Palette className="w-3 h-3 text-accent" />
                        <span>{lang === 'ar' ? 'ألوان البطاقة والإطار' : 'Card & Frame Colors'}</span>
                      </span>
                      <span className="text-[9px] font-bold text-white/50">
                        {lang === 'ar' ? 'اختر ثيم جاهز أو اختر لونك' : 'Presets or Custom'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {/* Quick Color Presets */}
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                        {COLOR_PRESETS.map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => {
                              setPendingCardColor(preset.c1);
                              setPendingCardColor2(preset.c2);
                              setPendingAvatarFrameColor(preset.frame);
                            }}
                            className={`w-6 h-6 rounded-full border cursor-pointer transition-transform hover:scale-110 active:scale-95 shrink-0 relative overflow-hidden shadow-xs ${
                              pendingCardColor === preset.c1 && pendingCardColor2 === preset.c2
                                ? 'ring-2 ring-accent border-white'
                                : 'border-white/30'
                            }`}
                            style={{
                              background: `linear-gradient(135deg, ${preset.c1}, ${preset.c2})`
                            }}
                            title={preset.name}
                          />
                        ))}
                      </div>

                      {/* Color Pickers */}
                      <div className="flex items-center gap-2 border-l border-white/10 pl-2">
                        <label className="flex items-center gap-1 text-[10px] font-bold cursor-pointer" title={lang === 'ar' ? 'بداية التدرج' : 'Color 1'}>
                          <input
                            type="color"
                            value={pendingCardColor}
                            onChange={(e) => setPendingCardColor(e.target.value)}
                            className="w-5 h-5 rounded-md border-0 bg-transparent cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[10px] font-bold cursor-pointer" title={lang === 'ar' ? 'نهاية التدرج' : 'Color 2'}>
                          <input
                            type="color"
                            value={pendingCardColor2}
                            onChange={(e) => setPendingCardColor2(e.target.value)}
                            className="w-5 h-5 rounded-md border-0 bg-transparent cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[10px] font-bold cursor-pointer" title={lang === 'ar' ? 'لون إطار الصورة' : 'Avatar Frame'}>
                          <input
                            type="color"
                            value={pendingAvatarFrameColor}
                            onChange={(e) => setPendingAvatarFrameColor(e.target.value)}
                            className="w-5 h-5 rounded-md border-0 bg-transparent cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Profile Button Bar */}
                <div className="w-full flex flex-col items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-2xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#000000)] font-black text-xs transition-all shadow-lg cursor-pointer border-0 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{loading ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Profile Changes')}</span>
                  </button>

                  {success && (
                    <span className="text-xs text-accent font-bold animate-fade-in">
                      {lang === 'ar' ? 'تم حفظ التعديلات بنجاح!' : 'Profile changes saved successfully!'}
                    </span>
                  )}
                  {error && (
                    <span className="text-xs text-rose-400 font-bold">
                      {error}
                    </span>
                  )}
                </div>
              </form>
            )}

            {/* Admin Global App Theme Tab */}
            {activeTab === 'global_theme' && isAdmin && (
              <Suspense fallback={<div className="p-8 flex items-center justify-center text-accent"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                <GlobalThemeManagerTab currentUser={currentUser} lang={lang} />
              </Suspense>
            )}

            {/* Admin Text Tokens & Localization Tab */}
            {activeTab === 'text_tokens' && isAdmin && (
              <Suspense fallback={<div className="p-8 flex items-center justify-center text-accent"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
                <TextTokensManagerTab currentUser={currentUser} lang={lang} />
              </Suspense>
            )}

            {/* Admin Database URL Configuration Tab */}
            {activeTab === 'admin_db' && isAdmin && (
              <div className="space-y-6">
                <div className="p-4 rounded-2xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] space-y-2">
                  <h4 className="font-extrabold text-sm text-accent flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'تعديل عنوان قاعدة البيانات (Admin Only)' : 'Database URL Configuration (Admin Only)'}</span>
                  </h4>
                  <p className="text-xs text-[var(--theme-text-muted)] leading-relaxed">
                    {lang === 'ar'
                      ? 'تحديث رابط سيرفر PocketBase / Backend. عند الحفظ، سيتصل جميع المستخدمين والمتصلين فوراً ورسمياً بالعنوان الجديد.'
                      : 'Update the backend/database URL. Upon saving, every connected client will automatically switch to the updated backend.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-[var(--theme-text-secondary)]">
                    {lang === 'ar' ? 'رابط خادم PocketBase Backend' : 'PocketBase Backend URL'}
                  </label>
                  <input
                    type="text"
                    value={adminDbUrl}
                    onChange={(e) => setAdminDbUrl(e.target.value)}
                    placeholder={APP_URLS.MAIN_DOMAIN}
                    className="w-full p-3.5 rounded-xl border text-xs font-mono font-medium focus:outline-none focus:border-accent bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveAdminDbUrl}
                  disabled={savingDbUrl}
                  className="px-6 py-3.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-bg-primary)] font-bold text-xs transition-all cursor-pointer border-0 shadow-lg flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingDbUrl
                      ? (lang === 'ar' ? 'جاري الحفظ والتعميم...' : 'Updating Clients...')
                      : (lang === 'ar' ? 'حفظ وتحديث كافة العملاء' : 'Save & Update All Clients')}
                  </span>
                </button>

                {dbUrlSuccess && (
                  <p className="text-xs font-bold text-accent flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'تم تحديث عنوان قاعدة البيانات وإبلاغ كافة العملاء بنجاح!' : 'Database URL updated and broadcast to all connected clients!'}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
