import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { pbService, mergeUserRecord } from './pocketbase';
import { MessageDeletionService } from './services/messageDeletionService';
import { getLanguageDictionary } from './services/localization';
import { Bell, RefreshCw, Volume2, CheckCircle, AlertTriangle, RotateCcw, Download, Sparkles } from 'lucide-react';
import { User, Server, Channel, Message, MessageCursor, Attachment, Translation, AppLanguageConfig, MusicTrack, NotificationItem, UnreadChannelInfo, Call } from './types';
import { sendInAppNotification, requestNotificationPermission } from './lib/notifications';
import { notificationService } from './services/notificationService';
import { playLeaveSound, playPingSound } from './lib/sounds';
import {
  UserSettings,
  getCachedUserSettings,
  saveCachedUserSettings,
  applySettingsToDocument,
  mergeWithDefaults,
  resolveEffectiveTheme,
  formatBytes
} from './lib/userSettings';
import { processAndOptimizeUserAvatar } from './services/avatarProcessor';
import { backStackManager, useBackHandler } from './services/backStackManager';

// Components. Keep the authenticated workspace out of the initial auth
// bundle; it contains the chat renderer, media stack, and attachment code.
const AuthScreen = React.lazy(() => import('./components/AuthScreen'));
const ChannelList = React.lazy(() => import('./components/ChannelList'));
const ChatPanel = React.lazy(() => import('./components/ChatPanel'));
const VoicePanel = React.lazy(() => import('./components/VoicePanel'));
const UserProfileModal = React.lazy(() => import('./components/UserProfileModal'));
import NotificationToast, { ToastNotice } from './components/NotificationToast';
import NotificationsPopover from './components/NotificationsPopover';
import TitleBar from './components/TitleBar';
import { CURRENT_APP_VERSION } from './config/version';
const ResetPasswordScreen = React.lazy(() => import('./components/ResetPasswordScreen'));
import { isTauriEnvironment, isMobilePlatform } from './lib/platform';
const GlobalMusicPlayer = React.lazy(async () => {
  const module = await import('./components/MusicPlayer');
  return { default: module.GlobalMusicPlayer };
});

// Code-Split Lazy Loaded Components
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));
const ServerSettingsModal = React.lazy(() => import('./components/ServerSettingsModal'));
const DiscoveryCenter = React.lazy(() => import('./components/DiscoveryCenter'));
const CreateServerModal = React.lazy(() => import('./components/CreateServerModal'));
const NewDmModal = React.lazy(() => import('./components/NewDmModal'));
const FloatingCallWindow = React.lazy(async () => {
  const module = await import('./components/FloatingCallWindow');
  return { default: module.FloatingCallWindow };
});
const LeaveServerModal = React.lazy(() => import('./components/LeaveServerModal'));
import wsService from './services/websocket';
import callSignalingService from './services/callSignaling';
import { parseCallLog } from './services/callLogService';
import { offlineCacheService } from './services/offlineCacheService';
import { parseReactions, toggleReactionInList } from './components/MessageReactions';
import { areMessagesEqual, isSingleMessageEqual, mergeMessageListPreservingReferences } from './lib/messageDiff';
import { mergeMessagesChronologically } from './lib/messagePagination';
import useRealtimeMedia, { ensureMediaProvider, getRegisteredMediaContext } from './context/MediaContextBridge';
import voicePresenceStore from './services/voicePresenceStore';
import type { ActiveUploadState } from './components/ChatPanel';
import type { AnchorRect } from './components/UserProfileModal';

const EMPTY_ACTIVE_CALLS: Call[] = [];
const loadCapacitorApp = () => import('@capacitor/app').then((module) => module.App);
const isDirectMessageChannel = (channel?: Partial<Channel> | null): boolean => Boolean(
  channel && (
    channel.server === 'dm' ||
    channel.id?.startsWith('dm-') ||
    channel.id?.startsWith('private-') ||
    channel.name?.startsWith('@')
  )
);

const MAX_ACTIVE_MESSAGES = 500;

/**
 * Keep the active React window bounded while retaining every fetched page in
 * the offline cache. Older-page loads slide the window toward the beginning
 * of the conversation so an anchored prepend remains visible.
 */
function selectActiveMessageWindow(all: Message[], previous: Message[] = [], prependOlder = false): Message[] {
  if (all.length <= MAX_ACTIVE_MESSAGES) return all;
  if (!prependOlder || previous.length === 0) return all.slice(-MAX_ACTIVE_MESSAGES);

  const previousFirst = previous.find((message) => !message.id.startsWith('optimistic-'))?.id || previous[0]?.id;
  const anchorIndex = previousFirst ? all.findIndex((message) => message.id === previousFirst) : -1;
  if (anchorIndex < 0) return all.slice(-MAX_ACTIVE_MESSAGES);

  // Always make room for at least one older page. If the current window is
  // smaller than the cap, use the remaining capacity before sliding further.
  const olderBudget = Math.max(50, MAX_ACTIVE_MESSAGES - Math.min(previous.length, MAX_ACTIVE_MESSAGES));
  const start = Math.max(0, anchorIndex - olderBudget);
  return all.slice(start, start + MAX_ACTIVE_MESSAGES);
}

// Keep lazy chunks from looking like a broken/white page on slower phones.
// This component deliberately uses only inline classes and no lazy imports.
const AppLoadingFallback = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex h-full w-full min-h-[72px] items-center justify-center bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)]">
    <div className={`flex items-center gap-2 ${compact ? 'text-[10px]' : 'text-xs'} font-medium`}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      {!compact && <span>Loading SirverData…</span>}
    </div>
  </div>
);

