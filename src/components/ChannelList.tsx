import React, { useState } from 'react';
import { Server, Channel, User, Call, UnreadChannelInfo } from '../types';
import { pbService, getServerIconUrl, getServerBannerUrl, parseChannelOptions, getEffectiveUserStatus, mergeUserRecord, getServerMemberAvatarUrl } from '../pocketbase';
import { getCachedUserSettings } from '../lib/userSettings';
import { filterAccessibleChannels } from '../lib/channelPermissions';
import { stripServerPassword } from '../lib/serverPassword';
import Avatar from './Avatar';
import SmartGifImage from './SmartGifImage';
import MinimizedVoiceBar from './MinimizedVoiceBar';
import CustomStatusModal from './CustomStatusModal';
import {
  Hash,
  Volume2,
  Plus,
  Settings,
  LogOut,
  ChevronDown,
  Globe,
  Radio,
  Mic,
  MicOff,
  Headphones,
  Compass,
  MessageSquare,
  Search,
  Trash2,
  Sparkles,
  Server as ServerIcon,
  Bell,
  Shield,
  Lock,
  Users,
  X
} from 'lucide-react';
import useRealtimeMedia from '../context/MediaContext';
import liveKitManager from '../media/livekit/LiveKitManager';
import voicePresenceStore from '../services/voicePresenceStore';
import wsService from '../services/websocket';
import { ScreenShare, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChannelListProps {
  servers: Server[];
  activeServer: Server | null;
  onSelectServer: (server: Server) => void;
  channels: Channel[];
  activeChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  currentUser: User;
  onOpenSettings: () => void;
  onOpenCreateServer: () => void;
  onLogout: () => void;
  serverUrl: string;
  lang: 'en' | 'ar';
  t: (key: string) => string;

  // Voice channel states
  activeVoiceChannel: Channel | null;
  onLeaveVoice: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isDeafened: boolean;
  onToggleDeafen: () => void;
  activeCalls: Call[];

  // Dynamic Theme
  theme: string;

  // Interaction
  onSelectUser?: (user: User, anchor?: any) => void;
  onSelectSelfGlobalProfile?: (anchor?: any) => void;
  activeFriends?: boolean;
  onSelectFriends?: () => void;
  activeDiscovery?: boolean;
  onSelectDiscovery?: () => void;
  unreadCounts?: Record<string, UnreadChannelInfo>;
  allDmChannels?: Channel[];
  onOpenNewDmModal?: () => void;
  onDeleteChannel?: (channelId: string) => void;
  onDeleteServer?: (serverId: string) => void;
  onUpdateUser?: (updatedUser: User) => void;
  onOpenServerSettings?: (server: Server) => void;
  onLeaveServer?: (server: Server) => void;
  onExpandVoice?: () => void;
  onCloseDm?: (dmChannel: Channel) => void;
}

interface ServerDropdownItemProps {
  server: Server;
  isSelected: boolean;
  unreadCount: number;
  bannerUrl: string;
  iconUrl: string;
  onSelect: (server: Server) => void;
  lang: 'en' | 'ar';
}

const ServerDropdownItem = React.memo(function ServerDropdownItem({
  server,
  isSelected,
  unreadCount,
  bannerUrl,
  iconUrl,
  onSelect,
  lang,
}: ServerDropdownItemProps) {
  const handleClick = React.useCallback(() => {
    onSelect(server);
  }, [onSelect, server]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-start border-0 cursor-pointer relative rounded-2xl overflow-hidden p-2.5 flex items-center justify-between gap-2.5 min-h-[58px] transition-colors duration-100 ${
        isSelected
          ? 'ring-2 ring-accent shadow-lg shadow-accent/25 bg-[var(--theme-bg-tertiary)]'
          : 'hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)]/80 bg-[var(--theme-bg-tertiary)]/50'
      }`}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Seamless Full-Background Banner */}
      {bannerUrl ? (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <SmartGifImage
            src={bannerUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover opacity-65 group-hover:opacity-80 transition-opacity"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(${lang === 'ar' ? 'to left' : 'to right'}, var(--theme-bg-tertiary) 0%, var(--theme-bg-tertiary) 20%, transparent 75%)`,
            }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 bg-accent/10 pointer-events-none z-0" />
      )}

      {/* Content Row */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 relative z-10">
        <div className="relative shrink-0">
          {iconUrl ? (
            <SmartGifImage
              src={iconUrl}
              alt={server.name}
              loading="lazy"
              decoding="async"
              className="w-9 h-9 rounded-xl object-cover shadow-md border border-white/20"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-black text-xs flex items-center justify-center shadow-md">
              {server.name ? server.name.substring(0, 2).toUpperCase() : 'SV'}
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1 text-start">
          <span className={`font-extrabold text-xs truncate ${isSelected ? 'text-accent' : 'text-[var(--theme-text-primary)]'}`}>
            {server.name}
          </span>
          <span className="text-[10px] text-[var(--theme-text-muted)] font-medium truncate flex items-center gap-1.5 opacity-80 mt-0.5">
            <span className="truncate">
              {server.description ? stripServerPassword(server.description) : (lang === 'ar' ? 'مساحة عمل نشطة' : 'Active Space')}
            </span>
          </span>
        </div>
      </div>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="relative z-10 px-2 py-0.5 rounded-full bg-red-500 text-white font-black text-[10px] shadow-md shrink-0">
          @{unreadCount}
        </span>
      )}
    </button>
  );
});

function ChannelList({
  servers,
  activeServer,
  onSelectServer,
  channels,
  activeChannel,
  onSelectChannel,
  currentUser,
  onOpenSettings,
  onOpenCreateServer,
  onLogout,
  serverUrl,
  lang,
  t,
  activeVoiceChannel,
  onLeaveVoice,
  isMuted,
  onToggleMute,
  isDeafened,
  onToggleDeafen,
  activeCalls,
  theme,
  onSelectUser,
  onSelectSelfGlobalProfile,
  activeFriends,
  onSelectFriends,
  activeDiscovery,
  onSelectDiscovery,
  unreadCounts,
  allDmChannels = [],
  onOpenNewDmModal,
  onDeleteChannel,
  onDeleteServer,
  onUpdateUser,
  onOpenServerSettings,
  onLeaveServer,
  onExpandVoice,
  onCloseDm,
}: ChannelListProps) {
  const { activeRoom, participants } = useRealtimeMedia();
  const [showServerDropdown, setShowServerDropdown] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'servers' | 'dms'>('servers');
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCustomStatusModal, setShowCustomStatusModal] = useState(false);
  const [, setPresenceTick] = useState(0);
  const [, setVoicePresenceTick] = useState(0);

  React.useEffect(() => {
    const unsub = voicePresenceStore.subscribe(() => {
      setVoicePresenceTick((t) => t + 1);
    });
    voicePresenceStore.queryAllPresence(activeServer?.id);
    return () => unsub();
  }, [activeServer?.id]);

  React.useEffect(() => {
    const handleUserPresenceChanged = () => {
      setPresenceTick((t) => t + 1);
    };

    window.addEventListener('user-presence-changed', handleUserPresenceChanged);
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        setPresenceTick((t) => t + 1);
      }
    }, 60000);

    return () => {
      window.removeEventListener('user-presence-changed', handleUserPresenceChanged);
      clearInterval(timer);
    };
  }, []);

  const lastServerChannelRef = React.useRef<Channel | null>(null);
  const lastDmChannelRef = React.useRef<Channel | null>(null);

  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );

  React.useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (activeChannel) {
      if (activeChannel.server === 'dm' || activeChannel.name.startsWith('@')) {
        lastDmChannelRef.current = activeChannel;
        setSidebarTab('dms');
      } else {
        lastServerChannelRef.current = activeChannel;
        setSidebarTab('servers');
      }
    }
  }, [activeChannel?.id]);

  const handleTabSwitch = (tab: 'servers' | 'dms') => {
    setSidebarTab(tab);
    // On desktop, auto-select last or default channel when switching tabs.
    // On phones (mobile viewports), avoid auto-selecting channel on tab switch so it doesn't trigger drawer close animation.
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      if (tab === 'servers') {
        if (!activeChannel || activeChannel.server === 'dm' || activeChannel.name.startsWith('@')) {
          const targetChan =
            (lastServerChannelRef.current && channels.some((c) => c.id === lastServerChannelRef.current?.id)
              ? lastServerChannelRef.current
              : textChannels[0] || channels[0]);
          if (targetChan) {
            onSelectChannel(targetChan);
          }
        }
      } else if (tab === 'dms') {
        if (!activeChannel || (activeChannel.server !== 'dm' && !activeChannel.name.startsWith('@'))) {
          const targetDm =
            (lastDmChannelRef.current && dmChannels.some((c) => c.id === lastDmChannelRef.current?.id)
              ? lastDmChannelRef.current
              : dmChannels[0]);
          if (targetDm) {
            onSelectChannel(targetDm);
          }
        }
      }
    }
  };

  const isLight = theme === 'light';

  // Theme styling definitions
  const themeClasses: any = {
    sidebarBg: 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]',
    textPrimary: 'text-[var(--theme-text-primary)]',
    textSecondary: 'text-[var(--theme-text-secondary)]',
    buttonBg: 'bg-[var(--theme-bg-tertiary)] hover:opacity-80 text-[var(--theme-text-primary)]',
    activeItem: 'bg-accent/20 text-accent font-extrabold border-r-2 border-accent shadow-sm',
    brandBg: 'bg-accent',
  };

  const accessibleChannels = React.useMemo(
    () => filterAccessibleChannels(channels, currentUser, activeServer, []),
    [channels, currentUser, activeServer]
  );
  
  const textChannels = React.useMemo(
    () => accessibleChannels.filter((c) => c.type === 'text' && !c.name.startsWith('@') && c.server !== 'dm'),
    [accessibleChannels]
  );

  const getChannelActivityTime = React.useCallback((c: Channel): number => {
    const ts = (c as any).last_message_at || (c as any).lastMessageTs || c.updated || c.created;
    if (!ts) return 0;
    const time = new Date(ts).getTime();
    return isNaN(time) ? 0 : time;
  }, []);

  // Robust DM deduplication by recipient user ID or username to prevent duplicate DM rows
  const dmChannels = React.useMemo(() => {
    const localDms = channels.filter((c) => c.name.startsWith('@') || c.server === 'dm');
    const rawDms = [...allDmChannels, ...localDms];
    const dmChannelsRecipientMap = new Map<string, Channel>();

    for (const c of rawDms) {
      const key = c.recipientUser?.id || (c.name ? c.name.toLowerCase().replace(/^@/, '') : c.id);
      const existing = dmChannelsRecipientMap.get(key);
      if (!existing) {
        dmChannelsRecipientMap.set(key, c);
      } else {
        const existingTime = getChannelActivityTime(existing);
        const newTime = getChannelActivityTime(c);
        if (c.id.startsWith('dm-server-') && !existing.id.startsWith('dm-server-')) {
          dmChannelsRecipientMap.set(key, c);
        } else if (newTime > existingTime && (!existing.id.startsWith('dm-server-') || c.id.startsWith('dm-server-'))) {
          dmChannelsRecipientMap.set(key, c);
        }
      }
    }

    let list = Array.from(dmChannelsRecipientMap.values()).sort((a, b) => {
      return getChannelActivityTime(b) - getChannelActivityTime(a);
    });

    if (dmSearchQuery.trim()) {
      const q = dmSearchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.recipientUser?.display_name?.toLowerCase().includes(q) ||
          c.recipientUser?.username?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allDmChannels, channels, dmSearchQuery, getChannelActivityTime]);

  const voiceChannels = React.useMemo(
    () => accessibleChannels.filter((c) => c.type === 'voice'),
    [accessibleChannels]
  );

  // Prefetch LiveKit token for the first voice channel in background when server opens
  React.useEffect(() => {
    if (voiceChannels.length > 0 && currentUser) {
      liveKitManager.prefetchChannelToken(voiceChannels[0], currentUser);
    }
  }, [activeServer?.id, voiceChannels.length, currentUser?.id]);

  // User notification preferences
  const settingsObj = getCachedUserSettings();
  const notifSettings = (settingsObj?.notifications || {}) as Record<string, boolean | undefined>;
  const mentionBadgesEnabled = notifSettings.mentionBadges !== false;
  const mentionBlinkingEnabled = notifSettings.mentionBlinking !== false;
  const badgeCountEnabled = notifSettings.badgeCount !== false;

  const dmChannelIdSet = React.useMemo(() => {
    const set = new Set<string>();
    dmChannels.forEach((d) => set.add(d.id));
    allDmChannels.forEach((d) => set.add(d.id));
    return set;
  }, [dmChannels, allDmChannels]);

  // Helper to identify if an unread entry belongs to a Direct Message
  const isDmUnread = React.useCallback(
    (u?: UnreadChannelInfo) => {
      if (!u) return false;
      if (u.serverId === 'dm' || u.channelId === 'dm' || u.channelId.startsWith('dm-') || u.channelId.startsWith('dm-server-')) return true;
      return dmChannelIdSet.has(u.channelId);
    },
    [dmChannelIdSet]
  );

  // Calculate total unread counts for server channels and DMs independently
  let totalUnreadTextChannels = 0;
  let textChannelsHasMention = false;
  textChannels.forEach((c) => {
    const u = unreadCounts?.[c.id];
    if (u && u.count > 0 && !isDmUnread(u)) {
      if (u.hasMention && mentionBadgesEnabled) {
        totalUnreadTextChannels += u.count;
        textChannelsHasMention = true;
      } else if (!u.hasMention && badgeCountEnabled) {
        totalUnreadTextChannels += u.count;
      }
    }
  });

  let totalUnreadDms = 0;
  let dmsHasMention = false;
  if (unreadCounts) {
    Object.values(unreadCounts).forEach((u) => {
      if (u && u.count > 0 && isDmUnread(u)) {
        totalUnreadDms += u.count;
        if (u.hasMention && mentionBadgesEnabled) dmsHasMention = true;
      }
    });
  }

  // Pre-calculate server unread counts map for O(1) instant lookup
  const serverUnreadCountsMap = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!unreadCounts) return map;
    for (const u of Object.values(unreadCounts)) {
      if (!u || u.count <= 0 || !u.serverId || u.serverId === 'dm') continue;
      if (u.channelId === 'dm' || u.channelId.startsWith('dm-') || u.channelId.startsWith('dm-server-') || dmChannelIdSet.has(u.channelId)) continue;
      const count = u.hasMention && mentionBadgesEnabled ? u.count : !u.hasMention && badgeCountEnabled ? u.count : 0;
      if (count > 0) {
        map.set(u.serverId, (map.get(u.serverId) || 0) + count);
      }
    }
    return map;
  }, [unreadCounts, dmChannelIdSet, mentionBadgesEnabled, badgeCountEnabled]);

  const activeServerUnread = activeServer ? serverUnreadCountsMap.get(activeServer.id) || 0 : 0;

  const getAvatarUrl = () => {
    if (currentUser.avatar) {
      if (currentUser.avatar.startsWith('blob:') || currentUser.avatar.startsWith('http')) {
        return currentUser.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`;
    }
    return '';
  };

  const effectiveUserStatus = getEffectiveUserStatus(currentUser, true);

  const statusColor =
    effectiveUserStatus === 'online'
      ? 'bg-[var(--status-online)]'
      : effectiveUserStatus === 'away'
      ? 'bg-[var(--status-away)]'
      : effectiveUserStatus === 'dnd'
      ? 'bg-[var(--status-dnd)]'
      : 'bg-[var(--status-offline)]';

  const handleUpdateUserStatus = async (newStatus: 'online' | 'away' | 'dnd' | 'offline') => {
    setShowStatusPicker(false);
    try {
      const updated = await pbService.updateUser(currentUser.id, { status: newStatus });
      if (onUpdateUser) {
        onUpdateUser(updated);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const getActiveCallsText = (channelId: string) => {
    const callsInChannel = activeCalls.filter((c) => c.channel === channelId);
    if (callsInChannel.length === 0) return null;
    return `${callsInChannel.length} in voice`;
  };

  const getServerBannerUrl = (server: Server) => {
    if (server.banner) {
      if (server.banner.startsWith('blob:') || server.banner.startsWith('http')) {
        return server.banner;
      }
      return `${pbService.getServerUrl()}/api/files/servers/${server.id}/${server.banner}`;
    }
    return '';
  };

  // Keyboard shortcut: close server dropdown on Escape
  React.useEffect(() => {
    if (!showServerDropdown) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowServerDropdown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showServerDropdown]);

  // Fast memoized handler for selecting a server from dropdown
  const handleSelectServerItem = React.useCallback(
    (s: Server) => {
      setShowServerDropdown(false);
      if (activeServer?.id !== s.id) {
        onSelectServer(s);
      }
    },
    [activeServer?.id, onSelectServer]
  );

  return (
    <div
      className={`w-full md:w-80 h-full flex flex-col shrink-0 select-none transition-all duration-300 relative bg-[var(--theme-bg-secondary)] ${themeClasses.sidebarBg} ${
        lang === 'ar' ? 'border-l' : 'border-r'
      } border-[var(--theme-border)]`}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* App & Server Switcher Top Bar */}
      <div className="px-4 h-14 border-b border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] flex items-center justify-between gap-2 shrink-0">
        {/* Workspace Dropdown Trigger */}
        <div className="relative flex-1 min-w-0" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {/* Backdrop overlay to close dropdown on click outside */}
          {showServerDropdown && (
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setShowServerDropdown(false)}
              aria-hidden="true"
            />
          )}

          <button
            onClick={() => setShowServerDropdown((prev) => !prev)}
            aria-expanded={showServerDropdown}
            className="w-full p-2.5 rounded-2xl flex items-center justify-between gap-2 transition-all cursor-pointer border border-[var(--theme-border)] bg-[var(--theme-bg-card)] hover:bg-[var(--theme-bg-tertiary)] relative overflow-hidden group text-start select-none"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
          >
            {/* Server Banner Background Image */}
            {!activeDiscovery && activeServer && getServerBannerUrl(activeServer) && (
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0">
                <SmartGifImage
                  src={getServerBannerUrl(activeServer)}
                  alt="Server Banner"
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-75 transition-opacity duration-300"
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(${lang === 'ar' ? 'to left' : 'to right'}, var(--theme-bg-card) 0%, var(--theme-bg-card) 15%, transparent 75%)`,
                  }}
                />
              </div>
            )}

            <div className="flex items-center gap-2.5 min-w-0 flex-1 relative z-10">
              {activeDiscovery ? (
                <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-[var(--theme-accent-contrast,#ffffff)] shrink-0 shadow-md">
                  <Compass className="w-4 h-4 animate-spin-slow" />
                </div>
              ) : activeServer?.icon ? (
                <div className="relative shrink-0">
                  <SmartGifImage
                    src={getServerIconUrl(activeServer)}
                    alt="Server"
                    className="w-8 h-8 rounded-xl object-cover shrink-0 shadow-md border border-white/20"
                  />
                  {activeServerUnread > 0 && (
                    <span className="absolute -top-1 end-0 w-3 h-3 bg-red-500 rounded-full animate-ping border-2 border-slate-900" />
                  )}
                </div>
              ) : (
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-[var(--theme-accent-contrast,#ffffff)] font-black text-xs shrink-0 shadow-md">
                    {activeServer ? activeServer.name.substring(0, 2).toUpperCase() : 'SV'}
                  </div>
                  {activeServerUnread > 0 && (
                    <span className="absolute -top-1 end-0 w-3 h-3 bg-red-500 rounded-full animate-ping border-2 border-slate-900" />
                  )}
                </div>
              )}

              <div className="flex flex-col text-start min-w-0 flex-1">
                <span className="font-black text-xs truncate leading-none text-[var(--theme-text-primary)]">
                  {activeDiscovery ? (lang === 'ar' ? 'مركز اكتشاف السيرفرات' : 'Discovery Center') : activeServer ? activeServer.name : (lang === 'ar' ? 'اختر سيرفر' : 'Select Server')}
                </span>
                {(() => {
                  const rawDesc = activeServer?.description ? stripServerPassword(activeServer.description) : '';
                  const displaySub = activeDiscovery 
                    ? (lang === 'ar' ? 'تصفح المجتمع' : 'Explore Public Servers')
                    : rawDesc || `${channels.length} ${lang === 'ar' ? 'قناة' : 'channels'}`;
                  return (
                    <span 
                      title={displaySub}
                      className="text-[10px] font-medium truncate mt-1 leading-tight text-[var(--theme-text-secondary)] block opacity-90"
                    >
                      {displaySub}
                    </span>
                  );
                })()}
              </div>
            </div>

            <ChevronDown className={`w-4 h-4 text-[var(--theme-text-secondary)] transition-transform duration-200 relative z-10 shrink-0 ${showServerDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Server Switcher Dropdown */}
          <AnimatePresence>
            {showServerDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                style={{ willChange: 'transform, opacity' }}
                className="absolute left-0 right-0 top-full mt-2 rounded-2xl shadow-2xl border p-2 z-50 flex flex-col gap-1 bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
              >
                <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--theme-text-muted)] text-start">
                  {lang === 'ar' ? 'السيرفرات الخاصة بك' : 'Your Servers'}
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2.5 p-1 scrollbar-thin">
                  {servers.map((s) => {
                    const isSelected = activeServer?.id === s.id;
                    const serverUnreads = !isSelected ? (serverUnreadCountsMap.get(s.id) || 0) : 0;
                    const bannerUrl = getServerBannerUrl(s);
                    const iconUrl = s.icon ? getServerIconUrl(s) : '';
                    return (
                      <ServerDropdownItem
                        key={s.id}
                        server={s}
                        isSelected={isSelected}
                        unreadCount={serverUnreads}
                        bannerUrl={bannerUrl}
                        iconUrl={iconUrl}
                        onSelect={handleSelectServerItem}
                        lang={lang}
                      />
                    );
                  })}
                </div>

                <div className="pt-1.5 flex flex-col gap-1">
                  {activeServer && onOpenServerSettings && (
                    <button
                      onClick={() => {
                        onOpenServerSettings(activeServer);
                        setShowServerDropdown(false);
                      }}
                      className="w-full p-2 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent font-bold text-xs flex items-center gap-2 transition-all border border-accent/30 cursor-pointer"
                    >
                      <Shield className="w-4 h-4" />
                      <span>{lang === 'ar' ? 'إعدادات السيرفر والرتب' : 'Server Settings & Roles'}</span>
                    </button>
                  )}

                  {activeServer && onLeaveServer && (
                    <button
                      onClick={() => {
                        onLeaveServer(activeServer);
                        setShowServerDropdown(false);
                      }}
                      className="w-full p-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 font-bold text-xs flex items-center gap-2 transition-all border border-red-500/30 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{lang === 'ar' ? 'مغادرة السيرفر' : 'Leave Server'}</span>
                    </button>
                  )}

                  {onSelectFriends && (
                    <button
                      onClick={() => {
                        onSelectFriends();
                        setShowServerDropdown(false);
                      }}
                      className="w-full p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] font-bold text-xs flex items-center gap-2 transition-all border-0 cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-emerald-400" />
                      <span>{lang === 'ar' ? 'الأصدقاء' : 'Friends'}</span>
                    </button>
                  )}

                  {onSelectDiscovery && (
                    <button
                      onClick={() => {
                        onSelectDiscovery();
                        setShowServerDropdown(false);
                      }}
                      className="w-full p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] font-bold text-xs flex items-center gap-2 transition-all border-0 cursor-pointer"
                    >
                      <Compass className="w-4 h-4 text-amber-400" />
                      <span>{lang === 'ar' ? 'استكشاف السيرفرات' : 'Explore Discovery'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onOpenCreateServer();
                      setShowServerDropdown(false);
                    }}
                    className="w-full p-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-border)] text-[var(--theme-text-primary)] font-bold text-xs flex items-center gap-2 transition-all border-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('create_server')}</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tabs Header: Channels vs DMs with Notification Badges */}
      <div className="px-3 pt-2.5 pb-2.5 flex gap-1 border-b shrink-0 border-[var(--theme-border)]">
        <div className="w-full p-1 flex gap-1 rounded-2xl bg-[var(--theme-bg-tertiary)]/50 border border-[var(--theme-border)] relative overflow-hidden">
          <button
            type="button"
            onClick={() => handleTabSwitch('servers')}
            className={`flex-1 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer border-0 relative z-10 transition-colors ${
              sidebarTab === 'servers'
                ? 'text-[var(--theme-accent-contrast)] font-black'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            {sidebarTab === 'servers' && (
              <motion.div
                layoutId="activeSidebarTabPill"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-xl bg-accent shadow-md shadow-accent/20 z-0"
              />
            )}
            <span className="flex items-center gap-1.5 relative z-10">
              <ServerIcon className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'القنوات' : 'Channels'}</span>
              {totalUnreadTextChannels > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shadow-sm ${
                  textChannelsHasMention ? 'bg-red-500 text-white' : 'bg-[var(--theme-accent-contrast)] text-accent'
                }`}>
                  {totalUnreadTextChannels}
                </span>
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('dms')}
            className={`flex-1 py-2 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer border-0 relative z-10 transition-colors ${
              sidebarTab === 'dms'
                ? 'text-[var(--theme-accent-contrast)] font-black'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            {sidebarTab === 'dms' && (
              <motion.div
                layoutId="activeSidebarTabPill"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-xl bg-accent shadow-md shadow-accent/20 z-0"
              />
            )}
            <span className="flex items-center gap-1.5 relative z-10">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'المحادثات' : 'DMs'}</span>
              {totalUnreadDms > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shadow-sm ${
                  dmsHasMention ? 'bg-red-500 text-white' : 'bg-[var(--theme-accent-contrast)] text-accent'
                }`}>
                  {totalUnreadDms}
                </span>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Channel & DM List Area */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin flex flex-col justify-start min-h-0">
        <AnimatePresence initial={false}>
          <motion.div
            key={sidebarTab}
            initial={{ opacity: 0, x: (sidebarTab === 'servers' ? -8 : 8) * (lang === 'ar' ? -1 : 1) }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: (sidebarTab === 'servers' ? 8 : -8) * (lang === 'ar' ? -1 : 1) }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="w-full space-y-4"
          >
        {sidebarTab === 'servers' ? (
          <>
            {/* Text Channels Section Header */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-extrabold text-[var(--theme-text-muted)] px-2 uppercase tracking-widest py-1">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-accent" />
                  <span>{t('text_channels')}</span>
                </span>
              </div>

              <div className="space-y-0.5">
                {textChannels.map((c) => {
                  const isActive = activeChannel?.id === c.id;
                  const unread = unreadCounts?.[c.id];
                  const opts = parseChannelOptions(c);
                  const customIcon = opts.icon || c.icon;
                  const visRoles = opts.visible_roles || c.visible_roles || [];

                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectChannel(c)}
                      className={`w-full px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between cursor-pointer border-0 text-left group relative overflow-hidden ${
                        isActive
                          ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-extrabold'
                          : 'hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)]/80 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 relative z-10">
                        {customIcon ? (
                          <span className="text-sm shrink-0 select-none">{customIcon}</span>
                        ) : (
                          <Hash className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-slate-500'}`} />
                        )}
                        <span className="truncate">{c.name}</span>
                        {visRoles.length > 0 && (
                          <Lock className="w-3 h-3 text-amber-400 shrink-0 opacity-70 group-hover:opacity-100" title={lang === 'ar' ? 'مخصصة لرتب محددة' : 'Restricted to specific roles'} />
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 relative z-10">
                        {unread && unread.count > 0 && unread.hasMention && mentionBadgesEnabled && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white shadow-sm bg-red-500 flex items-center gap-0.5">
                            <span>@</span>
                            <span>{unread.count}</span>
                          </span>
                        )}
                        {unread && unread.count > 0 && !unread.hasMention && badgeCountEnabled && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-[var(--theme-accent-contrast,#ffffff)] shadow-sm bg-accent flex items-center gap-0.5">
                            <span>{unread.count}</span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Voice Channels Section Header & List */}
            <div className="space-y-1 mt-4">
              <div className="flex items-center justify-between text-[10px] font-extrabold text-[var(--theme-text-muted)] px-2 uppercase tracking-widest py-1">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-accent" />
                  <span>{lang === 'ar' ? 'القنوات الصوتية' : 'Voice Channels'}</span>
                </span>
              </div>

              <div className="space-y-0.5">
                {voiceChannels.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-[var(--theme-text-muted)] italic">
                    {lang === 'ar' ? 'لا توجد قنوات صوتية' : 'No voice channels'}
                  </div>
                ) : (
                  voiceChannels.map((c) => {
                    const isActive = activeChannel?.id === c.id;
                    const opts = parseChannelOptions(c);
                    const customIcon = opts.icon || c.icon;
                    const visRoles = opts.visible_roles || c.visible_roles || [];
                    const maxLimit = opts.user_limit || c.user_limit || 8;
                    const roomParticipants = voicePresenceStore.getChannelParticipants(c.id);

                    return (
                      <div key={c.id} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => onSelectChannel(c)}
                          onMouseEnter={() => {
                            if (currentUser) {
                              liveKitManager.prefetchChannelToken(c, currentUser);
                            }
                          }}
                          className={`w-full px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-between cursor-pointer border-0 text-left group relative overflow-hidden ${
                            isActive
                              ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-extrabold'
                              : 'hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)]/80 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 relative z-10">
                            {customIcon ? (
                              <span className="text-sm shrink-0 select-none">{customIcon}</span>
                            ) : (
                              <Volume2 className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-slate-500'}`} />
                            )}
                            <span className="truncate">{c.name}</span>
                            {visRoles.length > 0 && (
                              <Lock className="w-3 h-3 text-amber-400 shrink-0 opacity-70 group-hover:opacity-100" title={lang === 'ar' ? 'مخصصة لرتب محددة' : 'Restricted to specific roles'} />
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 relative z-10 text-[10px] font-mono">
                            {roomParticipants.length > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center gap-1">
                                <Radio className="w-2.5 h-2.5 text-emerald-400" />
                                {roomParticipants.length}/{maxLimit}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--theme-text-muted)] font-bold opacity-60">
                                0/{maxLimit}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Voice channel active participants sub-list */}
                        {roomParticipants.length > 0 && (
                          <div className="pl-3 pr-1 py-1 space-y-1 border-l-2 border-emerald-500/40 ml-4 my-1">
                            {roomParticipants.map((p) => {
                              const member = activeServer?.id && p.userId ? pbService.getCachedServerMember(activeServer.id, p.userId) : null;
                              const pAvatarUrl = getServerMemberAvatarUrl(member, p.userRef, activeServer?.id) || p.avatar || '';
                              const pName = (member && member.member_name) || p.displayName || (p as any).username || 'User';

                              return (
                                <div key={p.userId} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[var(--theme-text-primary)]">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className="relative shrink-0">
                                      <Avatar
                                        src={pAvatarUrl}
                                        username={pName}
                                        size="xs"
                                        className="w-5 h-5 rounded-full text-[9px]"
                                      />
                                    </div>
                                    <span className="truncate text-[11px] font-semibold text-[var(--theme-text-primary)]">{pName}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
                                    {p.isMuted ? (
                                      <MicOff className="w-3 h-3 text-red-400" />
                                    ) : (
                                      <Mic className="w-3 h-3 text-emerald-400" />
                                    )}
                                    {p.isDeafened && (
                                      <Headphones className="w-3 h-3 text-red-400" title="Deafened" />
                                    )}
                                    {p.isCameraEnabled && (
                                      <Video className="w-3 h-3 text-emerald-400" />
                                    )}
                                    {p.isScreenSharing && (
                                      <span className="px-1.5 py-0.5 rounded text-[8px] bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-extrabold flex items-center gap-0.5 shadow-sm">
                                        <ScreenShare className="w-2.5 h-2.5" />
                                        <span>Screen Sharing</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : (
          /* Direct Messages List */
          <div className="space-y-3">
            {/* Direct Navigation destinations */}
            <div className="space-y-1">
              {onSelectFriends && (
                <button
                  type="button"
                  onClick={onSelectFriends}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer ${
                    activeFriends
                      ? 'bg-accent/20 text-accent font-extrabold border border-accent/30'
                      : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
                  }`}
                >
                  <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{lang === 'ar' ? 'الأصدقاء' : 'Friends'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-2 pt-1 border-t border-[var(--theme-border)]/40">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--theme-text-muted)]">
                {lang === 'ar' ? 'المحادثات الخاصة (DMs)' : 'Direct Messages'}
              </span>
              {onOpenNewDmModal && (
                <button
                  type="button"
                  onClick={onOpenNewDmModal}
                  className="flex items-center gap-1 text-[10px] text-accent hover:opacity-80 font-bold px-1.5 py-0.5 rounded-lg bg-accent/10 hover:bg-accent/20 cursor-pointer border-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'محادثة' : 'New DM'}</span>
                </button>
              )}
            </div>

            <div className="space-y-0.5">
              {dmChannels.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--theme-text-muted)] flex flex-col items-center gap-2">
                  <span>{lang === 'ar' ? 'لا توجد محادثات خاصة بعد' : 'No direct messages yet'}</span>
                  {onOpenNewDmModal && (
                    <button
                      type="button"
                      onClick={onOpenNewDmModal}
                      className="mt-1 flex items-center gap-1.5 text-xs text-accent hover:opacity-80 font-bold px-3 py-1.5 rounded-xl bg-accent/10 hover:bg-accent/20 cursor-pointer border-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'بدء محادثة جديدة' : 'Start a DM'}</span>
                    </button>
                  )}
                </div>
              ) : (
                dmChannels.map((c) => {
                  const isActive = activeChannel?.id === c.id;
                  const unread = unreadCounts?.[c.id];

                  return (
                    <div
                      key={c.id}
                      className={`relative group/dm flex items-center justify-between w-full px-3 py-1 rounded-xl transition-all ${
                        isActive
                          ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-extrabold shadow-xs'
                          : 'hover:bg-[var(--theme-bg-tertiary)] active:bg-[var(--theme-bg-tertiary)]/80 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectChannel(c)}
                        className="flex items-center gap-2 min-w-0 flex-1 py-1.5 cursor-pointer border-0 bg-transparent text-left text-inherit font-bold text-xs"
                      >
                        <div className="relative shrink-0 flex items-center">
                          {c.recipientUser?.avatar ? (
                            <img
                              src={`${pbService.getServerUrl()}/api/files/users/${c.recipientUser.id}/${c.recipientUser.avatar}`}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-700"
                            />
                          ) : (
                            <MessageSquare className="w-4 h-4 text-accent shrink-0" />
                          )}
                          {c.recipientUser && (
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-[var(--theme-bg-primary)] ${
                                getEffectiveUserStatus(c.recipientUser) === 'online'
                                  ? 'bg-[var(--status-online)]'
                                  : getEffectiveUserStatus(c.recipientUser) === 'away'
                                  ? 'bg-[var(--status-away)]'
                                  : getEffectiveUserStatus(c.recipientUser) === 'dnd'
                                  ? 'bg-[var(--status-dnd)]'
                                  : 'bg-[var(--status-offline)]'
                              }`}
                            />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 text-left">
                          <span className="truncate">{c.name}</span>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 relative z-10 shrink-0 pl-1">
                        {unread && unread.count > 0 && (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                            unread.hasMention && mentionBadgesEnabled ? 'bg-red-500 text-white' : 'bg-accent text-[var(--theme-accent-contrast,#ffffff)]'
                          }`}>
                            {unread.hasMention && mentionBadgesEnabled ? `@${unread.count}` : unread.count}
                          </span>
                        )}
                        {onCloseDm && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseDm(c);
                            }}
                            title={lang === 'ar' ? 'إغلاق المحادثة' : 'Close DM'}
                            className="opacity-0 group-hover/dm:opacity-100 focus:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all cursor-pointer border-0 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Persistent Minimized Voice Dock when connected to voice (Desktop only; Mobile uses floating bar) */}
      <div className="px-3 shrink-0 hidden md:block">
        <MinimizedVoiceBar
          variant="sidebar"
          onExpand={onExpandVoice || (() => {})}
          lang={lang}
          t={t}
          theme={theme}
          currentChannel={activeVoiceChannel}
        />
      </div>

      {/* User Footer Deck */}
      <div className="p-3 border-t border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] flex items-center gap-2.5 shrink-0 relative">
        {/* Status Quick Popover Menu */}
        <AnimatePresence>
          {showStatusPicker && (
            <>
              <div 
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setShowStatusPicker(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className={`absolute bottom-full ${lang === 'ar' ? 'right-3' : 'left-3'} mb-2 w-52 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg-card)] text-[var(--theme-text-primary)] p-2 shadow-2xl z-50 flex flex-col gap-1`}
              >
              <span className="text-[10px] font-extrabold text-[var(--theme-text-muted)] uppercase tracking-widest px-2.5 py-1">
                {lang === 'ar' ? 'تغيير الحالة' : 'Set Status'}
              </span>
              <button
                onClick={() => handleUpdateUserStatus('online')}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                  effectiveUserStatus === 'online' ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]' : 'hover:bg-[var(--theme-bg-tertiary)]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-online)] shrink-0 shadow-xs" />
                <span className="flex-1 rtl:text-right ltr:text-left">{lang === 'ar' ? 'متصل' : 'Online'}</span>
              </button>
              <button
                onClick={() => handleUpdateUserStatus('away')}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                  effectiveUserStatus === 'away' ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]' : 'hover:bg-[var(--theme-bg-tertiary)]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-away)] shrink-0 shadow-xs" />
                <span className="flex-1 rtl:text-right ltr:text-left">{lang === 'ar' ? 'بعيد' : 'Away'}</span>
              </button>
              <button
                onClick={() => handleUpdateUserStatus('dnd')}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                  effectiveUserStatus === 'dnd' ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]' : 'hover:bg-[var(--theme-bg-tertiary)]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-dnd)] shrink-0 shadow-xs" />
                <span className="flex-1 rtl:text-right ltr:text-left">{lang === 'ar' ? 'عدم الإزعاج' : 'Do Not Disturb'}</span>
              </button>
              <button
                onClick={() => handleUpdateUserStatus('offline')}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-0 ${
                  effectiveUserStatus === 'offline' ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)]' : 'hover:bg-[var(--theme-bg-tertiary)]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-offline)] shrink-0 shadow-xs" />
                <span className="flex-1 rtl:text-right ltr:text-left">{lang === 'ar' ? 'غير متصل (مخفي)' : 'Invisible'}</span>
              </button>

              <div className="my-1 border-t border-[var(--theme-border)]/50" />

              <button
                onClick={() => {
                  setShowStatusPicker(false);
                  setShowCustomStatusModal(true);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-accent hover:bg-accent/15 transition-all cursor-pointer border-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="flex-1 rtl:text-right ltr:text-left">{lang === 'ar' ? 'تعيين حالة نشاط مخصصة...' : 'Set Custom Status...'}</span>
              </button>
            </motion.div>
          </>
          )}
        </AnimatePresence>

        <div
          onClick={(e) => {
            if (onSelectSelfGlobalProfile) {
              onSelectSelfGlobalProfile(e.currentTarget);
            } else {
              onSelectUser?.(currentUser, e.currentTarget);
            }
          }}
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer p-1 rounded-xl hover:bg-[var(--theme-bg-tertiary)] transition-all"
        >
          <div 
            className="relative shrink-0 group/status cursor-pointer"
            title={lang === 'ar' ? 'عرض البروفايل' : 'View Profile'}
          >
            <Avatar
              src={getAvatarUrl()}
              username={currentUser.username}
              size="sm"
              frameId={currentUser.profile_frame || (currentUser as any).settings?.profile_frame}
              className="w-9 h-9 rounded-xl"
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h4 className={`text-xs font-black truncate leading-none ${themeClasses.textPrimary}`}>
              {currentUser.display_name || currentUser.username}
            </h4>
            <div className="flex items-center gap-1.5 mt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStatusPicker(!showStatusPicker);
                }}
                className={`text-[9px] font-mono font-bold uppercase tracking-wider transition-all border-0 rounded-md px-1.5 py-0.5 cursor-pointer flex items-center gap-1 ${
                  effectiveUserStatus === 'online' ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-border)]' :
                  effectiveUserStatus === 'away' ? 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-border)]' :
                  'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] hover:bg-[var(--theme-border)]'
                }`}
                title={lang === 'ar' ? 'تغيير الحالة الحالية' : 'Change current online status'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                <span>{effectiveUserStatus}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenSettings}
            title={t('settings')}
            className="p-2 rounded-xl hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-all cursor-pointer border-0"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onLogout}
            title={t('logout')}
            className="p-2 rounded-xl hover:bg-red-500/20 text-[var(--theme-text-secondary)] hover:text-red-400 transition-all cursor-pointer border-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showCustomStatusModal && (
        <CustomStatusModal
          currentUser={currentUser}
          onClose={() => setShowCustomStatusModal(false)}
          onUpdateUser={() => {
            window.dispatchEvent(new CustomEvent('user-presence-changed'));
          }}
          lang={lang}
        />
      )}
    </div>
  );
}

export default React.memo(ChannelList);