function extractResetTokenFromUrl(urlStr?: string): string | null {
  if (typeof window === 'undefined') return null;
  const target = urlStr || window.location.href;
  try {
    const parsed = new URL(target);
    const t = parsed.searchParams.get('token');
    if (t) return t;
  } catch (e) {}
  if (target.includes('token=')) {
    const match = target.match(/token=([^&]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(() => extractResetTokenFromUrl());
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesPage, setMessagesPage] = useState<number>(1);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isInitialLoadingChannel, setIsInitialLoadingChannel] = useState<boolean>(false);
  
  // Unread, Toast & Notification states
  const [unreadCounts, setUnreadCounts] = useState<Record<string, UnreadChannelInfo>>({});
  const [activeUnreadCountOnOpen, setActiveUnreadCountOnOpen] = useState<{ channelId: string; count: number } | null>(null);
  const [activeToast, setActiveToast] = useState<ToastNotice | null>(null);
  const [notificationsList, setNotificationsList] = useState<NotificationItem[]>([]);
  const [showNotificationsPopover, setShowNotificationsPopover] = useState<boolean>(false);
  const [showNewDmModal, setShowNewDmModal] = useState<boolean>(false);
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<ActiveUploadState | null>(null);
  
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [activeServerChannel, setActiveServerChannel] = useState<Channel | null>(null);
  const [activeDmChannel, setActiveDmChannel] = useState<Channel | null>(null);
  const [activeVoiceChannel, setActiveVoiceChannel] = useState<Channel | null>(null);
  const [pendingVoiceSwitchChannel, setPendingVoiceSwitchChannel] = useState<Channel | null>(null);
  const lastVoiceChannelRef = useRef<Channel | null>(null);
  const [activeCallMode, setActiveCallMode] = useState<'voice' | 'video' | 'screen'>('voice');
  const previousTextChannelRef = useRef<Channel | null>(null);
  const [showDiscoveryCenter, setShowDiscoveryCenter] = useState(false);
  const [discoveryTab, setDiscoveryTab] = useState<'friends' | 'servers'>('servers');
  const [allDmChannels, setAllDmChannels] = useState<Channel[]>([]);
  const [closedDmIds, setClosedDmIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`closed_dms_${pbService.getCurrentUser()?.id}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { activeRoom, leaveRoomOrCall, joinVoiceRoom, startDmCall } = useRealtimeMedia();

  const prevActiveRoomIdRef = useRef<string | null>(null);

  // Deep link listener & web redirect logic for password reset tokens (sirver://reset-password?token=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialToken = extractResetTokenFromUrl(window.location.href);
    if (initialToken) {
      if (window.location.protocol.startsWith('http') && window.location.pathname.includes('/reset-password')) {
        const isNative = isTauriEnvironment() || isMobilePlatform();
        if (!isNative) {
          // Attempt opening the installed native application via custom protocol sirver://
          const appUri = `sirver://reset-password?token=${encodeURIComponent(initialToken)}`;
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = appUri;
          document.body.appendChild(iframe);
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1500);
        }
      }
      setResetToken(initialToken);
    }

    if (!isMobilePlatform()) return;
    let capListener: any = null;
    let cancelled = false;
    loadCapacitorApp().then((CapApp) => {
      if (cancelled) return;
      capListener = CapApp.addListener('appUrlOpen', (data: any) => {
        if (data?.url) {
          const deepToken = extractResetTokenFromUrl(data.url);
          if (deepToken) setResetToken(deepToken);
        }
      });
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (capListener && typeof capListener.then === 'function') {
        capListener.then((h: any) => h?.remove?.()).catch(() => {});
      }
    };
  }, []);

  // Sync activeVoiceChannel with activeRoom in MediaContext and navigate to voice channel screen on join
  useEffect(() => {
    const currentRoomId = activeRoom?.roomId || null;
    if (currentRoomId && currentRoomId !== prevActiveRoomIdRef.current) {
      // Find matching voice channel in channels or allDmChannels or activeVoiceChannel
      const matchedVoiceChan =
        (activeVoiceChannel && activeVoiceChannel.id === currentRoomId ? activeVoiceChannel : null) ||
        channels.find((c) => c.id === currentRoomId) ||
        allDmChannels.find((c) => c.id === currentRoomId);

      if (matchedVoiceChan) {
        if (matchedVoiceChan.server && matchedVoiceChan.server !== 'dm' && matchedVoiceChan.server !== activeServer?.id) {
          const parentServer = servers.find((s) => s.id === matchedVoiceChan.server);
          if (parentServer) {
            setActiveServer(parentServer);
          }
        }
        if (activeChannel && activeChannel.type !== 'voice' && activeChannel.id !== matchedVoiceChan.id) {
          previousTextChannelRef.current = activeChannel;
        }
        setActiveVoiceChannel(matchedVoiceChan);
        setActiveChannel(matchedVoiceChan);
        setShowDiscoveryCenter(false);
      }
    } else if (!activeRoom && activeVoiceChannel) {
      setActiveVoiceChannel(null);
    }
    prevActiveRoomIdRef.current = currentRoomId;
  }, [activeRoom, activeVoiceChannel, channels, allDmChannels, servers, activeServer, activeChannel]);

  // Connection & settings
  const isDemo = false; // Always connected to sirverdata only
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarDragState, setSidebarDragState] = useState<{
    isDragging: boolean;
    dragX: number;
    opacity: number;
  }>({ isDragging: false, dragX: 0, opacity: 0 });

  const sidebarTouchRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    axis: 'horizontal' | 'vertical' | null;
    initialIsOpen: boolean;
    active: boolean;
  } | null>(null);

  const [serverUrl, setServerUrl] = useState(pbService.getServerUrl());
  
  // Default to Arabic lang
  const [lang, setLang] = useState<'en' | 'ar'>(() => {
    const saved = localStorage.getItem('app_lang');
    return (saved === 'en' || saved === 'ar') ? saved : 'ar';
  });
  const [langConfig, setLangConfig] = useState<AppLanguageConfig>({});

  // User Settings state
  const [userSettings, setUserSettings] = useState<UserSettings>(() => getCachedUserSettings());

  // Apply settings to document on initial mount and change
  useEffect(() => {
    applySettingsToDocument(userSettings);
    voicePresenceStore.init();
  }, [userSettings]);

  // Intercept native Tauri window close button (X) to hide instead of exit
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let unlisten: (() => void) | null = null;
    import('./lib/tauriDesktopService').then(({ setupWindowCloseRequestedListener }) => setupWindowCloseRequestedListener()).then((fn) => {
      if (fn) unlisten = fn;
    }).catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleUpdateUserSettings = (newSettings: UserSettings) => {
    setUserSettings(newSettings);
    saveCachedUserSettings(newSettings);
    applySettingsToDocument(newSettings);

    if (newSettings.languageRegion.appLanguage !== lang) {
      setLang(newSettings.languageRegion.appLanguage);
      localStorage.setItem('app_lang', newSettings.languageRegion.appLanguage);
    }

    if (currentUser) {
      pbService.updateProfile(currentUser.id, { settings: newSettings }).catch((e) => {
        console.warn('Failed to sync settings to PocketBase profile:', e);
      });
    }
  };

  const effectiveTheme = resolveEffectiveTheme(userSettings.appearance.theme);

  // Audio state
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [activeGlobalTrack, setActiveGlobalTrack] = useState<MusicTrack | null>(null);
  const [leavingServer, setLeavingServer] = useState<Server | null>(null);

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<User | null>(null);
  const [profileAnchorRect, setProfileAnchorRect] = useState<AnchorRect | null>(null);
  const [isGlobalSelfProfile, setIsGlobalSelfProfile] = useState<boolean>(false);
  const [serverSettingsModalServer, setServerSettingsModalServer] = useState<Server | null>(null);
  const lastProfileSelectTimeRef = useRef<number>(0);

  const handleSelectUser = (
    user: User | null,
    anchor?: AnchorRect | HTMLElement | MouseEvent | React.MouseEvent | null,
    isEditableSelf: boolean = false
  ) => {
    const now = Date.now();
    // Guard against identical event firing within 30ms (e.g. pointerdown + click on same tap)
    if (user && now - lastProfileSelectTimeRef.current < 30) {
      return;
    }
    lastProfileSelectTimeRef.current = now;

    setIsGlobalSelfProfile(isEditableSelf);

    if (!user) {
      setSelectedUserProfile(null);
      setProfileAnchorRect(null);
      setIsGlobalSelfProfile(false);
      return;
    }
    if (anchor) {
      let targetEl: HTMLElement | null = null;

      if (typeof anchor === 'object' && anchor !== null) {
        if ('currentTarget' in anchor && (anchor as any).currentTarget instanceof HTMLElement) {
          targetEl = (anchor as any).currentTarget;
        } else if ('target' in anchor && (anchor as any).target instanceof HTMLElement) {
          targetEl = (anchor as any).target;
        } else if (anchor instanceof HTMLElement) {
          targetEl = anchor;
        }
      }

      if (targetEl) {
        // Check if target element is inside the desktop server member list
        const memberListDesktopEl = targetEl.closest?.('[data-member-list-desktop="true"]');
        const isMemberListDesktop = Boolean(memberListDesktopEl) && window.innerWidth >= 768;

        // Resolve anchor directly to the avatar element if present in target or nearby row
        const avatarEl =
          targetEl.querySelector?.('[data-member-avatar="true"], img, [data-avatar], .app-message-avatar, .rounded-lg, .rounded-xl, .rounded-full') ||
          targetEl.closest?.('.flex, li, button, div.group, .app-message-avatar')?.querySelector?.('[data-member-avatar="true"], img, [data-avatar], .app-message-avatar, .rounded-lg, .rounded-xl, .rounded-full') ||
          targetEl;

        const elToMeasure = (avatarEl as HTMLElement) || targetEl;
        const r = elToMeasure.getBoundingClientRect();

        let memberListLeft: number | undefined = undefined;
        let memberListRight: number | undefined = undefined;

        if (isMemberListDesktop && memberListDesktopEl) {
          const mlRect = memberListDesktopEl.getBoundingClientRect();
          memberListLeft = mlRect.left;
          memberListRight = mlRect.right;
        }

        setProfileAnchorRect({
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          isMemberListDesktop,
          memberListLeft,
          memberListRight,
        });
      } else if (typeof anchor === 'object' && 'getBoundingClientRect' in anchor && typeof (anchor as any).getBoundingClientRect === 'function') {
        const r = (anchor as any).getBoundingClientRect();
        setProfileAnchorRect({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
      } else if (typeof anchor === 'object' && 'left' in anchor && 'top' in anchor && !('clientX' in anchor)) {
        setProfileAnchorRect(anchor as AnchorRect);
      } else {
        setProfileAnchorRect(null);
      }
    } else {
      setProfileAnchorRect(null);
    }
    if (selectedUserProfile?.id === user.id) {
      setSelectedUserProfile({ ...user });
    } else {
      setSelectedUserProfile(user);
    }
  };

  // Disable default browser context menu globally; custom app context menus will continue working
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Caching mechanism for instant browsing experience (SWR pattern)
  const channelsCache = useRef<Record<string, Channel[]>>({});
  const messagesCache = useRef<Record<string, { items: Message[]; page: number; hasMore: boolean }>>({});
  const messageCacheFreshnessRef = useRef<Record<string, number>>({});
  // Each conversation owns its request generation so a slow response from a
  // previous channel cannot invalidate or overwrite an unrelated channel.
  const messageRequestGenerationRef = useRef<Record<string, number>>({});
  const messageCursorRef = useRef<Record<string, MessageCursor | null>>({});
  const messageLoadingRef = useRef<Set<string>>(new Set());
  const stagedLoadTimerRef = useRef<any>(null);
  const messageCacheTtlMs = 15000;

  // Refs for tracking changes without triggering re-renders in effects
  const channelsRef = useRef<Channel[]>([]);
  const activeChannelRef = useRef<Channel | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const langRef = useRef<string>('en');
  const activeServerRef = useRef<Server | null>(null);
  const handleSelectNotificationRef = useRef<((notif: NotificationItem) => void) | null>(null);

  useEffect(() => { channelsRef.current = channels; }, [channels]);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { activeServerRef.current = activeServer; }, [activeServer]);

  // Initialize native Android & local notification channels and setup tap listeners
  useEffect(() => {
    notificationService.init();
    const unsub = notificationService.onNotificationTapped((notif) => {
      if (handleSelectNotificationRef.current) {
        handleSelectNotificationRef.current(notif);
      }
    });
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (activeChannel) {
      const isDm = isDirectMessageChannel(activeChannel);
      if (isDm) {
        setActiveDmChannel(activeChannel);
      } else {
        setActiveServerChannel(activeChannel);
      }
    }
  }, [activeChannel]);

  // Track active modals and overlays in ref for back button handler
  const modalsStateRef = useRef({
    selectedUserProfile: null as User | null,
    showSettings: false,
    serverSettingsModalServer: null as Server | null,
    showCreateServer: false,
    showDiscoveryCenter: false,
    showNotificationsPopover: false,
    showNewDmModal: false,
    activeUpload: null as ActiveUploadState | null,
    isSidebarOpen: false,
  });

  useEffect(() => {
    modalsStateRef.current = {
      selectedUserProfile,
      showSettings,
      serverSettingsModalServer,
      showCreateServer,
      showDiscoveryCenter,
      showNotificationsPopover,
      showNewDmModal,
      activeUpload,
      isSidebarOpen,
    };
  }, [
    selectedUserProfile,
    showSettings,
    serverSettingsModalServer,
    showCreateServer,
    showDiscoveryCenter,
    showNotificationsPopover,
    showNewDmModal,
    activeUpload,
    isSidebarOpen,
  ]);

  // Register LIFO Back Stack handlers for top-level modals & overlays
  useBackHandler('app-user-profile', Boolean(selectedUserProfile), () => setSelectedUserProfile(null));
  useBackHandler('app-settings', showSettings, () => setShowSettings(false));
  useBackHandler('app-server-settings', Boolean(serverSettingsModalServer), () => setServerSettingsModalServer(null));
  useBackHandler('app-create-server', showCreateServer, () => setShowCreateServer(false));
  useBackHandler('app-discovery', showDiscoveryCenter, () => setShowDiscoveryCenter(false));
  useBackHandler('app-notifications-popover', showNotificationsPopover, () => setShowNotificationsPopover(false));
  useBackHandler('app-new-dm-modal', showNewDmModal, () => setShowNewDmModal(false));
  useBackHandler('app-active-upload', Boolean(activeUpload), () => setActiveUpload(null));
  useBackHandler('app-sidebar-drawer', isSidebarOpen, () => setIsSidebarOpen(false));

  // Native 1:1 Edge & Drag Gesture Manager for Mobile Sidebar Drawer
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768) return;
      if (e.touches.length !== 1) return;

      if (showSettings || showCreateServer || selectedUserProfile || serverSettingsModalServer || showDiscoveryCenter) return;

      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      const isRtl = lang === 'ar';
      const edgeThreshold = 35;

      let isTriggerable = false;

      if (!isSidebarOpen) {
        if (isRtl) {
          if (startX >= window.innerWidth - edgeThreshold) isTriggerable = true;
        } else {
          if (startX <= edgeThreshold) isTriggerable = true;
        }
      } else {
        isTriggerable = true;
      }

      if (isTriggerable) {
        sidebarTouchRef.current = {
          startX,
          startY,
          lastX: startX,
          lastTime: Date.now(),
          axis: null,
          initialIsOpen: isSidebarOpen,
          active: true,
        };
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
      }
    };

    let dragRaf: number | null = null;
    let pendingDragState: any = null;

    const scheduleDragState = (newState: any) => {
      pendingDragState = newState;
      if (dragRaf === null) {
        dragRaf = requestAnimationFrame(() => {
          dragRaf = null;
          if (pendingDragState) {
            setSidebarDragState(pendingDragState);
          }
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!sidebarTouchRef.current || !sidebarTouchRef.current.active) return;
      const state = sidebarTouchRef.current;
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;

      if (state.axis === null) {
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
          state.axis = 'vertical';
          state.active = false;
          window.removeEventListener('touchmove', handleTouchMove);
          window.removeEventListener('touchend', handleTouchEnd);
          window.removeEventListener('touchcancel', handleTouchEnd);
          return;
        } else if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
          state.axis = 'horizontal';
        }
      }

      if (state.axis === 'horizontal') {
        if (e.cancelable) e.preventDefault();

        state.lastX = touch.clientX;
        state.lastTime = Date.now();

        const isRtl = lang === 'ar';
        const drawerWidth = window.innerWidth < 640 ? Math.min(window.innerWidth * 0.5, 280) : Math.min(window.innerWidth * 0.42, 340);
        let translateX = 0;

        if (!isRtl) {
          if (!state.initialIsOpen) {
            const dragDelta = Math.max(0, Math.min(drawerWidth, deltaX));
            translateX = -drawerWidth + dragDelta;
          } else {
            const dragDelta = Math.min(0, Math.max(-drawerWidth, deltaX));
            translateX = dragDelta;
          }
        } else {
          if (!state.initialIsOpen) {
            const dragDelta = Math.max(0, Math.min(drawerWidth, -deltaX));
            translateX = drawerWidth - dragDelta;
          } else {
            const dragDelta = Math.min(drawerWidth, Math.max(0, deltaX));
            translateX = dragDelta;
          }
        }

        const opacity = !isRtl
          ? Math.max(0, Math.min(1, (drawerWidth + translateX) / drawerWidth))
          : Math.max(0, Math.min(1, (drawerWidth - translateX) / drawerWidth));

        scheduleDragState({
          isDragging: true,
          dragX: translateX,
          opacity,
        });
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);

      if (dragRaf !== null) {
        cancelAnimationFrame(dragRaf);
        dragRaf = null;
      }

      if (!sidebarTouchRef.current || !sidebarTouchRef.current.active) return;
      const state = sidebarTouchRef.current;
      sidebarTouchRef.current = null;

      if (state.axis !== 'horizontal') {
        setSidebarDragState({ isDragging: false, dragX: 0, opacity: 0 });
        return;
      }

      const touch = e.changedTouches[0];
      const endX = touch ? touch.clientX : state.lastX;
      const elapsedTime = Math.max(1, Date.now() - state.lastTime);
      const velocityX = (endX - state.lastX) / elapsedTime;
      const totalDeltaX = endX - state.startX;
      const isRtl = lang === 'ar';
      const drawerWidth = window.innerWidth < 640 ? Math.min(window.innerWidth * 0.5, 280) : Math.min(window.innerWidth * 0.42, 340);
      const threshold = drawerWidth * 0.4;

      let shouldOpen = state.initialIsOpen;

      if (!isRtl) {
        if (!state.initialIsOpen) {
          if (totalDeltaX > threshold || velocityX > 0.25) shouldOpen = true;
        } else {
          if (totalDeltaX < -threshold || velocityX < -0.25) shouldOpen = false;
        }
      } else {
        if (!state.initialIsOpen) {
          if (totalDeltaX < -threshold || velocityX < -0.25) shouldOpen = true;
        } else {
          if (totalDeltaX > threshold || velocityX > 0.25) shouldOpen = false;
        }
      }

      setIsSidebarOpen(shouldOpen);
      setSidebarDragState({ isDragging: false, dragX: 0, opacity: 0 });
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isSidebarOpen, lang, showSettings, showCreateServer, selectedUserProfile, serverSettingsModalServer, showDiscoveryCenter]);

  // Menu / Modal back navigation logic fallback for active channel / server
  const handleGoBackInMenu = (): boolean => {
    if (activeChannelRef.current) {
      setActiveChannel(null);
      return true;
    }

    if (activeServerRef.current) {
      setActiveServer(null);
      return true;
    }

    return false;
  };

  const [exitToast, setExitToast] = useState<string | null>(null);
  const lastBackPressTimeRef = useRef<number>(0);

  // Hardware and browser back button listener
  useEffect(() => {
    try {
      window.history.pushState({ appNav: true }, '');
    } catch (e) {}

    let exitTimer: any = null;

    const handleDoubleBackExit = () => {
      const now = Date.now();
      if (lastBackPressTimeRef.current && (now - lastBackPressTimeRef.current < 2000)) {
        if (exitTimer) clearTimeout(exitTimer);
        lastBackPressTimeRef.current = 0;
        setExitToast(null);
          if (isMobilePlatform()) {
            loadCapacitorApp().then((CapApp) => {
              try { CapApp.exitApp(); } catch (e) {
                try { CapApp.minimizeApp(); } catch (err) {}
              }
            }).catch(() => {});
          }
      } else {
        lastBackPressTimeRef.current = now;
        const msg = langRef.current === 'ar' ? 'اضغط رجوع مرة أخرى للخروج' : 'Press back again to exit';
        setExitToast(msg);
        if (exitTimer) clearTimeout(exitTimer);
        exitTimer = setTimeout(() => {
          setExitToast(null);
          lastBackPressTimeRef.current = 0;
        }, 2000);
      }
    };

    const triggerGlobalBack = () => {
      // 1. Pop most recent modal/sheet/dialog from LIFO BackStack Manager
      const handledByStack = backStackManager.handleBack();
      if (handledByStack) {
        return true;
      }

      // 2. Close open side panel (channel sidebar)
      if (isSidebarOpen) {
        setIsSidebarOpen(false);
        return true;
      }

      // 3. Leave voice channel and restore previous text channel context
      if (activeVoiceChannel || (activeChannel && activeChannel.type === 'voice')) {
        setActiveVoiceChannel(null);
        if (previousTextChannelRef.current) {
          setActiveChannel(previousTextChannelRef.current);
          previousTextChannelRef.current = null;
        }
        return true;
      }

      // 4. Fallback to channel/server menu navigation
      const handledByMenu = handleGoBackInMenu();
      if (handledByMenu) {
        return true;
      }

      // 5. Trigger double-back exit confirmation toast
      handleDoubleBackExit();
      return false;
    };

    const handlePopState = () => {
      const handled = triggerGlobalBack();
      try {
        window.history.pushState({ appNav: true }, '');
      } catch (e) {}
    };

    window.addEventListener('popstate', handlePopState);

    let capListener: any = null;
    if (isMobilePlatform()) {
      loadCapacitorApp().then((CapApp) => CapApp.addListener('backButton', () => {
        triggerGlobalBack();
      })).then((l) => { capListener = l; }).catch(() => {});
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (capListener && typeof capListener.remove === 'function') {
        capListener.remove();
      }
    };
  }, []);

  // 1. Restore Auth Session on load & perform background update check
  useEffect(() => {
    const user = pbService.getCurrentUser();
    const cachedSettings = getCachedUserSettings();
    if (user) {
      setCurrentUser(user);
      let userSet = user.settings;
      if (typeof userSet === 'string') {
        try { userSet = JSON.parse(userSet); } catch (e) {}
      }
      const merged = mergeWithDefaults({
        ...cachedSettings,
        ...(userSet || {}),
        appearance: {
          ...cachedSettings.appearance,
          ...(userSet?.appearance || {}),
        },
        languageRegion: {
          ...cachedSettings.languageRegion,
          ...(userSet?.languageRegion || {}),
        },
      });
      setUserSettings(merged);
      saveCachedUserSettings(merged);
      applySettingsToDocument(merged);

      // Restore user's saved language immediately
      const settingsLang = merged.languageRegion?.appLanguage;
      const rawPref = (user as any)?.preferred_language || (user as any)?.preferredLanguage || user?.language;
      let targetLang: 'en' | 'ar' | null = null;
      if (settingsLang === 'en' || settingsLang === 'ar') {
        targetLang = settingsLang;
      } else if (rawPref) {
        const lower = String(rawPref).toLowerCase().trim();
        if (lower.startsWith('ar') || lower.includes('arabic') || lower.includes('العربية')) targetLang = 'ar';
        else if (lower.startsWith('en') || lower.includes('english')) targetLang = 'en';
      }
      if (targetLang) {
        setLang(targetLang);
        localStorage.setItem('app_lang', targetLang);
      }
    } else {
      applySettingsToDocument(cachedSettings);
    }
    requestNotificationPermission();

    // Verify and refresh auth session against the server in the background
    if (user) {
      pbService.refreshAuth().then((refreshedUser) => {
        if (refreshedUser) {
          setCurrentUser(refreshedUser);
        } else if (!pbService.getCurrentUser()) {
          setCurrentUser(null);
        }
      }).catch(() => {});
    }
  }, []);

  // 1a. Listen for session expiration events and reset user state cleanly
  useEffect(() => {
    const handleAuthExpired = () => {
      setCurrentUser(null);
    };
    window.addEventListener('auth-session-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-session-expired', handleAuthExpired);
  }, []);

  // 1b. Sync current user to Call Signaling Service
  useEffect(() => {
    callSignalingService.setCurrentUser(currentUser);
    // Do not open a persistent chat socket for the auth screen or guests.
    // The connection starts only after a valid session is present.
    if (currentUser?.id) {
      wsService.connect(currentUser.id);
    } else {
      wsService.disconnect();
    }
  }, [currentUser]);

  // 1c. User presence heartbeat to signal real-time connectivity (90s interval to prevent DB write lock thrashing)
  useEffect(() => {
    if (!currentUser?.id) return;
    
    let isCancelled = false;

    const triggerHeartbeat = async () => {
      if (isCancelled || (typeof document !== 'undefined' && document.hidden)) return;
      try {
        await pbService.sendHeartbeat(currentUser.id);
      } catch (e) {
        console.warn('Presence heartbeat failed:', e);
      }
    };
    
    triggerHeartbeat();
    
    const interval = setInterval(triggerHeartbeat, 90000); // 90 seconds

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerHeartbeat();
      }
    };
    
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', triggerHeartbeat);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', triggerHeartbeat);
    };
  }, [currentUser?.id]);

  // 1c. Set user status to 'offline' when closing the tab/window
  useEffect(() => {
    if (!currentUser) return;

    const handleBeforeUnload = () => {
      try {
        const url = `${pbService.getServerUrl()}/api/collections/users/records/${currentUser.id}`;
        const body = JSON.stringify({ status: 'offline' });
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } catch (e) {
        console.warn('Failed to send offline beacon:', e);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser?.id]);

  // Real-time listener for server profile updates, ownership transfers, and leaves
  useEffect(() => {
    const handleServerUpdated = (e: CustomEvent) => {
      const { serverId, server, owner } = e.detail || {};
      if (!serverId) return;
      setServers((prev) =>
        prev.map((s) => {
          if (s.id === serverId) {
            return {
              ...s,
              ...(server || {}),
              ...(owner ? { owner } : {})
            };
          }
          return s;
        })
      );
      if (activeServer?.id === serverId) {
        setActiveServer((prev) =>
          prev
            ? {
                ...prev,
                ...(server || {}),
                ...(owner ? { owner } : {})
              }
            : null
        );
      }
    };

    const handleServerMemberUpdated = (e: CustomEvent) => {
      const { serverId, userId, is_member } = e.detail || {};
      if (!serverId || !userId) return;
      if (currentUser && userId === currentUser.id && is_member === false) {
        setServers((prev) => prev.filter((s) => s.id !== serverId));
        if (activeServer?.id === serverId) {
          setServers((prev) => {
            const remaining = prev.filter((s) => s.id !== serverId);
            if (remaining.length > 0) {
              setActiveServer(remaining[0]);
              loadChannels(remaining[0].id);
            } else {
              setActiveServer(null);
              setChannels([]);
              setActiveChannel(null);
              setShowDiscoveryCenter(true);
            }
            return remaining;
          });
        }
      }
    };

    window.addEventListener('server-updated', handleServerUpdated as EventListener);
    window.addEventListener('server-member-updated', handleServerMemberUpdated as EventListener);
    return () => {
      window.removeEventListener('server-updated', handleServerUpdated as EventListener);
      window.removeEventListener('server-member-updated', handleServerMemberUpdated as EventListener);
    };
  }, [activeServer?.id, currentUser?.id]);

  // 1d. Subscribe to App Config for real-time Database URL changes across connected clients
  useEffect(() => {
    const unsub = pbService.subscribeToAppConfig((newUrl) => {
      if (newUrl && newUrl !== pbService.getServerUrl()) {
        console.log('Syncing updated database URL from admin config:', newUrl);
        pbService.setServerUrl(newUrl);
        setServerUrl(newUrl);
        localStorage.setItem('sirver_pb_url', newUrl);
      }
    });
    return () => unsub();
  }, []);

  // 1e. Load user's saved notifications from database on login
  useEffect(() => {
    if (currentUser?.id) {
      const isCallSignal = (n: NotificationItem | any) => {
        const content = n.message_content || n.message || '';
        if (typeof content === 'string' && (content.includes('INCOMING_CALL:') || content.startsWith('INCOMING_CALL:'))) return true;
        if (n.id && String(n.id).startsWith('call_') && !content.includes('[CALL_LOG:')) return true;
        return false;
      };

      if (currentUser.notifications) {
        if (typeof currentUser.notifications === 'string') {
          try {
            const parsed = JSON.parse(currentUser.notifications);
            if (Array.isArray(parsed)) {
              setNotificationsList(parsed.filter((n) => !isCallSignal(n)));
            }
          } catch (e) {}
        } else if (Array.isArray(currentUser.notifications)) {
          setNotificationsList(currentUser.notifications.filter((n) => !isCallSignal(n)));
        }
      } else {
        pbService.getUserNotifications(currentUser.id).then((notifs) => {
          if (notifs && notifs.length > 0) {
            setNotificationsList(notifs.filter((n) => !isCallSignal(n)));
          }
        });
      }
    }
  }, [currentUser?.id]);

  // Sync unread counts from loaded unread notifications so badges persist accurately across reloads
  useEffect(() => {
    if (notificationsList.length > 0) {
      const unreadFromNotifs: Record<string, UnreadChannelInfo> = {};
      notificationsList.forEach((n) => {
        if (!n.read) {
          const isDm = n.type === 'dm' || n.channel_id === 'dm' || n.channel_id?.startsWith('dm-') || n.channel_id?.startsWith('dm-server-') || !!n.private_chat_id || n.server_id === 'dm';
          const rawChanId = n.channel_id || '';
          const chanId = isDm
            ? (rawChanId && rawChanId !== 'dm' ? rawChanId : (n.private_chat_id ? `dm-server-${n.private_chat_id}` : 'dm'))
            : rawChanId;
          
          if (!chanId) return;

          const srvId = isDm ? 'dm' : (n.server_id && n.server_id !== 'dm' ? n.server_id : '');
          const isMention = n.type === 'mention' || n.type === 'reply' || n.type === 'dm';

          if (!unreadFromNotifs[chanId]) {
            unreadFromNotifs[chanId] = {
              channelId: chanId,
              serverId: srvId,
              count: 1,
              hasMention: isMention,
              lastMentionMsgId: n.message_id
            };
          } else {
            unreadFromNotifs[chanId].count += 1;
            if (isMention) {
              unreadFromNotifs[chanId].hasMention = true;
            }
            if (n.message_id && !unreadFromNotifs[chanId].lastMentionMsgId) {
              unreadFromNotifs[chanId].lastMentionMsgId = n.message_id;
            }
          }
        }
      });

      setUnreadCounts((prev) => {
        const updated = { ...prev };
        Object.keys(unreadFromNotifs).forEach((cId) => {
          if (!updated[cId]) {
            updated[cId] = unreadFromNotifs[cId];
          } else {
            updated[cId] = {
              ...updated[cId],
              serverId: unreadFromNotifs[cId].serverId || updated[cId].serverId,
              hasMention: updated[cId].hasMention || unreadFromNotifs[cId].hasMention,
              lastMentionMsgId: updated[cId].lastMentionMsgId || unreadFromNotifs[cId].lastMentionMsgId
            };
          }
        });
        return updated;
      });
    }
  }, [notificationsList]);
  useEffect(() => {
    const initTranslations = async () => {
      try {
        const records = await pbService.fetchTranslations();
        const config = getLanguageDictionary(records, lang);
        setLangConfig(config);
      } catch (err) {
        console.warn('Error loading translations:', err);
      }
    };
    initTranslations();
  }, [lang]);

  // 3. Fetch servers on login / toggle modes
  useEffect(() => {
    if (currentUser?.id) {
      loadServers();
    }
  }, [currentUser?.id, isDemo]);

  // In-memory instant DM channels cache per user
  const inMemoryDmCacheRef = useRef<Map<string, Channel[]>>(new Map());

  const loadAllDmChannels = async () => {
    if (!currentUser?.id) return;
    const userId = currentUser.id;

    // 1. Instant sync load from in-memory / local cache for 0ms transition
    let cachedDms = inMemoryDmCacheRef.current.get(userId) || offlineCacheService.getDmChannelsSync(userId) || pbService.getCachedDmChannels(userId);
    if (cachedDms && cachedDms.length > 0) {
      inMemoryDmCacheRef.current.set(userId, cachedDms);
      const visible = cachedDms.filter(
        (c) =>
          !closedDmIds.has(c.id) &&
          (!c.recipientUser?.id ||
            (!closedDmIds.has(c.recipientUser.id) &&
              !closedDmIds.has(`dm-user-${c.recipientUser.id}`)))
      );
      setAllDmChannels(visible);
    } else {
      // 2. Fast load cached DM channels from IndexedDB if not in sync cache
      try {
        const idbCachedDms = await offlineCacheService.getDmChannels(userId);
        if (idbCachedDms && idbCachedDms.length > 0) {
          inMemoryDmCacheRef.current.set(userId, idbCachedDms);
          pbService.setCachedDmChannels(userId, idbCachedDms);
          const visible = idbCachedDms.filter(
            (c) =>
              !closedDmIds.has(c.id) &&
              (!c.recipientUser?.id ||
                (!closedDmIds.has(c.recipientUser.id) &&
                  !closedDmIds.has(`dm-user-${c.recipientUser.id}`)))
          );
          setAllDmChannels(visible);
        }
      } catch (e) {
        console.warn('Failed to load cached DMs from IndexedDB:', e);
      }
    }

    // 3. Non-blocking background sync from PocketBase
    try {
      const userChatServers = await pbService.getUserPrivateChatServers();
      const currentId = currentUser?.id;

      // Resolve only the counterpart profiles needed for visible DMs. The
      // previous login path fetched the entire user directory before it could
      // render the DM list.
      const counterpartIds = Array.from(new Set(
        userChatServers.flatMap((cs: any) => {
          const users = cs.users || [cs.user1, cs.user2].filter(Boolean);
          return users.filter((uid: string) => uid && uid !== currentId);
        }),
      ));
      const counterpartUsers = await Promise.all(counterpartIds.map((id) => pbService.fetchUserById(id)));
      const usersById = new Map(counterpartUsers.filter(Boolean).map((user) => [user!.id, user!]));

      const dynamicDmChannels: Channel[] = [];
      const seenRecipientIds = new Set<string>();

      for (const cs of userChatServers) {
        const usersInServer = cs.users || [cs.user1, cs.user2].filter(Boolean);
        const otherUserId = usersInServer.find((uid: string) => uid !== currentId) || usersInServer[0];
        const otherUser = usersById.get(otherUserId);
        if (otherUser && !seenRecipientIds.has(otherUser.id)) {
          const chanId = `dm-server-${cs.id}`;
          const isClosed =
            closedDmIds.has(chanId) ||
            closedDmIds.has(otherUser.id) ||
            closedDmIds.has(`dm-user-${otherUser.id}`);
          if (!isClosed) {
            seenRecipientIds.add(otherUser.id);
            dynamicDmChannels.push({
              id: chanId,
              name: `@${otherUser.username}`,
              type: 'text',
              server: 'dm',
              description: `Direct Messages with ${otherUser.display_name || otherUser.username}`,
              recipientUser: otherUser,
              created: cs.created || new Date().toISOString()
            });
          }
        }
      }

      // Diff check: compare with existing to avoid unnecessary React re-renders/flashes
      const prevList = inMemoryDmCacheRef.current.get(userId) || [];
      const hasChanged =
        prevList.length !== dynamicDmChannels.length ||
        dynamicDmChannels.some((newChan, idx) => {
          const oldChan = prevList[idx];
          return !oldChan || oldChan.id !== newChan.id || oldChan.created !== newChan.created || oldChan.recipientUser?.avatar !== newChan.recipientUser?.avatar;
        });

      if (hasChanged || prevList.length === 0) {
        inMemoryDmCacheRef.current.set(userId, dynamicDmChannels);
        pbService.setCachedDmChannels(userId, dynamicDmChannels);
        setAllDmChannels(dynamicDmChannels);
        offlineCacheService.saveDmChannels(userId, dynamicDmChannels);
      }
    } catch (err) {
      console.warn('Failed to load DM channels:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadAllDmChannels();
    }
  }, [currentUser?.id]);

  // 4. Fetch channels when active server changes
  useEffect(() => {
    if (activeServer) {
      loadChannels(activeServer.id);
    } else {
      setChannels([]);
      setActiveChannel(null);
    }
  }, [activeServer?.id]);

  // Persist current active server and channel to localStorage when selection changes
  useEffect(() => {
    if (activeServer) {
      localStorage.setItem('last_active_server_id', activeServer.id);
    }
  }, [activeServer?.id]);

  useEffect(() => {
    if (activeServer && activeChannel) {
      localStorage.setItem(`last_active_channel_id_${activeServer.id}`, activeChannel.id);
    }
    if (activeChannel) {
      const isDm = isDirectMessageChannel(activeChannel);
      if (isDm) {
        setActiveDmChannel(activeChannel);
      } else {
        setActiveServerChannel(activeChannel);
      }
    }
  }, [activeServer?.id, activeChannel?.id]);

  // 5a. Fetch channel messages when active channel changes
  useEffect(() => {
    if (activeChannel && activeChannel.type === 'text') {
      if (stagedLoadTimerRef.current) {
        clearTimeout(stagedLoadTimerRef.current);
        stagedLoadTimerRef.current = null;
      }

      let cached = messagesCache.current[activeChannel.id] || offlineCacheService.getCachedMessagesSync(activeChannel.id);
      if (!cached || !Array.isArray(cached.items)) {
        const isDm = isDirectMessageChannel(activeChannel);
        if (isDm) {
          const recipientId = activeChannel.recipientUser?.id;
          const serverId = activeChannel.id.startsWith('dm-server-') ? activeChannel.id.replace('dm-server-', '') : null;
          const altKeys = [
            serverId ? `dm-server-${serverId}` : null,
            serverId,
            recipientId ? `dm-user-${recipientId}` : null,
            recipientId
          ].filter(Boolean) as string[];

          for (const k of altKeys) {
            const hit = messagesCache.current[k] || offlineCacheService.getCachedMessagesSync(k);
            if (hit && Array.isArray(hit.items)) {
              cached = hit;
              messagesCache.current[activeChannel.id] = hit;
              break;
            }
          }
        }
      }

      if (cached && Array.isArray(cached.items)) {
        messagesCache.current[activeChannel.id] = cached;
         const visibleCached = selectActiveMessageWindow(cached.items);
        setMessages(visibleCached);
        setHasMoreMessages(cached.hasMore === true || cached.items.length > visibleCached.length);
        setMessagesPage(cached.page || 1);
        setIsInitialLoadingChannel(false);
      } else {
        setMessages([]);
        setMessagesPage(1);
        setHasMoreMessages(true);
        setIsInitialLoadingChannel(true);
      }
      loadMessages(activeChannel.id, 1, false, null, 30);
      const conversationKind = isDirectMessageChannel(activeChannel) ? 'dm' : 'channel';
      return () => {
        pbService.cancelMessagePage(activeChannel.id, conversationKind);
      };
    } else {
      setMessages([]);
      setIsInitialLoadingChannel(false);
    }
  }, [activeChannel?.id]);

  // 5c. Global Realtime SSE subscriptions for Server Channels & Direct Messages (Runs whenever user is logged in)
  useEffect(() => {
    if (!currentUser?.id) return;

    // Subscribe to ALL message events across channels and servers
    const unsubscribe = pbService.subscribeToMessages('*', async (e) => {
      const currentActiveChan = activeChannelRef.current;
      const currentCurrUser = currentUserRef.current;
      const currentLang = langRef.current;
      const currentServer = activeServerRef.current;

      if (e.action === 'create' || e.action === 'update') {
        const rawContent = e.record?.content || '';
        if (
          rawContent.startsWith('INCOMING_CALL:') ||
          rawContent.includes('INCOMING_CALL:') ||
          rawContent.startsWith('CALL_SIGNAL:') ||
          rawContent.includes('CALL_SIGNAL:')
        ) {
          callSignalingService.handleIncomingCallPayload(rawContent);
          if (e.record?.id) {
            pbService.deleteMessage(e.record.id).catch(() => {});
          }
          return;
        }

        const senderId = e.record.sender;
        const senderObj = e.record.expand?.sender;
        const senderName = senderObj?.display_name || senderObj?.username || 'User';
        const isMe = currentCurrUser && senderId === currentCurrUser.id;

        const fullMsg = e.record;
        if (fullMsg?.channel) {
          messageCacheFreshnessRef.current[fullMsg.channel] = Date.now();
        }
        // PocketBaseService delivers one normalized expanded message event;
        // do not issue a second getOne request from the app layer.

        const isCurrentlyViewing = !!(currentActiveChan && currentActiveChan.id === fullMsg.channel);

        if (e.action === 'create' && currentCurrUser && !isMe) {
          const content = (fullMsg.content || '').toLowerCase();
          const usernameLower = (currentCurrUser.username || '').toLowerCase();
          const displayNameLower = (currentCurrUser.display_name || '').toLowerCase();

          const hasMention = (usernameLower && content.includes(`@${usernameLower}`)) ||
            (displayNameLower && content.includes(`@${displayNameLower}`));

          const isReplyToMe = fullMsg.reply_to && messages.some((m) => m.id === fullMsg.reply_to && m.sender === currentCurrUser.id);
          const isDmMsg = fullMsg.channel.startsWith('dm-server-') ||
            fullMsg.channel.startsWith('dm-') ||
            fullMsg.channel === 'dm' ||
            allDmChannels.some((d) => d.id === fullMsg.channel) ||
            (fullMsg.expand?.channel && (fullMsg.expand.channel as any).server === 'dm');

          // Determine originating server ID and channel (DMs must ALWAYS be 'dm')
          const msgChannelObj = channels.find((c) => c.id === fullMsg.channel) || (currentActiveChan?.id === fullMsg.channel ? currentActiveChan : null);
          let msgServerId = '';
          if (isDmMsg) {
            msgServerId = 'dm';
          } else if (fullMsg.expand?.channel && (fullMsg.expand.channel as any).server) {
            msgServerId = (fullMsg.expand.channel as any).server;
          } else if (msgChannelObj && msgChannelObj.server) {
            msgServerId = msgChannelObj.server;
          } else if (currentActiveChan && currentActiveChan.id === fullMsg.channel && currentServer && currentActiveChan.server !== 'dm') {
            msgServerId = currentServer.id;
          }

          const userSettingsObj = userSettings || getCachedUserSettings();
          const notifSettings = userSettingsObj.notifications || {};

          const mentionAllowed = hasMention && notifSettings.mentionNotifications !== false;
          const replyAllowed = isReplyToMe && notifSettings.replyNotifications !== false;
          const isPingEvent = mentionAllowed || replyAllowed || isDmMsg;

          const soundsEnabled = notifSettings.mentionSounds !== false && notifSettings.sound !== false;
          const desktopEnabled = notifSettings.desktopMentions !== false && notifSettings.pushNotifications !== false;
          const highlightEnabled = notifSettings.mentionHighlight !== false;

          if (isCurrentlyViewing) {
            // User is already inside this channel:
            // Do NOT add navigation badges. Instead, play sound and highlight message in-chat.
            if (isPingEvent) {
              if (soundsEnabled) playPingSound();
              if (highlightEnabled) setTargetMessageId(fullMsg.id);
            }
          } else {
            // User is NOT inside this channel
            const isCallLogOrSignal =
              fullMsg.content?.startsWith('INCOMING_CALL:') ||
              fullMsg.content?.includes('INCOMING_CALL:') ||
              fullMsg.content?.startsWith('[CALL_LOG:') ||
              fullMsg.content?.includes('CALL_LOG:') ||
              parseCallLog(fullMsg.content) !== null;

            if (isCallLogOrSignal) {
              if (fullMsg.content?.includes('INCOMING_CALL:')) {
                callSignalingService.handleIncomingCallPayload(fullMsg.content);
              }
              return;
            }

            if (isPingEvent) {
              if (soundsEnabled) playPingSound();

              if (notifSettings.mentionNotifications !== false) {
                setActiveToast({
                  id: fullMsg.id,
                  title: senderName,
                  body: fullMsg.content || (currentLang === 'ar' ? 'أرسل مرفقاً جديداً' : 'Sent an attachment'),
                  avatar: senderObj?.avatar ? `${pbService.getServerUrl()}/api/files/users/${senderId}/${senderObj.avatar}` : undefined,
                  senderName: senderName,
                  type: hasMention ? 'ping' : isDmMsg ? 'dm' : 'reply',
                  channelId: fullMsg.channel
                });

                const notifItem: NotificationItem = {
                  id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                  type: hasMention ? 'mention' : isDmMsg ? 'dm' : 'reply',
                  sender_id: senderId,
                  sender_name: senderName,
                  sender_avatar: senderObj?.avatar ? `${pbService.getServerUrl()}/api/files/users/${senderId}/${senderObj.avatar}` : undefined,
                  channel_id: fullMsg.channel,
                  channel_name: msgChannelObj?.name || 'channel',
                  server_id: msgServerId,
                  message_id: fullMsg.id,
                  message_content: fullMsg.content || '',
                  created: fullMsg.created || new Date().toISOString(),
                  read: false
                };

                setNotificationsList((prev) => [notifItem, ...prev.filter((n) => n.id !== notifItem.id)]);
                pbService.addNotificationToUser(currentCurrUser.id, notifItem);

                if (desktopEnabled) {
                  sendInAppNotification(
                    hasMention
                      ? (currentLang === 'ar' ? `إشارة جديدة من ${senderName}` : `New Mention from ${senderName}`)
                      : isDmMsg
                      ? (currentLang === 'ar' ? `رسالة خاصة من ${senderName}` : `Direct Message from ${senderName}`)
                      : (currentLang === 'ar' ? `رد على رسالتك من ${senderName}` : `Reply from ${senderName}`),
                    fullMsg.content || (currentLang === 'ar' ? 'مرفق جديد' : 'New Attachment'),
                    senderObj?.avatar ? `${pbService.getServerUrl()}/api/files/users/${senderId}/${senderObj.avatar}` : undefined,
                    () => handleSelectNotification(notifItem)
                  );
                }
              }
            }

            // Update unread counts for channel and its exact server_id
            setUnreadCounts((prev) => {
              const currentUnread = prev[fullMsg.channel] || {
                channelId: fullMsg.channel,
                serverId: msgServerId,
                count: 0,
                hasMention: false
              };
              return {
                ...prev,
                [fullMsg.channel]: {
                  channelId: fullMsg.channel,
                  serverId: msgServerId,
                  count: currentUnread.count + 1,
                  hasMention: currentUnread.hasMention || isPingEvent,
                  lastMentionMsgId: isPingEvent ? fullMsg.id : currentUnread.lastMentionMsgId
                }
              };
            });
          }
        }

        if (currentActiveChan && fullMsg.channel === currentActiveChan.id) {
          const activeCache = messagesCache.current[currentActiveChan.id];
          if (activeCache) {
            activeCache.items = mergeMessagesChronologically(activeCache.items, [fullMsg]);
          }
          setMessages((prev) => {
            const existingIdx = prev.findIndex(
              (m) =>
                m.id === fullMsg.id ||
                ((m as any).temp_id && m.sender === fullMsg.sender && m.content === fullMsg.content) ||
                (m.id.startsWith('optimistic-') && m.sender === fullMsg.sender && m.content === fullMsg.content)
            );

            if (existingIdx === -1) {
              const updated = [...prev, fullMsg];
              return selectActiveMessageWindow(updated);
            }

            const prevMsg = prev[existingIdx];
            const nextMsg: Message = {
              ...prevMsg,
              ...fullMsg,
              reactions: fullMsg.reactions !== undefined ? fullMsg.reactions : prevMsg.reactions,
              temp_id: undefined,
              expand: fullMsg.expand || prevMsg.expand
            };

            // If the message is visually unchanged (e.g. identical reactions after optimistic update), return prev to avoid re-render flicker
            if (isSingleMessageEqual(prevMsg, nextMsg)) {
              return prev;
            }

            const updated = [...prev];
            updated[existingIdx] = nextMsg;

            return selectActiveMessageWindow(updated);
          });
        } else if (fullMsg.channel) {
          if (messagesCache.current[fullMsg.channel]) {
            const existing = messagesCache.current[fullMsg.channel].items || [];
            if (!existing.some((m) => m.id === fullMsg.id)) {
              messagesCache.current[fullMsg.channel].items = mergeMessagesChronologically(existing, [fullMsg]);
            }
          }
        }
        if (fullMsg.channel) {
          offlineCacheService.mergeChannelMessages(fullMsg.channel, [fullMsg]);
        }
      } else if (e.action === 'delete') {
        if (e.record?.channel) {
          offlineCacheService.mergeChannelMessages(e.record.channel, [], undefined, undefined, [e.record.id]);
        }
        if (currentActiveChan && e.record.channel === currentActiveChan.id) {
          if (messagesCache.current[currentActiveChan.id]) {
            messagesCache.current[currentActiveChan.id].items = MessageDeletionService.transformMessagesOnDeletion(
              messagesCache.current[currentActiveChan.id].items,
              e.record.id,
              currentLang,
            );
          }
          setMessages((prev) => {
            const updated = MessageDeletionService.transformMessagesOnDeletion(prev, e.record.id, currentLang);
            return updated;
          });

          const currentPins = currentActiveChan.pinned_messages || (currentActiveChan as any).Pinned_messages || [];
          if (currentPins.includes(e.record.id)) {
            const newPins = currentPins.filter((id) => id !== e.record.id);
            setActiveChannel({
              ...currentActiveChan,
              pinned_messages: newPins,
              Pinned_messages: newPins
            });
          }
        }
      }
    });

    // Subscribe to ALL private message events across private chats
    const unsubscribePrivate = pbService.subscribeToPrivateMessages('*', async (e: any) => {
      const currentCurrUser = currentUserRef.current;
      const currentLang = langRef.current;
      const currentActiveChan = activeChannelRef.current;

      if (!currentCurrUser || !e.record) return;

      const rawContent = e.record.content || '';
      const isCallSignal =
        rawContent.startsWith('INCOMING_CALL:') ||
        rawContent.includes('INCOMING_CALL:') ||
        rawContent.startsWith('CALL_SIGNAL:') ||
        rawContent.includes('CALL_SIGNAL:');

      if (isCallSignal) {
        // Fast-path: immediately handle incoming call signal without delay or blocking user fetch
        callSignalingService.handleIncomingCallPayload(rawContent);
        if (e.record.id) {
          pbService.deletePrivateMessage(e.record.id).catch(() => {});
        }
        return;
      }

      const senderId = e.record.sender || e.record.user;
      const isMe = senderId === currentCurrUser.id;
      const chatServerId = e.record.chat_server;
      const dmChannelId = `dm-server-${chatServerId}`;

      let fullMsg = e.record;
      if (!fullMsg.expand?.sender && senderId) {
        try {
          const senderObj = await pbService.fetchUserById(senderId);
          if (senderObj) {
            fullMsg.expand = { ...fullMsg.expand, sender: senderObj };
          }
        } catch (err) {}
      }

      // Check if current active channel matches this DM conversation
      const isCurrentlyViewingDM = !!(currentActiveChan && (
        currentActiveChan.id === dmChannelId ||
        currentActiveChan.id === chatServerId ||
        (currentActiveChan.recipientUser && (currentActiveChan.recipientUser.id === senderId || (isMe && currentActiveChan.recipientUser.id === e.record.recipient))) ||
        (fullMsg.expand?.sender?.username && currentActiveChan.name === `@${fullMsg.expand.sender.username}`)
      ));

      const targetChanId = currentActiveChan && isCurrentlyViewingDM ? currentActiveChan.id : dmChannelId;
      messageCacheFreshnessRef.current[targetChanId] = Date.now();

      if (e.action === 'create') {
        const msgWithChannel = { ...fullMsg, channel: targetChanId };

        [currentActiveChan?.id, dmChannelId].filter(Boolean).forEach((key) => {
          const cache = messagesCache.current[key as string];
          if (cache) cache.items = mergeMessagesChronologically(cache.items, [msgWithChannel]);
        });

        if (isCurrentlyViewingDM && currentActiveChan) {
          setMessages((prev) => {
            // If message with this real ID already exists in state, do not duplicate
            if (prev.some((m) => m.id === fullMsg.id)) {
              return prev;
            }

            const senderId = (typeof fullMsg.sender === 'object' ? fullMsg.sender?.id : fullMsg.sender) ||
                             (typeof fullMsg.user === 'object' ? fullMsg.user?.id : fullMsg.user);

            const existingIdx = prev.findIndex((m) => {
              if (m.id === fullMsg.id) return true;
              const mSenderId = typeof m.sender === 'object' ? (m.sender as any)?.id : m.sender;
              const isSenderMatch = (mSenderId && senderId && mSenderId === senderId) || (isMe && mSenderId === currentCurrUser.id);
              if (isSenderMatch && (m.id.startsWith('optimistic-') || (m as any).temp_id)) {
                if (m.content === fullMsg.content) return true;
              }
              return false;
            });

            let updated: Message[];
            if (existingIdx !== -1) {
              updated = [...prev];
              updated[existingIdx] = {
                ...msgWithChannel,
                temp_id: undefined,
                expand: fullMsg.expand || prev[existingIdx].expand
              };
            } else {
              updated = [...prev, msgWithChannel];
            }

            // Deduplicate by message ID & temp_id to prevent any duplicate bubbles
            const seen = new Set<string>();
            const deduplicated = updated.filter((m) => {
              const k = m.id;
              const t = (m as any).temp_id;
              if (k && seen.has(k)) return false;
              if (t && seen.has(t)) return false;
              if (k) seen.add(k);
              if (t) seen.add(t);
              return true;
            });

            return selectActiveMessageWindow(deduplicated);
          });
        } else {
          if (messagesCache.current[dmChannelId]) {
            const cachedItems = messagesCache.current[dmChannelId].items || [];
            if (!cachedItems.some((m) => m.id === fullMsg.id)) {
              messagesCache.current[dmChannelId].items = mergeMessagesChronologically(cachedItems, [msgWithChannel]);
            }
          }
        }

        // Notification & sound ONLY for incoming messages from others when not currently viewing
        if (e.action === 'create' && !isMe) {
          const senderObj = fullMsg.expand?.sender;
          const senderName = senderObj?.display_name || senderObj?.username || 'User';

          // Check if message is a call log or call signaling event
          const isCallLogOrSignal =
            fullMsg.content?.startsWith('INCOMING_CALL:') ||
            fullMsg.content?.includes('INCOMING_CALL:') ||
            fullMsg.content?.startsWith('[CALL_LOG:') ||
            fullMsg.content?.includes('CALL_LOG:') ||
            parseCallLog(fullMsg.content) !== null;

          if (isCallLogOrSignal) {
            if (fullMsg.content?.includes('INCOMING_CALL:')) {
              callSignalingService.handleIncomingCallPayload(fullMsg.content);
            }
            return;
          }

          if (!isCurrentlyViewingDM) {
            playPingSound();

            const notifItem: NotificationItem = {
              id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              type: 'dm',
              sender_id: senderId,
              sender_name: senderName,
              sender_avatar: senderObj?.avatar ? `${pbService.getServerUrl()}/api/files/users/${senderId}/${senderObj.avatar}` : undefined,
              channel_id: dmChannelId,
              channel_name: '@' + senderName,
              server_id: 'dm',
              private_chat_id: chatServerId,
              message_id: fullMsg.id,
              message_content: fullMsg.content || '',
              created: fullMsg.created || new Date().toISOString(),
              read: false
            };

            setActiveToast({
              id: fullMsg.id,
              title: currentLang === 'ar' ? `رسالة خاصة من ${senderName}` : `Direct Message from ${senderName}`,
              body: fullMsg.content || (currentLang === 'ar' ? 'أرسل مرفقاً جديداً' : 'Sent an attachment'),
              avatar: senderObj?.avatar ? `${pbService.getServerUrl()}/api/files/users/${senderId}/${senderObj.avatar}` : undefined,
              senderName: senderName,
              type: 'dm',
              channelId: dmChannelId,
              serverId: 'dm',
              onClick: () => handleSelectNotification(notifItem)
            });

            setNotificationsList((prev) => [notifItem, ...prev.filter((n) => n.id !== notifItem.id)]);
            pbService.addNotificationToUser(currentCurrUser.id, notifItem);

            sendInAppNotification(
              currentLang === 'ar' ? `رسالة خاصة من ${senderName}` : `Direct Message from ${senderName}`,
              fullMsg.content || (currentLang === 'ar' ? 'مرفق جديد' : 'New Attachment'),
              senderObj?.avatar ? `${pbService.getServerUrl()}/api/files/users/${senderId}/${senderObj.avatar}` : undefined,
              () => handleSelectNotification(notifItem)
            );

            setUnreadCounts((prev) => {
              const currentUnread = prev[dmChannelId] || { channelId: dmChannelId, serverId: 'dm', count: 0, hasMention: true };
              return {
                ...prev,
                [dmChannelId]: {
                  ...currentUnread,
                  count: currentUnread.count + 1,
                  hasMention: true
                }
              };
            });
          }
        }

        // Automatic DM list order & timestamp refresh
        setAllDmChannels((prevDms) => {
          const targetIndex = prevDms.findIndex((c) => c.id === dmChannelId || c.id.endsWith(chatServerId));
          if (targetIndex !== -1) {
            const updatedChan = { ...prevDms[targetIndex], created: fullMsg.created || new Date().toISOString() };
            const remaining = prevDms.filter((_, idx) => idx !== targetIndex);
            return [updatedChan, ...remaining];
          } else {
            loadAllDmChannels();
            return prevDms;
          }
        });

        offlineCacheService.mergeChannelMessages(targetChanId, [msgWithChannel]);

      } else if (e.action === 'delete' && e.record?.id) {
        offlineCacheService.mergeChannelMessages(dmChannelId, [], undefined, undefined, [e.record.id]);
        if (isCurrentlyViewingDM) {
          setMessages((prev) => MessageDeletionService.transformMessagesOnDeletion(prev, e.record.id, currentLang));
        }
        if (messagesCache.current[dmChannelId]) {
          messagesCache.current[dmChannelId].items = MessageDeletionService.transformMessagesOnDeletion(
            messagesCache.current[dmChannelId].items,
            e.record.id,
            currentLang
          );
        }
      } else if (e.action === 'update' && e.record?.id) {
        const updatedRecord = e.record;
        [currentActiveChan?.id, dmChannelId].filter(Boolean).forEach((key) => {
          const cache = messagesCache.current[key as string];
          if (cache) {
            cache.items = cache.items.map((message) => message.id === updatedRecord.id
              ? { ...message, ...updatedRecord, channel: targetChanId, expand: updatedRecord.expand || message.expand }
              : message);
          }
        });
        if (isCurrentlyViewingDM) {
          setMessages((prev) => {
            const existingIdx = prev.findIndex((m) => m.id === updatedRecord.id);
            if (existingIdx === -1) return prev;
            const prevMsg = prev[existingIdx];
            const nextMsg: Message = {
              ...prevMsg,
              ...updatedRecord,
              reactions: updatedRecord.reactions !== undefined ? updatedRecord.reactions : prevMsg.reactions,
              channel: targetChanId,
              expand: updatedRecord.expand || prevMsg.expand
            };
            if (isSingleMessageEqual(prevMsg, nextMsg)) {
              return prev;
            }
            const updated = [...prev];
            updated[existingIdx] = nextMsg;
            return selectActiveMessageWindow(updated);
          });
        } else {
          if (messagesCache.current[dmChannelId]) {
            messagesCache.current[dmChannelId].items = (messagesCache.current[dmChannelId].items || []).map((m) =>
              m.id === updatedRecord.id
                ? { ...m, ...updatedRecord, channel: dmChannelId, expand: updatedRecord.expand || m.expand }
                : m
            );
          }
        }
        offlineCacheService.mergeChannelMessages(targetChanId, [{
          ...updatedRecord,
          channel: targetChanId,
        } as Message]);
      }
    });

    const unsubscribeUsers = pbService.subscribeToUsers((e: any) => {
      if (e?.record?.id) {
        const activeUserId = currentUserRef.current?.id;
        if (e.record.id === activeUserId) {
          const userRec = e.record;
          setCurrentUser((prev) => (prev ? mergeUserRecord(prev, userRec) : prev));

          // Sync remote notifications list and dispatch notifications for new items
          let remoteNotifs: NotificationItem[] = [];
          if (userRec.notifications) {
            if (typeof userRec.notifications === 'string') {
              try { remoteNotifs = JSON.parse(userRec.notifications); } catch {}
            } else if (Array.isArray(userRec.notifications)) {
              remoteNotifs = userRec.notifications;
            }
          }

          setNotificationsList((prevList) => {
            const existingIds = new Set(prevList.map((n) => n.id));
            const newUnreadItems = remoteNotifs.filter(
              (rn) => !existingIds.has(rn.id) && !rn.read && rn.sender_id !== activeUserId
            );

            newUnreadItems.forEach((nItem) => {
              const contentStr = nItem.message_content || nItem.message || '';
              const isSignal =
                contentStr.startsWith('INCOMING_CALL:') ||
                contentStr.includes('INCOMING_CALL:') ||
                contentStr.startsWith('CALL_SIGNAL:') ||
                contentStr.includes('CALL_SIGNAL:');
              const isCallLog =
                contentStr.startsWith('[CALL_LOG:') ||
                contentStr.includes('CALL_LOG:') ||
                parseCallLog(contentStr) !== null;

              if (isSignal) {
                // Pass directly to Call Signaling so FloatingCallWindow handles incoming call with Answer/Reject/Mute
                callSignalingService.handleIncomingCallPayload(contentStr || nItem);
                return;
              }

              if (isCallLog) {
                return;
              }

              notificationService.sendNotification(nItem, { lang: langRef.current });

              setActiveToast({
                id: nItem.id,
                title: nItem.sender_name || 'Sirver Notification',
                body: nItem.message_content || nItem.message || '',
                avatar: nItem.sender_avatar,
                senderName: nItem.sender_name,
                type: nItem.type === 'friend_request' ? 'ping' : nItem.type === 'dm' ? 'dm' : 'reply',
                channelId: nItem.channel_id || 'dm',
                onClick: () => {
                  if (handleSelectNotificationRef.current) {
                    handleSelectNotificationRef.current(nItem);
                  }
                }
              });
            });

            const cleanRemoteNotifs = remoteNotifs.filter((rn) => {
              const c = rn.message_content || rn.message || '';
              return !c.includes('INCOMING_CALL:') && !(rn.id?.startsWith('call_') && !c.includes('[CALL_LOG:'));
            });

            return cleanRemoteNotifs;
          });
        }

        setSelectedUserProfile((prev) => (prev && prev.id === e.record.id ? mergeUserRecord(prev, e.record) : prev));
        setAllDmChannels((prev) =>
          prev.map((dm) => {
            if (dm.recipientUser?.id === e.record.id) {
              return { ...dm, recipientUser: mergeUserRecord(dm.recipientUser, e.record) };
            }
            return dm;
          })
        );
        try {
          window.dispatchEvent(new CustomEvent('user-presence-changed', { detail: e.record }));
        } catch (err) {}
      }
    });


    return () => {
      unsubscribe();
      unsubscribePrivate();
      unsubscribeUsers();
    };
  }, [currentUser?.id]);


  // --- CORE SERVICES ---

  const loadServers = async () => {
    // 1. Instantly display cached servers synchronously (0ms)
    if (currentUser?.id) {
      const syncServers = offlineCacheService.getServersSync(currentUser.id);
      if (syncServers && syncServers.length > 0) {
        setServers(syncServers);
        if (!activeServerRef.current) {
          const savedServerId = localStorage.getItem('last_active_server_id');
          const restoredServer = syncServers.find((s) => s.id === savedServerId) || syncServers[0];
          setActiveServer(restoredServer);
          setShowDiscoveryCenter(false);
        }
      } else {
        // Fallback to IndexedDB async lookup
        try {
          const cachedServers = await offlineCacheService.getServers(currentUser.id);
          if (cachedServers && cachedServers.length > 0) {
            setServers(cachedServers);
            if (!activeServerRef.current) {
              const savedServerId = localStorage.getItem('last_active_server_id');
              const restoredServer = cachedServers.find((s) => s.id === savedServerId) || cachedServers[0];
              setActiveServer(restoredServer);
              setShowDiscoveryCenter(false);
            }
          }
        } catch (e) {
          console.warn('Failed to load cached servers from IndexedDB:', e);
        }
      }
    }

    // 2. Background sync with server
    try {
      const list = await pbService.fetchServers();
      setServers((prev) => {
        if (
          prev.length === list.length &&
          prev.every((s, i) => s.id === list[i]?.id && s.name === list[i]?.name && s.icon === list[i]?.icon && s.banner === list[i]?.banner)
        ) {
          return prev;
        }
        return list;
      });

      if (currentUser?.id && list.length > 0) {
        offlineCacheService.saveServers(currentUser.id, list);
      }

      if (list.length > 0) {
        if (!activeServerRef.current) {
          const savedServerId = localStorage.getItem('last_active_server_id');
          const restoredServer = list.find((s) => s.id === savedServerId) || list[0];
          setActiveServer(restoredServer);
          setShowDiscoveryCenter(false);
        }
      } else {
        setShowDiscoveryCenter(true);
      }
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  };

  const loadChannels = async (serverId: string) => {
    // 1. Instantly check synchronous in-memory & local cache (0ms)
    let cachedList = channelsCache.current[serverId] || offlineCacheService.getChannelsSync(serverId) || pbService.getCachedChannels(serverId);
    if (!cachedList || cachedList.length === 0) {
      try {
        const dbChannels = await offlineCacheService.getChannels(serverId);
        if (dbChannels && dbChannels.length > 0) {
          cachedList = dbChannels;
          channelsCache.current[serverId] = cachedList;
          pbService.setCachedChannels(serverId, cachedList);
        }
      } catch (e) {}
    }

    const currentActive = activeChannelRef.current;
    const isCurrentActiveInThisServer = currentActive && currentActive.server === serverId;

    if (cachedList && cachedList.length > 0) {
      channelsCache.current[serverId] = cachedList;
      setChannels(cachedList);
      
      if (!isCurrentActiveInThisServer) {
        const savedChannelId = localStorage.getItem(`last_active_channel_id_${serverId}`);
        const restoredChannel = cachedList.find((c) => c.id === savedChannelId);
        
        if (restoredChannel) {
          setActiveChannel(restoredChannel);
        } else {
          const defaultTextChan = cachedList.find((c) => c.type === 'text');
          if (defaultTextChan) {
            setActiveChannel(defaultTextChan);
          } else if (cachedList.length > 0) {
            setActiveChannel(cachedList[0]);
          }
        }
      }
    }

    // 2. Background sync from server
    try {
      const list = await pbService.fetchChannels(serverId);
      channelsCache.current[serverId] = list;
      setChannels((prev) => {
        if (
          prev.length === list.length &&
          prev.every((c, i) => c.id === list[i]?.id && c.name === list[i]?.name && c.topic === list[i]?.topic && c.type === list[i]?.type)
        ) {
          return prev;
        }
        return list;
      });
      offlineCacheService.saveChannels(serverId, list);
      
      const currentActiveNow = activeChannelRef.current;
      const isCurrentActiveInThisServerNow = currentActiveNow && currentActiveNow.server === serverId;

      if (!isCurrentActiveInThisServerNow) {
        const savedChannelId = localStorage.getItem(`last_active_channel_id_${serverId}`);
        const restoredChannel = list.find((c) => c.id === savedChannelId);
        
        if (restoredChannel) {
          setActiveChannel(restoredChannel);
        } else {
          const defaultTextChan = list.find((c) => c.type === 'text');
          if (defaultTextChan) {
            setActiveChannel(defaultTextChan);
          } else if (list.length > 0) {
            setActiveChannel(list[0]);
          }
        }
      } else {
        const matchingChan = list.find((c) => c.id === currentActiveNow.id);
        if (matchingChan && (matchingChan.name !== currentActiveNow.name || matchingChan.topic !== currentActiveNow.topic)) {
          setActiveChannel(matchingChan);
        }
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    }
  };

  const loadMessages = async (channelId: string, pageNum = 1, append = false, targetMessageId: string | null = null, limit = 10) => {
    const currentReqSeq = (messageRequestGenerationRef.current[channelId] || 0) + 1;
    messageRequestGenerationRef.current[channelId] = currentReqSeq;
    const isCurrentGeneration = () => messageRequestGenerationRef.current[channelId] === currentReqSeq;
    let canUseFreshCache = false;
    const targetChan = activeChannelRef.current?.id === channelId ? activeChannelRef.current : channels.find((c) => c.id === channelId);
    if (targetChan?.type === 'voice') {
      if (activeChannelRef.current?.id === channelId) {
        setMessages([]);
        setIsInitialLoadingChannel(false);
      }
      return;
    }
    if (!append && pageNum === 1) {
      const isDm = channelId.startsWith('dm-') || channelId.startsWith('private-') || activeChannelRef.current?.server === 'dm' || activeChannelRef.current?.name?.startsWith('@');
      let targetUser = activeChannelRef.current?.recipientUser;
      if (!targetUser && isDm) {
        const targetUsername = activeChannelRef.current?.name?.replace(/^@/, '');
        targetUser = allDmChannels.find(
          (c) =>
            c.id === channelId ||
            (targetUsername && c.recipientUser?.username?.toLowerCase() === targetUsername.toLowerCase())
        )?.recipientUser;
      }
      const recipientId = targetUser?.id || (channelId.startsWith('dm-user-') ? channelId.replace('dm-user-', '') : null);
      let serverId = channelId.startsWith('dm-server-') ? channelId.replace('dm-server-', '') : null;
      if (!serverId && recipientId) {
        const cachedServer = pbService.getCachedPrivateChatServer(recipientId);
        if (cachedServer?.id) serverId = cachedServer.id;
      }
      const altKeys = isDm ? [
        channelId,
        serverId ? `dm-server-${serverId}` : null,
        serverId,
        recipientId ? `dm-user-${recipientId}` : null,
        recipientId
      ].filter(Boolean) as string[] : [channelId];

      // 1. Check synchronous in-memory L1 cache first
      let cached: any = null;
      let cachedKey = channelId;
      for (const k of altKeys) {
        const hit = messagesCache.current[k] || offlineCacheService.getCachedMessagesSync(k);
        if (hit && Array.isArray(hit.items)) {
          cached = hit;
          cachedKey = k;
          messagesCache.current[channelId] = hit;
          break;
        }
      }

      // 2. Check IndexedDB persistent cache if missing from memory
      if (!cached || !Array.isArray(cached.items)) {
        try {
          for (const k of altKeys) {
            const dbCached = await offlineCacheService.getCachedMessages(k);
            if (dbCached && Array.isArray(dbCached.items)) {
              cached = {
                items: dbCached.items,
                page: dbCached.page,
                hasMore: dbCached.hasMore !== undefined ? dbCached.hasMore : false
              };
              cachedKey = k;
              messagesCache.current[channelId] = cached;
              break;
            }
          }
        } catch (e) {}
      }

      if (activeChannelRef.current?.id === channelId && isCurrentGeneration()) {
        if (cached && Array.isArray(cached.items)) {
           const visibleCached = selectActiveMessageWindow(cached.items);
          setMessages((prev) => (areMessagesEqual(prev, visibleCached) ? prev : visibleCached));
          setHasMoreMessages(cached.hasMore === true || cached.items.length > visibleCached.length);
          setMessagesPage(cached.page || 1);
          setIsInitialLoadingChannel(false);
        } else {
          setMessages([]);
          setHasMoreMessages(true);
          setIsInitialLoadingChannel(true);
        }
      }

      // Re-selecting a recently viewed channel should be instant. Realtime
      // subscriptions keep this cache current; only refresh after it becomes
      // stale so toggling Server/DM mode does not issue duplicate queries.
      const cachedAt = Math.max(
        messageCacheFreshnessRef.current[channelId] || 0,
        messageCacheFreshnessRef.current[cachedKey] || 0,
        ...altKeys.map((key) => messageCacheFreshnessRef.current[key] || 0),
      );
      canUseFreshCache = Boolean(
        cached && Array.isArray(cached.items) &&
        cachedAt > 0 && Date.now() - cachedAt < messageCacheTtlMs &&
        !targetMessageId
      );
    }

    if (canUseFreshCache) {
      return;
    }

    const isDmChan = activeChannelRef.current?.name.startsWith('@') || activeChannelRef.current?.server === 'dm' || activeChannelRef.current?.id.startsWith('dm-') || activeChannelRef.current?.id.startsWith('private-') || activeServerRef.current?.name === 'Direct Messages' || activeServerRef.current?.name === 'الرسائل الخاصة';
    if (isDmChan && activeChannelRef.current) {
      const watchdogTimer = setTimeout(() => {
        if (activeChannelRef.current?.id === channelId) {
          setIsInitialLoadingChannel(false);
          setIsLoadingMore(false);
        }
      }, 12000);
      const targetUsername = activeChannelRef.current.name.replace(/^@/, '');
      let chatServerId = channelId.startsWith('dm-server-') ? channelId.replace(/^dm-server-/, '') : undefined;
      let targetUser = activeChannelRef.current.recipientUser;

      try {
        if (messageLoadingRef.current.has(channelId)) return;
        messageLoadingRef.current.add(channelId);
        if (append && activeChannelRef.current?.id === channelId) setIsLoadingMore(true);
        if (!targetUser?.id && targetUsername) {
          const foundInDms = allDmChannels.find((c) => c.recipientUser?.username?.toLowerCase() === targetUsername.toLowerCase())?.recipientUser;
          targetUser = foundInDms || (await pbService.searchUsers(targetUsername)).find((u) => u.username.toLowerCase() === targetUsername.toLowerCase());
        }
        if (!targetUser?.id) return;
        if (!chatServerId) chatServerId = pbService.getCachedPrivateChatServer(targetUser.id)?.id;
        if (!chatServerId) {
          const resolved = await pbService.getOrCreatePrivateChatServer(targetUser.id);
          chatServerId = resolved?.id;
        }
        if (!chatServerId) return;

        const cacheKey = `dm-server-${chatServerId}`;
        const currentDataset = messagesCache.current[cacheKey]?.items || messagesCache.current[channelId]?.items || messages;
        const oldest = currentDataset.find((m) => !m.id.startsWith('optimistic-') && m.created);
        const before = append
          ? (messageCursorRef.current[cacheKey] || (oldest?.created ? { created: oldest.created, id: oldest.id } : null) as MessageCursor | null)
          : undefined;
        const result = await pbService.fetchDirectMessagePage(chatServerId, append ? 50 : 30, before || undefined);
        const merged = await offlineCacheService.mergeChannelMessages(channelId, result.items, result.hasMore, pageNum);
        const cacheData = { items: merged.items, page: pageNum, hasMore: result.hasMore };
        const visibleWindow = selectActiveMessageWindow(merged.items, currentDataset, append);
        const hiddenOlderCache = Boolean(visibleWindow[0] && merged.items[0] && visibleWindow[0].id !== merged.items[0].id);
        const cacheTimestamp = Date.now();
        [channelId, cacheKey, `dm-user-${targetUser.id}`, targetUser.id].forEach((key) => {
          messagesCache.current[key] = cacheData;
          messageCacheFreshnessRef.current[key] = cacheTimestamp;
          messageCursorRef.current[key] = result.nextCursor;
        });

        const isSameChannel = activeChannelRef.current?.id === channelId || activeChannelRef.current?.id === cacheKey || activeChannelRef.current?.recipientUser?.id === targetUser.id;
        if (isSameChannel && isCurrentGeneration()) {
          setMessages((prev) => {
            const pending = prev.filter((m) => m.id.startsWith('optimistic-') || (m as any).temp_id);
            const incoming = [...merged.items, ...pending.filter((p) => !merged.items.some((m) => m.id === p.id || (m as any).temp_id === (p as any).temp_id))];
            const combined = mergeMessageListPreservingReferences(prev, incoming);
            return selectActiveMessageWindow(combined, prev, append);
          });
          setHasMoreMessages(result.hasMore || hiddenOlderCache);
          setMessagesPage(pageNum);
          setIsInitialLoadingChannel(false);
        }
      } catch (error) {
        console.warn('Error loading direct messages:', error);
      } finally {
        messageLoadingRef.current.delete(channelId);
        clearTimeout(watchdogTimer);
        if (activeChannelRef.current?.id === channelId) {
          setIsLoadingMore(false);
          setIsInitialLoadingChannel(false);
        }
      }
      return;
    }

    try {
      if (append && activeChannelRef.current?.id === channelId) {
        setIsLoadingMore(true);
      }

      if (append) {
        // CURSOR PAGINATION: Query PocketBase for messages older than the oldest message in dataset
        const currentDataset = messagesCache.current[channelId]?.items || messages;
        const nonOptimistic = currentDataset.filter((m) => !m.id.startsWith('optimistic-') && m.created);
        const oldestMsg = nonOptimistic[0];

        if (oldestMsg) {
          const before = messageCursorRef.current[channelId] || { created: oldestMsg.created!, id: oldestMsg.id };
          const result = await pbService.fetchMessagePage(channelId, 'channel', 50, before);

          if (result.items.length === 0 && !result.hasMore) {
            // Confirm 0 older messages exist in PocketBase
            if (activeChannelRef.current?.id === channelId) {
              setHasMoreMessages(false);
            }
            if (messagesCache.current[channelId]) {
              messagesCache.current[channelId].hasMore = false;
            }
            await offlineCacheService.saveCachedMessages(
              channelId,
              currentDataset,
              false,
              messagesCache.current[channelId]?.page || pageNum
            );
          } else {
            const merged = await offlineCacheService.mergeChannelMessages(channelId, result.items, result.hasMore, pageNum);
            messageCacheFreshnessRef.current[channelId] = Date.now();
            messageCursorRef.current[channelId] = result.nextCursor;
            const visibleWindow = selectActiveMessageWindow(merged.items, currentDataset, true);
            const hasHiddenOlderCache = Boolean(visibleWindow[0] && merged.items[0] && visibleWindow[0].id !== merged.items[0].id);
            const hasMore = result.hasMore || hasHiddenOlderCache;

            if (activeChannelRef.current?.id === channelId && (append || isCurrentGeneration())) {
              setMessages((prev) => {
                const pendingOptimistic = prev.filter(
                  (m) => m.id.startsWith('optimistic-') || (m as any).temp_id
                );
                const missingPending = pendingOptimistic.filter(
                  (p) => !merged.items.some((d) => d.id === p.id || ((p as any).temp_id && (d as any).temp_id === (p as any).temp_id))
                );
                const incomingWithPending = [...merged.items, ...missingPending];
                const updated = mergeMessageListPreservingReferences(prev, incomingWithPending);
                messagesCache.current[channelId] = {
                   items: updated,
                   page: pageNum,
                    hasMore
                 };
                 return selectActiveMessageWindow(updated, prev, true);
              });
              setHasMoreMessages(hasMore);
            } else {
              messagesCache.current[channelId] = {
                items: merged.items,
                page: pageNum,
                hasMore
              };
            }

            if ((import.meta as any).env?.DEV) {
               console.log(`[PAGINATION_DEBUG] Appending Channel Cursor Older: ${oldestMsg.created} | Returned Count: ${result.items.length} | New Oldest ID: ${result.items[0]?.id || 'none'} | Has More: ${hasMore}`);
            }
          }
        } else {
          // Fallback if current dataset is empty
            const result = await pbService.fetchMessagePage(channelId, 'channel', 30);
            const hasMore = result.hasMore;
            const merged = await offlineCacheService.mergeChannelMessages(channelId, result.items, hasMore, 1);
          messageCursorRef.current[channelId] = result.nextCursor;
          messagesCache.current[channelId] = { items: merged.items, page: 1, hasMore };
          messageCacheFreshnessRef.current[channelId] = Date.now();
          if (activeChannelRef.current?.id === channelId && (append || isCurrentGeneration())) {
            setMessages((prev) => selectActiveMessageWindow(mergeMessageListPreservingReferences(prev, merged.items), prev, true));
            setHasMoreMessages(hasMore);
          }
        }
      } else {
        // INITIAL LOAD: fetch only the newest page; older history is loaded by
        // the anchored cursor path when the user reaches the top.
        const result = await pbService.fetchMessagePage(channelId, 'channel', 30);

        let itemsToSet = [...result.items];
        if (targetMessageId && !itemsToSet.some((m) => m.id === targetMessageId)) {
          try {
            const targetMsg = await pbService.getMessageById(targetMessageId);
            if (targetMsg && targetMsg.channel === channelId) {
              itemsToSet.push(targetMsg);
            }
          } catch (e) {
            console.warn('Could not fetch target message directly:', e);
          }
        }

        const hasMore = result.hasMore;

        const merged = await offlineCacheService.mergeChannelMessages(channelId, itemsToSet, hasMore, 1);

        messagesCache.current[channelId] = {
          items: merged.items,
          page: 1,
          hasMore
        };
        messageCacheFreshnessRef.current[channelId] = Date.now();
        messageCursorRef.current[channelId] = result.nextCursor;

        if (activeChannelRef.current?.id === channelId && (append || isCurrentGeneration())) {
          setMessages((prev) => {
            const pendingOptimistic = prev.filter(
              (m) => m.id.startsWith('optimistic-') || (m as any).temp_id
            );
            const missingPending = pendingOptimistic.filter(
              (p) => !merged.items.some((d) => d.id === p.id || ((p as any).temp_id && (d as any).temp_id === (p as any).temp_id))
            );
            const incomingWithPending = [...merged.items, ...missingPending];
             const updated = mergeMessageListPreservingReferences(prev, incomingWithPending);
             messagesCache.current[channelId] = {
               items: merged.items,
               page: 1,
               hasMore
             };
             return selectActiveMessageWindow(updated);
          });
          setHasMoreMessages(hasMore);

          // Do not issue a hidden second request. The scroll sentinel will
          // request the next page only when the user asks for older history.
        }

        if ((import.meta as any).env?.DEV) {
          console.log(`[PAGINATION_DEBUG] Initial Server Channel Page Load: Returned Count: ${result.items.length} | Oldest Msg ID: ${merged.items[0]?.id || 'none'} | Has More: ${hasMore}`);
        }
      }
      if (activeChannelRef.current?.id === channelId) {
        setMessagesPage(pageNum);
      }
    } catch (err) {
      console.warn('Failed to load messages:', err);
      // Do NOT set setHasMoreMessages(false) on error so user can retry
    } finally {
      if (activeChannelRef.current?.id === channelId) {
        setIsLoadingMore(false);
        setIsInitialLoadingChannel(false);
      }
    }
  };

  const handleLoadMoreMessages = async () => {
    if (!activeChannel || isLoadingMore || !hasMoreMessages) return;
    if (stagedLoadTimerRef.current) {
      clearTimeout(stagedLoadTimerRef.current);
      stagedLoadTimerRef.current = null;
    }

    // Check if we have cached messages that aren't yet in current state
    const cachedItems = messagesCache.current[activeChannel.id]?.items || [];
    const activeFirstIndex = messages[0]?.id ? cachedItems.findIndex((item) => item.id === messages[0].id) : -1;
    if (cachedItems.length > messages.length && activeFirstIndex > 0) {
      const cacheWindow = selectActiveMessageWindow(cachedItems, messages, true);
      setMessages((prev) => selectActiveMessageWindow(mergeMessageListPreservingReferences(prev, cacheWindow), prev, true));
      const visibleFirstId = cacheWindow[0]?.id;
      const firstCacheIndex = visibleFirstId ? cachedItems.findIndex((item) => item.id === visibleFirstId) : -1;
      const remoteHasMore = messagesCache.current[activeChannel.id]?.hasMore === true;
      setHasMoreMessages((firstCacheIndex > 0) || remoteHasMore);
      return;
    }

    const nextPage = messagesPage + 1;
    await loadMessages(activeChannel.id, nextPage, true, null, 50);
  };

  const handleSkipUploadFile = () => {
    if (!activeUpload) return;
    activeUpload.skipRequested = true;
    activeUpload.abortController.abort();
  };

  const handleCancelUploadMessage = async () => {
    if (!activeUpload) return;
    const targetMsgId = activeUpload.messageId;
    const targetTempId = activeUpload.tempId;

    activeUpload.skipRequested = false;
    activeUpload.abortController.abort();
    setActiveUpload(null);

    if (targetMsgId) {
      try {
        await pbService.deleteMessage(targetMsgId);
      } catch (e) {
        console.warn('Failed to delete cancelled message from PocketBase:', e);
      }
    }

    setMessages((prev) =>
      prev.filter((m) => m.id !== targetMsgId && m.id !== targetTempId)
    );
  };

  const handleSendMessage = async (content: string, replyToId?: string, attachments?: File[], uploadedAttachments?: Attachment[]) => {
    if (!activeChannel) return;

    const finalContent = content.trim() === '' ? '  ' : content;

    // Check if sending a Direct Message
    const isDmChannel = isDirectMessageChannel(activeChannel) || activeServer?.name === 'Direct Messages' || activeServer?.name === 'الرسائل الخاصة';
    const targetUsername = isDmChannel ? activeChannel.name.replace(/^@/, '') : '';

    const hasAttachment = !!((attachments && attachments.length > 0) || (uploadedAttachments && uploadedAttachments.length > 0));

    // Construct optimistic attachment records for atomic rendering
    let optimisticAttachmentsList: any[] = [];
    if (uploadedAttachments && uploadedAttachments.length > 0) {
      optimisticAttachmentsList = uploadedAttachments;
    } else if (attachments && attachments.length > 0) {
      optimisticAttachmentsList = attachments.map((file, idx) => ({
        id: `temp-att-${Date.now()}-${idx}`,
        file: file.name,
        type: file.type,
        size: file.size,
        created: new Date().toISOString(),
        collectionName: isDmChannel ? 'private_attachments' : 'attachments',
        url: (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))
          ? URL.createObjectURL(file)
          : ''
      }));
    }

    // 1. Create a local optimistic echo message for instant responsiveness
    const tempId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message & { attachmentsCount?: number; temp_id?: string } = {
      id: tempId,
      temp_id: tempId,
      content: finalContent,
      sender: currentUser!.id,
      channel: activeChannel.id,
      reply_to: replyToId,
      created: new Date().toISOString(),
      is_pending: false,
      has_attachment: hasAttachment,
      attachmentsCount: optimisticAttachmentsList.length,
      expand: {
        sender: currentUser!,
        'attachments(message)': optimisticAttachmentsList,
        'private_attachments(message)': optimisticAttachmentsList
      }
    };

    const optimisticCache = messagesCache.current[activeChannel.id];
    if (optimisticCache) {
      optimisticCache.items = mergeMessagesChronologically(optimisticCache.items, [optimisticMessage]);
    }

    setMessages((prev) => {
      if (prev.some((m) => m.id === tempId || (m as any).temp_id === tempId)) {
        return prev;
      }
      const updated = [...prev, optimisticMessage];
      return selectActiveMessageWindow(updated);
    });

    if (isDmChannel) {
      setAllDmChannels((prevDms) => {
        const targetIndex = prevDms.findIndex(
          (c) => c.id === activeChannel.id || c.name === activeChannel.name || (activeChannel.recipientUser && c.recipientUser?.id === activeChannel.recipientUser.id)
        );
        if (targetIndex !== -1) {
          const updatedChan = {
            ...prevDms[targetIndex],
            created: optimisticMessage.created
          };
          const remaining = prevDms.filter((_, idx) => idx !== targetIndex);
          return [updatedChan, ...remaining];
        }
        return prevDms;
      });
    }

    // Perform sending workflow in background asynchronously - non-blocking for client!
    (async () => {
      try {
        let msg: Message;
        if (isDmChannel && targetUsername) {
          let targetUser = activeChannel.recipientUser;
          if (!targetUser || !targetUser.id) {
            const foundInDms = allDmChannels.find(
              (c) => c.recipientUser?.username?.toLowerCase() === targetUsername.toLowerCase()
            )?.recipientUser;
            if (foundInDms) {
              targetUser = foundInDms;
            } else {
              const matchingUsers = await pbService.searchUsers(targetUsername);
              targetUser = matchingUsers.find((u) => u.username.toLowerCase() === targetUsername.toLowerCase());
            }
          }
          if (targetUser) {
            let chatServerId = activeChannel.id.startsWith('dm-server-') ? activeChannel.id.replace('dm-server-', '') : undefined;
            if (!chatServerId) {
              const privateChatServer = await pbService.getOrCreatePrivateChatServer(targetUser.id);
              chatServerId = privateChatServer?.id;
            }
            msg = await pbService.sendDirectMessage(targetUser.id, finalContent, replyToId, chatServerId, hasAttachment);
          } else {
            msg = await pbService.sendMessage(activeChannel.id, finalContent, replyToId, hasAttachment);
          }
        } else {
          msg = await pbService.sendMessage(activeChannel.id, finalContent, replyToId, hasAttachment);
        }

        const realMsgId = msg.id;

        // Immediately update optimistic echo with real message id in local state
        setMessages((prev) => {
          // If message with this real ID already exists (e.g. delivered via realtime subscription), drop optimistic duplicate
          const alreadyHasReal = prev.some((m) => m.id === realMsgId);
          if (alreadyHasReal) {
            return prev.filter((m) => m.id === realMsgId || (m.id !== tempId && (m as any).temp_id !== tempId));
          }
          const updated = prev.map((m) => {
            if (m.id === tempId || (m as any).temp_id === tempId) {
              const currentAtts = m.expand?.['attachments(message)'] || m.expand?.['private_attachments(message)'] || optimisticAttachmentsList;
              return {
                ...m,
                ...msg,
                id: realMsgId,
                temp_id: undefined,
                expand: {
                  ...msg.expand,
                  ...m.expand,
                  'attachments(message)': currentAtts,
                  'private_attachments(message)': currentAtts
                }
              };
            }
            return m;
          });
          const seen = new Set<string>();
          return updated.filter((m) => {
            const k = m.id;
            const t = (m as any).temp_id;
            if (k && seen.has(k)) return false;
            if (t && seen.has(t)) return false;
            if (k) seen.add(k);
            if (t) seen.add(t);
            return true;
          }).slice(-MAX_ACTIVE_MESSAGES);
        });

        // Handle pre-uploaded attachments from background upload manager
        if (uploadedAttachments && uploadedAttachments.length > 0) {
          await Promise.all(
            uploadedAttachments.map((att) => pbService.linkAttachmentToMessage(att.id, realMsgId, isDmChannel))
          );
          await pbService.touchMessage(realMsgId);
          msg.expand = {
            ...msg.expand,
            'attachments(message)': uploadedAttachments,
            'private_attachments(message)': uploadedAttachments
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === realMsgId || (m as any).temp_id === tempId
                ? {
                    ...m,
                    expand: {
                      ...m.expand,
                      'attachments(message)': uploadedAttachments,
                      'private_attachments(message)': uploadedAttachments
                    }
                  }
                : m
            )
          );
        }
        // Handle fallback attachment file uploads if queued (legacy path)
        else if (attachments && attachments.length > 0) {
          const abortController = new AbortController();
          const uploadState: ActiveUploadState = {
            messageId: realMsgId,
            tempId,
            files: attachments,
            currentFileIndex: 0,
            currentFileName: attachments[0].name,
            fileProgress: 0,
            totalProgress: 0,
            abortController,
            skipRequested: false
          };

          setActiveUpload(uploadState);

          const uploadedAttachmentsList = [];
          let isCancelled = false;

          for (let i = 0; i < attachments.length; i++) {
            if (abortController.signal.aborted && !uploadState.skipRequested) {
              isCancelled = true;
              break;
            }

            const file = attachments[i];
            
            setActiveUpload({
              messageId: realMsgId,
              tempId,
              files: attachments,
              currentFileIndex: i,
              currentFileName: file.name,
              fileProgress: 0,
              totalProgress: Math.round((i / attachments.length) * 100),
              abortController,
              skipRequested: false
            });

            try {
              // Upload as unlinked first so other users only see attachments once all are ready
              const attach = await pbService.uploadAttachmentWithProgress(
                '',
                file,
                (pct) => {
                  const total = Math.round(((i + pct / 100) / attachments.length) * 100);
                  setActiveUpload({
                    messageId: realMsgId,
                    tempId,
                    files: attachments,
                    currentFileIndex: i,
                    currentFileName: file.name,
                    fileProgress: pct,
                    totalProgress: total,
                    abortController,
                    skipRequested: uploadState.skipRequested
                  });
                },
                abortController.signal,
                isDmChannel
              );
              uploadedAttachmentsList.push(attach);
            } catch (uploadErr: any) {
              if (uploadState.skipRequested) {
                console.log('User skipped file:', file.name);
                uploadState.skipRequested = false;
                continue;
              } else if (abortController.signal.aborted) {
                isCancelled = true;
                break;
              } else {
                console.warn('Upload error for file:', file.name, uploadErr);
              }
            }
          }

          setActiveUpload(null);

          if (isCancelled && !uploadState.skipRequested) {
            try {
              await pbService.deleteMessage(realMsgId);
            } catch (e) {
              // ignore
            }
            setMessages((prev) => prev.filter((m) => m.id !== realMsgId && m.id !== tempId));
            return;
          }

          if (uploadedAttachmentsList.length > 0) {
            // Link all uploaded attachments atomically to the message
            await Promise.all(
              uploadedAttachmentsList.map((att) => pbService.linkAttachmentToMessage(att.id, realMsgId, isDmChannel))
            );
            msg.expand = {
              ...msg.expand,
              'attachments(message)': uploadedAttachmentsList,
              'private_attachments(message)': uploadedAttachmentsList
            };
            try {
              await pbService.touchMessage(msg.id);
            } catch (e) {
              // ignore
            }
          }
        }

        // Swap optimistic echo out for real database record
        // The create response is already expanded with sender/reply data and
        // is also delivered through the single realtime message event. Avoid
        // fetching the same record a second time after every send.
        const finalMsg = msg;

        const sentCache = messagesCache.current[activeChannel.id];
        if (sentCache) {
          const withoutOptimistic = sentCache.items.filter((message) => message.id !== tempId && (message as any).temp_id !== tempId);
          sentCache.items = mergeMessagesChronologically(withoutOptimistic, [finalMsg]);
        }

        setMessages((prev) => {
          const updated = prev.map((m) => (m.id === tempId || m.id === realMsgId ? finalMsg : m));
          return selectActiveMessageWindow(updated);
        });

        offlineCacheService.mergeChannelMessages(activeChannel.id, [finalMsg]);

        if (isDmChannel) {
          setAllDmChannels((prevDms) => {
            const targetIndex = prevDms.findIndex((c) => c.id === activeChannel.id || c.name === activeChannel.name);
            if (targetIndex !== -1) {
              const updatedChan = { ...prevDms[targetIndex], created: finalMsg.created || new Date().toISOString() };
              const remaining = prevDms.filter((_, idx) => idx !== targetIndex);
              return [updatedChan, ...remaining];
            }
            return prevDms;
          });
        }

        // Dispatch notifications to target users in PocketBase so offline users receive them in their notifications tab
        try {
          const contentLower = (finalMsg.content || '').toLowerCase();
          const targetUserIds = new Set<string>();
          // Mention matching is the only case that needs a directory-wide
          // lookup. Avoid a users full-list request for ordinary messages and
          // resolve DM recipients from the channel/user cache instead.
          const allUsers = /@[a-z0-9_.-]+/i.test(contentLower)
            ? await pbService.fetchAllUsers()
            : [];

          // Helper for exact mention matching without partial substring match (e.g. @simlfe matching @simlfe90)
          const isMentionMatch = (text: string, name: string) => {
            if (!name) return false;
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@${escaped}(?![a-zA-Z0-9_-])`, 'i');
            return regex.test(text);
          };

          // 1. Mentions (@username or @display_name)
          allUsers.forEach((u) => {
            if (u.id === currentUser!.id) return;

            // In server channels, skip users who left or are inactive in this server
            if (activeServer?.id) {
              const memRecord = pbService.getCachedServerMember(activeServer.id, u.id);
              if (memRecord && (memRecord.is_member === false || memRecord.membership_status === 'left' || memRecord.membership_status === 'banned' || memRecord.membership_status === 'kicked')) {
                return;
              }
            }

            const uName = (u.username || '').toLowerCase();
            const dName = (u.display_name || '').toLowerCase();
            if ((uName && isMentionMatch(contentLower, uName)) || (dName && isMentionMatch(contentLower, dName))) {
              targetUserIds.add(u.id);
            }
          });

          // 2. Replies
          if (replyToId) {
            const repliedMsg = messages.find((m) => m.id === replyToId);
            if (repliedMsg && repliedMsg.sender !== currentUser!.id) {
              targetUserIds.add(repliedMsg.sender);
            }
          }

          // 3. Direct Message
          if (isDmChannel && targetUsername) {
            const targetUser = activeChannel.recipientUser?.id
              ? activeChannel.recipientUser
              : (await pbService.searchUsers(targetUsername)).find((u) => u.username.toLowerCase() === targetUsername.toLowerCase());
            if (targetUser && targetUser.id !== currentUser!.id) {
              targetUserIds.add(targetUser.id);
            }
          }

          for (const targetId of Array.from(targetUserIds)) {
            const isDM = isDmChannel || activeChannel.id === 'dm';
            const isReply = replyToId && messages.some((m) => m.id === replyToId && m.sender === targetId);

            const notifItem: NotificationItem = {
              id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              type: isDM ? 'dm' : isReply ? 'reply' : 'mention',
              sender_id: currentUser!.id,
              sender_name: currentUser!.display_name || currentUser!.username,
              sender_avatar: currentUser!.avatar ? `${pbService.getServerUrl()}/api/files/users/${currentUser!.id}/${currentUser!.avatar}` : undefined,
              channel_id: activeChannel.id,
              channel_name: activeChannel.name,
              server_id: activeServer?.id,
              message_id: finalMsg.id,
              message_content: finalMsg.content || '',
              created: finalMsg.created || new Date().toISOString(),
              read: false
            };

            await pbService.addNotificationToUser(targetId, notifItem);
          }
        } catch (notifErr) {
          console.warn('Failed to dispatch notifications to users:', notifErr);
        }
      } catch (err) {
        console.error('Failed to sync sent message with PocketBase, falling back:', err);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setActiveUpload(null);
        if (uploadedAttachments && uploadedAttachments.length > 0) {
          for (const att of uploadedAttachments) {
            pbService.deleteAttachmentRecord(att.id, isDmChannel);
          }
        }
      }
    })();
  };

  // DELETIONS

  const handleEditMessage = async (messageId: string, newContent: string) => {
    try {
      const now = new Date().toISOString();
      await pbService.editMessage(messageId, newContent);
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, content: newContent, edited: true, updated: now, edited_at: now } : m));
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    const currentActiveChan = activeChannelRef.current || activeChannel;
    const isDm = Boolean(
      currentActiveChan &&
        (currentActiveChan.server === 'dm' ||
          (currentActiveChan as any).server_id === 'dm' ||
          currentActiveChan.id.startsWith('dm-') ||
          currentActiveChan.id.startsWith('private-') ||
          currentActiveChan.name.startsWith('@') ||
          activeServer?.name === 'Direct Messages' ||
          activeServer?.name === 'الرسائل الخاصة' ||
          activeServer?.id === 'dm')
    );

    const updateMsgReactions = (m: Message): Message => {
      if (m.id !== messageId) return m;
      const raw = (m as any).reactions ?? (m as any).expand?.reactions ?? (m as any).reactions_list ?? (m as any).message_reactions;
      const updatedList = toggleReactionInList(raw, emoji, currentUser.id);

      return {
        ...m,
        reactions: updatedList,
      };
    };

    if (currentActiveChan?.id && messagesCache.current[currentActiveChan.id]) {
      messagesCache.current[currentActiveChan.id].items = messagesCache.current[currentActiveChan.id].items.map(updateMsgReactions);
    }
    setMessages((prev) => {
      const updated = prev.map(updateMsgReactions);
      return updated;
    });

    try {
      await pbService.toggleMessageReaction(messageId, emoji, Boolean(isDm));
    } catch (err) {
      console.warn('Failed to toggle reaction:', err);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await MessageDeletionService.deleteMessage(messageId, {
        channelId: activeChannel?.id,
        activeChannel,
        lang,
        onChannelUpdated: (updatedChan) => {
          setActiveChannel(updatedChan);
          setChannels((prev) =>
            prev.map((c) => (c.id === updatedChan.id ? updatedChan : c))
          );
        },
        onMessageDeletedStateUpdate: (deletedId) => {
          setMessages((prev) => MessageDeletionService.transformMessagesOnDeletion(prev, deletedId, lang));
        }
      });
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      await pbService.deleteChannel(channelId);
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
      if (activeChannel?.id === channelId) {
        setActiveChannel(null);
      }
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    try {
      const targetServer = servers.find((s) => s.id === serverId);
      const serverName = targetServer?.name || 'Server';

      // Notify all users in the server that this server was deleted by an admin and won't be accessible anymore
      await pbService.notifyServerUsersDeleted(serverId, serverName, currentUser?.id, lang);

      await pbService.deleteServer(serverId);
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      if (activeServer?.id === serverId) {
        const remaining = servers.filter((s) => s.id !== serverId);
        setActiveServer(remaining.length > 0 ? remaining[0] : null);
        setActiveChannel(null);
      }
    } catch (err) {
      console.error('Failed to delete server:', err);
    }
  };

  const handleLeaveServer = (serverToLeave: Server) => {
    if (!currentUser) return;
    setLeavingServer(serverToLeave);
  };

  const handleLeaveServerSuccess = async (leftServer: Server, newOwnerId?: string) => {
    setServerSettingsModalServer(null);
    setLeavingServer(null);

    if (activeVoiceChannel && activeVoiceChannel.server === leftServer.id) {
      await leaveRoomOrCall();
    }

    const nextServers = servers.filter((s) => s.id !== leftServer.id);
    setServers(nextServers);

    if (activeServer?.id === leftServer.id) {
      if (nextServers.length > 0) {
        const nextSrv = nextServers[0];
        setActiveServer(nextSrv);
        await loadChannels(nextSrv.id);
      } else {
        setActiveServer(null);
        setChannels([]);
        setActiveChannel(null);
        setShowDiscoveryCenter(true);
      }
    }
  };

  const handleKickMember = async (targetUserId: string) => {
    if (!activeServer) return;
    try {
      await pbService.kickMember(activeServer.id, targetUserId);
      setServers((prev) =>
        prev.map((s) =>
          s.id === activeServer.id
            ? { ...s, members: (s.members || []).filter((m) => m !== targetUserId) }
            : s
        )
      );
      setSelectedUserProfile(null);
    } catch (err) {
      console.error('Failed to kick member:', err);
    }
  };

  const handleSelectChannel = (channel: Channel, overrideTargetMessageId?: string) => {
    setShowDiscoveryCenter(false);

    if (channel.server && channel.server !== activeServer?.id) {
      const parentServer = servers.find((s) => s.id === channel.server);
      if (parentServer) {
        setActiveServer(parentServer);
      }
    }

    if (channel.type === 'voice') {
      if (activeChannel && activeChannel.type !== 'voice') {
        previousTextChannelRef.current = activeChannel;
      }
      setActiveVoiceChannel(channel);
      setActiveChannel(channel);
      lastVoiceChannelRef.current = channel;
      if (currentUser && activeRoom?.roomId !== channel.id) {
        void ensureMediaProvider().then(() => (getRegisteredMediaContext()?.joinVoiceRoom || joinVoiceRoom)(channel, currentUser, 'voice')).catch((e) => {
          console.error('Failed to auto-join voice channel:', e);
        });
      }
      return;
    } else {
      previousTextChannelRef.current = channel;
      // Capture unread count before clearing
      const unreadInfo = unreadCounts[channel.id];
      const countOnOpen = unreadInfo?.count || 0;
      setActiveUnreadCountOnOpen(countOnOpen > 0 ? { channelId: channel.id, count: countOnOpen } : null);

      // Clear unread count for this channel
      setUnreadCounts((prev) => {
        if (!prev[channel.id]) return prev;
        const copy = { ...prev };
        delete copy[channel.id];
        return copy;
      });

      // 1. Immediately populate messages from synchronous L1 / memory cache (0ms).
      // DMs can be represented by either the private-chat server id or the
      // recipient id, so resolve all aliases before showing a loading state.
      let cached: any = messagesCache.current[channel.id] || offlineCacheService.getCachedMessagesSync(channel.id);
      const isDmChannel = isDirectMessageChannel(channel);
      if ((!cached || !Array.isArray(cached.items)) && isDmChannel) {
        const recipientId = channel.recipientUser?.id;
        const serverId = channel.id.startsWith('dm-server-') ? channel.id.replace('dm-server-', '') : null;
        const altKeys = [
          serverId ? `dm-server-${serverId}` : null,
          serverId,
          recipientId ? `dm-user-${recipientId}` : null,
          recipientId,
        ].filter(Boolean) as string[];
        for (const key of altKeys) {
          const hit = messagesCache.current[key] || offlineCacheService.getCachedMessagesSync(key);
          if (hit && Array.isArray(hit.items)) {
            cached = hit;
            messagesCache.current[channel.id] = hit;
            break;
          }
        }
      }
      if (cached && Array.isArray(cached.items)) {
        messagesCache.current[channel.id] = cached;
        const visibleCached = selectActiveMessageWindow(cached.items);
        setMessages(visibleCached);
        setHasMoreMessages(cached.hasMore === true || cached.items.length > visibleCached.length);
        setMessagesPage(cached.page || 1);
        setIsInitialLoadingChannel(false);
      } else {
        setMessages([]);
        setHasMoreMessages(true);
        setIsInitialLoadingChannel(true);
      }

      const targetMsgToFocus = overrideTargetMessageId || (unreadInfo?.hasMention ? unreadInfo?.lastMentionMsgId : null) || null;
      setTargetMessageId(targetMsgToFocus);

      // Mark notifications for this channel as read
      if (currentUser?.id) {
        const updated = notificationsList.map((n) =>
          n.channel_id === channel.id || (isDirectMessageChannel(channel) && n.type === 'dm' && (n.private_chat_id === channel.id.replace('dm-server-', '') || n.channel_name === channel.name))
            ? { ...n, read: true }
            : n
        );
        if (updated.some((notification, index) => notification.read !== notificationsList[index]?.read)) {
          setNotificationsList(updated);
          // Keep network I/O outside the state updater and avoid rewriting the
          // full notification array on a no-op navigation.
          pbService.updateUserNotifications(currentUser.id, updated);
        }
      }

      if (isDirectMessageChannel(channel)) {
        setActiveDmChannel(channel);
      } else {
        setActiveServerChannel(channel);
      }

      setActiveChannel(channel);
    }
  };

  const handleNavigateToMessageLink = (serverId: string, channelId: string, messageId: string) => {
    if (serverId && serverId !== 'dm' && serverId !== activeServer?.id) {
      const parentServer = servers.find((s) => s.id === serverId);
      if (parentServer) {
        setActiveServer(parentServer);
      }
    }
    const targetChan = channels.find((c) => c.id === channelId) || allDmChannels.find((c) => c.id === channelId);
    if (targetChan) {
      handleSelectChannel(targetChan, messageId);
    }
  };

  const handleCloseDm = useCallback(
    (dmChannelToClose: Channel) => {
      if (!currentUser?.id || !dmChannelToClose) return;
      const userId = currentUser.id;
      const recipientId = dmChannelToClose.recipientUser?.id;

      setClosedDmIds((prev) => {
        const next = new Set(prev);
        next.add(dmChannelToClose.id);
        if (recipientId) {
          next.add(recipientId);
          next.add(`dm-user-${recipientId}`);
        }
        try {
          localStorage.setItem(
            `closed_dms_${userId}`,
            JSON.stringify(Array.from(next))
          );
        } catch (e) {}
        return next;
      });

      setAllDmChannels((prev) =>
        prev.filter(
          (c) =>
            c.id !== dmChannelToClose.id &&
            (!recipientId || c.recipientUser?.id !== recipientId)
        )
      );

      const currentCached = inMemoryDmCacheRef.current.get(userId) || [];
      const filteredCached = currentCached.filter(
        (c) =>
          c.id !== dmChannelToClose.id &&
          (!recipientId || c.recipientUser?.id !== recipientId)
      );
      inMemoryDmCacheRef.current.set(userId, filteredCached);
      offlineCacheService.saveDmChannels(userId, filteredCached);

      if (
        activeChannel?.id === dmChannelToClose.id ||
        (recipientId && activeChannel?.recipientUser?.id === recipientId)
      ) {
        setActiveChannel(null);
        setActiveDmChannel(null);
        setMessages([]);
      }
    },
    [currentUser?.id, activeChannel]
  );

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleToggleMuteCallback = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleToggleDeafenCallback = useCallback(() => {
    setIsDeafened((prev) => !prev);
  }, []);

  const handleSelectServerFromSidebar = useCallback((server: Server) => {
    if (activeServerRef.current?.id === server.id) {
      setIsSidebarOpen(false);
      return;
    }
    setActiveServer(server);
    setShowDiscoveryCenter(false);
    setIsSidebarOpen(false);
  }, []);

  const handleSelectChannelFromSidebar = useCallback((chan: Channel) => {
    handleSelectChannel(chan);
    setIsSidebarOpen(false);
  }, []);

  const handleOpenSettingsFromSidebar = useCallback(() => {
    setShowSettings(true);
    setIsSidebarOpen(false);
  }, []);

  const handleOpenCreateServerFromSidebar = useCallback(() => {
    setShowCreateServer(true);
    setIsSidebarOpen(false);
  }, []);

  const handleSelectFriendsFromSidebar = useCallback(() => {
    setDiscoveryTab('friends');
    setShowDiscoveryCenter(true);
    setActiveChannel(null);
    setActiveVoiceChannel(null);
    setIsSidebarOpen(false);
  }, []);

  const handleSelectDiscoveryFromSidebar = useCallback(() => {
    setDiscoveryTab('servers');
    setShowDiscoveryCenter(true);
    setActiveChannel(null);
    setActiveVoiceChannel(null);
    setIsSidebarOpen(false);
  }, []);

  const handleOpenNewDmModalFromSidebar = useCallback(() => {
    setShowNewDmModal(true);
  }, []);

  const handleOpenServerSettingsFromSidebar = useCallback((srv: Server) => {
    setServerSettingsModalServer(srv);
  }, []);

  const handleUpdateUserFromSidebar = useCallback((updated: User) => {
    setCurrentUser(updated);
  }, []);

  const handlePlayGlobalTrack = useCallback((track: any) => {
    setActiveGlobalTrack(track);
  }, []);

  const handleClearTargetMessage = useCallback(() => {
    setTargetMessageId(null);
  }, []);

  const handleUpdateChannelInChat = useCallback((updated: Channel) => {
    setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setActiveChannel(updated);
    if (isDirectMessageChannel(updated)) {
      setActiveDmChannel(updated);
    } else {
      setActiveServerChannel(updated);
    }
  }, []);

  const handleUpdateServerInChat = useCallback((updated: Server) => {
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setActiveServer(updated);
  }, []);

  const handleExpandVoice = useCallback(() => {
    let targetVoice = activeVoiceChannel || lastVoiceChannelRef.current;
    if (!targetVoice && activeRoom?.channelId) {
      targetVoice = channels.find((c) => c.id === activeRoom.channelId) || null;
    }
    if (targetVoice) {
      if (targetVoice.server && targetVoice.server !== 'dm') {
        const parentServer = servers.find((s) => s.id === targetVoice.server);
        if (parentServer) setActiveServer(parentServer);
      }
      setActiveChannel(targetVoice);
    }
  }, [activeVoiceChannel, activeRoom?.channelId, channels, servers]);

  const handleStartDm = async (targetUser: User) => {
    try {
      const targetChanName = `@${targetUser.username}`;
      const existingDm = allDmChannels.find(
        (c) => c.recipientUser?.id === targetUser.id || c.name.toLowerCase() === targetChanName.toLowerCase()
      );

      // Un-close this DM if it was previously closed
      setClosedDmIds((prev) => {
        const targetServerDmId = existingDm?.id;
        if (
          prev.has(targetUser.id) ||
          prev.has(`dm-user-${targetUser.id}`) ||
          (targetServerDmId && prev.has(targetServerDmId))
        ) {
          const next = new Set(prev);
          next.delete(targetUser.id);
          next.delete(`dm-user-${targetUser.id}`);
          if (targetServerDmId) next.delete(targetServerDmId);
          if (currentUser?.id) {
            try {
              localStorage.setItem(
                `closed_dms_${currentUser.id}`,
                JSON.stringify(Array.from(next))
              );
            } catch (e) {}
          }
          return next;
        }
        return prev;
      });

      const cachedServer = pbService.getCachedPrivateChatServer(targetUser.id);
      const initialDmChannelId = existingDm
        ? existingDm.id
        : (cachedServer?.id ? `dm-server-${cachedServer.id}` : `dm-user-${targetUser.id}`);

      const dmChannel: Channel = existingDm || {
        id: initialDmChannelId,
        name: targetChanName,
        type: 'text',
        server: 'dm',
        description: `Direct Messages with ${targetUser.display_name || targetUser.username}`,
        recipientUser: targetUser,
        created: cachedServer?.created || new Date().toISOString()
      };

      // Synchronous immediate navigation (0ms lag!)
      setShowDiscoveryCenter(false);
      setActiveChannel(dmChannel);
      setActiveDmChannel(dmChannel);

      // Restore cached messages if available across all possible key variants
      const altKeys = [
        dmChannel.id,
        cachedServer?.id ? `dm-server-${cachedServer.id}` : null,
        cachedServer?.id,
        `dm-user-${targetUser.id}`,
        targetUser.id
      ].filter(Boolean) as string[];

      let cached: any = null;
      for (const k of altKeys) {
        const hit = messagesCache.current[k] || offlineCacheService.getCachedMessagesSync(k);
        if (hit && Array.isArray(hit.items)) {
          cached = hit;
          break;
        }
      }

      if (cached && Array.isArray(cached.items)) {
        messagesCache.current[dmChannel.id] = cached;
        const initialCached = selectActiveMessageWindow(cached.items);
        setMessages(initialCached);
        setHasMoreMessages(cached.hasMore === true || cached.items.length > initialCached.length);
        setMessagesPage(cached.page || 1);
        setIsInitialLoadingChannel(false);
      } else {
        setMessages([]);
        setHasMoreMessages(true);
        setMessagesPage(1);
        setIsInitialLoadingChannel(true);
      }

      // Clear unread count
      setUnreadCounts((prev) => {
        if (!prev[dmChannel.id]) return prev;
        const copy = { ...prev };
        delete copy[dmChannel.id];
        return copy;
      });

      // Background non-blocking record resolution and sync
      (async () => {
        try {
          const privateChatServer = await pbService.getOrCreatePrivateChatServer(targetUser.id);
          const realDmChannelId = `dm-server-${privateChatServer.id}`;

          const resolvedDmChannel: Channel = {
            ...dmChannel,
            id: realDmChannelId,
            created: privateChatServer.created || dmChannel.created
          };

          setActiveChannel((curr) => (curr?.id === initialDmChannelId || curr?.id === realDmChannelId ? resolvedDmChannel : curr));
          setActiveDmChannel((curr) => (curr?.id === initialDmChannelId || curr?.id === realDmChannelId ? resolvedDmChannel : curr));

          // The active-channel effect owns message loading. Avoid a second
          // 40-record DM query here, which used to race and overwrite the
          // cursor/cache state established by the real loader.
          loadAllDmChannels();
        } catch (err) {
          console.warn('Background DM resolution error:', err);
          setIsInitialLoadingChannel(false);
        }
      })();
    } catch (err) {
      console.error('Failed to start DM:', err);
    }
  };

  const handleStartCallDm = async (targetUser: User, mode: 'voice' | 'video' | 'screen' = 'voice') => {
    try {
      const targetChanName = `@${targetUser.username}`;
      const existingDm = allDmChannels.find(
        (c) => c.recipientUser?.id === targetUser.id || c.name.toLowerCase() === targetChanName.toLowerCase()
      );
      const dmChannel: Channel = existingDm || {
        id: `dm-user-${targetUser.id}`,
        name: targetChanName,
        type: 'text',
        server: 'dm',
        recipientUser: targetUser,
        description: `Direct Messages with ${targetUser.display_name || targetUser.username}`
      };

      if (currentUser) {
        // LiveKit is intentionally deferred from the initial web bundle, but
        // a first-call click must still execute instead of hitting the bridge's
        // temporary no-op context while the media chunk is mounting.
        await ensureMediaProvider();
        const media = getRegisteredMediaContext();
        await (media?.startDmCall || startDmCall)(targetUser, currentUser, dmChannel, mode);
      }
      setActiveCallMode(mode);

      // Perform background DM channel creation/selection asynchronously without delaying the call UI
      handleStartDm(targetUser).catch(() => {});
    } catch (e) {
      console.error('Failed to start call with user:', e);
    }
  };

  const handleStartCall = async (mode: 'voice' | 'video' | 'screen' = 'voice') => {
    // 1. Direct DM Channel with attached recipient user
    if (activeDmChannel && activeDmChannel.recipientUser) {
      handleStartCallDm(activeDmChannel.recipientUser, mode);
      return;
    }

    // 2. Active channel is DM or starts with @
    if (isDirectMessageChannel(activeChannel)) {
      if (activeChannel.recipientUser) {
        handleStartCallDm(activeChannel.recipientUser, mode);
        return;
      }
      const match = allDmChannels.find(
        (c) => (c.name.toLowerCase() === activeChannel.name.toLowerCase() || c.id === activeChannel.id) && c.recipientUser
      )?.recipientUser;
      if (match) {
        handleStartCallDm(match, mode);
        return;
      }

      // Try resolving user by username from channel name
      const rawUsername = activeChannel.name.replace(/^@/, '').trim();
      if (rawUsername) {
        try {
          const results = await pbService.searchUsers(rawUsername);
          const userObj = results.find(
            (u) => u.username.toLowerCase() === rawUsername.toLowerCase() || u.display_name?.toLowerCase() === rawUsername.toLowerCase()
          ) || results[0];
          if (userObj) {
            handleStartCallDm(userObj, mode);
            return;
          }
        } catch {}
      }
    }

    // 3. Active server is a private 1-on-1 DM server
    if (activeServer && (activeServer.type === 'dm' || (activeServer as any).is_private || activeServer.id.startsWith('dm-'))) {
      try {
        const members = await pbService.fetchServerMembers(activeServer.id);
        const otherMember = members.find((m) => m.id !== currentUser?.id && (m as any).user !== currentUser?.id);
        if (otherMember) {
          const userObj = (otherMember as any).expand?.user || (otherMember as any).userRef || otherMember;
          if (userObj) {
            handleStartCallDm(userObj as User, mode);
            return;
          }
        }
      } catch {}
    }

    if (!activeServer) return;
    try {
      // Find the voice channel of the current server
      const list = await pbService.fetchChannels(activeServer.id);
      const voiceChan = list.find((c) => c.type === 'voice');
      if (voiceChan) {
        if (activeVoiceChannel && activeVoiceChannel.id === voiceChan.id) {
          return;
        }

        if (activeVoiceChannel && activeVoiceChannel.id !== voiceChan.id) {
          setPendingVoiceSwitchChannel(voiceChan);
          return;
        }
        if (activeChannel && activeChannel.type === 'text') {
          previousTextChannelRef.current = activeChannel;
        }
        setActiveCallMode(mode);
        setActiveVoiceChannel(voiceChan);
        lastVoiceChannelRef.current = voiceChan;
        if (currentUser) {
          void ensureMediaProvider().then(() => (getRegisteredMediaContext()?.joinVoiceRoom || joinVoiceRoom)(voiceChan, currentUser, mode)).catch((err) => {
            console.error('Failed to join voice channel from call button:', err);
          });
        }
      }
    } catch (e) {
      console.error('Failed to start call:', e);
    }
  };

  const handleLeaveVoice = useCallback(() => {
    setActiveVoiceChannel(null);
    lastVoiceChannelRef.current = null;
    leaveRoomOrCall();

    let targetTextChan = previousTextChannelRef.current;
    if (!targetTextChan || targetTextChan.type === 'voice') {
      if (activeServer) {
        const serverChans = channels.filter((c) => c.server === activeServer.id);
        targetTextChan = serverChans.find((c) => c.type === 'text' || c.type === 'announcement') || null;
      }
      if (!targetTextChan && channels.length > 0) {
        targetTextChan = channels.find((c) => c.type === 'text' || c.type === 'announcement') || null;
      }
    }

    if (targetTextChan) {
      setActiveChannel(targetTextChan);
      previousTextChannelRef.current = targetTextChan;
    }
    playLeaveSound();
  }, [activeServer, channels, leaveRoomOrCall, playLeaveSound]);

  // Auto-restore text channel when activeRoom disconnects while viewing a voice channel
  useEffect(() => {
    if (!activeRoom && activeChannel && activeChannel.type === 'voice') {
      let targetTextChan = previousTextChannelRef.current;
      if (!targetTextChan || targetTextChan.type === 'voice') {
        if (activeServer) {
          const serverChans = channels.filter((c) => c.server === activeServer.id);
          targetTextChan = serverChans.find((c) => c.type === 'text' || c.type === 'announcement') || null;
        }
        if (!targetTextChan && channels.length > 0) {
          targetTextChan = channels.find((c) => c.type === 'text' || c.type === 'announcement') || null;
        }
      }
      if (targetTextChan) {
        setActiveChannel(targetTextChan);
        previousTextChannelRef.current = targetTextChan;
      }
    }
  }, [activeRoom, activeChannel, activeServer, channels]);

  const handleLogout = () => {
    leaveRoomOrCall().catch(() => {});
    wsService.disconnect();
    offlineCacheService.clearUserCache();
    pbService.logout();
    setCurrentUser(null);
    setServers([]);
    setChannels([]);
    setMessages([]);
    setActiveServer(null);
    setActiveChannel(null);
    setActiveVoiceChannel(null);
    setShowDiscoveryCenter(false);
    localStorage.removeItem('last_active_server_id');
  };

  const handleSelectNotification = async (notif: NotificationItem) => {
    // 1. Mark notification as read in state and persist to database (keeping in history)
    const updatedList = notificationsList.map((n) => (n.id === notif.id ? { ...n, read: true } : n));
    setNotificationsList(updatedList);
    if (currentUser?.id) {
      await pbService.updateUserNotifications(currentUser.id, updatedList);
    }

    // 2. Dismiss activeToast if it matches
    if (activeToast && activeToast.id === notif.message_id) {
      setActiveToast(null);
    }

    // 3. Friend request notification: navigate to Discovery Center
    if (notif.type === 'friend_request' || notif.channel_name === 'Friend Request') {
      setShowDiscoveryCenter(true);
      return;
    }


    // 4. Set target message ID for ChatPanel scrolling and highlighting
    if (notif.message_id) {
      setTargetMessageId(notif.message_id);
    }

    // 5. Navigate to DM or Server Channel
    if (notif.type === 'dm' || notif.channel_id === 'dm' || notif.private_chat_id) {
      if (notif.sender_id) {
        try {
          const senderUser = await pbService.fetchUserById(notif.sender_id);
          if (senderUser) {
            await handleStartDm(senderUser);
          } else {
            await handleStartDm({
              id: notif.sender_id,
              username: notif.sender_name,
              display_name: notif.sender_name,
              email: '',
              role: 'user',
              status: 'online',
              avatar: notif.sender_avatar
            } as User);
          }
          if (notif.message_id) {
            setTargetMessageId(notif.message_id);
          }
        } catch (e) {
          console.warn('Failed to start DM for notification:', e);
        }
      }
    } else if (notif.server_id) {
      let targetServer = servers.find((s) => s.id === notif.server_id);
      if (!targetServer) {
        try {
          targetServer = await pbService.getServerById(notif.server_id);
          if (targetServer) setServers((prev) => [...prev, targetServer!]);
        } catch (e) {
          console.warn('Could not fetch target server for notification:', e);
        }
      }
      if (targetServer) {
        setActiveServer(targetServer);
        setShowDiscoveryCenter(false);
        let serverChans = channelsCache.current[targetServer.id];
        if (!serverChans || serverChans.length === 0) {
          serverChans = await pbService.fetchChannels(targetServer.id);
          channelsCache.current[targetServer.id] = serverChans;
        }
        let targetChan = serverChans.find((c) => c.id === notif.channel_id);
        if (!targetChan && notif.channel_id) {
          try {
            targetChan = await pbService.getChannelById(notif.channel_id);
          } catch (e) {
            console.warn('Could not fetch channel by ID:', e);
          }
        }
        if (targetChan) {
          handleSelectChannel(targetChan, notif.message_id);
        }
      }
    } else if (notif.channel_id) {
      let targetChan = channels.find((c) => c.id === notif.channel_id);
      if (!targetChan) {
        try {
          targetChan = await pbService.getChannelById(notif.channel_id);
        } catch (e) {
          console.warn('Could not fetch channel by ID:', e);
        }
      }
      if (targetChan) {
        handleSelectChannel(targetChan, notif.message_id);
      }
    }
  };

  useEffect(() => {
    handleSelectNotificationRef.current = handleSelectNotification;
  }, [handleSelectNotification]);

  const handleMarkAllAsRead = async () => {
    const updatedList = notificationsList.map((n) => ({ ...n, read: true }));
    setNotificationsList(updatedList);
    if (currentUser?.id) {
      await pbService.updateUserNotifications(currentUser.id, updatedList);
    }
  };

  const handleClearNotifications = async () => {
    setNotificationsList([]);
    if (currentUser?.id) {
      await pbService.updateUserNotifications(currentUser.id, []);
    }
  };

  const handleAcceptFriendRequestNotif = async (notif: NotificationItem) => {
    if (!currentUser || !notif.sender_id) return;
    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentFriends = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
        ? currentUser.friends
        : (mySettings.friends || []);
      const updatedFriends = Array.from(new Set([...currentFriends, notif.sender_id]));

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = currentReqs.filter((r: any) => r.targetId !== notif.sender_id);

      const updatedSettings = {
        ...mySettings,
        friends: updatedFriends,
        friend_requests: updatedReqs
      };

      await pbService.updateProfile(currentUser.id, {
        friends: updatedFriends,
        settings: updatedSettings
      });
      currentUser.friends = updatedFriends;
      currentUser.settings = updatedSettings;

      // Update target sender settings in PocketBase schema
      try {
        const senderRecord = await pbService.fetchUserById(notif.sender_id);
        if (senderRecord) {
          let sSettings = senderRecord.settings;
          if (typeof sSettings === 'string') {
            try { sSettings = JSON.parse(sSettings); } catch { sSettings = {}; }
          }
          if (!sSettings) sSettings = {};

          const sFriends = (Array.isArray(senderRecord.friends) && senderRecord.friends.length > 0)
            ? senderRecord.friends
            : (sSettings.friends || []);
          const sReqs = sSettings.friend_requests || [];

          const newSFriends = Array.from(new Set([...sFriends, currentUser.id]));

          await pbService.updateProfile(notif.sender_id, {
            friends: newSFriends,
            settings: {
              ...sSettings,
              friends: newSFriends,
              friend_requests: sReqs.filter((r: any) => r.targetId !== currentUser.id)
            }
          });
        }
      } catch (e) {
        console.warn('Failed to update sender friend settings:', e);
      }

      const myAvatarUrl = currentUser.avatar ? (
        currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('blob:')
          ? currentUser.avatar
          : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`
      ) : undefined;

      // Notify sender
      await pbService.addNotificationToUser(notif.sender_id, {
        id: 'notif-fra-' + Date.now(),
        type: 'mention',
        sender_id: currentUser.id,
        sender_name: currentUser.display_name || currentUser.username,
        sender_avatar: myAvatarUrl,
        channel_id: 'dm',
        channel_name: 'Friend Request Accepted',
        message_id: 'fra-' + Date.now(),
        message_content: lang === 'ar' ? `قبل ${currentUser.display_name || currentUser.username} طلب الصداقة!` : `${currentUser.display_name || currentUser.username} accepted your friend request!`,
        created: new Date().toISOString(),
        read: false
      });

      const updatedList = notificationsList.map((n) => (n.id === notif.id ? { ...n, read: true } : n));
      setNotificationsList(updatedList);
      if (currentUser?.id) {
        await pbService.updateUserNotifications(currentUser.id, updatedList);
      }
    } catch (err) {
      console.error('Failed to accept friend request from notification:', err);
    }
  };

  const handleDeclineFriendRequestNotif = async (notif: NotificationItem) => {
    if (!currentUser || !notif.sender_id) return;
    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = currentReqs.filter((r: any) => r.targetId !== notif.sender_id);

      const updatedSettings = {
        ...mySettings,
        friend_requests: updatedReqs
      };

      await pbService.updateProfile(currentUser.id, { settings: updatedSettings });
      currentUser.settings = updatedSettings;

      const updatedList = notificationsList.map((n) => (n.id === notif.id ? { ...n, read: true } : n));
      setNotificationsList(updatedList);
      if (currentUser?.id) {
        await pbService.updateUserNotifications(currentUser.id, updatedList);
      }
    } catch (err) {
      console.error('Failed to decline friend request from notification:', err);
    }
  };

  const t = (key: string): string => {
    return langConfig[key] || key;
  };

  const handleSetLangAndPersist = (l: 'en' | 'ar') => {
    setLang(l);
    localStorage.setItem('app_lang', l);
  };

  // Map theme variables to CSS custom properties
  const themeClasses: any = {
    rootBg: 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)]',
    sidebarBg: 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]',
    panelBg: 'bg-[var(--theme-bg-primary)]',
    cardBg: 'bg-[var(--theme-bg-card)] border-[var(--theme-border)]',
    inputBg: 'bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]',
    activeChannelBg: 'bg-accent/20 text-accent',
    primaryBtn: 'bg-accent hover:opacity-90 text-white',
  };

  const fontClass = 'font-sans';

  const sizeClass = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base',
    xlarge: 'text-lg'
  }[userSettings.appearance.fontSize] || 'text-sm';

  const animClass = `anim-${userSettings.appearance.animations || 'high'}`;

  return (
    <>
      <div id="theme-wallpaper-layer" aria-hidden="true" />
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className={`app-root-container h-full w-full overflow-hidden flex flex-col antialiased select-none ${themeClasses.rootBg} ${fontClass} ${sizeClass} ${animClass}`}
      >
      <TitleBar
        appName="SirverData"
        isLight={effectiveTheme === 'light'}
        lang={lang}
        onOpenSettings={() => setShowSettings(true)}
        isConnected={true}
      />
      <div className="flex-1 flex w-full min-h-0 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {resetToken ? (
            <motion.div
              key="reset-password-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <Suspense fallback={<AppLoadingFallback />}>
                <ResetPasswordScreen
                  token={resetToken}
                  onComplete={() => {
                    setResetToken(null);
                    if (typeof window !== 'undefined' && window.history?.replaceState) {
                      window.history.replaceState({}, document.title, window.location.pathname);
                    }
                  }}
                  onCancel={() => {
                    setResetToken(null);
                    if (typeof window !== 'undefined' && window.history?.replaceState) {
                      window.history.replaceState({}, document.title, window.location.pathname);
                    }
                  }}
                  lang={lang}
                  t={t}
                  toggleLang={() => handleSetLangAndPersist(lang === 'en' ? 'ar' : 'en')}
                />
              </Suspense>
            </motion.div>
          ) : !currentUser ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <Suspense fallback={<AppLoadingFallback />}>
                <AuthScreen
                  onAuthSuccess={(user) => {
                    setCurrentUser(user);
                    let userSet = user.settings;
                    if (typeof userSet === 'string') {
                      try { userSet = JSON.parse(userSet); } catch (e) {}
                    }
                    const cachedSettings = getCachedUserSettings();
                    const merged = mergeWithDefaults({
                      ...cachedSettings,
                      ...(userSet || {}),
                      appearance: {
                        ...cachedSettings.appearance,
                        ...(userSet?.appearance || {}),
                      },
                      languageRegion: {
                        ...cachedSettings.languageRegion,
                        ...(userSet?.languageRegion || {}),
                      },
                    });
                    setUserSettings(merged);
                    saveCachedUserSettings(merged);
                    applySettingsToDocument(merged);

                    const settingsLang = merged.languageRegion?.appLanguage;
                    const rawPref = (user as any)?.preferred_language || (user as any)?.preferredLanguage || user?.language;
                    let targetLang: 'en' | 'ar' | null = null;
                    if (settingsLang === 'en' || settingsLang === 'ar') {
                      targetLang = settingsLang;
                    } else if (rawPref) {
                      const lower = String(rawPref).toLowerCase().trim();
                      if (lower.startsWith('ar') || lower.includes('arabic') || lower.includes('العربية')) targetLang = 'ar';
                      else if (lower.startsWith('en') || lower.includes('english')) targetLang = 'en';
                    }
                    if (targetLang) {
                      setLang(targetLang);
                      localStorage.setItem('app_lang', targetLang);
                    }

                    processAndOptimizeUserAvatar(user).then((optimized) => {
                      if (optimized) {
                        setCurrentUser(optimized);
                      }
                    }).catch(() => {});
                  }}
                  lang={lang}
                  t={t}
                  toggleLang={() => handleSetLangAndPersist(lang === 'en' ? 'ar' : 'en')}
                  serverUrl={serverUrl}
                  setServerUrl={(url) => {
                    setServerUrl(url);
                    pbService.setServerUrl(url);
                  }}
                />
              </Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="app-workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex"
            >
            {/* Unified Collaboration Sidebar Navigation */}
            {/* Desktop Static Sidebar */}
            {!isMobile && (
              <div className="hidden md:flex md:relative md:inset-auto md:z-auto w-80 h-full shrink-0">
                <Suspense fallback={<AppLoadingFallback compact />}>
                  <ChannelList
                  servers={servers}
                  activeServer={activeServer}
                  onSelectServer={handleSelectServerFromSidebar}
                  channels={channels}
                  activeChannel={activeChannel}
                  onSelectChannel={handleSelectChannelFromSidebar}
                  currentUser={currentUser}
                  onOpenSettings={handleOpenSettingsFromSidebar}
                  onOpenCreateServer={handleOpenCreateServerFromSidebar}
                  onLogout={handleLogout}
                  serverUrl={serverUrl}
                  lang={lang}
                  t={t}
                  activeVoiceChannel={activeVoiceChannel}
                  onLeaveVoice={handleLeaveVoice}
                  onExpandVoice={handleExpandVoice}
                  isMuted={isMuted}
                  onToggleMute={handleToggleMuteCallback}
                  isDeafened={isDeafened}
                  onToggleDeafen={handleToggleDeafenCallback}
                  activeCalls={EMPTY_ACTIVE_CALLS}
                  theme={effectiveTheme}
                  onSelectUser={(u, anchor) => {
                    setIsGlobalSelfProfile(false);
                    handleSelectUser(u, anchor);
                    setIsSidebarOpen(false);
                  }}
                  onSelectSelfGlobalProfile={(e) => {
                    setIsGlobalSelfProfile(true);
                    if (currentUser) {
                      handleSelectUser(currentUser, e || null);
                    }
                    setIsSidebarOpen(false);
                  }}
                  activeFriends={showDiscoveryCenter && discoveryTab === 'friends'}
                  onSelectFriends={handleSelectFriendsFromSidebar}
                  activeDiscovery={showDiscoveryCenter && discoveryTab === 'servers'}
                  onSelectDiscovery={handleSelectDiscoveryFromSidebar}
                  unreadCounts={unreadCounts}
                  allDmChannels={allDmChannels}
                  onOpenNewDmModal={handleOpenNewDmModalFromSidebar}
                  onDeleteChannel={handleDeleteChannel}
                  onDeleteServer={activeServer ? () => handleDeleteServer(activeServer.id) : undefined}
                  onLeaveServer={activeServer ? handleLeaveServer : undefined}
                  onUpdateUser={handleUpdateUserFromSidebar}
                  onOpenServerSettings={handleOpenServerSettingsFromSidebar}
                    onCloseDm={handleCloseDm}
                  />
                </Suspense>
              </div>
            )}

            {/* In-App Floating Liquid Glass Notification Toast */}
            <NotificationToast
              toast={activeToast}
              onDismiss={() => setActiveToast(null)}
              onOpenToast={(toast) => {
                const matchingNotif = notificationsList.find((n) => n.message_id === toast.id);
                if (matchingNotif) {
                  handleSelectNotification(matchingNotif);
                } else {
                  handleSelectNotification({
                    id: 'toast-' + toast.id,
                    sender_id: '',
                    sender_name: toast.senderName || toast.title,
                    channel_id: toast.channelId || '',
                    channel_name: '',
                    server_id: toast.serverId,
                    message_id: toast.id,
                    message_content: toast.body,
                    created: new Date().toISOString(),
                    read: true
                  });
                }
              }}
              lang={lang}
            />

            {/* Mobile Slide-Over Left Channels Drawer */}
            <AnimatePresence>
              {(isSidebarOpen || sidebarDragState.isDragging) && (
                <>
                  <motion.div
                    key="channels-drawer-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: sidebarDragState.isDragging ? sidebarDragState.opacity : 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: sidebarDragState.isDragging ? 0 : 0.22, ease: 'easeOut' }}
                    onClick={handleCloseSidebar}
                    className="fixed inset-0 bg-black/60 z-[70] md:hidden pointer-events-auto"
                  />
                  <motion.div
                    key="channels-drawer-panel"
                    initial={{ transform: `translate3d(${lang === 'ar' ? '100%' : '-100%'}, 0px, 0px)` }}
                    animate={{
                      transform: sidebarDragState.isDragging
                        ? `translate3d(${sidebarDragState.dragX}px, 0px, 0px)`
                        : 'translate3d(0px, 0px, 0px)',
                    }}
                    exit={{
                      transform: `translate3d(${lang === 'ar' ? '100%' : '-100%'}, 0px, 0px)`,
                    }}
                    transition={{
                      duration: sidebarDragState.isDragging ? 0 : (isSidebarOpen ? 0.25 : 0.20),
                      ease: sidebarDragState.isDragging ? 'linear' : (isSidebarOpen ? [0.16, 1, 0.3, 1] : [0.4, 0, 0.2, 1]),
                    }}
                    style={{ willChange: 'transform' }}
                    onClick={(e) => e.stopPropagation()}
                    data-mobile-drawer="channels"
                    className={`fixed inset-y-0 ${lang === 'ar' ? 'right-0 border-l' : 'left-0 border-r'} border-[var(--theme-border)] z-[70] w-[78vw] max-w-[320px] sm:w-[50vw] sm:max-w-[340px] md:w-80 shrink-0 md:hidden bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] flex flex-col overflow-hidden shadow-2xl mobile-drawer-panel`}
                  >
                    <Suspense fallback={<AppLoadingFallback compact />}>
                      <ChannelList
                      servers={servers}
                      activeServer={activeServer}
                      onSelectServer={handleSelectServerFromSidebar}
                      channels={channels}
                      activeChannel={activeChannel}
                      onSelectChannel={handleSelectChannelFromSidebar}
                      currentUser={currentUser}
                      onOpenSettings={handleOpenSettingsFromSidebar}
                      onOpenCreateServer={handleOpenCreateServerFromSidebar}
                      onLogout={handleLogout}
                      serverUrl={serverUrl}
                      lang={lang}
                      t={t}
                      activeVoiceChannel={activeVoiceChannel}
                      onLeaveVoice={handleLeaveVoice}
                      onExpandVoice={handleExpandVoice}
                      isMuted={isMuted}
                      onToggleMute={handleToggleMuteCallback}
                      isDeafened={isDeafened}
                      onToggleDeafen={handleToggleDeafenCallback}
                      activeCalls={EMPTY_ACTIVE_CALLS}
                      theme={effectiveTheme}
                      onSelectUser={(u, anchor) => {
                        setIsGlobalSelfProfile(false);
                        handleSelectUser(u, anchor);
                        setIsSidebarOpen(false);
                      }}
                      onSelectSelfGlobalProfile={(e) => {
                        setIsGlobalSelfProfile(true);
                        if (currentUser) {
                          handleSelectUser(currentUser, e || null);
                        }
                        setIsSidebarOpen(false);
                      }}
                      activeFriends={showDiscoveryCenter && discoveryTab === 'friends'}
                      onSelectFriends={handleSelectFriendsFromSidebar}
                      activeDiscovery={showDiscoveryCenter && discoveryTab === 'servers'}
                      onSelectDiscovery={handleSelectDiscoveryFromSidebar}
                      unreadCounts={unreadCounts}
                      allDmChannels={allDmChannels}
                      onOpenNewDmModal={handleOpenNewDmModalFromSidebar}
                      onDeleteChannel={handleDeleteChannel}
                      onDeleteServer={activeServer ? () => handleDeleteServer(activeServer.id) : undefined}
                      onLeaveServer={activeServer ? handleLeaveServer : undefined}
                      onUpdateUser={handleUpdateUserFromSidebar}
                      onOpenServerSettings={handleOpenServerSettingsFromSidebar}
                        onCloseDm={handleCloseDm}
                      />
                    </Suspense>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* 3. Main Action Panel (Swaps between Mobile Settings Page, Discovery, Voice Stage, or Chat) */}
            <div className="flex-1 flex min-w-0 w-full h-full relative">
              {isMobile && showSettings && currentUser ? (
                <Suspense fallback={null}>
                  <SettingsModal
                    isMobilePage={true}
                    currentUser={currentUser}
                    onUpdateUser={(updated) => setCurrentUser(updated)}
                    onClose={() => setShowSettings(false)}
                    serverUrl={serverUrl}
                    setServerUrl={(url) => {
                      setServerUrl(url);
                      pbService.setServerUrl(url);
                    }}
                    lang={lang}
                    setLang={handleSetLangAndPersist}
                    t={t}
                    userSettings={userSettings}
                    onUpdateUserSettings={handleUpdateUserSettings}
                    onLogout={handleLogout}
                    servers={servers}
                    activeServer={activeServer}
                    channels={channels}
                    onChannelCreated={(newChan) => setChannels((prev) => [...prev, newChan])}
                    onChannelUpdated={(updatedChan) => {
                      setChannels((prev) => prev.map((c) => (c.id === updatedChan.id ? updatedChan : c)));
                      if (activeChannel?.id === updatedChan.id) {
                        setActiveChannel(updatedChan);
                      }
                    }}
                    onDeleteChannel={handleDeleteChannel}
                    onDeleteServer={handleDeleteServer}
                    onOpenServerSettings={(srv) => setServerSettingsModalServer(srv)}
                    onServerUpdated={(updated) => {
                      setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                      if (activeServer?.id === updated.id) {
                        setActiveServer(updated);
                      }
                    }}
                  />
                </Suspense>
              ) : showDiscoveryCenter ? (
                <Suspense fallback={null}>
                  <DiscoveryCenter
                    initialTab={discoveryTab}
                    currentUser={currentUser}
                    onJoinServerSuccess={async (serverId) => {
                      await loadServers();
                      // Load server channels
                      try {
                        const list = await pbService.fetchServers();
                        const match = list.find((s) => s.id === serverId);
                        if (match) {
                          setActiveServer(match);
                          await loadChannels(serverId);
                        }
                      } catch (e) {
                        console.warn(e);
                      }
                      setShowDiscoveryCenter(false);
                    }}
                    joinedServers={servers}
                    t={t}
                    lang={lang}
                    theme={effectiveTheme}
                    onSelectUser={handleSelectUser}
                    onToggleSidebar={handleToggleSidebar}
                    onStartDm={handleStartDm}
                    onStartCall={handleStartCallDm}
                  />
                </Suspense>
              ) : (activeChannel && activeChannel.type === 'voice') ? (
                <Suspense fallback={null}>
                  <VoicePanel
                    channel={activeChannel}
                    currentUser={currentUser}
                    isMuted={isMuted}
                    isDeafened={isDeafened}
                    onToggleMute={handleToggleMuteCallback}
                    onToggleDeafen={handleToggleDeafenCallback}
                    onLeave={handleLeaveVoice}
                    t={t}
                    lang={lang}
                    theme={effectiveTheme}
                    onSelectUser={handleSelectUser}
                    onToggleSidebar={handleToggleSidebar}
                    initialMode={activeCallMode}
                  />
                </Suspense>
              ) : (activeChannel || activeServerChannel || activeDmChannel) ? (
                <div className="flex-1 flex min-w-0 w-full h-full relative overflow-hidden">
                  {(() => {
                    const currentChatChannel = activeChannel || activeServerChannel || activeDmChannel;
                    if (!currentChatChannel) return null;

                    const isDm = isDirectMessageChannel(currentChatChannel);
                    const targetServer = !isDm
                      ? (servers.find((s) => s.id === currentChatChannel.server || s.id === (currentChatChannel as any).server_id) ||
                         (activeServer?.id === currentChatChannel.server ? activeServer : undefined) ||
                         servers.find((s) => s.id === activeServer?.id) ||
                         activeServer ||
                         pbService.getCachedServers?.()?.find((s) => s.id === currentChatChannel.server) ||
                         (currentChatChannel.server && currentChatChannel.server !== 'dm' ? ({ id: currentChatChannel.server, name: currentChatChannel.name } as Server) : undefined))
                      : undefined;

                    const cachedEntry =
                      messagesCache.current[currentChatChannel.id] ||
                      (currentChatChannel.recipientUser?.id
                        ? messagesCache.current[`dm-user-${currentChatChannel.recipientUser.id}`] ||
                          messagesCache.current[currentChatChannel.recipientUser.id]
                        : null);

                    return (
                      <Suspense fallback={<AppLoadingFallback compact />}>
                        <ChatPanel
                          isActive={true}
                          isInitialLoading={Boolean(isInitialLoadingChannel && (!cachedEntry || !Array.isArray(cachedEntry.items)))}
                          channel={currentChatChannel}
                          messages={messages}
                          currentUser={currentUser}
                          onSendMessage={handleSendMessage}
                          onDeleteMessage={handleDeleteMessage}
                          onEditMessage={handleEditMessage}
                          onToggleReaction={handleToggleReaction}
                          onDeleteChannel={handleDeleteChannel}
                          onDeleteServer={!isDm && targetServer ? () => handleDeleteServer(targetServer.id) : undefined}
                          t={t}
                          lang={lang}
                          theme={effectiveTheme}
                          onSelectUser={handleSelectUser}
                          server={targetServer}
                          onUpdateChannel={handleUpdateChannelInChat}
                          onUpdateServer={handleUpdateServerInChat}
                          isSidebarOpen={isSidebarOpen}
                          onToggleSidebar={handleToggleSidebar}
                          onStartCall={handleStartCall}
                          hasMoreMessages={hasMoreMessages}
                          isLoadingMore={isLoadingMore}
                          onLoadMoreMessages={handleLoadMoreMessages}
                          onPlayGlobalTrack={handlePlayGlobalTrack}
                          targetMessageId={targetMessageId}
                          onClearTargetMessage={handleClearTargetMessage}
                          notificationsList={notificationsList}
                          onSelectNotification={handleSelectNotification}
                          onMarkAllAsRead={handleMarkAllAsRead}
                          onClearNotifications={handleClearNotifications}
                          onAcceptFriendRequest={handleAcceptFriendRequestNotif}
                          onDeclineFriendRequest={handleDeclineFriendRequestNotif}
                          activeUpload={activeUpload}
                          onSkipUploadFile={handleSkipUploadFile}
                          onCancelUploadMessage={handleCancelUploadMessage}
                          unreadCountOnOpen={activeUnreadCountOnOpen && activeUnreadCountOnOpen.channelId === currentChatChannel.id ? activeUnreadCountOnOpen.count : 0}
                          serverChannels={channels}
                          onNavigateToMessageLink={handleNavigateToMessageLink}
                          activeVoiceChannel={activeVoiceChannel}
                          onCloseDm={isDm ? () => handleCloseDm(currentChatChannel) : undefined}
                          onExpandVoice={handleExpandVoice}
                        />
                      </Suspense>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 select-none">
                  {/* Toggle button on empty screen for mobile */}
                  <button
                    onClick={handleToggleSidebar}
                    className="md:hidden px-4 py-2 bg-accent hover:opacity-90 text-[var(--theme-bg-primary)] rounded-xl text-xs font-bold mb-4 flex items-center gap-2 border-0 cursor-pointer"
                  >
                    <span>{lang === 'ar' ? 'عرض القنوات' : 'Show Channels'}</span>
                  </button>
                  <span className="text-sm italic">{lang === 'ar' ? 'انضم إلى إحدى القنوات لبدء المحادثة.' : 'Join or create a channel to begin communicating.'}</span>
                </div>
              )}
            </div>

            {/* Modals Drawers */}
            <Suspense fallback={null}>
              <AnimatePresence>
                {/* Profile Settings Modal (Desktop Only Overlay) */}
                {!isMobile && showSettings && currentUser && (
                  <SettingsModal
                    currentUser={currentUser}
                    onUpdateUser={(updated) => setCurrentUser(updated)}
                    onClose={() => setShowSettings(false)}
                    serverUrl={serverUrl}
                    setServerUrl={(url) => {
                      setServerUrl(url);
                      pbService.setServerUrl(url);
                    }}
                    lang={lang}
                    setLang={handleSetLangAndPersist}
                    t={t}
                    userSettings={userSettings}
                    onUpdateUserSettings={handleUpdateUserSettings}
                    onLogout={handleLogout}
                    servers={servers}
                    activeServer={activeServer}
                    channels={channels}
                    onChannelCreated={(newChan) => setChannels((prev) => [...prev, newChan])}
                    onChannelUpdated={(updatedChan) => {
                      setChannels((prev) => prev.map((c) => (c.id === updatedChan.id ? updatedChan : c)));
                      if (activeChannel?.id === updatedChan.id) {
                        setActiveChannel(updatedChan);
                      }
                    }}
                    onDeleteChannel={handleDeleteChannel}
                    onDeleteServer={handleDeleteServer}
                    onOpenServerSettings={(srv) => setServerSettingsModalServer(srv)}
                    onServerUpdated={(updated) => {
                      setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                      if (activeServer?.id === updated.id) {
                        setActiveServer(updated);
                      }
                    }}
                  />
                )}

                {/* Dedicated Server Settings & Roles Modal */}
                {serverSettingsModalServer && currentUser && (
                  <ServerSettingsModal
                    server={serverSettingsModalServer}
                    currentUser={currentUser}
                    channels={channels.filter((c) => c.server === serverSettingsModalServer.id)}
                    onClose={() => setServerSettingsModalServer(null)}
                    onServerUpdated={(updated) => {
                      setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                      if (activeServer?.id === updated.id) {
                        setActiveServer(updated);
                      }
                    }}
                    onChannelCreated={(newChan) => setChannels((prev) => [...prev, newChan])}
                    onChannelUpdated={(updatedChan) => {
                      setChannels((prev) => prev.map((c) => (c.id === updatedChan.id ? updatedChan : c)));
                      if (activeChannel?.id === updatedChan.id) {
                        setActiveChannel(updatedChan);
                      }
                    }}
                    onChannelDeleted={handleDeleteChannel}
                    onServerDeleted={(sId) => {
                      handleDeleteServer(sId);
                      setServerSettingsModalServer(null);
                    }}
                    onLeaveServer={(srv) => {
                      handleLeaveServer(srv);
                      setServerSettingsModalServer(null);
                    }}
                    t={t}
                    lang={lang}
                    theme={effectiveTheme}
                  />
                )}

                {/* Create Server */}
                {showCreateServer && (
                  <CreateServerModal
                    onClose={() => setShowCreateServer(false)}
                    onServerCreated={(newServer) => {
                      setServers((prev) => [...prev, newServer]);
                      setActiveServer(newServer);
                    }}
                    t={t}
                    theme={effectiveTheme}
                  />
                )}

                {/* User Profile Modal */}
                {selectedUserProfile && (
                  <UserProfileModal
                    key={`${selectedUserProfile.id}-${profileAnchorRect?.left || 0}-${profileAnchorRect?.top || 0}`}
                    user={selectedUserProfile.id === currentUser?.id ? (currentUser as User) : selectedUserProfile}
                    currentUser={currentUser || undefined}
                    currentServer={
                      (!isGlobalSelfProfile && !showDiscoveryCenter && activeServer && activeChannel && activeChannel.server === activeServer.id && !isDirectMessageChannel(activeChannel))
                        ? activeServer
                        : undefined
                    }
                    onClose={() => handleSelectUser(null)}
                    lang={lang}
                    t={t}
                    theme={effectiveTheme}
                    animations={userSettings.appearance.animations}
                    onStartDm={handleStartDm}
                    onStartCall={handleStartCallDm}
                    onKickMember={handleKickMember}
                    anchorRect={profileAnchorRect}
                    preferredPlacement={isGlobalSelfProfile ? 'above' : undefined}
                    onUpdateUser={(updated) => setCurrentUser(updated)}
                    isEditable={isGlobalSelfProfile}
                  />
                )}

                {/* New DM Search Modal */}
                {showNewDmModal && currentUser && (
                  <NewDmModal
                    currentUser={currentUser}
                    onClose={() => setShowNewDmModal(false)}
                    onSelectUserToDm={(targetUser) => {
                      handleStartDm(targetUser);
                    }}
                    lang={lang}
                    allDmChannels={allDmChannels}
                  />
                )}

                {/* Leave Server Modal */}
                {leavingServer && currentUser && (
                  <LeaveServerModal
                    isOpen={Boolean(leavingServer)}
                    server={leavingServer}
                    currentUser={currentUser}
                    lang={lang}
                    onClose={() => setLeavingServer(null)}
                    onSuccess={handleLeaveServerSuccess}
                  />
                )}
              </AnimatePresence>
            </Suspense>

            {/* Switch Voice Channel Confirmation Modal */}
            {pendingVoiceSwitchChannel && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 animate-in fade-in duration-200">
                <div className="w-full max-w-md p-6 rounded-2xl border shadow-2xl bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                  <div className="flex items-center gap-3 mb-4 text-amber-500">
                    <Volume2 className="w-6 h-6 animate-pulse" />
                    <h3 className="text-lg font-bold">
                      {lang === 'ar' ? 'تبديل القناة الصوتية؟' : 'Switch Voice Channel?'}
                    </h3>
                  </div>
                  <p className="text-sm text-[var(--theme-text-secondary)] mb-6">
                    {lang === 'ar'
                      ? `أنت متصل حالياً بالقناة "${activeVoiceChannel?.name}". هل تريد قطع الاتصال والانضمام إلى "${pendingVoiceSwitchChannel.name}"؟`
                      : `You are currently connected to "${activeVoiceChannel?.name}". Would you like to disconnect and join "${pendingVoiceSwitchChannel.name}"?`}
                  </p>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setPendingVoiceSwitchChannel(null)}
                      className="px-4 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] hover:opacity-80 transition-opacity font-medium text-sm cursor-pointer border-0"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const targetChan = pendingVoiceSwitchChannel;
                        setPendingVoiceSwitchChannel(null);
                        if (targetChan) {
                          await leaveRoomOrCall();
                          setActiveVoiceChannel(targetChan);
                          setActiveChannel(targetChan);
                          lastVoiceChannelRef.current = targetChan;
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-accent text-white hover:opacity-90 transition-opacity font-bold text-sm cursor-pointer border-0 shadow-md shadow-accent/20"
                    >
                      {lang === 'ar' ? 'تبديل القناة' : 'Switch Channel'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Global Floating Call Window (Incoming Ringing, Outgoing Calling & Active Room Overlay) */}
            <Suspense fallback={null}>
              <FloatingCallWindow
                lang={lang}
                t={t}
                currentChannel={activeChannel}
                onExpand={() => {
                  const voiceRoomId = activeVoiceChannel?.id;
                  if (voiceRoomId) {
                    const targetChan = channels.find((c) => c.id === voiceRoomId) || allDmChannels.find((c) => c.id === voiceRoomId);
                    if (targetChan) {
                      handleSelectChannel(targetChan);
                    }
                  }
                }}
              />

              {/* Persistent Global Music Player */}
              {activeGlobalTrack && (
                <GlobalMusicPlayer
                  track={activeGlobalTrack}
                  onClose={() => setActiveGlobalTrack(null)}
                  lang={lang}
                  isLight={effectiveTheme === 'light'}
                />
              )}
            </Suspense>

            {/* Double Back Exit Toast Notification */}
            <AnimatePresence>
              {exitToast && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900/95 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-2xl border border-slate-700/80 pointer-events-none flex items-center gap-2"
                >
                  <span>{exitToast}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Discreet Version Watermark in Bottom Right */}
      <div
        id="app-version-watermark"
        className="fixed bottom-1.5 right-2.5 z-50 pointer-events-none select-none text-[11px] font-mono text-[var(--theme-text-muted)] opacity-50"
      >
        v{CURRENT_APP_VERSION}
      </div>
    </div>
    </>
  );
}
