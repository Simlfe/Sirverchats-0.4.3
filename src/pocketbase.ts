import PocketBase from 'pocketbase';
import { ResilientAuthStore, cleanupStorageQuota, safeLocalStorageGet, safeLocalStorageSet } from './lib/storageManager';
import { parseReactions, toggleReactionInList } from './components/MessageReactions';
import { User, Server, Channel, Message, MessageCursor, MessagePage, Attachment, Call, ServerMember, Translation, NotificationItem, ServerRole, ServerOptionInvite, ChannelOptions, DownloadedFileRecord, AppUpdateRecord, ServerEmoji } from './types';
import { MessageDeletionService, DeleteMessageOptions } from './services/messageDeletionService';
import { inferMimeType } from './services/attachmentProcessor';
import { offlineCacheService } from './services/offlineCacheService';
import wsService from './services/websocket';
import ENDPOINTS from './config/endpoints';
import APP_URLS from './config/urls';
import { buildMessageCursorFilter, pageItemsChronological } from './lib/messagePagination';

export function mergeUserRecord(existing: User | null | undefined, updated: Partial<User> | null | undefined): User {
  if (!existing && !updated) {
    return {
      id: '',
      username: 'User',
      email: '',
      role: 'user',
      status: 'offline'
    };
  }
  if (!existing) return updated as User;
  if (!updated) return existing;

  const existingLastSeen = existing.last_seen ? new Date(existing.last_seen).getTime() : 0;
  const updatedLastSeen = updated.last_seen ? new Date(updated.last_seen).getTime() : 0;

  // Preserve the newer heartbeat timestamp to prevent race conditions or stale event downgrades
  const effectiveLastSeen = updatedLastSeen >= existingLastSeen
    ? (updated.last_seen || existing.last_seen)
    : existing.last_seen;

  return {
    ...existing,
    ...updated,
    last_seen: effectiveLastSeen
  };
}

export function getEffectiveUserStatus(user: User | null | undefined, isCurrentUser: boolean = false): 'online' | 'offline' | 'away' | 'dnd' {
  if (!user) return 'offline';
  
  const rawStatus = user.status as 'online' | 'offline' | 'away' | 'dnd' | undefined;
  
  // Invisible or explicit offline status means offline
  if (rawStatus === 'offline') {
    return 'offline';
  }

  // Active current user logged into browser
  if (isCurrentUser) {
    return rawStatus || 'online';
  }

  // For other users, if status is not explicitly set to online/away/dnd, they are offline
  if (!rawStatus || (rawStatus !== 'online' && rawStatus !== 'away' && rawStatus !== 'dnd')) {
    return 'offline';
  }
  
  // Real-time connectivity check ONLY using actual heartbeat timestamp (last_seen).
  // CRITICAL: NEVER use user.updated! user.updated changes when messages, notifications, or edits occur.
  const lastHeartbeatMs = user.last_seen ? new Date(user.last_seen).getTime() : 0;

  if (!lastHeartbeatMs || isNaN(lastHeartbeatMs) || lastHeartbeatMs <= 0) {
    return 'offline';
  }

  const now = Date.now();
  // Presence timeout after 60 seconds (60000 ms) without a heartbeat
  if (now - lastHeartbeatMs > 60000) {
    return 'offline';
  }

  return rawStatus;
}

export function extractCooldown(text: string | undefined): { cleanText: string; cooldown: number } {
  if (!text) return { cleanText: '', cooldown: 0 };
  const match = text.match(/\[cooldown:(\d+)\]/);
  if (match) {
    const cooldown = parseInt(match[1], 10);
    const cleanText = text.replace(/\[cooldown:\d+\]/, '').trim();
    return { cleanText, cooldown };
  }
  return { cleanText: text, cooldown: 0 };
}

export function injectCooldown(text: string | undefined, cooldown: number): string {
  const { cleanText } = extractCooldown(text);
  if (cooldown <= 0) return cleanText;
  return cleanText ? `${cleanText} [cooldown:${cooldown}]` : `[cooldown:${cooldown}]`;
}

export function withTimeout<T>(promise: Promise<T>, ms: number = 7000, fallbackVal?: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fallbackVal !== undefined) resolve(fallbackVal);
      else reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Only schema/version mismatches may use a compatibility query. Network,
 * timeout, Cloudflare, and generic server failures must fail fast so callers
 * can keep rendering their local cache instead of starting a waterfall. */
export function isSchemaCompatibilityError(error: any): boolean {
  const status = Number(error?.status || error?.response?.status || 0);
  const details = error?.details || error?.response?.data || error?.data || {};
  const message = [
    error?.message,
    details?.message,
    details?.data?.message,
    error?.response?.url,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/unknown field|no such field|field .* does not exist|missing field/.test(message)) return true;
  if (/missing collection|no such collection|collection .* not found/.test(message)) return true;
  // A list request returning 404 is a missing collection/route, while a
  // record operation can legitimately return 404 and must not trigger a
  // compatibility waterfall. queryCollection includes the collection name in
  // its details so only its list-route failures use this fallback.
  return status === 404 && Boolean(details?.collection || /\/collections\/[^/]+\/records/.test(message));
}

/**
 * A legacy caller asked PocketBase for history while the read backend was
 * unavailable. Keeping this distinct from an empty page prevents callers
 * from treating an outage as a successfully loaded conversation.
 */
export class MessagePageUnavailableError extends Error {
  readonly code = 'message_unavailable';
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('Message history is temporarily unavailable.');
    this.name = 'MessagePageUnavailableError';
    this.cause = cause;
  }
}

export function getFileUrl(collection: string, recordId: string, filename: string, queryParams?: string): string {
  if (!filename) return '';
  if (filename.startsWith('data:') || filename.startsWith('blob:') || filename.startsWith('http')) {
    return filename;
  }
  return APP_URLS.getFileUrl(pbService.getServerUrl(), collection, recordId, filename, queryParams);
}

export function normalizeAttachmentRecords(pubAtts: any[] = [], privAtts: any[] = []): Attachment[] {
  const normalizedPub = pubAtts.map((a) => ({
    ...a,
    collectionName: a.collectionName || a['@collectionName'] || 'attachments',
    type: inferMimeType(a.file, a.type)
  }));
  const normalizedPriv = privAtts.map((a) => ({
    ...a,
    collectionName: a.collectionName || a['@collectionName'] || 'private_attachments',
    isPrivate: true,
    type: inferMimeType(a.file, a.type)
  }));
  const seen = new Set<string>();
  const combined: Attachment[] = [];
  for (const item of [...normalizedPub, ...normalizedPriv]) {
    if (!item) continue;
    const key = item.id || item.file;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }
  return combined;
}

export function getAttachmentUrl(recordIdOrAttach: any, filename?: string, collectionName?: string): string {
  if (typeof recordIdOrAttach === 'object' && recordIdOrAttach !== null) {
    const recordId = recordIdOrAttach.id;
    const fn = recordIdOrAttach.file || filename || '';
    if (recordIdOrAttach.url && (recordIdOrAttach.url.startsWith('blob:') || recordIdOrAttach.url.startsWith('data:'))) {
      return recordIdOrAttach.url;
    }
    const coll =
      recordIdOrAttach.collectionName ||
      recordIdOrAttach['@collectionName'] ||
      (recordIdOrAttach.isPrivate ? 'private_attachments' : null) ||
      collectionName ||
      'attachments';
    if (!recordId || !fn) return '';
    if (fn.startsWith('data:') || fn.startsWith('blob:') || fn.startsWith('http://') || fn.startsWith('https://')) {
      return fn;
    }
    return getFileUrl(coll, recordId, fn);
  }

  const recordId = recordIdOrAttach;
  const fn = filename || '';
  if (!recordId || !fn) return '';
  if (fn.startsWith('data:') || fn.startsWith('blob:') || fn.startsWith('http://') || fn.startsWith('https://')) {
    return fn;
  }
  const coll = collectionName || 'attachments';
  return getFileUrl(coll, recordId, fn);
}

export function getUserAvatarUrl(user: User | null | undefined): string {
  if (!user || !user.avatar || user.avatar === 'REMOVE') return '';
  return getFileUrl('users', user.id, user.avatar);
}

export function getUserBannerUrl(user: User | null | undefined): string {
  if (!user || !user.banner || user.banner === 'REMOVE') return '';
  return getFileUrl('users', user.id, user.banner);
}

// Fast in-memory cache for hot local storage keys (user profile colors, server overrides, etc.)
const fastLocalCache = new Map<string, string | null>();

export function getFastLocalItem(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  if (fastLocalCache.has(key)) {
    return fastLocalCache.get(key)!;
  }
  try {
    const val = localStorage.getItem(key);
    fastLocalCache.set(key, val);
    return val;
  } catch {
    return null;
  }
}

export function setFastLocalItem(key: string, val: string): void {
  fastLocalCache.set(key, val);
  try {
    localStorage.setItem(key, val);
  } catch {}
}

export function removeFastLocalItem(key: string): void {
  fastLocalCache.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key) fastLocalCache.delete(e.key);
    else fastLocalCache.clear();
  });
}

export function getServerIconUrl(server: Server | null | undefined): string {
  if (!server) return '';
  const localIcon = getFastLocalItem(`server_icon_${server.id}`);
  if (localIcon) return localIcon;
  if (!server.icon) return '';
  return getFileUrl('servers', server.id, server.icon);
}

export function getServerBannerUrl(server: Server | null | undefined): string {
  if (!server) return '';
  const localBanner = getFastLocalItem(`server_banner_${server.id}`);
  if (localBanner) return localBanner;
  if (!server.banner) return '';
  return getFileUrl('servers', server.id, server.banner);
}

export function getServerMemberDisplayName(member: ServerMember | null | undefined, user: User | null | undefined, serverId?: string): string {
  const uId = user?.id || member?.user || member?.id;
  const sId = serverId || (serverId === null ? undefined : member?.server);
  const isSelf = typeof localStorage !== 'undefined' && uId && (pbService.getCurrentUser()?.id === uId);

  if (serverId && sId && uId && isSelf) {
    const local = getFastLocalItem(`server_name_${sId}_${uId}`);
    if (local && local.trim()) return local.trim();
  }
  if (serverId && member?.member_name && member.member_name.trim()) return member.member_name.trim();
  if (serverId && member?.nickname && member.nickname.trim()) return member.nickname.trim();
  if (user) return user.display_name || user.username;
  if (member?.member_name && member.member_name.trim()) return member.member_name.trim();
  if (member?.nickname && member.nickname.trim()) return member.nickname.trim();
  return 'User';
}

export function getServerMemberAvatarUrl(member: ServerMember | null | undefined, user: User | null | undefined, serverId?: string): string {
  const uId = user?.id || member?.user || member?.id;
  const sId = serverId || member?.server;
  const isSelf = typeof localStorage !== 'undefined' && uId && (pbService.getCurrentUser()?.id === uId);

  if (sId && uId && isSelf) {
    const local = getFastLocalItem(`server_avatar_${sId}_${uId}`);
    if (local && local !== 'REMOVE') return local;
    if (local === 'REMOVE') {
      if (user?.avatar && user.avatar !== 'REMOVE') {
        if (user.avatar.startsWith('data:') || user.avatar.startsWith('blob:') || user.avatar.startsWith('http')) {
          return user.avatar;
        }
        return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`;
      }
      return '';
    }
  }
  if (member?.server_avatar && member.server_avatar !== 'REMOVE') {
    if (member.server_avatar.startsWith('data:') || member.server_avatar.startsWith('blob:') || member.server_avatar.startsWith('http')) {
      return member.server_avatar;
    }
    return `${pbService.getServerUrl()}/api/files/server_members/${member.id}/${member.server_avatar}`;
  }
  if (user?.avatar && user.avatar !== 'REMOVE') {
    if (user.avatar.startsWith('data:') || user.avatar.startsWith('blob:') || user.avatar.startsWith('http')) {
      return user.avatar;
    }
    return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`;
  }
  return '';
}

export function getServerMemberBannerUrl(member: ServerMember | null | undefined, user: User | null | undefined, serverId?: string): string {
  const uId = user?.id || member?.user || member?.id;
  const sId = serverId || member?.server;
  const isSelf = typeof localStorage !== 'undefined' && uId && (pbService.getCurrentUser()?.id === uId);

  if (sId && uId && isSelf) {
    const local = getFastLocalItem(`server_banner_${sId}_${uId}`);
    if (local && local !== 'REMOVE') return local;
    if (local === 'REMOVE') {
      if (user?.banner && user.banner !== 'REMOVE') {
        if (user.banner.startsWith('data:') || user.banner.startsWith('blob:') || user.banner.startsWith('http')) {
          return user.banner;
        }
        return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.banner}`;
      }
      return '';
    }
  }
  if (member?.server_banner && member.server_banner !== 'REMOVE') {
    if (member.server_banner.startsWith('data:') || member.server_banner.startsWith('blob:') || member.server_banner.startsWith('http')) {
      return member.server_banner;
    }
    return `${pbService.getServerUrl()}/api/files/server_members/${member.id}/${member.server_banner}`;
  }
  if (user?.banner && user.banner !== 'REMOVE') {
    if (user.banner.startsWith('data:') || user.banner.startsWith('blob:') || user.banner.startsWith('http')) {
      return user.banner;
    }
    return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.banner}`;
  }
  return '';
}

export function getServerMemberProfileSettings(member: ServerMember | null | undefined, serverId?: string, userId?: string): { cardColor?: string; cardColor2?: string; avatarFrameColor?: string; bio?: string } {
  let settings: any = {};
  if (member?.server_profile_settings) {
    if (typeof member.server_profile_settings === 'string') {
      try { settings = JSON.parse(member.server_profile_settings); } catch {}
    } else if (typeof member.server_profile_settings === 'object') {
      settings = member.server_profile_settings;
    }
  }

  const sId = serverId || member?.server;
  const uId = userId || member?.user || member?.id;
  const isSelf = typeof localStorage !== 'undefined' && uId && (pbService.getCurrentUser()?.id === uId);

  if (sId && uId && isSelf) {
    try {
      const localStr = getFastLocalItem(`server_profile_settings_${sId}_${uId}`);
      if (localStr) {
        settings = { ...settings, ...JSON.parse(localStr) };
      }
    } catch {}
  }
  return settings || {};
}

export interface EffectiveProfile {
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  cardColor1: string;
  cardColor2: string;
  avatarFrameColor: string;
  serverMemberRecord: ServerMember | null;
  hasCustomServerProfile: boolean;
}

export function getEffectiveProfile(
  user: User | null | undefined,
  serverId?: string | null,
  overrideMember?: ServerMember | null
): EffectiveProfile {
  if (!user) {
    return {
      displayName: 'User',
      avatarUrl: '',
      bannerUrl: '',
      bio: '',
      cardColor1: 'var(--accent-color)',
      cardColor2: 'var(--accent-color)',
      avatarFrameColor: 'var(--accent-color)',
      serverMemberRecord: null,
      hasCustomServerProfile: false,
    };
  }

  let member: ServerMember | null = serverId ? (overrideMember || null) : null;
  if (!member && serverId) {
    member = pbService.getCachedServerMember(serverId, user.id);
  }

  let userSettings: any = user.settings;
  if (typeof userSettings === 'string') {
    try { userSettings = JSON.parse(userSettings); } catch { userSettings = {}; }
  }

  // If user is currently logged in, check local settings cache as well
  const isCurrentAuthUser = typeof localStorage !== 'undefined' && (pbService.getCurrentUser()?.id === user.id);

  const globalColor1 =
    userSettings?.appearance?.cardColor ||
    userSettings?.appearance?.cardColor1 ||
    userSettings?.cardColor ||
    userSettings?.cardColor1 ||
    userSettings?.card_color ||
    userSettings?.color1 ||
    user.settings?.cardColor ||
    user.settings?.cardColor1 ||
    (user as any).cardColor ||
    (user as any).cardColor1 ||
    (user as any).card_color ||
    (user as any).color1 ||
    (user as any).color_1 ||
    (isCurrentAuthUser ? getFastLocalItem('user_card_color1') : null) ||
    'var(--accent-color)';

  const globalColor2 =
    userSettings?.appearance?.cardColor2 ||
    userSettings?.cardColor2 ||
    userSettings?.card_color2 ||
    userSettings?.color2 ||
    user.settings?.cardColor2 ||
    (user as any).cardColor2 ||
    (user as any).card_color2 ||
    (user as any).color2 ||
    (user as any).color_2 ||
    (isCurrentAuthUser ? getFastLocalItem('user_card_color2') : null) ||
    globalColor1;

  const globalFrameColor =
    userSettings?.appearance?.avatarFrameColor ||
    userSettings?.avatarFrameColor ||
    userSettings?.avatar_frame_color ||
    userSettings?.frameColor ||
    user.settings?.avatarFrameColor ||
    (user as any).avatarFrameColor ||
    (user as any).avatar_frame_color ||
    (user as any).frameColor ||
    (isCurrentAuthUser ? getFastLocalItem('user_frame_color') : null) ||
    globalColor1;

  const displayName = getServerMemberDisplayName(member, user, serverId || undefined);
  const avatarUrl = getServerMemberAvatarUrl(member, user, serverId || undefined);
  const bannerUrl = getServerMemberBannerUrl(member, user, serverId || undefined);

  const serverSettings = getServerMemberProfileSettings(member, serverId || undefined, user.id);
  const serverColor1 = serverSettings.cardColor || (serverId && isCurrentAuthUser ? getFastLocalItem(`server_color1_${serverId}_${user.id}`) : null);
  const serverColor2 = serverSettings.cardColor2 || (serverId && isCurrentAuthUser ? getFastLocalItem(`server_color2_${serverId}_${user.id}`) : null);
  const serverFrameColor = serverSettings.avatarFrameColor || (serverId && isCurrentAuthUser ? getFastLocalItem(`server_frame_color_${serverId}_${user.id}`) : null);
  const serverBio = serverSettings.bio || (serverId && isCurrentAuthUser ? getFastLocalItem(`server_bio_${serverId}_${user.id}`) : null);

  const cardColor1 = (serverId && (serverColor1 || serverSettings.cardColor)) ? (serverColor1 || globalColor1) : globalColor1;
  const cardColor2 = (serverId && (serverColor2 || serverSettings.cardColor2)) ? (serverColor2 || globalColor2) : globalColor2;
  const avatarFrameColor = (serverId && (serverFrameColor || serverSettings.avatarFrameColor)) ? (serverFrameColor || globalFrameColor) : globalFrameColor;
  const bio = (serverId && serverBio !== null && serverBio !== undefined) ? serverBio : (user.bio || '');

  const hasCustomServerProfile = Boolean(
    serverId && (
      member?.member_name ||
      (member?.server_avatar && member.server_avatar !== 'REMOVE') ||
      (member?.server_banner && member.server_banner !== 'REMOVE') ||
      serverSettings?.bio ||
      (isCurrentAuthUser && (
        getFastLocalItem(`server_name_${serverId}_${user.id}`) ||
        getFastLocalItem(`server_avatar_${serverId}_${user.id}`) ||
        getFastLocalItem(`server_banner_${serverId}_${user.id}`) ||
        getFastLocalItem(`server_color1_${serverId}_${user.id}`) ||
        getFastLocalItem(`server_color2_${serverId}_${user.id}`) ||
        getFastLocalItem(`server_frame_color_${serverId}_${user.id}`) ||
        getFastLocalItem(`server_bio_${serverId}_${user.id}`)
      ))
    )
  );

  return {
    displayName,
    avatarUrl,
    bannerUrl,
    bio,
    cardColor1,
    cardColor2,
    avatarFrameColor,
    serverMemberRecord: member,
    hasCustomServerProfile,
  };
}

export interface PrimaryRole {
  id: string;
  name: string;
  color?: string;
  emoji?: string;
  priority: number;
}

export function getPrimaryServerRole(
  memberRoleRaw: string | string[] | any,
  serverRoles: ServerRole[],
  isOwner: boolean = false,
  userGlobalRole?: string,
  lang: 'en' | 'ar' = 'en'
): PrimaryRole {
  let roleTokens: string[] = [];
  if (Array.isArray(memberRoleRaw)) {
    roleTokens = memberRoleRaw.map((r: any) => typeof r === 'string' ? r : (r.id || r.name)).filter(Boolean);
  } else if (typeof memberRoleRaw === 'string' && memberRoleRaw.trim()) {
    roleTokens = memberRoleRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  roleTokens = roleTokens.filter((t) => t !== 'owner' && t !== 'Owner' && t !== 'المالك');

  // Check assigned roles for the highest role with a valid custom color
  if (roleTokens.length > 0 && serverRoles.length > 0) {
    for (let i = roleTokens.length - 1; i >= 0; i--) {
      const tok = roleTokens[i];
      const sRole = serverRoles.find((r) => r.id === tok || r.name === tok || r.name.toLowerCase() === tok.toLowerCase());
      const roleColor = sRole?.color || (sRole as any)?.role_settings?.color;
      if (sRole && roleColor && roleColor !== 'inherit' && roleColor !== 'transparent') {
        const sIdx = serverRoles.findIndex((r) => r.id === sRole.id);
        return {
          id: sRole.id,
          name: sRole.name,
          color: roleColor,
          emoji: sRole.emoji || (sRole as any)?.role_settings?.emoji || '🛡️',
          priority: sIdx >= 0 ? sIdx : 0
        };
      }
    }

    // Fallback if roles are assigned but none have a custom color
    for (let i = roleTokens.length - 1; i >= 0; i--) {
      const tok = roleTokens[i];
      const sRole = serverRoles.find((r) => r.id === tok || r.name === tok || r.name.toLowerCase() === tok.toLowerCase());
      if (sRole) {
        const sIdx = serverRoles.findIndex((r) => r.id === sRole.id);
        return {
          id: sRole.id,
          name: sRole.name,
          color: undefined,
          emoji: sRole.emoji || (sRole as any)?.role_settings?.emoji || '🛡️',
          priority: sIdx >= 0 ? sIdx : 0
        };
      }
    }
  }

  if (isOwner) {
    return {
      id: 'owner',
      name: lang === 'ar' ? 'المالك' : 'Owner',
      color: '#f59e0b',
      emoji: '👑',
      priority: -100
    };
  }

  if (roleTokens.length > 0) {
    const lastTok = roleTokens[roleTokens.length - 1];
    return {
      id: lastTok,
      name: lastTok,
      color: '#3b82f6',
      emoji: '🛡️',
      priority: 50
    };
  }

  if (userGlobalRole === 'admin') {
    return {
      id: 'admin',
      name: lang === 'ar' ? 'المسؤولين' : 'Admins',
      color: '#ef4444',
      emoji: '⭐',
      priority: 900
    };
  }

  return {
    id: 'members',
    name: lang === 'ar' ? 'الأعضاء' : 'Members',
    color: undefined,
    emoji: undefined,
    priority: 999
  };
}

class PocketBaseService {
  private pb: PocketBase;
  private authStore: ResilientAuthStore;
  private serverUrl: string = APP_URLS.API_BASE_URL;
  private isDemo: boolean = false;
  private appSettingsAdminSupported: boolean = true;
  private demoListeners: Set<(event: any) => void> = new Set();
  private pinnedCache: Map<string, string[]> = new Map();
  private serverMembersCache: Map<string, Map<string, ServerMember>> = new Map();
  private negativeServerMembersCache: Set<string> = new Set();
  private serverRolesCache: Map<string, ServerRole[]> = new Map();
  private usersCache: User[] | null = null;
  private usersMapCache: Map<string, User> = new Map();
  private pendingUserFetches: Map<string, Promise<User | null>> = new Map();
  private negativeUserFetches: Set<string> = new Set();
  private lastUsersFetch: number = 0;
  private privateChatServerCache: Map<string, any> = new Map();
  private dmMessagesCache: Map<string, Message[]> = new Map();
  private dmLastBackgroundSync: Map<string, number> = new Map();
  private dmSyncInFlight: Set<string> = new Set();
  private serverChannelsCache: Map<string, Channel[]> = new Map();
  private dmChannelsCache: Map<string, Channel[]> = new Map();
  private channelMetaCache: Map<string, { record: any; timestamp: number }> = new Map();
  private serverOwnerCache: Map<string, { owner: string; timestamp: number }> = new Map();
  private memberRoleCache: Map<string, { roles: string[]; timestamp: number }> = new Map();
  private messagePageControllers: Map<string, AbortController> = new Map();
  private messageAttachmentControllers: Map<string, AbortController> = new Map();

  private messagePageRequestKey(kind: 'channel' | 'dm', conversationId: string): string {
    return `message-page:${kind}:${conversationId}`;
  }

  cancelMessagePage(conversationId: string, kind: 'channel' | 'dm'): void {
    if (!conversationId) return;
    const key = this.messagePageRequestKey(kind, conversationId);
    if (kind === 'dm') {
      // A DM UI id (dm-user-* / dm-server-*) can resolve to a different
      // PocketBase chat-server id while the request is in flight. Cancel all
      // DM page work on a conversation switch rather than leaking that race.
      for (const [controllerKey, controller] of this.messagePageControllers) {
        if (controllerKey.startsWith('message-page:dm:')) controller.abort();
      }
      for (const [controllerKey, controller] of this.messageAttachmentControllers) {
        if (controllerKey.startsWith('message-attachments:dm:')) controller.abort();
      }
      return;
    }
    this.messagePageControllers.get(key)?.abort();
    const attachmentKey = `message-attachments:${kind}:${conversationId}`;
    this.messageAttachmentControllers.get(attachmentKey)?.abort();
  }

  getCachedPrivateChatServer(recipientId: string): any {
    if (!recipientId) return null;
    const inMem = this.privateChatServerCache.get(recipientId);
    if (inMem) return inMem;
    const currentId = this.pb.authStore.model?.id;
    if (currentId) {
      try {
        const raw = localStorage.getItem(`cached_pcs_${currentId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const match = parsed.find((s: any) => {
              const users = s.users || [s.user1, s.user2].filter(Boolean);
              return users.includes(recipientId) || s.id === recipientId;
            });
            if (match) {
              this.privateChatServerCache.set(recipientId, match);
              this.privateChatServerCache.set(match.id, match);
              return match;
            }
          }
        }
      } catch (e) {}
    }
    return null;
  }

  setCachedPrivateChatServer(recipientIdOrServerId: string, server: any): void {
    if (!recipientIdOrServerId || !server) return;
    this.privateChatServerCache.set(recipientIdOrServerId, server);
    if (server.id) this.privateChatServerCache.set(server.id, server);
    const users = server.users || [server.user1, server.user2].filter(Boolean);
    users.forEach((u: string) => {
      if (u) this.privateChatServerCache.set(u, server);
    });
  }

  getCachedChannels(serverId: string): Channel[] {
    if (!serverId) return [];
    const inMem = this.serverChannelsCache.get(serverId);
    if (inMem && inMem.length > 0) return inMem;

    try {
      const raw = localStorage.getItem(`cached_channels_${serverId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.serverChannelsCache.set(serverId, parsed);
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  }

  setCachedChannels(serverId: string, channels: Channel[]): void {
    if (!serverId || !Array.isArray(channels)) return;
    this.serverChannelsCache.set(serverId, channels);
    channels.forEach((c) => {
      if (c && c.id) {
        this.channelMetaCache.set(c.id, { record: c, timestamp: Date.now() });
      }
    });
    try {
      localStorage.setItem(`cached_channels_${serverId}`, JSON.stringify(channels));
    } catch (e) {}
  }

  getCachedDmChannels(userId: string): Channel[] {
    if (!userId) return [];
    const inMem = this.dmChannelsCache.get(userId);
    if (inMem && inMem.length > 0) return inMem;

    try {
      const raw = localStorage.getItem(`cached_dm_channels_${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.dmChannelsCache.set(userId, parsed);
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  }

  setCachedDmChannels(userId: string, channels: Channel[]): void {
    if (!userId || !Array.isArray(channels)) return;
    this.dmChannelsCache.set(userId, channels);
    try {
      localStorage.setItem(`cached_dm_channels_${userId}`, JSON.stringify(channels));
    } catch (e) {}
  }

  getCachedServers(userId?: string): Server[] {
    const uId = userId || this.getCurrentUser()?.id;
    if (uId) {
      try {
        const raw = localStorage.getItem(`offline_servers_${uId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  }

  getCachedUsers(): User[] {
    if (this.usersCache && this.usersCache.length > 0) {
      return this.usersCache;
    }
    try {
      const raw = localStorage.getItem('cached_all_users');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.usersCache = parsed;
          this.usersMapCache.clear();
          for (const u of parsed) {
            if (u?.id) this.usersMapCache.set(u.id, u);
          }
          this.lastUsersFetch = Date.now();
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  }

  getCachedServerMembers(serverId: string): ServerMember[] {
    if (!serverId) return [];
    const sMap = this.serverMembersCache.get(serverId);
    if (sMap && sMap.size > 0) {
      return Array.from(sMap.values());
    }
    try {
      const raw = localStorage.getItem(`cached_server_members_${serverId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!this.serverMembersCache.has(serverId)) {
            this.serverMembersCache.set(serverId, new Map());
          }
          const targetMap = this.serverMembersCache.get(serverId)!;
          parsed.forEach((m: ServerMember) => {
            const uId = m.user || (m as any).expand?.user?.id || m.id;
            if (uId) targetMap.set(uId, m);
          });
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  }

  getCachedServerRoles(serverId: string): ServerRole[] {
    if (!serverId) return [];
    if (this.serverRolesCache.has(serverId)) {
      return this.serverRolesCache.get(serverId)!;
    }
    try {
      const stored = localStorage.getItem(`server_roles_${serverId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.serverRolesCache.set(serverId, parsed);
          return parsed;
        }
      }
    } catch (err) {}
    return [];
  }

  getCachedUser(userId: string): User | null {
    if (!userId) return null;
    const fromMap = this.usersMapCache.get(userId);
    if (fromMap) return fromMap;
    if (this.usersCache) {
      const found = this.usersCache.find((u) => u.id === userId);
      if (found) {
        this.usersMapCache.set(userId, found);
        return found;
      }
    }
    return null;
  }

  getCachedServerMember(serverId: string, userId: string): ServerMember | null {
    if (!serverId || !userId) return null;

    const sMap = this.serverMembersCache.get(serverId);
    if (sMap && sMap.has(userId)) {
      return sMap.get(userId)!;
    }

    const negKey = `${serverId}_${userId}`;
    if (this.negativeServerMembersCache.has(negKey)) {
      return null;
    }

    const localIsMember = localStorage.getItem(`is_member_${serverId}_${userId}`);
    const localStatus = localStorage.getItem(`membership_status_${serverId}_${userId}`);
    const localLeftAt = localStorage.getItem(`left_at_${serverId}_${userId}`);

    const name = localStorage.getItem(`server_name_${serverId}_${userId}`);
    const avatar = localStorage.getItem(`server_avatar_${serverId}_${userId}`);
    const banner = localStorage.getItem(`server_banner_${serverId}_${userId}`);
    const role = localStorage.getItem(`member_role_${serverId}_${userId}`);
    const settingsStr = localStorage.getItem(`server_profile_settings_${serverId}_${userId}`);

    if (name || avatar || banner || role || settingsStr || localStatus) {
      let isMember = localIsMember !== 'false' && localStatus !== 'left' && localStatus !== 'banned' && localStatus !== 'kicked';
      const syntheticMember: ServerMember = {
        id: `cached-${serverId}-${userId}`,
        server: serverId,
        user: userId,
        member_name: name || undefined,
        nickname: name || undefined,
        server_avatar: avatar || undefined,
        server_banner: banner || undefined,
        role: role || undefined,
        server_profile_settings: settingsStr || undefined,
        is_member: isMember,
        membership_status: (localStatus as any) || (isMember ? 'active' : 'left'),
        left_at: localLeftAt || null
      };
      if (!this.serverMembersCache.has(serverId)) {
        this.serverMembersCache.set(serverId, new Map());
      }
      this.serverMembersCache.get(serverId)!.set(userId, syntheticMember);
      return syntheticMember;
    }

    this.negativeServerMembersCache.add(negKey);
    return null;
  }

  getFileUrl(record: { id: string; collectionId?: string; collectionName?: string }, filename: string): string {
    if (!filename) return '';
    if (filename.startsWith('http://') || filename.startsWith('https://') || filename.startsWith('blob:') || filename.startsWith('data:')) {
      return filename;
    }
    const collection = record.collectionName || record.collectionId || 'messages';
    return `${this.getServerUrl()}/api/files/${collection}/${record.id}/${filename}`;
  }

  async banMember(serverId: string, userId: string): Promise<boolean> {
    const leftAt = new Date().toISOString();
    localStorage.setItem(`is_member_${serverId}_${userId}`, 'false');
    localStorage.setItem(`membership_status_${serverId}_${userId}`, 'banned');
    localStorage.setItem(`left_at_${serverId}_${userId}`, leftAt);

    if (this.serverMembersCache.has(serverId)) {
      const cached = this.serverMembersCache.get(serverId)?.get(userId);
      if (cached) {
        cached.is_member = false;
        cached.banned = true;
        cached.left_at = leftAt;
        cached.membership_status = 'banned';
      }
    }

    if (this.isDemo) {
      window.dispatchEvent(new CustomEvent('server-member-updated', {
        detail: { serverId, userId, is_member: false, membership_status: 'banned' }
      }));
      return true;
    }

    try {
      const record = await this.pb.collection('server_members').getFirstListItem(
        `server="${serverId}" && user="${userId}"`
      );
      if (record) {
        await this.pb.collection('server_members').update(record.id, {
          is_member: false,
          banned: true,
          left_at: leftAt,
          membership_status: 'banned'
        });
      }
    } catch (e) {
      console.warn('Failed to ban server member:', e);
    }

    window.dispatchEvent(new CustomEvent('server-member-updated', {
      detail: { serverId, userId, is_member: false, membership_status: 'banned' }
    }));
    return true;
  }

  private initPbInstance(pbInstance: PocketBase) {
    pbInstance.autoCancellation(false);
    pbInstance.beforeSend = (url, options) => {
      if (url.includes('/api/files/')) {
        options.headers = {
          ...options.headers,
          'Cache-Control': 'public, max-age=31536000, immutable',
        };
      } else {
        options.headers = {
          ...options.headers,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        };
      }
      return { url, options };
    };

    pbInstance.afterSend = (response, data) => {
      if (response.status === 400 && typeof data?.message === 'string' && data.message.includes("authorization don't match")) {
        console.warn('PocketBase auth mismatch detected. Resetting realtime SSE connection.');
        try {
          pbInstance.realtime.unsubscribe().catch(() => {});
        } catch (e) {}
        try {
          pbInstance.cancelAllRequests();
        } catch (e) {}
        setTimeout(() => {
          this.resubscribeAllRealtime();
        }, 100);
      }
      return data;
    };

    pbInstance.authStore.onChange(() => {
      try {
        pbInstance.cancelAllRequests();
      } catch (e) {}
      try {
        pbInstance.realtime.unsubscribe().catch(() => {});
      } catch (e) {}
      // Automatically re-establish subscriptions with updated credentials
      setTimeout(() => {
        this.resubscribeAllRealtime();
      }, 100);
    });
  }

  public resubscribeAllRealtime() {
    this.messagesSubscribed = false;
    this.attachmentsSubscribed = false;
    this.privateMessagesSubscribed = false;
    this.privateAttachmentsSubscribed = false;
    this.usersSubscribed = false;

    if (this.messageListeners.size > 0) {
      this.setupMessagesSubscription();
    }
    if (this.privateMessageListeners.size > 0) {
      this.setupPrivateMessagesSubscription();
    }
    if (this.userListeners.size > 0) {
      this.setupUsersSubscription();
    }
  }

  constructor() {
    this.authStore = new ResilientAuthStore('pocketbase_auth');
    const savedUrl = safeLocalStorageGet('sirver_pb_url');
    if (savedUrl && savedUrl !== ENDPOINTS.MAIN_DOMAIN) {
      this.serverUrl = savedUrl;
    } else {
      this.serverUrl = ENDPOINTS.API_BASE_URL;
      safeLocalStorageSet('sirver_pb_url', ENDPOINTS.API_BASE_URL);
    }
    this.pb = new PocketBase(this.serverUrl, this.authStore);
    this.initPbInstance(this.pb);
  }

  setServerUrl(url: string) {
    this.serverUrl = url;
    safeLocalStorageSet('sirver_pb_url', url);
    this.pb = new PocketBase(url, this.authStore);
    this.initPbInstance(this.pb);
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  getPbInstance(): PocketBase {
    return this.pb;
  }

  getIsDemo(): boolean {
    return this.isDemo;
  }

  updatePinnedCache(channelId: string, pinnedIds: string[]): void {
    this.pinnedCache.set(channelId, pinnedIds);
    try {
      localStorage.setItem(`pinned_msgs_${channelId}`, JSON.stringify(pinnedIds));
    } catch (e) {}
  }

  isDemoMode(): boolean {
    return false;
  }

  setDemoMode(val: boolean) {
    this.isDemo = false;
  }

  // --- AUTH SERVICES ---

  async login(identity: string, password: string): Promise<User> {
    if (this.isDemo) {
      const mockUser: User = {
        id: 'demo-user-id',
        username: identity.split('@')[0],
        email: identity.includes('@') ? identity : `${identity}@example.com`,
        role: 'admin',
        display_name: identity.charAt(0).toUpperCase() + identity.slice(1),
        status: 'online',
        bio: 'Just another Sirver enthusiast!',
        language: 'en'
      };
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      return mockUser;
    }

    const cleanIdentity = (identity || '').trim();
    const cleanPassword = password || '';
    const isEmail = cleanIdentity.includes('@');

    // Proactively clean up disposable cached assets to guarantee quota for the auth token
    cleanupStorageQuota();

    try {
      const authData = await this.pb.collection('users').authWithPassword(cleanIdentity, cleanPassword);
      return authData.record as any as User;
    } catch (err: any) {
      // If user entered mixed/uppercase username and login failed, attempt lowercased username as fallback
      if (!isEmail && cleanIdentity.toLowerCase() !== cleanIdentity) {
        try {
          cleanupStorageQuota();
          const authData = await this.pb.collection('users').authWithPassword(cleanIdentity.toLowerCase(), cleanPassword);
          return authData.record as any as User;
        } catch (retryErr: any) {
          if (
            retryErr?.name === 'QuotaExceededError' ||
            String(retryErr?.message || retryErr).includes('QuotaExceededError')
          ) {
            cleanupStorageQuota();
            if (this.pb.authStore.model) {
              return this.pb.authStore.model as any as User;
            }
          }
        }
      }

      // Check if QuotaExceededError occurred during token persistence
      if (
        err?.name === 'QuotaExceededError' ||
        String(err?.message || err).includes('QuotaExceededError')
      ) {
        cleanupStorageQuota();
        if (this.pb.authStore.model) {
          return this.pb.authStore.model as any as User;
        }
      }

      console.warn('PocketBase login failed:', err);
      throw err;
    }
  }

  async refreshAuth(): Promise<User | null> {
    if (this.isDemo) {
      return this.getCurrentUser();
    }
    if (!this.pb.authStore.isValid || !this.pb.authStore.token) {
      return null;
    }
    try {
      const authData = await this.pb.collection('users').authRefresh();
      return authData.record as any as User;
    } catch (err: any) {
      console.warn('PocketBase auth refresh failed:', err);
      const isAuthError =
        err?.status === 401 ||
        err?.status === 403 ||
        err?.status === 400 ||
        String(err?.message || '').toLowerCase().includes('authenticate');

      if (isAuthError) {
        this.logout();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth-session-expired'));
        }
      }
      return null;
    }
  }

  async signup(formData: FormData): Promise<User> {
    if (this.isDemo) {
      const username = formData.get('username') as string;
      const email = formData.get('email') as string;
      const displayName = formData.get('display_name') as string;
      const mockUser: User = {
        id: 'demo-user-id-' + Math.random().toString(36).substr(2, 9),
        username,
        email,
        role: 'user',
        display_name: displayName || username,
        status: 'online',
        bio: 'Hello, I just registered!',
        language: 'en'
      };
      localStorage.setItem('demo_user', JSON.stringify(mockUser));
      return mockUser;
    }

    try {
      const userRecord = await this.pb.collection('users').create(formData);
      return userRecord as any as User;
    } catch (err) {
      console.error('PocketBase register failed:', err);
      throw err;
    }
  }

  logout() {
    if (this.isDemo) {
      localStorage.removeItem('demo_user');
      return;
    }
    try {
      this.pb.cancelAllRequests();
    } catch (e) {}
    try {
      this.pb.realtime.unsubscribe().catch(() => {});
    } catch (e) {}
    this.pb.authStore.clear();
  }

  async requestPasswordReset(email: string): Promise<boolean> {
    if (this.isDemo) {
      return true;
    }
    try {
      await this.pb.collection('users').requestPasswordReset(email.trim());
      return true;
    } catch (err) {
      console.warn('PocketBase requestPasswordReset error:', err);
      // Always return true to avoid revealing registered email existence
      return true;
    }
  }

  async confirmPasswordReset(token: string, password: string, passwordConfirm: string): Promise<boolean> {
    if (this.isDemo) {
      if (password !== passwordConfirm) {
        throw new Error('Passwords do not match');
      }
      return true;
    }
    await this.pb.collection('users').confirmPasswordReset(token, password, passwordConfirm);
    return true;
  }

  async updateUser(userId: string, data: any): Promise<User> {
    if (this.isDemo) {
      const current = this.getCurrentUser();
      const updated = { ...current, ...data };
      localStorage.setItem('demo_user', JSON.stringify(updated));
      return updated as User;
    }
    const record = await this.pb.collection('users').update(userId, data);
    return record as any as User;
  }

  async blockUser(targetUserId: string): Promise<User> {
    const currentUser = this.getCurrentUser();
    if (!currentUser) throw new Error('Not logged in');
    if (currentUser.id === targetUserId) return currentUser;

    const currentBlocked = Array.isArray(currentUser.blocked_users) ? currentUser.blocked_users : [];
    if (currentBlocked.includes(targetUserId)) {
      return currentUser;
    }

    const updatedBlocked = [...currentBlocked, targetUserId];
    const updatedUser = await this.updateUser(currentUser.id, {
      blocked_users: updatedBlocked,
    });
    if (this.pb.authStore.model) {
      (this.pb.authStore.model as any).blocked_users = updatedBlocked;
    }
    return updatedUser;
  }

  async unblockUser(targetUserId: string): Promise<User> {
    const currentUser = this.getCurrentUser();
    if (!currentUser) throw new Error('Not logged in');

    const currentBlocked = Array.isArray(currentUser.blocked_users) ? currentUser.blocked_users : [];
    if (!currentBlocked.includes(targetUserId)) {
      return currentUser;
    }

    const updatedBlocked = currentBlocked.filter((id) => id !== targetUserId);
    const updatedUser = await this.updateUser(currentUser.id, {
      blocked_users: updatedBlocked,
    });
    if (this.pb.authStore.model) {
      (this.pb.authStore.model as any).blocked_users = updatedBlocked;
    }
    return updatedUser;
  }

  async createReport(params: {
    reportedUserId: string;
    reason: string;
    details?: string;
    serverId?: string;
    channelId?: string;
    messageId?: string;
    targetType?: 'admin' | 'owner';
  }): Promise<any> {
    const currentUser = this.getCurrentUser();
    if (!currentUser) throw new Error('Not logged in');

    const reportData = {
      reporter: currentUser.id,
      reporter_name: currentUser.display_name || currentUser.username,
      reported_user: params.reportedUserId,
      reason: params.reason,
      details: params.details || '',
      server: params.serverId || '',
      channel: params.channelId || '',
      message: params.messageId || '',
      target_type: params.targetType || 'admin',
      status: 'pending',
      created: new Date().toISOString(),
    };

    try {
      return await this.pb.collection('reports').create(reportData);
    } catch (err) {
      console.warn('Failed to save report to server collection, storing locally:', err);
      const localReports = JSON.parse(localStorage.getItem('reports_fallback') || '[]');
      localReports.push({ id: `report_${Date.now()}`, ...reportData });
      localStorage.setItem('reports_fallback', JSON.stringify(localReports));
      return reportData;
    }
  }

  getCurrentUser(): User | null {
    if (this.isDemo) {
      const saved = localStorage.getItem('demo_user');
      return saved ? JSON.parse(saved) : null;
    }
    if (this.pb.authStore.isValid && this.pb.authStore.model) {
      return this.pb.authStore.model as any as User;
    }
    return null;
  }

  // --- FETCH CHANNELS & SERVERS ---

  async fetchServers(): Promise<Server[]> {
    if (this.isDemo) {
      return [
        { id: 'demo-server-1', name: 'General Lounge', description: 'Hangout and chat with friends!' },
        { id: 'demo-server-2', name: 'Developers Area', description: 'Tech discussions, bots, and programming.' },
        { id: 'demo-server-3', name: 'Voice & Gaming', description: 'Active match streams and multiplayer queues.' }
      ];
    }

    const currentUserId = this.pb.authStore.model?.id;
    if (!currentUserId) return [];

    const isDmServer = (s: any) =>
      s.name === 'Direct Messages' ||
      s.name === 'الرسائل الخاصة' ||
      s.description === 'Private Direct Messages' ||
      s.type === 'dm';

    try {
      // 1. FAST-PATH: Query users collection with expanded in_servers relation
      try {
        const userRec = await this.pb.collection('users').getOne(currentUserId, {
          expand: 'in_servers',
        });
        if (userRec && userRec.expand && Array.isArray(userRec.expand.in_servers) && userRec.expand.in_servers.length > 0) {
          const directInServers = (userRec.expand.in_servers as Server[]).filter((s) => !isDmServer(s));
          if (directInServers.length > 0) {
            directInServers.forEach((s) => {
              const { cleanText, cooldown } = extractCooldown(s.description);
              s.description = cleanText;
              s.cooldown = cooldown || this.getLocalServerCooldown(s.id);
            });
            return directInServers;
          }
        }
      } catch (fastErr) {
        if (!isSchemaCompatibilityError(fastErr)) throw fastErr;
        // Continue to the normalized membership query only for older schemas.
      }

      let records: any[] = [];
      try {
        records = await this.pb.collection('server_members').getFullList({
          filter: `user = "${currentUserId}"`,
          expand: 'server',
        });
      } catch (innerErr) {
        if (!isSchemaCompatibilityError(innerErr)) throw innerErr;
        console.warn('Normalized server membership is unavailable; using the legacy relation once:', innerErr);
        // Fallback: fetch directly from 'servers' collection
        const directServers = await this.pb.collection('servers').getFullList({
          sort: '-created'
        });
        const list = directServers as any as Server[];
        list.forEach((s) => {
          const { cleanText, cooldown } = extractCooldown(s.description);
          s.description = cleanText;
          s.cooldown = cooldown || this.getLocalServerCooldown(s.id);
        });
        return list;
      }

      const servers = records
        .filter((r) => r.expand && r.expand.server && r.is_member !== false && r.membership_status !== 'left' && r.membership_status !== 'banned')
        .map((r) => r.expand!.server as any as Server)
        .filter((s) => !isDmServer(s));
      
      // If user has no servers joined on this real instance, join a default one or create one
      if (servers.length === 0) {
        // Fetch all public servers
        try {
          const publicServers = await this.pb.collection('servers').getList(1, 10);
          const validPublicServers = publicServers.items.filter((s) => !isDmServer(s));
          if (validPublicServers.length > 0) {
            // Join first public server
            const firstServer = validPublicServers[0];
            try {
              await this.joinServer(firstServer.id);
            } catch (joinErr) {
              console.warn('Could not auto-join first public server:', joinErr);
            }
            const list = [firstServer as any as Server];
            list.forEach((s) => {
              const { cleanText, cooldown } = extractCooldown(s.description);
              s.description = cleanText;
              s.cooldown = cooldown || this.getLocalServerCooldown(s.id);
            });
            return list;
          }
        } catch (e) {
          if (!isSchemaCompatibilityError(e)) throw e;
          console.warn('Could not fetch public servers:', e);
        }
      }
      servers.forEach((s) => {
        const { cleanText, cooldown } = extractCooldown(s.description);
        s.description = cleanText;
        s.cooldown = cooldown || this.getLocalServerCooldown(s.id);
      });
      return servers.filter((s) => !isDmServer(s));
    } catch (err) {
      if (!isSchemaCompatibilityError(err)) throw err;
      console.warn('Failed to fetch normalized servers; trying the legacy collection once:', err);
      try {
        const fallbackServers = await this.pb.collection('servers').getFullList();
        const list = (fallbackServers as any as Server[]).filter((s) =>
          s.name !== 'Direct Messages' && s.name !== 'الرسائل الخاصة' && s.description !== 'Private Direct Messages' && (s as any).type !== 'dm'
        );
        list.forEach((s) => {
          const { cleanText, cooldown } = extractCooldown(s.description);
          s.description = cleanText;
          s.cooldown = cooldown || this.getLocalServerCooldown(s.id);
        });
        return list;
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }
  }

  async getServerById(id: string): Promise<Server> {
    if (this.isDemo) {
      return { id, name: 'Demo Server', description: '' };
    }
    const record = await this.pb.collection('servers').getOne(id);
    const server = record as any as Server;
    const { cleanText, cooldown } = extractCooldown(server.description);
    server.description = cleanText;
    server.cooldown = cooldown || this.getLocalServerCooldown(server.id);
    return server;
  }

  async getChannelById(id: string): Promise<Channel> {
    if (this.isDemo) {
      return { id, name: 'demo-channel', server: 'demo', type: 'text' };
    }
    const record = await this.pb.collection('channels').getOne(id);
    return record as any as Channel;
  }

  async joinServer(serverId: string): Promise<ServerMember> {
    if (this.isDemo) {
      return { id: 'mock-member-id', server: serverId, user: 'demo-user-id', is_member: true, membership_status: 'active' };
    }
    const currentUserId = this.pb.authStore.model?.id;
    if (!currentUserId) throw new Error('Not authenticated');

    localStorage.setItem(`is_member_${serverId}_${currentUserId}`, 'true');
    localStorage.setItem(`membership_status_${serverId}_${currentUserId}`, 'active');
    localStorage.removeItem(`left_at_${serverId}_${currentUserId}`);

    // Check if member record already exists (user left/kicked previously)
    try {
      const existing = await this.pb.collection('server_members').getFullList({
        filter: `server = "${serverId}" && user = "${currentUserId}"`
      });

      if (existing.length > 0) {
        const rec = existing[0];
        if (rec.membership_status === 'banned' || rec.banned) {
          throw new Error('You are banned from this server.');
        }

        const updated = await this.pb.collection('server_members').update(rec.id, {
          is_member: true,
          membership_status: 'active',
          left_at: null
        });

        if (this.serverMembersCache.has(serverId)) {
          const cached = this.serverMembersCache.get(serverId)?.get(currentUserId);
          if (cached) {
            cached.is_member = true;
            cached.membership_status = 'active';
            cached.left_at = null;
          }
        }

        window.dispatchEvent(new CustomEvent('server-member-updated', {
          detail: { serverId, userId: currentUserId, is_member: true, membership_status: 'active' }
        }));

        this.markInviteJoined(serverId, currentUserId).catch(() => {});

        return updated as any as ServerMember;
      }
    } catch (err: any) {
      if (err?.message?.includes('banned')) throw err;
      console.warn('Check existing member record failed, creating new record:', err);
    }

    // Resolve server's automatic/default role
    let defaultRoleId = localStorage.getItem(`default_role_${serverId}`);
    if (!defaultRoleId) {
      try {
        const rolesList = await this.pb.collection('server_roles').getFullList({
          filter: `server = "${serverId}" && is_default = true`
        }).catch(() => []);
        if (rolesList && rolesList.length > 0) {
          defaultRoleId = rolesList[0].id;
          localStorage.setItem(`default_role_${serverId}`, defaultRoleId);
        }
      } catch (err) {
        console.warn('Failed to query default server role:', err);
      }
    }

    const data: any = {
      user: currentUserId,
      server: serverId,
      joined_at: new Date().toISOString(),
      is_member: true,
      membership_status: 'active',
      left_at: null
    };
    if (defaultRoleId) {
      data.role = defaultRoleId;
      data.role_id = defaultRoleId;
    }
    const record = await this.pb.collection('server_members').create(data);
    
    if (currentUserId && defaultRoleId) {
      try {
        localStorage.setItem(`member_role_${serverId}_${currentUserId}`, defaultRoleId);
      } catch (e) {}
    }

    // Auto-mark invite as joined if waiting for this user
    if (currentUserId) {
      this.markInviteJoined(serverId, currentUserId).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('server-member-updated', {
      detail: { serverId, userId: currentUserId, is_member: true, membership_status: 'active' }
    }));

    // Sync in_servers on user record
    if (currentUserId) {
      try {
        const user = await this.pb.collection('users').getOne(currentUserId);
        const existingInServers: string[] = Array.isArray(user.in_servers) ? user.in_servers : [];
        if (!existingInServers.includes(serverId)) {
          this.pb.collection('users').update(currentUserId, {
            in_servers: [...existingInServers, serverId]
          }).catch(() => {});
        }
      } catch (e) {}
    }

    return record as any as ServerMember;
  }

  async leaveServer(serverId: string, userId: string): Promise<boolean> {
    const leftAt = new Date().toISOString();
    localStorage.setItem(`is_member_${serverId}_${userId}`, 'false');
    localStorage.setItem(`membership_status_${serverId}_${userId}`, 'left');
    localStorage.setItem(`left_at_${serverId}_${userId}`, leftAt);

    if (this.serverMembersCache.has(serverId)) {
      const cached = this.serverMembersCache.get(serverId)?.get(userId);
      if (cached) {
        cached.is_member = false;
        cached.left_at = leftAt;
        cached.membership_status = 'left';
      }
    }

    if (this.isDemo) {
      window.dispatchEvent(new CustomEvent('server-member-updated', {
        detail: { serverId, userId, is_member: false, membership_status: 'left' }
      }));
      return true;
    }

    try {
      const records = await this.pb.collection('server_members').getFullList({
        filter: `server = "${serverId}" && user = "${userId}"`
      });
      if (records.length > 0) {
        await this.pb.collection('server_members').update(records[0].id, {
          is_member: false,
          left_at: leftAt,
          membership_status: 'left'
        });
      } else {
        await this.pb.collection('server_members').create({
          server: serverId,
          user: userId,
          is_member: false,
          left_at: leftAt,
          membership_status: 'left'
        });
      }
    } catch (err) {
      console.warn('PocketBase leaveServer update failed, local fallback applied:', err);
    }

    // Remove serverId from user's in_servers
    if (userId) {
      try {
        const user = await this.pb.collection('users').getOne(userId);
        const existingInServers: string[] = Array.isArray(user.in_servers) ? user.in_servers : [];
        if (existingInServers.includes(serverId)) {
          this.pb.collection('users').update(userId, {
            in_servers: existingInServers.filter((id) => id !== serverId)
          }).catch(() => {});
        }
      } catch (e) {}
    }

    window.dispatchEvent(new CustomEvent('server-member-updated', {
      detail: { serverId, userId, is_member: false, membership_status: 'left' }
    }));
    return true;
  }

  async getServerMembers(serverId: string): Promise<{ id: string; user: User; is_member: boolean; role?: string }[]> {
    if (!serverId) return [];
    if (this.isDemo) {
      const all = await this.fetchAllUsers();
      return all.map((u) => ({
        id: `mem-${u.id}`,
        user: u,
        is_member: true
      }));
    }

    try {
      const records = await this.pb.collection('server_members').getFullList({
        filter: `server = "${serverId}"`,
        expand: 'user'
      });

      const allUsers = await this.fetchAllUsers();
      const allUsersMap = new Map(allUsers.map((u) => [u.id, u]));
      const result: { id: string; user: User; is_member: boolean; role?: string }[] = [];

      for (const rec of records) {
        if (rec.is_member === false || rec.membership_status === 'left') continue;
        const userId = rec.user || rec.expand?.user?.id;
        let u: User | undefined = rec.expand?.user;
        if (!u && userId) {
          u = allUsersMap.get(userId);
        }
        if (u) {
          result.push({
            id: rec.id,
            user: mergeUserRecord(u, {}),
            is_member: rec.is_member !== false,
            role: rec.role
          });
        }
      }

      return result;
    } catch (err) {
      console.warn('Failed to fetch server_members in pbService.getServerMembers:', err);
      const all = await this.fetchAllUsers();
      return all.map((u) => ({
        id: `mem-${u.id}`,
        user: u,
        is_member: true
      }));
    }
  }

  async transferServerOwnership(serverId: string, newOwnerId: string): Promise<Server> {
    if (!serverId || !newOwnerId) {
      throw new Error('Server ID and new owner ID are required for ownership transfer');
    }

    if (this.isDemo) {
      const updated: Server = { id: serverId, name: 'Demo Server', owner: newOwnerId };
      window.dispatchEvent(new CustomEvent('server-updated', {
        detail: { serverId, owner: newOwnerId, server: updated }
      }));
      return updated;
    }

    const currentUserId = this.pb.authStore.model?.id;
    if (!currentUserId) {
      throw new Error('Not authenticated');
    }

    // Backend verification: Only current owner can transfer ownership
    const serverRecord = await this.pb.collection('servers').getOne(serverId);
    if (!serverRecord || serverRecord.owner !== currentUserId) {
      throw new Error('Unauthorized: Only the current server owner can transfer ownership.');
    }

    try {
      localStorage.setItem(`server_owner_${serverId}`, newOwnerId);
      localStorage.removeItem(`member_role_${serverId}_${currentUserId}`);
      const updated = await this.updateServer(serverId, { owner: newOwnerId });

      // Broadcast real-time ownership update events
      window.dispatchEvent(new CustomEvent('server-updated', {
        detail: { serverId, owner: newOwnerId, newOwnerId, server: updated }
      }));
      window.dispatchEvent(new CustomEvent('server-member-updated', {
        detail: { serverId, userId: newOwnerId, is_member: true, role: 'owner' }
      }));

      return updated;
    } catch (err) {
      console.error('Failed to transfer server ownership in pbService:', err);
      throw err;
    }
  }

  async createServer(name: string, description: string, iconFile?: File): Promise<Server> {
    if (this.isDemo) {
      return { id: 'demo-server-' + Math.random().toString(36).substr(2, 9), name, description };
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('owner', this.pb.authStore.model?.id || '');
    if (iconFile) {
      formData.append('icon', iconFile);
    }

    const serverRecord = await this.pb.collection('servers').create(formData);
    
    // Auto join creator as member
    await this.joinServer(serverRecord.id);

    // Create default text & voice channel
    await this.createChannel(serverRecord.id, 'general', 'text', 'Welcome channel!');
    await this.createChannel(serverRecord.id, 'Lobby Voice', 'voice');

    return serverRecord as any as Server;
  }

  async fetchChannels(serverId: string): Promise<Channel[]> {
    if (this.isDemo) {
      if (serverId === 'demo-server-1') {
        return [
          { id: 'demo-chan-1', name: 'general', server: serverId, type: 'text', topic: 'Hang out and stay friendly!' },
          { id: 'demo-chan-2', name: 'announcements', server: serverId, type: 'text', topic: 'Official server announcements.' },
          { id: 'demo-chan-3', name: 'Music & Vibes 🎵', server: serverId, type: 'voice' },
          { id: 'demo-chan-4', name: 'Gaming Lounge 🎮', server: serverId, type: 'voice' }
        ];
      } else if (serverId === 'demo-server-2') {
        return [
          { id: 'demo-chan-5', name: 'general-dev', server: serverId, type: 'text', topic: 'Coding talk and debugging.' },
          { id: 'demo-chan-6', name: 'showcase-projects', server: serverId, type: 'text', topic: 'Share screenshots of your work.' },
          { id: 'demo-chan-7', name: 'Standup Room', server: serverId, type: 'voice' }
        ];
      } else {
        return [
          { id: 'demo-chan-8', name: 'game-clips', server: serverId, type: 'text', topic: 'Show off your highlight clips.' },
          { id: 'demo-chan-9', name: 'Squad Chat 1', server: serverId, type: 'voice' },
          { id: 'demo-chan-10', name: 'Squad Chat 2', server: serverId, type: 'voice' }
        ];
      }
    }

    try {
      try {
        const list = await this.pb.collection('channels').getFullList({
          filter: `server = "${serverId}"`,
          sort: 'position,created',
          requestKey: null
        });
        const channels = list as any as Channel[];
        channels.forEach((c) => {
          const { cleanText, cooldown } = extractCooldown(c.topic);
          c.topic = cleanText;
          c.cooldown = cooldown || this.getLocalChannelCooldown(c.id);
          this.channelMetaCache.set(c.id, { record: c, timestamp: Date.now() });
        });
        this.setCachedChannels(serverId, channels);
        return channels;
      } catch (e) {
        if (!isSchemaCompatibilityError(e)) throw e;
        console.warn("Retrying fetchChannels without position sort key:", e);
        const list = await this.pb.collection('channels').getFullList({
          filter: `server = "${serverId}"`,
          sort: 'created',
          requestKey: null
        });
        const channels = list as any as Channel[];
        channels.forEach((c) => {
          const { cleanText, cooldown } = extractCooldown(c.topic);
          c.topic = cleanText;
          c.cooldown = cooldown || this.getLocalChannelCooldown(c.id);
          this.channelMetaCache.set(c.id, { record: c, timestamp: Date.now() });
        });
        this.setCachedChannels(serverId, channels);
        return channels;
      }
    } catch (err) {
      if (!isSchemaCompatibilityError(err)) throw err;
      console.warn('Failed to fetch channels:', err);
      return this.getCachedChannels(serverId);
    }
  }

  async createChannel(serverId: string, name: string, type: 'text' | 'voice' | 'stream', topic: string = ''): Promise<Channel> {
    if (this.isDemo) {
      return { id: 'demo-chan-' + Math.random().toString(36).substr(2, 9), name, server: serverId, type, topic };
    }
    const data = {
      name: name.toLowerCase().replace(/\s+/g, '-'),
      server: serverId,
      type,
      topic,
      position: '0'
    };
    const record = await this.pb.collection('channels').create(data);
    return record as any as Channel;
  }

  // --- FETCH & SEND MESSAGES ---

  /**
   * Cursor based history loader shared by public channels and DMs.
   * PocketBase's total-count query is deliberately skipped: the extra row is
   * enough to tell the client whether another request can return data.
   */
  async fetchMessagePage(
    conversationId: string,
    kind: 'channel' | 'dm',
    limit: number = 30,
    before?: MessageCursor,
  ): Promise<MessagePage> {
    if (this.isDemo) {
      const demo = await this.fetchMessages(conversationId, 1, limit);
      return {
        items: demo.items,
        nextCursor: null,
        hasMore: false,
      };
    }

    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const field = kind === 'dm' ? 'chat_server' : 'channel';
    const filter = buildMessageCursorFilter(field, conversationId, before);
    const requestKey = this.messagePageRequestKey(kind, conversationId);
    this.messagePageControllers.get(requestKey)?.abort();
    const controller = new AbortController();
    this.messagePageControllers.set(requestKey, controller);

    try {
      const records = await this.pb.collection(kind === 'dm' ? 'private_messages' : 'messages').getList(1, safeLimit + 1, {
        filter,
        sort: '-created,-id',
        expand: kind === 'dm' ? 'sender,reply_to' : 'sender,reply_to,attachments_via_message',
        skipTotal: true,
        requestKey: null,
        signal: controller.signal,
      });

      const fetchedItems = records.items as any as Message[];
      const remoteHasMore = fetchedItems.length > safeLimit;
      const raw = fetchedItems.filter((message) => {
        if (message.deleted || Boolean(message.deleted_at) || MessageDeletionService.isMessageDeleted(message.id)) return false;
        return true;
      });
      const result = pageItemsChronological(raw, safeLimit);
      return {
        items: result.items,
        nextCursor: result.nextCursor,
        // Deleted/tombstoned records may consume the +1 probe row. Keep the
        // remote-history flag based on the server response, never on the
        // post-filter item count, so hidden rows cannot terminate scrolling.
        hasMore: remoteHasMore || result.hasMore,
      };
    } catch (error) {
      console.warn(`Failed to fetch ${kind} message page:`, error);
      // A failed page is not an empty page. Callers must keep cached messages
      // and pagination state intact and surface the unavailable state.
      throw error;
    } finally {
      if (this.messagePageControllers.get(requestKey) === controller) {
        this.messagePageControllers.delete(requestKey);
      }
    }
  }

  async fetchMessages(channelId: string, page: number = 1, perPage: number = 35, beforeCreated?: string, beforeId?: string): Promise<{ items: Message[]; totalPages: number; totalItems: number }> {
    if (this.isDemo) {
      // Return beautiful high-quality demo message list
      const mockSender1: User = { id: 'demo-sender-1', username: 'alex_dev', email: 'alex@example.com', display_name: 'Alex Developer', role: 'admin', status: 'online' };
      const mockSender2: User = { id: 'demo-sender-2', username: 'sarah_m', email: 'sarah@example.com', display_name: 'Sarah Musician', role: 'user', status: 'away' };

      const items = [
        {
          id: 'msg-demo-1',
          content: 'Hello everyone! Welcome to the Sirver PocketBase workspace 🚀',
          sender: mockSender1.id,
          channel: channelId,
          created: new Date(Date.now() - 3600000 * 2).toISOString(),
          expand: { sender: mockSender1 }
        },
        {
          id: 'msg-demo-2',
          content: 'We have full cross-platform capabilities, voice streaming, and responsive file uploads!',
          sender: mockSender1.id,
          channel: channelId,
          created: new Date(Date.now() - 3600000).toISOString(),
          expand: { sender: mockSender1 }
        },
        {
          id: 'msg-demo-3',
          content: 'This sounds incredibly cool! Checking out the Arabic translation options in the top corner too, it swaps dynamically!',
          sender: mockSender2.id,
          channel: channelId,
          created: new Date(Date.now() - 1800000).toISOString(),
          expand: { sender: mockSender2 }
        }
      ];

      return {
        items: page === 1 ? items : [],
        totalPages: 1,
        totalItems: items.length
      };
    }

    try {
      const result = await this.fetchMessagePage(
        channelId,
        'channel',
        perPage,
        beforeCreated ? { created: beforeCreated, id: beforeId || '\uffff' } : undefined,
      );
      
      return {
        items: result.items,
        totalPages: result.hasMore ? 2 : 1,
        totalItems: result.items.length + (result.hasMore ? 1 : 0)
      };
    } catch (err) {
      // Do not turn an infrastructure failure into a successful empty page.
      // The shared v2 read client owns cache-first/offline rendering; legacy
      // callers receive a typed error and must preserve their current state.
      console.warn('Network error fetching messages:', err);
      throw new MessagePageUnavailableError(err);
    }
  }

  async getMessageById(messageId: string): Promise<Message> {
    if (this.isDemo) {
      let reactions: any = [];
      try {
        reactions = JSON.parse(localStorage.getItem(`demo_reactions_${messageId}`) || '[]');
      } catch {}
      return {
        id: messageId,
        content: 'Demo message',
        sender: 'demo-sender-1',
        channel: 'demo-channel',
        created: new Date().toISOString(),
        reactions
      };
    }

    try {
      const record = await this.pb.collection('messages').getOne(messageId, {
        expand: 'sender,reply_to,reply_to.sender,attachments_via_message'
      });
      return record as any as Message;
    } catch (err: any) {
      // A message can belong to the private collection, but only a confirmed
      // public-record miss/schema mismatch may trigger that compatibility
      // lookup. Network and upstream failures must fail immediately.
      if (Number(err?.status) !== 404 && !isSchemaCompatibilityError(err)) throw err;
      try {
        const pmRecord = await this.pb.collection('private_messages').getOne(messageId, {
          expand: 'sender,user,private_attachments_via_message,attachments_via_message'
        });
          const pubAtts = (pmRecord.expand as any)?.['attachments_via_message'] || (pmRecord.expand as any)?.['attachments(message)'] || [];
          const privAtts = (pmRecord.expand as any)?.['private_attachments_via_message'] || (pmRecord.expand as any)?.['private_attachments(message)'] || [];
          const combined = [...pubAtts, ...privAtts];
          if (combined.length > 0) {
            if (!pmRecord.expand) (pmRecord as any).expand = {};
            (pmRecord.expand as any)['attachments_via_message'] = combined;
            (pmRecord.expand as any)['private_attachments_via_message'] = combined;
            (pmRecord.expand as any)['attachments(message)'] = combined;
            (pmRecord.expand as any)['private_attachments(message)'] = combined;
          }
        return pmRecord as any as Message;
      } catch (pmErr) {
        console.warn('Failed to fetch message by id:', messageId, pmErr);
        throw pmErr;
      }
    }
  }

  async touchMessage(messageId: string): Promise<void> {
    if (this.isDemo) return;
    try {
      await this.pb.collection('messages').update(messageId, {
        has_attachment: true
      });
    } catch (err) {
      if (Number((err as any)?.status) !== 404 && !isSchemaCompatibilityError(err)) throw err;
      try {
        await this.pb.collection('private_messages').update(messageId, {
          has_attachment: true
        });
      } catch (e) {
        console.warn('Failed to touch message:', e);
      }
    }
  }

  async sendMessage(channelId: string, content: string, replyToId?: string, hasAttachment: boolean = false): Promise<Message> {
    if (this.isDemo) {
      const curUser = this.getCurrentUser()!;
      const msg: Message = {
        id: 'msg-demo-' + Math.random().toString(36).substr(2, 9),
        content,
        sender: curUser.id,
        channel: channelId,
        reply_to: replyToId,
        has_attachment: hasAttachment,
        created: new Date().toISOString(),
        expand: { sender: curUser }
      };
      
      // Notify listeners for simulated reactive updates
      setTimeout(() => {
        this.triggerDemoListeners({
          action: 'create',
          record: msg
        });
      }, 100);

      return msg;
    }

    const data: any = {
      content: content.trim() === '' ? '  ' : content,
      sender: this.pb.authStore.model?.id,
      channel: channelId,
      has_attachment: hasAttachment
    };
    if (replyToId) {
      data.reply_to = replyToId;
    }

    const record = await this.pb.collection('messages').create(data, {
      expand: 'sender,reply_to'
    });
    const msg = record as any as Message;

    // Broadcast message created event over WebSocket / BroadcastChannel for instant multi-client delivery
    try {
      wsService.send({
        type: 'message_delivery',
        action: 'create',
        record: msg,
        channelId: channelId,
        userId: this.pb.authStore.model?.id
      });
    } catch (wsErr) {}

    return msg;
  }

  // --- FILE & ATTACHMENT UPLOADS ---

  async uploadAttachment(messageId: string, file: File): Promise<Attachment> {
    return this.uploadAttachmentWithProgress(messageId, file);
  }

  async uploadAttachmentWithProgress(
    messageId: string,
    file: File,
    onProgress?: (pct: number) => void,
    abortSignal?: AbortSignal,
    isPrivate: boolean = false
  ): Promise<Attachment> {
    if (this.isDemo) {
      return new Promise((resolve, reject) => {
        let p = 0;
        const interval = setInterval(() => {
          if (abortSignal?.aborted) {
            clearInterval(interval);
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          p += 25;
          if (onProgress) onProgress(Math.min(p, 100));
          if (p >= 100) {
            clearInterval(interval);
            resolve({
              id: 'attachment-demo-' + Math.random().toString(36).substr(2, 9),
              file: URL.createObjectURL(file),
              uploader: this.getCurrentUser()?.id,
              message: messageId,
              type: file.type,
              size: `${Math.round(file.size / 1024)} KB`,
              created: new Date().toISOString()
            });
          }
        }, 120);

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            clearInterval(interval);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }
      });
    }

    const primaryCollection = isPrivate ? 'private_attachments' : 'attachments';
    const secondaryCollection = isPrivate ? 'attachments' : 'private_attachments';

    const tryUploadToCollection = (collectionName: string): Promise<Attachment> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = `${this.getServerUrl()}/api/collections/${collectionName}/records`;

        xhr.open('POST', url, true);

        const token = this.pb.authStore.token;
        if (token) {
          xhr.setRequestHeader('Authorization', token);
        }

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            xhr.abort();
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (onProgress) onProgress(100);
              resolve({ ...res, collectionName } as Attachment);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

        const formData = new FormData();
        formData.append('file', file);
        formData.append('uploader', this.pb.authStore.model?.id || '');
        if (messageId) formData.append('message', messageId);
        formData.append('type', file.type);
        formData.append('size', `${file.size}`);

        xhr.send(formData);
      });
    };

    try {
      return await tryUploadToCollection(primaryCollection);
    } catch (e) {
      console.warn(`Upload to ${primaryCollection} failed, trying ${secondaryCollection}:`, e);
      return await tryUploadToCollection(secondaryCollection);
    }
  }

  async linkAttachmentToMessage(attachmentId: string, messageId: string, isPrivate: boolean = false): Promise<void> {
    if (this.isDemo) return;
    const primaryCollection = isPrivate ? 'private_attachments' : 'attachments';
    const fallbackCollection = isPrivate ? 'attachments' : 'private_attachments';
    try {
      await this.pb.collection(primaryCollection).update(attachmentId, { message: messageId });
    } catch (e) {
      try {
        await this.pb.collection(fallbackCollection).update(attachmentId, { message: messageId });
      } catch (e2) {
        console.warn('Could not update attachment message field:', e2);
      }
    }
  }

  async deleteAttachmentRecord(attachmentId: string, isPrivate: boolean = false, force: boolean = false): Promise<void> {
    if (this.isDemo || !attachmentId) return;
    const primaryCollection = isPrivate ? 'private_attachments' : 'attachments';
    const fallbackCollection = isPrivate ? 'attachments' : 'private_attachments';

    const tryDelete = async (collName: string): Promise<boolean> => {
      try {
        const record = await this.pb.collection(collName).getOne(attachmentId).catch(() => null);
        if (record) {
          // Safety Check: Never delete an attachment that is linked to a sent message unless explicitly forced
          if (!force && record.message && record.message !== '') {
            return true;
          }
          await this.pb.collection(collName).delete(attachmentId);
          return true;
        }
      } catch (err) {
        // Record may not exist or already deleted
      }
      return false;
    };

    const deleted = await tryDelete(primaryCollection);
    if (!deleted) {
      await tryDelete(fallbackCollection);
    }
  }

  async deleteUnlinkedAttachments(attachmentIds: string[], isPrivate: boolean = false): Promise<void> {
    if (!attachmentIds || attachmentIds.length === 0) return;
    await Promise.all(attachmentIds.map((id) => this.deleteAttachmentRecord(id, isPrivate)));
  }

  // --- CALLS & VOICE CHANNELS ---

  async fetchActiveCalls(channelId: string): Promise<Call[]> {
    if (this.isDemo) {
      return [];
    }
    try {
      const records = await this.pb.collection('calls').getList(1, 20, {
        filter: `channel = "${channelId}"`,
        sort: '-updated',
        skipTotal: true,
        requestKey: `active-calls:${channelId}`,
      });
      return (records.items || []) as any as Call[];
    } catch (err) {
      console.warn('Could not fetch active calls:', err);
      return [];
    }
  }

  async startOrJoinCall(channelId: string): Promise<Call> {
    if (this.isDemo) {
      return {
        id: 'demo-call-' + Math.random().toString(36).substr(2, 9),
        channel: channelId,
        started_by: this.getCurrentUser()?.id || 'demo-user-id'
      };
    }

    // Try finding existing call for channel
    const active = await this.fetchActiveCalls(channelId);
    if (active.length > 0) {
      return active[0];
    }

    const data = {
      channel: channelId,
      started_by: this.pb.authStore.model?.id || '',
      call: `webrtc-room-${channelId}`
    };
    const record = await this.pb.collection('calls').create(data);
    return record as any as Call;
  }

  // --- REALTIME SUBSCRIPTIONS ---
  private messageListeners = new Set<{ channelId: string; callback: (event: any) => void }>();
  private messagesSubscribed = false;
  private attachmentsSubscribed = false;

  private setupMessagesSubscription() {
    if (this.messagesSubscribed || this.isDemo) return;
    this.messagesSubscribed = true;

    try {
      this.pb.collection('messages').subscribe('*', (e) => {
        // Deletes already contain all data needed by the UI. Creates/updates
        // are delivered once, after the single expanded lookup below.
        if (e.action === 'delete') {
          this.messageListeners.forEach(({ channelId, callback }) => {
            if (channelId === '*' || e.record?.channel === channelId) {
              try { callback(e); } catch (cbErr) { console.warn('[REALTIME] Error in message callback:', cbErr); }
            }
          });
        } else if (e.record?.id) {
          this.pb.collection('messages').getOne(e.record.id, {
            expand: 'sender,reply_to,attachments_via_message',
            requestKey: null
          }).then((fullRecord) => {
            this.messageListeners.forEach(({ channelId, callback }) => {
              if (channelId === '*' || fullRecord.channel === channelId) {
                try {
                  callback({
                    action: e.action,
                    record: fullRecord
                  });
                } catch (cbErr) {}
              }
            });
          }).catch(() => {});

          // The expanded lookup above is sufficient. A second delayed
          // getOne for every create event doubled API traffic and caused a
          // steady request burst in busy channels.
        }
      }).catch((err) => {
        this.messagesSubscribed = false;
        console.warn('[REALTIME] Messages subscribe error, retrying in 2s:', err);
        setTimeout(() => {
          if (this.messageListeners.size > 0 && !this.messagesSubscribed) {
            this.setupMessagesSubscription();
          }
        }, 2000);
      });
    } catch (err) {
      this.messagesSubscribed = false;
      console.warn('[REALTIME] Could not subscribe to messages collection, retrying in 2s:', err);
      setTimeout(() => {
        if (this.messageListeners.size > 0 && !this.messagesSubscribed) {
          this.setupMessagesSubscription();
        }
      }, 2000);
    }

    // Attachments subscription
    if (!this.attachmentsSubscribed) {
      this.attachmentsSubscribed = true;
      try {
        this.pb.collection('attachments').subscribe('*', async (e) => {
          const messageId = e.record?.message;
          if (messageId) {
            try {
              const fullRecord = await this.pb.collection('messages').getOne(messageId, {
                expand: 'sender,reply_to,attachments_via_message',
                requestKey: null
              });
              this.messageListeners.forEach(({ channelId, callback }) => {
                if (channelId === '*' || fullRecord.channel === channelId) {
                  try {
                    callback({
                      action: 'update',
                      record: fullRecord
                    });
                  } catch (cbErr) {}
                }
              });
            } catch (err) {}
          }
        }).catch((err) => {
          this.attachmentsSubscribed = false;
        });
      } catch (err) {
        this.attachmentsSubscribed = false;
      }
    }
  }

  subscribeToMessages(channelId: string, callback: (event: any) => void): () => void {
    if (this.isDemo) {
      const listener = (event: any) => {
        if (event.record && event.record.channel === channelId) {
          callback(event);
        }
      };
      this.demoListeners.add(listener);
      return () => {
        this.demoListeners.delete(listener);
      };
    }

    const listenerObj = { channelId, callback };
    this.messageListeners.add(listenerObj);
    this.setupMessagesSubscription();

    return () => {
      this.messageListeners.delete(listenerObj);
      if (this.messageListeners.size === 0) {
        this.messagesSubscribed = false;
        try {
          this.pb.collection('messages').unsubscribe('*').catch(() => {});
        } catch (e) {}
      }
    };
  }

  public triggerDemoListeners(event: any) {
    this.demoListeners.forEach((listener) => listener(event));
  }

  // --- TRANSLATION & LOCALIZATION SERVICES ---

  async fetchTranslations(): Promise<Translation[]> {
    if (this.isDemo) {
      return [
        { key: 'username', en: 'Username', ar: 'اسم المستخدم' },
        { key: 'password', en: 'Password', ar: 'كلمة المرور' },
        { key: 'login', en: 'Log In', ar: 'تسجيل الدخول' },
        { key: 'signup', en: 'Create Account', ar: 'إنشاء حساب' },
        { key: 'logout', en: 'Sign Out', ar: 'تسجيل الخروج' },
        { key: 'display_name', en: 'Display Name', ar: 'الاسم المستعار' },
        { key: 'status', en: 'Status', ar: 'الحالة' },
        { key: 'bio', en: 'About Me', ar: 'نبذة عني' },
        { key: 'settings', en: 'Settings', ar: 'الإعدادات' },
        { key: 'channels', en: 'Channels', ar: 'القنوات' },
        { key: 'text_channels', en: 'Text Channels', ar: 'القنوات النصية' },
        { key: 'voice_channels', en: 'Voice Channels', ar: 'القنوات الصوتية' },
        { key: 'general_server', en: 'Servers', ar: 'السيرفرات' },
        { key: 'reply', en: 'Reply', ar: 'رد' },
        { key: 'send', en: 'Send', ar: 'إرسال' },
        { key: 'mute', en: 'Mute', ar: 'كتم' },
        { key: 'unmute', en: 'Unmute', ar: 'إلغاء الكتم' },
        { key: 'deafen', en: 'Deafen', ar: 'تعطيل الصوت' },
        { key: 'undeafen', en: 'Undeafen', ar: 'تمكين الصوت' },
        { key: 'voice_connected', en: 'Voice Connected', ar: 'تم الاتصال بالصوت' },
        { key: 'leave_call', en: 'Disconnect', ar: 'قطع الاتصال' },
        { key: 'attachment', en: 'Attachment', ar: 'مرفق' },
        { key: 'server_url', en: 'PocketBase Server URL', ar: 'رابط سيرفر PocketBase' },
        { key: 'create_server', en: 'Create New Server', ar: 'إنشاء سيرفر جديد' },
        { key: 'create_channel', en: 'Create New Channel', ar: 'إنشاء قناة جديدة' },
        { key: 'joined', en: 'Joined', ar: 'انضم' },
        { key: 'role', en: 'Role', ar: 'الرتبة' },
        { key: 'language', en: 'Language', ar: 'اللغة' }
      ];
    }

    try {
      const records = await this.pb.collection('translations').getFullList({
        perPage: 500
      });
      return records as any as Translation[];
    } catch (err) {
      console.warn('Failed to fetch translations from PB, using fallback dictionary.', err);
      return [];
    }
  }

  // --- USER PROFILE SETTINGS SYNC ---

  async getUserById(userId: string): Promise<User | null> {
    if (this.isDemo) {
      const cur = this.getCurrentUser();
      if (cur && cur.id === userId) return cur;
      return null;
    }
    try {
      const record = await this.pb.collection('users').getOne(userId);
      return record as any as User;
    } catch (err) {
      console.warn('Failed to fetch user by id:', userId, err);
      return null;
    }
  }

  async updateProfile(userId: string, data: Partial<User>, avatarFile?: File, bannerFile?: File): Promise<User> {
    if (this.isDemo) {
      const current = this.getCurrentUser()!;
      const updated = { ...current, ...data };
      if (data.avatar === 'REMOVE' || data.avatar === null) {
        updated.avatar = '';
      } else if (avatarFile) {
        updated.avatar = URL.createObjectURL(avatarFile);
      }
      if (data.banner === 'REMOVE' || data.banner === null) {
        updated.banner = '';
      } else if (bannerFile) {
        updated.banner = URL.createObjectURL(bannerFile);
      }
      localStorage.setItem('demo_user', JSON.stringify(updated));
      return updated;
    }

    const formData = new FormData();
    Object.keys(data).forEach((key) => {
      const val = (data as any)[key];
      if (key === 'avatar' && (val === 'REMOVE' || val === null)) {
        formData.append('avatar', '');
      } else if (key === 'banner' && (val === 'REMOVE' || val === null)) {
        formData.append('banner', '');
      } else if (key === 'friends' && Array.isArray(val)) {
        val.forEach((fId) => formData.append('friends', fId));
      } else if (typeof val === 'object' && val !== null) {
        formData.append(key, JSON.stringify(val));
      } else {
        formData.append(key, val);
      }
    });
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }
    if (bannerFile) {
      formData.append('banner', bannerFile);
    }

    const record = await this.pb.collection('users').update(userId, formData);
    if (this.pb.authStore.model && this.pb.authStore.model.id === userId) {
      this.pb.authStore.save(this.pb.authStore.token, record);
    }
    return record as any as User;
  }

  getLocalServerCooldown(serverId: string): number {
    const val = localStorage.getItem(`server_cooldown_${serverId}`);
    return val ? parseInt(val, 10) : 0;
  }

  getLocalChannelCooldown(channelId: string): number {
    const val = localStorage.getItem(`channel_cooldown_${channelId}`);
    return val ? parseInt(val, 10) : 0;
  }

  async updateServer(serverId: string, data: Partial<Server>): Promise<Server> {
    if (this.isDemo) {
      return { id: serverId, name: 'Demo Server', ...data };
    }
    try {
      const existing = await this.pb.collection('servers').getOne(serverId);
      let desc = data.description !== undefined ? data.description : existing.description || '';
      
      let finalCooldown = data.cooldown;
      if (finalCooldown !== undefined) {
        localStorage.setItem(`server_cooldown_${serverId}`, finalCooldown.toString());
        desc = injectCooldown(desc, finalCooldown);
      } else {
        const { cooldown: parsedCool } = extractCooldown(desc);
        finalCooldown = parsedCool || this.getLocalServerCooldown(serverId);
      }
      
      const toSend: any = { ...data };
      toSend.description = desc;
      delete toSend.cooldown;

      const record = await this.pb.collection('servers').update(serverId, toSend);
      const server = record as any as Server;
      const { cleanText, cooldown } = extractCooldown(server.description);
      server.description = cleanText;
      server.cooldown = cooldown || finalCooldown;
      return server;
    } catch (err) {
      console.warn('PocketBase servers update failed, utilizing fallback:', err);
      if (data.cooldown !== undefined) {
        localStorage.setItem(`server_cooldown_${serverId}`, data.cooldown.toString());
      }
      try {
        const record = await this.pb.collection('servers').getOne(serverId);
        const server = record as any as Server;
        const { cleanText, cooldown } = extractCooldown(server.description);
        server.description = cleanText;
        server.cooldown = cooldown || this.getLocalServerCooldown(serverId);
        return server;
      } catch (inner) {
        return { id: serverId, ...data } as any as Server;
      }
    }
  }

  async updateChannel(channelId: string, data: Partial<Channel>): Promise<Channel> {
    if (this.isDemo) {
      return { id: channelId, name: 'Demo Channel', server: 'demo-server-1', type: 'text', ...data };
    }
    try {
      const existing = await this.pb.collection('channels').getOne(channelId);
      let top = data.topic !== undefined ? data.topic : existing.topic || '';
      
      let finalCooldown = data.cooldown;
      if (finalCooldown !== undefined) {
        localStorage.setItem(`channel_cooldown_${channelId}`, finalCooldown.toString());
        top = injectCooldown(top, finalCooldown);
      } else {
        const { cooldown: parsedCool } = extractCooldown(top);
        finalCooldown = parsedCool || this.getLocalChannelCooldown(channelId);
      }
      
      const toSend: any = { ...data };
      toSend.topic = top;
      delete toSend.cooldown;

      if (toSend.channel_options) {
        const jsonStr = typeof toSend.channel_options === 'string'
          ? toSend.channel_options
          : JSON.stringify(toSend.channel_options);
        toSend.channel_options = jsonStr;
        try {
          localStorage.setItem(`channel_options_${channelId}`, jsonStr);
        } catch (e) {}
      }

      let record;
      try {
        record = await this.pb.collection('channels').update(channelId, toSend);
      } catch (err) {
        if (toSend.channel_options !== undefined) {
          delete toSend.channel_options;
          record = await this.pb.collection('channels').update(channelId, toSend);
        } else {
          throw err;
        }
      }
      const channel = record as any as Channel;
      const { cleanText, cooldown } = extractCooldown(channel.topic);
      channel.topic = cleanText;
      channel.cooldown = cooldown || finalCooldown;
      return channel;
    } catch (err) {
      console.warn('PocketBase channels update failed, utilizing fallback:', err);
      if (data.cooldown !== undefined) {
        localStorage.setItem(`channel_cooldown_${channelId}`, data.cooldown.toString());
      }
      try {
        const record = await this.pb.collection('channels').getOne(channelId);
        const channel = record as any as Channel;
        const { cleanText, cooldown } = extractCooldown(channel.topic);
        channel.topic = cleanText;
        channel.cooldown = cooldown || this.getLocalChannelCooldown(channelId);
        return channel;
      } catch (inner) {
        return { id: channelId, name: 'Channel', server: '', type: 'text', ...data } as any as Channel;
      }
    }
  }

  async editMessage(messageId: string, content: string): Promise<Message> {
    const now = new Date().toISOString();
    if (this.isDemo) {
      const msg: any = { id: messageId, content, updated: now, edited_at: now, edited: true };
      this.triggerDemoListeners({
        action: 'update',
        record: msg
      });
      return msg;
    }
    let record: any;
    try {
      record = await this.pb.collection('messages').update(messageId, { content, edited: true, edited_at: now }, {
        expand: 'sender,reply_to,attachments_via_message'
      });
    } catch {
      record = await this.pb.collection('messages').update(messageId, { content }, {
        expand: 'sender,reply_to,attachments_via_message'
      });
    }
    const msg = record as any as Message;
    msg.updated = now;
    msg.edited_at = now;
    msg.edited = true;
    return msg;
  }

  async deleteMessage(messageId: string, options?: DeleteMessageOptions): Promise<boolean> {
    return MessageDeletionService.deleteMessage(messageId, options);
  }

  async toggleMessageReaction(messageId: string, emoji: string, isDm: boolean = false): Promise<{ emoji: string; users: string[] }[]> {
    const currentUserId = this.getCurrentUser()?.id;
    if (!currentUserId) throw new Error("Authentication required to add reaction");

    const collectionName = isDm ? 'private_messages' : 'messages';
    const expandQuery = isDm
      ? 'sender,reply_to,attachments_via_message,private_attachments_via_message'
      : 'sender,reply_to,attachments_via_message';

    if (this.isDemo) {
      const demoKey = `demo_reactions_${messageId}`;
      let currentRaw: any = [];
      try {
        currentRaw = JSON.parse(localStorage.getItem(demoKey) || '[]');
      } catch {}
      const updatedList = toggleReactionInList(currentRaw, emoji, currentUserId);
      localStorage.setItem(demoKey, JSON.stringify(updatedList));
      this.triggerDemoListeners({
        action: 'update',
        record: { id: messageId, reactions: updatedList }
      });
      return updatedList;
    }

    try {
      let record: any;
      try {
        record = await this.pb.collection(collectionName).getOne(messageId, { requestKey: null });
      } catch (e1) {
        if (!isDm) {
          try {
            record = await this.pb.collection('private_messages').getOne(messageId, { requestKey: null });
            return this.toggleMessageReaction(messageId, emoji, true);
          } catch {}
        } else {
          try {
            record = await this.pb.collection('messages').getOne(messageId, { requestKey: null });
            return this.toggleMessageReaction(messageId, emoji, false);
          } catch {}
        }
        throw e1;
      }

      const rawReactions = (record as any).reactions ?? (record as any).expand?.reactions ?? (record as any).reactions_list ?? (record as any).message_reactions;
      const updatedList = toggleReactionInList(rawReactions, emoji, currentUserId);

      try {
        await this.pb.collection(collectionName).update(messageId, {
          reactions: updatedList
        }, {
          expand: expandQuery,
          requestKey: null
        });
      } catch (err2) {
        await this.pb.collection(collectionName).update(messageId, {
          reactions: JSON.stringify(updatedList)
        }, {
          expand: expandQuery,
          requestKey: null
        });
      }

      return updatedList;
    } catch (err) {
      console.warn('Failed to toggle reaction on message:', err);
      throw err;
    }
  }

  async deleteChannel(channelId: string): Promise<boolean> {
    if (this.isDemo) {
      return true;
    }
    // Try direct deletion first (fast path)
    try {
      await this.pb.collection('channels').delete(channelId);
      return true;
    } catch (e1) {
      console.warn('Direct channel deletion failed, running background cleanup:', e1);
    }

    // Fallback parallel cleanup if direct delete failed due to FK references
    try {
      const msgs = await this.pb.collection('messages').getFullList({ filter: `channel = "${channelId}"` }).catch(() => []);
      if (msgs.length > 0) {
        await Promise.all(msgs.map((msg) => this.pb.collection('messages').delete(msg.id).catch(() => {})));
      }
    } catch (e) {
      console.warn('Error deleting channel messages:', e);
    }

    try {
      await this.pb.collection('channels').delete(channelId);
      return true;
    } catch (err) {
      console.warn('Final channel delete call resulted in error (may already be deleted):', err);
      return true;
    }
  }

  async deleteServer(serverId: string): Promise<boolean> {
    if (this.isDemo) {
      return true;
    }
    // Try direct deletion first (fast path)
    try {
      await this.pb.collection('servers').delete(serverId);
      return true;
    } catch (e1) {
      console.warn('Direct server deletion failed, running background cascading cleanup:', e1);
    }

    // Fallback parallel cleanup if direct delete failed due to FK constraints
    try {
      const channels = await this.pb.collection('channels').getFullList({ filter: `server = "${serverId}"` }).catch(() => []);
      await Promise.all(channels.map((ch) => this.deleteChannel(ch.id).catch(() => {})));

      const members = await this.pb.collection('server_members').getFullList({ filter: `server = "${serverId}"` }).catch(() => []);
      await Promise.all(members.map((m) => this.pb.collection('server_members').delete(m.id).catch(() => {})));

      const roles = await this.pb.collection('roles').getFullList({ filter: `server = "${serverId}"` }).catch(() => []);
      await Promise.all(roles.map((r) => this.pb.collection('roles').delete(r.id).catch(() => {})));

      const options = await this.pb.collection('server_options').getFullList({ filter: `server = "${serverId}"` }).catch(() => []);
      await Promise.all(options.map((o) => this.pb.collection('server_options').delete(o.id).catch(() => {})));
    } catch (e) {
      console.warn('Error during server cascading cleanup:', e);
    }

    try {
      await this.pb.collection('servers').delete(serverId);
      return true;
    } catch (err) {
      console.warn('Final server delete call resulted in error (may already be deleted):', err);
      return true;
    }
  }

  async searchUsers(query: string): Promise<User[]> {
    if (this.isDemo) {
      return [
        { id: 'demo-u1', username: 'john_doe', email: 'john@gmail.com', display_name: 'John Doe', role: 'user', status: 'online' },
        { id: 'demo-u2', username: 'mari_smith', email: 'mari@gmail.com', display_name: 'Mari Smith', role: 'user', status: 'away' }
      ];
    }
    try {
      const records = await this.pb.collection('users').getList(1, 25, {
        filter: `username ~ "${query}" || display_name ~ "${query}"`,
      });
      return records.items as any as User[];
    } catch (e) {
      console.warn('Failed to search PocketBase users:', e);
      return [];
    }
  }

  async fetchAllUsers(forceRefresh = false): Promise<User[]> {
    if (this.isDemo) return [];
    if (!this.usersCache || this.usersCache.length === 0) {
      this.getCachedUsers();
    }
    if (!forceRefresh && this.usersCache && this.usersCache.length > 0 && (Date.now() - this.lastUsersFetch < 180000)) {
      return this.usersCache;
    }
    try {
      const records = await this.pb.collection('users').getFullList({
        sort: '-created',
        requestKey: null
      });
      this.usersCache = records as any as User[];
      this.usersMapCache.clear();
      for (const u of this.usersCache) {
        if (u?.id) this.usersMapCache.set(u.id, u);
      }
      this.lastUsersFetch = Date.now();
      return this.usersCache;
    } catch (e) {
      // A failed full-list request is usually an infrastructure problem. Do
      // not immediately repeat it with another broad users query; preserve
      // the warm cache and let the caller retry explicitly. Only a confirmed
      // schema mismatch is eligible for the smaller compatibility page.
      if (!isSchemaCompatibilityError(e)) {
        if (this.usersCache) return this.usersCache;
        console.warn('Failed to fetch users:', e);
        return [];
      }
      try {
        const pageRecords = await this.pb.collection('users').getList(1, 200, { requestKey: null });
        this.usersCache = pageRecords.items as any as User[];
        this.usersMapCache.clear();
        for (const u of this.usersCache) {
          if (u?.id) this.usersMapCache.set(u.id, u);
        }
        this.lastUsersFetch = Date.now();
        return this.usersCache;
      } catch (innerErr) {
        if (this.usersCache) return this.usersCache;
        console.warn('Failed to fetch users:', e);
        return [];
      }
    }
  }

  async fetchUserById(userId: string): Promise<User | null> {
    if (!userId || this.isDemo) return null;
    const cached = this.getCachedUser(userId);
    if (cached) return cached;
    if (this.negativeUserFetches.has(userId)) return null;
    if (this.pendingUserFetches.has(userId)) {
      return this.pendingUserFetches.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        const record = await this.pb.collection('users').getOne(userId);
        const user = record as any as User;
        if (user?.id) {
          this.usersMapCache.set(user.id, user);
          if (this.usersCache) {
            const idx = this.usersCache.findIndex((u) => u.id === userId);
            if (idx >= 0) this.usersCache[idx] = user;
            else this.usersCache.push(user);
          }
        }
        return user;
      } catch (e) {
        this.negativeUserFetches.add(userId);
        setTimeout(() => this.negativeUserFetches.delete(userId), 60000);
        return null;
      } finally {
        this.pendingUserFetches.delete(userId);
      }
    })();

    this.pendingUserFetches.set(userId, fetchPromise);
    return fetchPromise;
  }

  async fetchAllServers(): Promise<Server[]> {
    if (this.isDemo) return [];
    try {
      const records = await this.pb.collection('servers').getFullList();
      return records as any as Server[];
    } catch (e) {
      console.warn('Failed to fetch all servers:', e);
      return [];
    }
  }

  async fetchAppUpdates(channel: string = 'stable', platform: string = 'windows'): Promise<AppUpdateRecord[]> {
    if (this.isDemo) return [];
    try {
      const records = await this.pb.collection('app_updates').getFullList({
        filter: `published = true && platform = "${platform}" && channel = "${channel}"`,
        sort: '-created'
      });
      return records as any as AppUpdateRecord[];
    } catch (e) {
      console.warn('Failed to fetch app updates from PocketBase:', e);
      return [];
    }
  }

  async kickMember(serverId: string, userId: string): Promise<boolean> {
    const leftAt = new Date().toISOString();
    localStorage.setItem(`is_member_${serverId}_${userId}`, 'false');
    localStorage.setItem(`membership_status_${serverId}_${userId}`, 'kicked');
    localStorage.setItem(`left_at_${serverId}_${userId}`, leftAt);

    if (this.serverMembersCache.has(serverId)) {
      const cached = this.serverMembersCache.get(serverId)!.get(userId);
      if (cached) {
        cached.is_member = false;
        cached.left_at = leftAt;
        cached.membership_status = 'kicked';
      }
    }

    if (this.isDemo) {
      window.dispatchEvent(new CustomEvent('server-member-updated', {
        detail: { serverId, userId, is_member: false, membership_status: 'kicked' }
      }));
      return true;
    }

    try {
      const record = await this.pb.collection('server_members').getFirstListItem(
        `server="${serverId}" && user="${userId}"`
      );
      if (record) {
        await this.pb.collection('server_members').update(record.id, {
          is_member: false,
          left_at: leftAt,
          membership_status: 'kicked'
        });
      }
    } catch (e) {
      console.warn('Failed to update kicked server member:', e);
    }

    window.dispatchEvent(new CustomEvent('server-member-updated', {
      detail: { serverId, userId, is_member: false, membership_status: 'kicked' }
    }));
    return true;
  }

  getPinnedMessageIds(channelId: string): string[] {
    if (this.pinnedCache.has(channelId)) {
      return this.pinnedCache.get(channelId)!;
    }
    try {
      const stored = localStorage.getItem(`pinned_msgs_${channelId}`);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  async fetchPinnedMessageIds(channelId: string): Promise<string[]> {
    if (this.isDemo) {
      return this.getPinnedMessageIds(channelId);
    }
    // DMs do not support pinned messages
    if (!channelId || channelId.startsWith('dm-') || channelId.startsWith('chat-') || channelId.startsWith('private-')) {
      return [];
    }
    try {
      const record = await this.pb.collection('channels').getOne(channelId);
      let rawPins = (record as any).Pinned_messages || (record as any).pinned_messages || [];
      if (!Array.isArray(rawPins)) rawPins = [];
      const ids: string[] = rawPins.map((item: any) => typeof item === 'string' ? item : item?.id).filter(Boolean);
      this.pinnedCache.set(channelId, ids);
      try {
        localStorage.setItem(`pinned_msgs_${channelId}`, JSON.stringify(ids));
      } catch (e) {}
      return ids;
    } catch (e) {
      console.warn('Failed to fetch Pinned_messages from channel record:', e);
      return this.getPinnedMessageIds(channelId);
    }
  }

  async togglePinMessage(channelId: string, messageId: string, isDm: boolean = false): Promise<boolean> {
    if (isDm || !channelId || channelId.startsWith('dm-') || channelId.startsWith('chat-') || channelId.startsWith('private-')) {
      console.warn('Pinned messages are not allowed in DMs.');
      return false;
    }

    if (this.isDemo) {
      const pinned = this.getPinnedMessageIds(channelId);
      const isPinned = pinned.includes(messageId);
      const updated = isPinned ? pinned.filter((id) => id !== messageId) : [...pinned, messageId];
      this.pinnedCache.set(channelId, updated);
      try {
        localStorage.setItem(`pinned_msgs_${channelId}`, JSON.stringify(updated));
      } catch (e) {}
      return !isPinned;
    }

    try {
      const channelRec = await this.pb.collection('channels').getOne(channelId);
      let rawPins = (channelRec as any).Pinned_messages || (channelRec as any).pinned_messages || [];
      if (!Array.isArray(rawPins)) rawPins = [];
      const existing: string[] = rawPins.map((item: any) => typeof item === 'string' ? item : item?.id).filter(Boolean);

      const isPinned = existing.includes(messageId);
      const updatedPins = isPinned ? existing.filter((id) => id !== messageId) : [...existing, messageId];

      try {
        await this.pb.collection('channels').update(channelId, {
          Pinned_messages: updatedPins
        });
      } catch (e1) {
        try {
          await this.pb.collection('channels').update(channelId, {
            pinned_messages: updatedPins
          });
        } catch (e2) {
          console.warn('Failed updating Pinned_messages on channels collection:', e2);
        }
      }

      this.pinnedCache.set(channelId, updatedPins);
      try {
        localStorage.setItem(`pinned_msgs_${channelId}`, JSON.stringify(updatedPins));
      } catch (e) {}

      return !isPinned;
    } catch (e) {
      console.warn('Failed to toggle pin message in channel record:', e);
      return false;
    }
  }

  // --- DEDICATED DIRECT MESSAGES & PRIVATE CHAT MEMBERS ---

  async notifyServerUsersDeleted(serverId: string, serverName: string, senderId?: string, lang: string = 'en'): Promise<void> {
    if (this.isDemo) return;
    try {
      const members = await this.pb.collection('server_members').getFullList({
        filter: `server = "${serverId}"`
      }).catch(() => []);

      const targetUserIds = new Set<string>();
      for (const m of members) {
        if (m.user) targetUserIds.add(m.user);
      }

      // Also notify all users if members filter is empty
      if (targetUserIds.size === 0) {
        const allUsers = await this.fetchAllUsers();
        for (const u of allUsers) {
          targetUserIds.add(u.id);
        }
      }

      const notifMessage = lang === 'ar'
        ? `تم حذف السيرفر "${serverName}" بواسطة مسؤول ولن يكون متاحاً بعد الآن.`
        : `Server "${serverName}" has been deleted by an admin and won't be accessible anymore.`;

      const notifItem: NotificationItem = {
        id: `notif-del-${serverId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: 'system',
        server_id: serverId,
        sender_id: senderId || 'admin',
        sender_name: 'Admin / System',
        message: notifMessage,
        created: new Date().toISOString(),
        read: false
      };

      for (const userId of targetUserIds) {
        await this.addNotificationToUser(userId, notifItem).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to notify users of server deletion:', e);
    }
  }

  async getUserPrivateChatServers(): Promise<any[]> {
    if (this.isDemo) return [];
    const currentId = this.pb.authStore.model?.id;
    if (!currentId) return [];

    // 0. Check fast in-memory / local storage cache first
    try {
      const raw = localStorage.getItem(`cached_pcs_${currentId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((s: any) => {
            const users = s.users || [s.user1, s.user2].filter(Boolean);
            const otherId = users.find((u: string) => u !== currentId) || users[0];
            if (otherId) this.privateChatServerCache.set(otherId, s);
            this.privateChatServerCache.set(s.id, s);
          });
        }
      }
    } catch (e) {}

    // 1. Prefer the normalized membership relation. The old multiselect
    // `users ~ ...` scan becomes increasingly expensive as DM servers grow.
    try {
      const memberships = await this.pb.collection('private_chat_members').getFullList({
        filter: `user = "${currentId}"`,
        requestKey: null,
      });
      const ids = Array.from(new Set(memberships.map((membership: any) => membership.chat_server).filter(Boolean)));
      // A successful membership query is authoritative even when it returns
      // no rows. Do not fall through to an unindexed multiselect scan: that
      // extra request was a common source of slow/duplicate DM loading.
      if (ids.length === 0) return [];
      const filter = ids.map((id) => `id = "${id}"`).join(' || ');
      const normalized = await this.pb.collection('private_chat_servers').getFullList({ filter, requestKey: null });
      normalized.forEach((s: any) => {
        const users = s.users || [s.user1, s.user2].filter(Boolean);
        const otherId = users.find((u: string) => u !== currentId) || users[0];
        if (otherId) this.privateChatServerCache.set(otherId, s);
        this.privateChatServerCache.set(s.id, s);
      });
      try { localStorage.setItem(`cached_pcs_${currentId}`, JSON.stringify(normalized)); } catch (e) {}
      return normalized;
    } catch (membershipErr) {
      // Compatibility fallback is only valid when the normalized collection
      // is genuinely missing. Network, timeout, Cloudflare, and 5xx errors
      // must reach the caller instead of starting another public request.
      if (!isSchemaCompatibilityError(membershipErr)) throw membershipErr;
    }

    // 2. Compatibility fallback for older installations without the
    // private_chat_members relation.
    let list: any[] = [];
    try {
      list = await this.pb.collection('private_chat_servers').getFullList({
        filter: `users ~ "${currentId}"`,
        requestKey: null
      });
    } catch (usersFilterErr) {
      if (!isSchemaCompatibilityError(usersFilterErr)) throw usersFilterErr;
      try {
        list = await this.pb.collection('private_chat_servers').getFullList({
          filter: `user1 = "${currentId}" || user2 = "${currentId}"`,
          requestKey: null
        });
      } catch (userColumnsErr) {
        if (!isSchemaCompatibilityError(userColumnsErr)) throw userColumnsErr;
        // Fall through to membership query strategy
      }
    }

    if (list && list.length > 0) {
      list.forEach((s: any) => {
        const users = s.users || [s.user1, s.user2].filter(Boolean);
        const otherId = users.find((u: string) => u !== currentId) || users[0];
        if (otherId) this.privateChatServerCache.set(otherId, s);
        this.privateChatServerCache.set(s.id, s);
      });
      try {
        localStorage.setItem(`cached_pcs_${currentId}`, JSON.stringify(list));
      } catch (e) {}
      return list;
    }

    // 3. Parallel membership query fallback
    try {
      let myMemberships: any[];
      try {
        myMemberships = await this.pb.collection('private_chat_members').getFullList({
          filter: `user = "${currentId}"`,
          requestKey: null
        });
      } catch (membershipErr) {
        if (!isSchemaCompatibilityError(membershipErr)) throw membershipErr;
        myMemberships = [];
      }
      const serverIds = Array.from(new Set(myMemberships.map((m) => m.chat_server).filter(Boolean)));
      if (serverIds.length > 0) {
        const servers = await Promise.all(
          serverIds.map((id) =>
            this.pb.collection('private_chat_servers').getOne(id, { requestKey: null }).catch((error) => {
              // A membership may point at a deleted conversation, but an
              // infrastructure failure must not be hidden by this fallback.
              if (Number(error?.status) === 404) return null;
              throw error;
            })
          )
        );
        const validServers = servers.filter(Boolean);
        validServers.forEach((s: any) => {
          const users = s.users || [s.user1, s.user2].filter(Boolean);
          const otherId = users.find((u: string) => u !== currentId) || users[0];
          if (otherId) this.privateChatServerCache.set(otherId, s);
          this.privateChatServerCache.set(s.id, s);
        });
        if (validServers.length > 0) {
          try {
            localStorage.setItem(`cached_pcs_${currentId}`, JSON.stringify(validServers));
          } catch (e) {}
          return validServers;
        }
      }
    } catch (e) {
      if (!isSchemaCompatibilityError(e)) throw e;
      // Graceful fallback for an older installation without the normalized
      // membership collection.
    }

    return [];
  }

  async getOrCreatePrivateChatServer(recipientId: string): Promise<any> {
    if (this.isDemo) {
      return { id: 'demo-chat-server-' + recipientId, users: [this.getCurrentUser()?.id, recipientId] };
    }
    const currentId = this.pb.authStore.model?.id;
    if (!currentId) throw new Error('Not logged in');

    // 0. Check in-memory & localStorage cache
    const cachedServer = this.getCachedPrivateChatServer(recipientId);
    if (cachedServer) {
      return cachedServer;
    }

    // 1. Check current user's existing servers from getUserPrivateChatServers (which is cached and highly reliable)
    try {
      const myServers = await withTimeout(this.getUserPrivateChatServers(), 3500);
      if (Array.isArray(myServers) && myServers.length > 0) {
        const found = myServers.find((s: any) => {
          const users = s.users || [s.user1, s.user2].filter(Boolean);
          return (
            (Array.isArray(users) && users.some((u: any) => (u.id || u) === recipientId)) ||
            s.user1 === recipientId ||
            s.user2 === recipientId ||
            s.id === recipientId
          );
        });
        if (found) {
          this.setCachedPrivateChatServer(recipientId, found);
          return found;
        }
      }
    } catch (e) {
      if (!isSchemaCompatibilityError(e)) throw e;
    }

    // 2. Direct fast query using the production `users` relation. Keep the
    // old user1/user2 pair filter only as a schema-gated compatibility path.
    try {
      const directQuery = await withTimeout(
        this.pb.collection('private_chat_servers').getList(1, 10, {
          filter: `users ~ "${currentId}" && users ~ "${recipientId}"`,
          requestKey: null
        }),
        3000
      );
      if (directQuery.items && directQuery.items.length > 0) {
        const s = directQuery.items[0];
        this.setCachedPrivateChatServer(recipientId, s);
        return s;
      }
    } catch (directErr) {
      if (!isSchemaCompatibilityError(directErr)) throw directErr;
      const legacyQuery = await withTimeout(
        this.pb.collection('private_chat_servers').getList(1, 10, {
          filter: `(user1 = "${currentId}" && user2 = "${recipientId}") || (user1 = "${recipientId}" && user2 = "${currentId}")`,
          requestKey: null
        }),
        3000,
      );
      if (legacyQuery.items && legacyQuery.items.length > 0) {
        const s = legacyQuery.items[0];
        this.setCachedPrivateChatServer(recipientId, s);
        return s;
      }
    }

    // 3. Fallback: check private_chat_members for current user
    try {
      const myMemberships = await withTimeout(
        this.pb.collection('private_chat_members').getFullList({
          filter: `user = "${currentId}"`,
          requestKey: null
        }),
        3000,
      );
      if (myMemberships.length > 0) {
        const serverIds = myMemberships.map((m: any) => m.chat_server).filter(Boolean);
        const serverChecks = await Promise.all(
          serverIds.slice(0, 15).map((sid: string) =>
            this.pb.collection('private_chat_servers').getOne(sid, { requestKey: null }).catch((error) => {
              if (Number(error?.status) === 404) return null;
              throw error;
            })
          )
        );
        const match = serverChecks.find((cs: any) => {
          if (!cs) return false;
          const u = cs.users || [cs.user1, cs.user2].filter(Boolean);
          return (
            (Array.isArray(u) && u.some((x: any) => (x.id || x) === recipientId)) ||
            cs.user1 === recipientId ||
            cs.user2 === recipientId
          );
        });
        if (match) {
          this.setCachedPrivateChatServer(recipientId, match);
          return match;
        }
      }
    } catch (memErr) {
      if (!isSchemaCompatibilityError(memErr)) throw memErr;
    }

    // 4. Only if no existing server found, create a new server with timeout
    try {
      let newChatServer: any;
      try {
        newChatServer = await withTimeout(
          this.pb.collection('private_chat_servers').create(
            {
              users: [currentId, recipientId],
              private_chat_options: {}
            },
            { requestKey: null }
          ),
          5000
        );
      } catch (createErr) {
        if (!isSchemaCompatibilityError(createErr)) throw createErr;
        // Older deployments may only expose user1/user2. Keep this retry
        // strictly schema-gated so outages never become a second write.
        newChatServer = await withTimeout(
          this.pb.collection('private_chat_servers').create(
            {
              user1: currentId,
              user2: recipientId,
              private_chat_options: {}
            },
            { requestKey: null },
          ),
          5000,
        );
      }

      this.setCachedPrivateChatServer(recipientId, newChatServer);

      // Non-blocking membership creation
      Promise.all([
        this.pb.collection('private_chat_members').create({ user: currentId, chat_server: newChatServer.id }, { requestKey: null }).catch(() => {}),
        this.pb.collection('private_chat_members').create({ user: recipientId, chat_server: newChatServer.id }, { requestKey: null }).catch(() => {})
      ]).catch(() => {});

      return newChatServer;
    } catch (createErr) {
      console.warn('Failed to create private chat server:', createErr);
      // Never cache a fabricated conversation id. A later retry must resolve
      // the real PocketBase record after the backend becomes reachable.
      throw createErr;
    }
  }

  private syncDirectMessagesInBackground(recipientId: string, targetServerId: string) {
    if (this.isDemo || !targetServerId) return;
    const now = Date.now();
    const lastSync = this.dmLastBackgroundSync.get(targetServerId) || 0;
    // A channel switch can call fetchDirectMessages several times in quick
    // succession. Keep the first refresh, but coalesce the rest for 15s.
    if (now - lastSync < 15000 || this.dmSyncInFlight.has(targetServerId)) return;
    this.dmLastBackgroundSync.set(targetServerId, now);
    this.dmSyncInFlight.add(targetServerId);
    this.fetchDirectMessagePage(targetServerId, 30).then(async (page) => {
      const merged = await offlineCacheService.mergeChannelMessages(
        `dm-server-${targetServerId}`,
        page.items,
        page.hasMore,
        1,
      );
      const processed = merged.items;
      this.dmMessagesCache.set(targetServerId, processed);
      if (recipientId) this.dmMessagesCache.set(recipientId, processed);
      if (recipientId) {
        await offlineCacheService.mergeChannelMessages(
          `dm-user-${recipientId}`,
          page.items,
          page.hasMore,
          1,
        );
      }
    }).catch(() => {}).finally(() => {
      this.dmSyncInFlight.delete(targetServerId);
    });
  }

  async fetchDirectMessages(recipientId: string, chatServerId?: string, forceRefresh: boolean = false): Promise<Message[]> {
    if (this.isDemo) return [];
    const currentId = this.pb.authStore.model?.id;

    let targetServerId = chatServerId;
    if (!targetServerId) {
      const cached = this.getCachedPrivateChatServer(recipientId);
      if (cached?.id) {
        targetServerId = cached.id;
      }
    }

    // 1. Fast in-memory cache check (0ms response)
    if (!forceRefresh) {
      if (targetServerId && this.dmMessagesCache.has(targetServerId)) {
        const cached = this.dmMessagesCache.get(targetServerId)!;
        if (Array.isArray(cached)) {
          if (cached.length > 0) {
            this.syncDirectMessagesInBackground(recipientId, targetServerId);
          }
          return cached;
        }
      }
      if (recipientId && this.dmMessagesCache.has(recipientId)) {
        const cached = this.dmMessagesCache.get(recipientId)!;
        if (Array.isArray(cached)) {
          if (cached.length > 0 && targetServerId) {
            this.syncDirectMessagesInBackground(recipientId, targetServerId);
          }
          return cached;
        }
      }

      // 2. Fast synchronous IndexedDB cache check
      if (targetServerId) {
        const syncRes = offlineCacheService.getCachedMessagesSync(`dm-server-${targetServerId}`) || offlineCacheService.getCachedMessagesSync(targetServerId);
        if (syncRes && Array.isArray(syncRes.items)) {
          this.dmMessagesCache.set(targetServerId, syncRes.items);
          this.dmMessagesCache.set(recipientId, syncRes.items);
          if (syncRes.items.length > 0) {
            this.syncDirectMessagesInBackground(recipientId, targetServerId);
          }
          return syncRes.items;
        }
      }
      if (recipientId) {
        const syncRes = offlineCacheService.getCachedMessagesSync(`dm-user-${recipientId}`) || offlineCacheService.getCachedMessagesSync(recipientId);
        if (syncRes && Array.isArray(syncRes.items)) {
          this.dmMessagesCache.set(recipientId, syncRes.items);
          if (targetServerId) {
            this.dmMessagesCache.set(targetServerId, syncRes.items);
          }
          if (syncRes.items.length > 0 && targetServerId) {
            this.syncDirectMessagesInBackground(recipientId, targetServerId);
          }
          return syncRes.items;
        }
      }
    }

    // Resolve targetServerId if still missing
    if (!targetServerId) {
      try {
        const server = await withTimeout(this.getOrCreatePrivateChatServer(recipientId), 6000);
        targetServerId = server?.id;
      } catch (e) {
        console.warn('Failed to resolve targetServerId within timeout:', e);
        // A missing/slow backend is not an empty conversation. Let the
        // caller preserve its cache and expose the unavailable state.
        throw e;
      }
    }

    // Keep the legacy method compatible for older callers, but route all
    // resolved conversations through the shared cursor page implementation.
    // This removes the former fixed 40-row query and its attachment retry
    // cascade. New UI code calls fetchDirectMessagePage directly.
    if (targetServerId) {
      const page = await this.fetchDirectMessagePage(targetServerId, 30);
      const chronological = page.items;
      this.dmMessagesCache.set(targetServerId, chronological);
      if (recipientId) this.dmMessagesCache.set(recipientId, chronological);
      offlineCacheService.saveCachedMessages(`dm-server-${targetServerId}`, chronological, page.hasMore, 1);
      if (recipientId) offlineCacheService.saveCachedMessages(`dm-user-${recipientId}`, chronological, page.hasMore, 1);
      return chronological;
    }

    let rawRecords: any[] = [];

    // 3. Primary query: by chat_server with sort '-created' and expand 'sender,reply_to'
    if (targetServerId) {
      try {
        const res = await withTimeout(
          this.pb.collection('private_messages').getList(1, 30, {
            filter: `chat_server = "${targetServerId}"`,
            sort: '-created,-id',
            expand: 'sender,reply_to',
            requestKey: null
          }),
          12000
        );
        rawRecords = res.items || [];
      } catch (srvErr) {
        // Fast zero-join fallback if expand or heavy query takes too long
        try {
          const fastRes = await withTimeout(
            this.pb.collection('private_messages').getList(1, 30, {
              filter: `chat_server = "${targetServerId}"`,
              sort: '-created,-id',
              requestKey: null
            }),
            5000
          );
          rawRecords = fastRes.items || [];
        } catch (fastErr) {
          console.warn('Direct message query failed:', fastErr);
        }
      }
    }

    // 4. Fallback: if 0 records found and targetServerId was NOT provided/known and we have recipientId, check alternative chat servers
    if (rawRecords.length === 0 && !targetServerId && recipientId) {
      try {
        const myServers = await this.getUserPrivateChatServers();
        const altServer = myServers.find((s: any) => {
          if (!s?.id || s.id === targetServerId) return false;
          const users = s.users || [s.user1, s.user2].filter(Boolean);
          return (
            (Array.isArray(users) && users.some((u: any) => (u.id || u) === recipientId)) ||
            s.user1 === recipientId ||
            s.user2 === recipientId
          );
        });

        if (altServer?.id) {
          try {
            const altRes = await withTimeout(
              this.pb.collection('private_messages').getList(1, 30, {
                filter: `chat_server = "${altServer.id}"`,
                sort: '-created,-id',
                expand: 'sender,reply_to',
                requestKey: null
              }),
              8000
            );
            if (altRes.items && altRes.items.length > 0) {
              rawRecords = altRes.items;
              targetServerId = altServer.id;
              this.setCachedPrivateChatServer(recipientId, altServer);
            }
          } catch (altErr) {
            if (!isSchemaCompatibilityError(altErr)) throw altErr;
          }
        }
      } catch (checkErr) {
        if (!isSchemaCompatibilityError(checkErr)) throw checkErr;
      }
    }

    // 5. Final server lookup fallback if targetServerId was completely missing
    if (rawRecords.length === 0 && !targetServerId && recipientId) {
      try {
        const server = await this.getOrCreatePrivateChatServer(recipientId);
        if (server?.id) {
          targetServerId = server.id;
          const res = await withTimeout(
          this.pb.collection('private_messages').getList(1, 30, {
              filter: `chat_server = "${targetServerId}"`,
              sort: '-created,-id',
              expand: 'sender,reply_to',
              requestKey: null
            }),
            8000
          );
          rawRecords = res.items || [];
        }
      } catch (fallbackErr) {
        if (!isSchemaCompatibilityError(fallbackErr)) throw fallbackErr;
      }
    }

    // Fetch attachments in a single batch query for only messages that actually have attachments
    const msgsWithAttachments = rawRecords.filter((m) => m.has_attachment);
    if (msgsWithAttachments.length > 0) {
      try {
        const idFilter = msgsWithAttachments.map((m) => `message = "${m.id}"`).join(' || ');
        const attRecords = await this.pb.collection('private_attachments').getFullList({
          filter: idFilter,
          requestKey: null
        });
        if (attRecords.length > 0) {
          const attsByMsg = new Map<string, any[]>();
          for (const att of attRecords) {
            const mId = att.message;
            if (!attsByMsg.has(mId)) attsByMsg.set(mId, []);
            attsByMsg.get(mId)!.push(att);
          }
          for (const m of rawRecords) {
            if (attsByMsg.has(m.id)) {
              if (!m.expand) m.expand = {};
              const list = attsByMsg.get(m.id)!;
              m.expand['attachments(message)'] = list;
              m.expand['private_attachments(message)'] = list;
            }
          }
        }
      } catch (attErr) {
        if (!isSchemaCompatibilityError(attErr)) throw attErr;
      }
    }

    // Process and normalize raw records without discarding valid messages
    const raw = rawRecords as any as Message[];
    const processed = raw.map((m) => {
      const pubAtts = m.expand?.['attachments(message)'] || [];
      const privAtts = m.expand?.['private_attachments(message)'] || [];
      const combined = normalizeAttachmentRecords(pubAtts, privAtts);
      if (combined.length > 0) {
        if (!m.expand) m.expand = {};
        m.expand['attachments(message)'] = combined;
        m.expand['private_attachments(message)'] = combined;
      }
      return m;
    }).filter((m) => {
      if (m.deleted || Boolean(m.deleted_at && m.deleted_at !== '') || MessageDeletionService.isMessageDeleted(m.id)) {
        return false;
      }
      return true;
    });

    // Reverse descending order to chronological order (oldest -> newest)
    const chronological = [...processed].reverse();

    if (chronological.length > 0) {
      if (targetServerId) this.dmMessagesCache.set(targetServerId, chronological);
      if (recipientId) this.dmMessagesCache.set(recipientId, chronological);

      if (targetServerId) offlineCacheService.saveCachedMessages(`dm-server-${targetServerId}`, chronological, false, 1);
      if (recipientId) offlineCacheService.saveCachedMessages(`dm-user-${recipientId}`, chronological, false, 1);
      return chronological;
    }

    // 5. If network yielded 0 items, check persistent IndexedDB before returning empty (prevent wiping valid offline messages)
    try {
      const idbCached =
        (targetServerId ? await offlineCacheService.getCachedMessages(`dm-server-${targetServerId}`) : null) ||
        (await offlineCacheService.getCachedMessages(`dm-user-${recipientId}`)) ||
        (targetServerId ? await offlineCacheService.getCachedMessages(targetServerId) : null);
      if (idbCached && idbCached.items && idbCached.items.length > 0) {
        return idbCached.items;
      }
    } catch (idbErr) {}

    // Verified empty channel: cache empty state to allow instant 0ms renders
    if (targetServerId) this.dmMessagesCache.set(targetServerId, []);
    if (recipientId) this.dmMessagesCache.set(recipientId, []);
    if (targetServerId) offlineCacheService.saveCachedMessages(`dm-server-${targetServerId}`, [], false, 1);
    if (recipientId) offlineCacheService.saveCachedMessages(`dm-user-${recipientId}`, [], false, 1);

    return [];
  }

  async fetchDirectMessagePage(
    chatServerId: string,
    limit: number = 30,
    before?: MessageCursor,
  ): Promise<MessagePage> {
    const page = await this.fetchMessagePage(chatServerId, 'dm', limit, before);
    if (page.items.length === 0 || this.isDemo) return page;

    const ids = page.items.filter((message) => message.has_attachment).map((message) => message.id);
    if (ids.length > 0) {
      const attachmentKey = `message-attachments:dm:${chatServerId}`;
      this.messageAttachmentControllers.get(attachmentKey)?.abort();
      const controller = new AbortController();
      this.messageAttachmentControllers.set(attachmentKey, controller);
      try {
        const filter = ids.map((id) => `message = "${id}"`).join(' || ');
        const attachments = await this.pb.collection('private_attachments').getFullList({
          filter,
          requestKey: null,
          signal: controller.signal,
        });
        const byMessage = new Map<string, any[]>();
        (attachments as any[]).forEach((attachment) => {
          const list = byMessage.get(attachment.message) || [];
          list.push(attachment);
          byMessage.set(attachment.message, list);
        });
        page.items = page.items.map((message) => {
          const list = byMessage.get(message.id);
          if (!list?.length) return message;
          return {
            ...message,
            attachments: list,
            expand: { ...(message.expand || {}), private_attachments_via_message: list },
          };
        });
      } catch (error) {
        console.warn('Failed to load direct-message attachments:', error);
      } finally {
        if (this.messageAttachmentControllers.get(attachmentKey) === controller) {
          this.messageAttachmentControllers.delete(attachmentKey);
        }
      }
    }
    return page;
  }

  async sendDirectMessage(recipientId: string, content: string, replyToId?: string, chatServerId?: string, hasAttachment: boolean = false): Promise<Message> {
    if (this.isDemo) {
      return {
        id: 'dm-' + Math.random().toString(36).substr(2, 9),
        content,
        sender: this.getCurrentUser()?.id || '',
        has_attachment: hasAttachment,
        created: new Date().toISOString()
      } as any;
    }
    const currentId = this.pb.authStore.model?.id;
    let targetServerId = chatServerId;
    if (targetServerId && targetServerId.startsWith('dm-server-')) {
      targetServerId = targetServerId.replace('dm-server-', '');
    } else if (targetServerId && (targetServerId.startsWith('dm-user-') || targetServerId.startsWith('dm-') || targetServerId.length !== 15)) {
      targetServerId = undefined;
    }
    if (!targetServerId) {
      const server = await this.getOrCreatePrivateChatServer(recipientId);
      targetServerId = server?.id;
    }

    const data: any = {
      chat_server: targetServerId,
      sender: currentId,
      user: currentId,
      content: content.trim() === '' ? '  ' : content,
      has_attachment: hasAttachment
    };
    if (replyToId) {
      data.reply_to = replyToId;
    }

    const record = await this.pb.collection('private_messages').create(data, {
      expand: 'sender,reply_to'
    });

    const msg = record as any as Message;
    if (!msg.expand?.sender && this.getCurrentUser()) {
      if (!msg.expand) msg.expand = {};
      msg.expand.sender = this.getCurrentUser()!;
    }

    if (targetServerId) {
      const existing = this.dmMessagesCache.get(targetServerId) || [];
      if (!existing.some((m) => m.id === msg.id)) {
        this.dmMessagesCache.set(targetServerId, [...existing, msg]);
      }
    }

    // Broadcast DM created event over WebSocket / BroadcastChannel for instant delivery
    try {
      wsService.send({
        type: 'message_delivery',
        action: 'create',
        record: msg,
        channelId: targetServerId,
        userId: currentId
      });
    } catch (wsErr) {}

    return msg;
  }

  async createPrivateMessage(recipientId: string, content: string, chatServerId?: string): Promise<Message> {
    return this.sendDirectMessage(recipientId, content, undefined, chatServerId);
  }

  async deletePrivateMessage(messageId: string): Promise<boolean> {
    if (this.isDemo || !messageId) return true;
    try {
      await this.pb.collection('private_messages').delete(messageId);
      return true;
    } catch {
      return false;
    }
  }

  private privateMessageListeners = new Set<{ chatServerId: string; callback: (event: any) => void }>();
  private privateMessagesSubscribed = false;
  private privateAttachmentsSubscribed = false;

  private setupPrivateMessagesSubscription() {
    if (this.privateMessagesSubscribed || this.isDemo) return;
    this.privateMessagesSubscribed = true;

    try {
      this.pb.collection('private_messages').subscribe('*', (e) => {
        if (e.action === 'delete') {
          this.privateMessageListeners.forEach(({ chatServerId, callback }) => {
            if (chatServerId === '*' || e.record?.chat_server === chatServerId) {
              try { callback(e); } catch (cbErr) { console.warn('[REALTIME] Error in DM callback:', cbErr); }
            }
          });
        } else if (e.record?.id) {
          this.pb.collection('private_messages').getOne(e.record.id, {
            expand: 'sender,reply_to',
            requestKey: null
          }).then(async (fullRecord) => {
            if (fullRecord.has_attachment) {
              try {
                const atts = await this.pb.collection('private_attachments').getFullList({
                  filter: `message = "${fullRecord.id}"`,
                  requestKey: null
                });
                if (atts.length > 0) {
                  if (!fullRecord.expand) fullRecord.expand = {};
                  fullRecord.expand['attachments_via_message'] = atts;
                  fullRecord.expand['private_attachments_via_message'] = atts;
                  // Legacy aliases keep older renderers and cached records readable.
                  fullRecord.expand['attachments(message)'] = atts;
                  fullRecord.expand['private_attachments(message)'] = atts;
                }
              } catch (attErr) {}
            }
              this.privateMessageListeners.forEach(({ chatServerId, callback }) => {
                if (chatServerId === '*' || fullRecord.chat_server === chatServerId) {
                  try {
                    callback({ action: e.action, record: fullRecord });
                } catch (cbErr) {}
              }
            });
          }).catch(() => {});
        }
      }).catch((err) => {
        this.privateMessagesSubscribed = false;
        console.warn('[REALTIME] Private messages subscribe error, retrying in 2s:', err);
        setTimeout(() => {
          if (this.privateMessageListeners.size > 0 && !this.privateMessagesSubscribed) {
            this.setupPrivateMessagesSubscription();
          }
        }, 2000);
      });
    } catch (e) {
      this.privateMessagesSubscribed = false;
      console.warn('[REALTIME] Subscribe to private_messages error, retrying in 2s:', e);
      setTimeout(() => {
        if (this.privateMessageListeners.size > 0 && !this.privateMessagesSubscribed) {
          this.setupPrivateMessagesSubscription();
        }
      }, 2000);
    }

    if (!this.privateAttachmentsSubscribed) {
      this.privateAttachmentsSubscribed = true;
      try {
        this.pb.collection('private_attachments').subscribe('*', async (e) => {
          const messageId = e.record?.message;
          if (messageId) {
            try {
              const fullRecord = await this.pb.collection('private_messages').getOne(messageId, {
                expand: 'sender,reply_to,attachments_via_message,private_attachments_via_message',
                requestKey: null
              });
              const pubAtts = fullRecord.expand?.['attachments_via_message'] || fullRecord.expand?.['attachments(message)'] || [];
              const privAtts = fullRecord.expand?.['private_attachments_via_message'] || fullRecord.expand?.['private_attachments(message)'] || [];
              const combined = normalizeAttachmentRecords(pubAtts, privAtts);
              if (combined.length > 0) {
                if (!fullRecord.expand) fullRecord.expand = {};
                fullRecord.expand['attachments_via_message'] = combined;
                fullRecord.expand['private_attachments_via_message'] = combined;
                fullRecord.expand['attachments(message)'] = combined;
                fullRecord.expand['private_attachments(message)'] = combined;
              }
              this.privateMessageListeners.forEach(({ chatServerId, callback }) => {
                if (chatServerId === '*' || fullRecord.chat_server === chatServerId) {
                  try {
                    callback({ action: 'update', record: fullRecord });
                  } catch (cbErr) {}
                }
              });
            } catch (err) {}
          }
        }).catch((err) => {
          this.privateAttachmentsSubscribed = false;
        });
      } catch (err) {
        this.privateAttachmentsSubscribed = false;
      }
    }
  }

  subscribeToPrivateMessages(chatServerId: string, callback: (event: any) => void): () => void {
    if (this.isDemo) return () => {};

    const listenerObj = { chatServerId, callback };
    this.privateMessageListeners.add(listenerObj);
    this.setupPrivateMessagesSubscription();

    return () => {
      this.privateMessageListeners.delete(listenerObj);
      if (this.privateMessageListeners.size === 0) {
        this.privateMessagesSubscribed = false;
        try {
          this.pb.collection('private_messages').unsubscribe('*').catch(() => {});
        } catch (e) {}
      }
    };
  }

  // --- USER NOTIFICATIONS FIELD SYNC ---

  async addNotificationToUser(targetUserId: string, notification: NotificationItem): Promise<void> {
    if (this.isDemo || !targetUserId) return;
    try {
      const userRecord = await this.pb.collection('users').getOne(targetUserId);
      let existingNotifications: NotificationItem[] = [];
      if (userRecord.notifications) {
        if (typeof userRecord.notifications === 'string') {
          try {
            existingNotifications = JSON.parse(userRecord.notifications);
          } catch (e) {
            existingNotifications = [];
          }
        } else if (Array.isArray(userRecord.notifications)) {
          existingNotifications = userRecord.notifications;
        }
      }

      // Avoid duplicate notification IDs and keep existing read & unread notifications up to 50 items
      const filtered = existingNotifications.filter(n => n.id !== notification.id);
      const updated = [notification, ...filtered].slice(0, 50);

      await this.pb.collection('users').update(targetUserId, {
        notifications: updated
      });
    } catch (err) {
      console.warn('Failed to add notification to user:', err);
    }
  }

  async updateUserNotifications(userId: string, notifications: NotificationItem[]): Promise<void> {
    if (this.isDemo || !userId) return;
    try {
      const cleanNotifications = notifications.slice(0, 50);
      await this.pb.collection('users').update(userId, {
        notifications: cleanNotifications
      });
    } catch (err) {
      console.warn('Failed to update user notifications in database:', err);
    }
  }

  async getUserNotifications(userId: string): Promise<NotificationItem[]> {
    if (this.isDemo || !userId) return [];
    try {
      const userRecord = await this.pb.collection('users').getOne(userId);
      if (userRecord.notifications) {
        let list: NotificationItem[] = [];
        if (typeof userRecord.notifications === 'string') {
          try {
            list = JSON.parse(userRecord.notifications);
          } catch (e) {
            list = [];
          }
        } else if (Array.isArray(userRecord.notifications)) {
          list = userRecord.notifications;
        }
        return list.slice(0, 50);
      }
    } catch (err) {
      console.warn('Failed to fetch user notifications:', err);
    }
    return [];
  }

  async cancelFriendRequest(senderId: string, targetUserId: string): Promise<void> {
    if (this.isDemo || !senderId || !targetUserId) return;
    try {
      // 1. Clean up Sender's profile settings (remove outgoing request)
      const senderRecord = await this.pb.collection('users').getOne(senderId);
      if (senderRecord) {
        let sSettings = senderRecord.settings;
        if (typeof sSettings === 'string') {
          try { sSettings = JSON.parse(sSettings); } catch { sSettings = {}; }
        }
        if (!sSettings) sSettings = {};

        const currentReqs = sSettings.friend_requests || [];
        const updatedReqs = currentReqs.filter((r: any) => r.targetId !== targetUserId && r.id !== targetUserId);
        sSettings.friend_requests = updatedReqs;

        await this.pb.collection('users').update(senderId, {
          settings: sSettings
        });
      }

      // 2. Clean up Target/Recipient's profile settings & notifications (remove incoming request & notification)
      try {
        const targetRecord = await this.pb.collection('users').getOne(targetUserId);
        if (targetRecord) {
          let tSettings = targetRecord.settings;
          if (typeof tSettings === 'string') {
            try { tSettings = JSON.parse(tSettings); } catch { tSettings = {}; }
          }
          if (!tSettings) tSettings = {};

          const tReqs = tSettings.friend_requests || [];
          const updatedTReqs = tReqs.filter((r: any) => r.targetId !== senderId && r.id !== senderId);
          tSettings.friend_requests = updatedTReqs;

          // Clean up notifications for target user
          let tNotifs: NotificationItem[] = [];
          if (targetRecord.notifications) {
            if (typeof targetRecord.notifications === 'string') {
              try { tNotifs = JSON.parse(targetRecord.notifications); } catch { tNotifs = []; }
            } else if (Array.isArray(targetRecord.notifications)) {
              tNotifs = targetRecord.notifications;
            }
          }

          const updatedNotifs = tNotifs.filter(
            (n) => !(n.type === 'friend_request' && n.sender_id === senderId)
          );

          await this.pb.collection('users').update(targetUserId, {
            settings: tSettings,
            notifications: updatedNotifs
          });
        }
      } catch (err) {
        console.warn('Target user cleanup during friend request cancellation:', err);
      }
    } catch (err) {
      console.error('Failed to cancel friend request:', err);
      throw err;
    }
  }

  // --- APP CONFIG & DATABASE URL SYNC ---

  async updateAppConfigDatabaseUrl(url: string): Promise<void> {
    if (this.isDemo) return;
    try {
      const records = await this.pb.collection('app_config').getFullList();
      if (records.length > 0) {
        const first = records[0];
        let langData: any = {};
        if (first.language_data) {
          langData = typeof first.language_data === 'string' ? JSON.parse(first.language_data) : first.language_data;
        }
        langData.db_url = url;
        await this.pb.collection('app_config').update(first.id, {
          language_data: langData
        });
      } else {
        await this.pb.collection('app_config').create({
          language_data: { db_url: url },
          language: 'en'
        });
      }
    } catch (e) {
      console.warn('Failed to update app_config database URL:', e);
    }
  }

  // --- ADMIN GLOBAL APP THEME & LAYOUT SETTINGS ---

  async getAdminAppSettings(): Promise<any> {
    if (this.isDemo) return null;

    // 1. Try app_settings_admin collection if supported (query without filter to prevent 400 invalid filter errors)
    if (this.appSettingsAdminSupported) {
      try {
        const result = await this.pb.collection('app_settings_admin').getList(1, 5).catch((err: any) => {
          if (err?.status === 404 || err?.status === 400 || String(err?.message || '').includes('404') || String(err?.message || '').includes('400')) {
            this.appSettingsAdminSupported = false;
          }
          return null;
        });

        if (result && result.items && result.items.length > 0) {
          const item = result.items[0];
          const raw = item.admin_settings ?? item.config_data;
          if (raw !== undefined && raw !== null) {
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
          }
          return item;
        }
      } catch (e: any) {
        if (e?.status === 404 || e?.status === 400) {
          this.appSettingsAdminSupported = false;
        }
      }
    }

    // 2. Fallback to app_config collection (guaranteed in DATABASE.md)
    try {
      const configRecords = await this.pb.collection('app_config').getList(1, 5).catch(() => null);
      if (configRecords && configRecords.items && configRecords.items.length > 0) {
        for (const item of configRecords.items) {
          let langData = item.language_data;
          if (typeof langData === 'string') {
            try { langData = JSON.parse(langData); } catch (_) {}
          }
          if (langData && typeof langData === 'object' && langData.admin_settings) {
            return langData.admin_settings;
          }
        }
      }
    } catch (_) {}

    // 3. Fallback to local storage
    try {
      const local = safeLocalStorageGet('sirver_admin_settings');
      if (local) {
        return JSON.parse(local);
      }
    } catch (_) {}

    return null;
  }

  async saveAdminAppSettings(data: any): Promise<boolean> {
    if (this.isDemo) return false;
    safeLocalStorageSet('sirver_admin_settings', JSON.stringify(data));
    let saved = false;

    if (this.appSettingsAdminSupported) {
      try {
        const records = await this.pb.collection('app_settings_admin').getList(1, 5).catch((err: any) => {
          if (err?.status === 404 || err?.status === 400) {
            this.appSettingsAdminSupported = false;
          }
          return null;
        });

        const fullPayload = {
          key: 'admin_settings',
          admin_settings: data,
          config_data: JSON.stringify(data),
        };

        if (records && records.items && records.items.length > 0) {
          const recordId = records.items[0].id;
          try {
            await this.pb.collection('app_settings_admin').update(recordId, fullPayload);
            saved = true;
          } catch (err) {
            try {
              await this.pb.collection('app_settings_admin').update(recordId, { key: 'admin_settings', admin_settings: data });
              saved = true;
            } catch (err2) {
              await this.pb.collection('app_settings_admin').update(recordId, { admin_settings: data });
              saved = true;
            }
          }
        } else if (this.appSettingsAdminSupported) {
          try {
            await this.pb.collection('app_settings_admin').create(fullPayload);
            saved = true;
          } catch (err) {
            try {
              await this.pb.collection('app_settings_admin').create({ key: 'admin_settings', admin_settings: data });
              saved = true;
            } catch (err2) {
              await this.pb.collection('app_settings_admin').create({ admin_settings: data });
              saved = true;
            }
          }
        }
      } catch (e: any) {
        if (e?.status === 404 || e?.status === 400) {
          this.appSettingsAdminSupported = false;
        }
      }
    }

    // Always sync to app_config as reliable backup
    try {
      const configRecords = await this.pb.collection('app_config').getList(1, 5).catch(() => null);
      if (configRecords && configRecords.items && configRecords.items.length > 0) {
        const first = configRecords.items[0];
        let langData: any = {};
        if (first.language_data) {
          langData = typeof first.language_data === 'string' ? JSON.parse(first.language_data) : first.language_data;
        }
        langData.admin_settings = data;
        await this.pb.collection('app_config').update(first.id, {
          language_data: langData
        });
        saved = true;
      } else {
        await this.pb.collection('app_config').create({
          language_data: { admin_settings: data },
          language: 'en'
        });
        saved = true;
      }
    } catch (_) {}

    return saved;
  }

  subscribeAdminAppSettings(callback: (data: any) => void): () => void {
    if (this.isDemo) return () => {};
    let unsubFunc: any = null;

    if (this.appSettingsAdminSupported) {
      this.pb.collection('app_settings_admin').subscribe('*', (e: any) => {
        if (e && e.record) {
          const raw = e.record.admin_settings ?? e.record.config_data;
          if (raw !== undefined && raw !== null) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            callback(parsed);
          }
        }
      }).then((unsub) => {
        unsubFunc = unsub;
      }).catch(() => {
        this.appSettingsAdminSupported = false;
      });
    }

    let unsubConfig: any = null;
    try {
      this.pb.collection('app_config').subscribe('*', (e: any) => {
        if (e && e.record && e.record.language_data) {
          let langData = e.record.language_data;
          if (typeof langData === 'string') {
            try { langData = JSON.parse(langData); } catch (_) {}
          }
          if (langData?.admin_settings) {
            callback(langData.admin_settings);
          }
        }
      }).then((unsub) => {
        unsubConfig = unsub;
      }).catch(() => {});
    } catch (_) {}

    return () => {
      if (unsubFunc) unsubFunc();
      if (unsubConfig) unsubConfig();
      if (this.appSettingsAdminSupported) {
        this.pb.collection('app_settings_admin').unsubscribe('*').catch(() => {});
      }
      this.pb.collection('app_config').unsubscribe('*').catch(() => {});
    };
  }

  // --- SERVER ROLES & MEMBERS ---

  async fetchServerRoles(serverId: string): Promise<ServerRole[]> {
    if (this.isDemo || !serverId) return [];

    let storedLocal: ServerRole[] = [];
    try {
      const stored = localStorage.getItem(`server_roles_${serverId}`);
      if (stored) storedLocal = JSON.parse(stored);
    } catch (err) {}

    try {
      const records = await this.pb.collection('roles').getFullList({
        filter: `server = "${serverId}"`,
        sort: '-created'
      });
      const remoteRoles: ServerRole[] = records.map((r: any) => {
        const localMatch = storedLocal.find((item) => item.id === r.id || item.name === r.name);

        let roleSettings: any = {};
        if (r.role_settings) {
          if (typeof r.role_settings === 'string') {
            try {
              roleSettings = JSON.parse(r.role_settings);
            } catch (e) {}
          } else if (typeof r.role_settings === 'object' && r.role_settings !== null) {
            roleSettings = r.role_settings;
          }
        }

        const resolvedEmoji = roleSettings.emoji || r.emoji || r.icon || localMatch?.emoji || '🛡️';
        const resolvedColor = roleSettings.color || r.color || localMatch?.color || '#3b82f6';

        let resolvedPermissions = roleSettings.permissions;
        if (!resolvedPermissions) {
          if (typeof r.permissions === 'string') {
            try { resolvedPermissions = JSON.parse(r.permissions); } catch (e) {}
          } else if (r.permissions && typeof r.permissions === 'object') {
            resolvedPermissions = r.permissions;
          } else {
            resolvedPermissions = localMatch?.permissions || {};
          }
        }

        return {
          id: r.id,
          server: r.server,
          name: r.name,
          emoji: resolvedEmoji,
          color: resolvedColor,
          permissions: resolvedPermissions || {},
          role_settings: roleSettings,
          created: r.created
        };
      });

      const merged: ServerRole[] = [...remoteRoles];
      for (const loc of storedLocal) {
        if (!merged.some((item) => item.id === loc.id || item.name === loc.name)) {
          merged.push(loc);
        }
      }

      try {
        localStorage.setItem(`server_roles_${serverId}`, JSON.stringify(merged));
      } catch (err) {}

      this.serverRolesCache.set(serverId, merged);
      return merged;
    } catch (e) {
      this.serverRolesCache.set(serverId, storedLocal);
      return storedLocal;
    }
  }

  async createServerRole(serverId: string, roleData: Partial<ServerRole>): Promise<ServerRole> {
    const emoji = roleData.emoji || '🛡️';
    const color = roleData.color || '#3b82f6';
    const permissions = roleData.permissions || { send_messages: true };

    const roleSettingsObj = {
      emoji,
      color,
      permissions,
      ...(roleData.role_settings || {})
    };

    const newRole: ServerRole = {
      id: 'role-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      server: serverId,
      name: roleData.name || 'New Role',
      emoji,
      color,
      permissions,
      role_settings: roleSettingsObj,
      created: new Date().toISOString()
    };

    try {
      const stored = localStorage.getItem(`server_roles_${serverId}`);
      const storedLocal: ServerRole[] = stored ? JSON.parse(stored) : [];
      localStorage.setItem(`server_roles_${serverId}`, JSON.stringify([newRole, ...storedLocal]));
    } catch (err) {}

    if (!this.isDemo) {
      try {
        const recordPayload: any = {
          server: serverId,
          name: newRole.name,
          emoji: newRole.emoji,
          color: newRole.color,
          permissions: JSON.stringify(newRole.permissions),
          role_settings: roleSettingsObj
        };
        const record = await this.pb.collection('roles').create(recordPayload);
        newRole.id = record.id;
      } catch (e) {
        console.warn('Failed to save role to PocketBase collection, attempting fallback:', e);
        try {
          const fallbackPayload: any = {
            server: serverId,
            name: newRole.name,
            role_settings: JSON.stringify(roleSettingsObj)
          };
          const record = await this.pb.collection('roles').create(fallbackPayload);
          newRole.id = record.id;
        } catch (e2) {
          console.warn('Fallback create also failed:', e2);
        }
      }
    }

    const current = await this.fetchServerRoles(serverId);
    return current.find((r) => r.id === newRole.id || r.name === newRole.name) || newRole;
  }

  async updateServerRole(serverId: string, roleId: string, roleData: Partial<ServerRole>): Promise<ServerRole> {
    let existingRole: ServerRole | undefined;
    try {
      const stored = localStorage.getItem(`server_roles_${serverId}`);
      if (stored) {
        const storedLocal: ServerRole[] = JSON.parse(stored);
        existingRole = storedLocal.find((r) => r.id === roleId || r.name === roleData.name);
      }
    } catch (err) {}

    const updatedEmoji = roleData.emoji || existingRole?.emoji || existingRole?.role_settings?.emoji || '🛡️';
    const updatedColor = roleData.color || existingRole?.color || existingRole?.role_settings?.color || '#3b82f6';
    const updatedPermissions = roleData.permissions || existingRole?.permissions || existingRole?.role_settings?.permissions || { send_messages: true };

    const roleSettingsObj = {
      ...(existingRole?.role_settings || {}),
      ...(roleData.role_settings || {}),
      emoji: updatedEmoji,
      color: updatedColor,
      permissions: updatedPermissions
    };

    const updatedRoleMerged: ServerRole = {
      id: roleId,
      server: serverId,
      name: roleData.name || existingRole?.name || 'Role',
      emoji: updatedEmoji,
      color: updatedColor,
      permissions: updatedPermissions,
      role_settings: roleSettingsObj
    };

    try {
      const stored = localStorage.getItem(`server_roles_${serverId}`);
      if (stored) {
        const storedLocal: ServerRole[] = JSON.parse(stored);
        const updatedLocal = storedLocal.map((r) =>
          (r.id === roleId || r.name === roleData.name)
            ? { ...r, ...updatedRoleMerged }
            : r
        );
        localStorage.setItem(`server_roles_${serverId}`, JSON.stringify(updatedLocal));
      }
    } catch (err) {}

    if (!this.isDemo) {
      try {
        const recordPayload: any = {
          role_settings: roleSettingsObj
        };
        if (roleData.name) recordPayload.name = roleData.name;
        if (updatedEmoji) recordPayload.emoji = updatedEmoji;
        if (updatedColor) recordPayload.color = updatedColor;
        if (updatedPermissions) recordPayload.permissions = typeof updatedPermissions === 'object' ? JSON.stringify(updatedPermissions) : updatedPermissions;

        await this.pb.collection('roles').update(roleId, recordPayload);
      } catch (e) {
        console.warn('Failed to update role in PocketBase collection:', e);
        try {
          const fallbackPayload: any = {
            role_settings: JSON.stringify(roleSettingsObj)
          };
          if (roleData.name) fallbackPayload.name = roleData.name;
          await this.pb.collection('roles').update(roleId, fallbackPayload);
        } catch (e2) {
          console.warn('Fallback update with stringified role_settings failed:', e2);
        }
      }
    }

    const current = await this.fetchServerRoles(serverId);
    return current.find((r) => r.id === roleId || r.name === roleData.name) || updatedRoleMerged;
  }

  async deleteServerRole(serverId: string, roleId: string): Promise<boolean> {
    if (!this.isDemo) {
      try {
        await this.pb.collection('roles').delete(roleId);
      } catch (e) {}
    }

    try {
      const current = await this.fetchServerRoles(serverId);
      const updated = current.filter((r) => r.id !== roleId);
      localStorage.setItem(`server_roles_${serverId}`, JSON.stringify(updated));
    } catch (err) {}

    return true;
  }

  async fetchSingleServerMember(serverId: string, userId: string): Promise<ServerMember | null> {
    if (this.isDemo || !serverId || !userId) return null;
    try {
      const records = await this.pb.collection('server_members').getFullList({
        filter: `server = "${serverId}" && (user = "${userId}" || id = "${userId}")`,
        expand: 'user,role'
      });
      if (records.length === 0) return null;
      const m: any = records[0];

      let serverRoles: ServerRole[] = [];
      try {
        serverRoles = await this.fetchServerRoles(serverId);
      } catch (e) {}

      const localRole = localStorage.getItem(`member_role_${serverId}_${userId}`);

      let pbRole = '';
      if (m.expand?.role) {
        if (Array.isArray(m.expand.role)) {
          pbRole = m.expand.role.map((r: any) => r.id || r.name).join(',');
        } else {
          pbRole = m.expand.role.id || m.expand.role.name || '';
        }
      } else if (m.role) {
        if (Array.isArray(m.role)) {
          pbRole = m.role.map((roleId: string) => {
            const matched = serverRoles.find(r => r.id === roleId || r.name === roleId);
            return matched ? matched.id : roleId;
          }).join(',');
        } else {
          pbRole = String(m.role);
        }
      }

      const effectiveRole = pbRole || localRole || '';

      const localIsMember = localStorage.getItem(`is_member_${serverId}_${userId}`);
      const localStatus = localStorage.getItem(`membership_status_${serverId}_${userId}`);
      const localLeftAt = localStorage.getItem(`left_at_${serverId}_${userId}`);

      let isMember = m.is_member !== false && m.membership_status !== 'left' && m.membership_status !== 'banned' && m.membership_status !== 'kicked';
      if (localIsMember === 'false' || localStatus === 'left' || localStatus === 'banned' || localStatus === 'kicked') {
        isMember = false;
      } else if (localIsMember === 'true' || localStatus === 'active') {
        isMember = true;
      }

      let memStatus: 'active' | 'left' | 'banned' | 'kicked' = (m.membership_status as any) || (m.banned ? 'banned' : (isMember ? 'active' : 'left'));
      if (localStatus) memStatus = localStatus as any;

      const resMember: ServerMember = {
        id: m.id,
        member_name: m.member_name || m.nickname,
        server: m.server,
        user: m.user,
        nickname: m.nickname || m.member_name,
        server_avatar: m.server_avatar,
        server_banner: m.server_banner,
        server_profile_settings: m.server_profile_settings,
        role: effectiveRole,
        role_id: effectiveRole,
        expand: m.expand,
        joined_at: m.joined_at,
        created: m.created,
        is_member: isMember,
        left_at: m.left_at || localLeftAt || null,
        membership_status: memStatus
      };

      if (!this.serverMembersCache.has(serverId)) {
        this.serverMembersCache.set(serverId, new Map());
      }
      this.serverMembersCache.get(serverId)!.set(m.user, resMember);

      return resMember;
    } catch (e) {
      return null;
    }
  }

  async fetchServerMembers(serverId: string): Promise<ServerMember[]> {
    if (this.isDemo) return [];
    try {
      const records = await this.pb.collection('server_members').getFullList({
        filter: `server = "${serverId}"`,
        expand: 'user,role'
      });
      let serverRoles: ServerRole[] = [];
      try {
        serverRoles = await this.fetchServerRoles(serverId);
      } catch (e) {}

      if (!this.serverMembersCache.has(serverId)) {
        this.serverMembersCache.set(serverId, new Map());
      }
      const sMap = this.serverMembersCache.get(serverId)!;

      const mappedMembers: ServerMember[] = records.map((m: any) => {
        const userId = m.user || m.expand?.user?.id || m.id;
        const localRole = localStorage.getItem(`member_role_${serverId}_${userId}`);

        let pbRole = '';
        if (m.expand?.role) {
          if (Array.isArray(m.expand.role)) {
            pbRole = m.expand.role.map((r: any) => r.id || r.name).join(',');
          } else {
            pbRole = m.expand.role.id || m.expand.role.name || '';
          }
        } else if (m.role) {
          if (Array.isArray(m.role)) {
            pbRole = m.role.map((roleId: string) => {
              const matched = serverRoles.find(r => r.id === roleId || r.name === roleId);
              return matched ? matched.id : roleId;
            }).join(',');
          } else {
            pbRole = String(m.role);
          }
        }

        const effectiveRole = pbRole || localRole || '';

        const localIsMember = localStorage.getItem(`is_member_${serverId}_${userId}`);
        const localStatus = localStorage.getItem(`membership_status_${serverId}_${userId}`);
        const localLeftAt = localStorage.getItem(`left_at_${serverId}_${userId}`);

        let isMember = m.is_member !== false && m.membership_status !== 'left' && m.membership_status !== 'banned' && m.membership_status !== 'kicked';
        if (localIsMember === 'false' || localStatus === 'left' || localStatus === 'banned' || localStatus === 'kicked') {
          isMember = false;
        } else if (localIsMember === 'true' || localStatus === 'active') {
          isMember = true;
        }

        let memStatus: 'active' | 'left' | 'banned' | 'kicked' = (m.membership_status as any) || (m.banned ? 'banned' : (isMember ? 'active' : 'left'));
        if (localStatus) memStatus = localStatus as any;

        const sm: ServerMember = {
          id: m.id,
          member_name: m.member_name || m.nickname,
          server: m.server,
          user: userId,
          nickname: m.nickname || m.member_name,
          server_avatar: m.server_avatar,
          server_banner: m.server_banner,
          server_profile_settings: m.server_profile_settings,
          role: effectiveRole,
          role_id: effectiveRole,
          expand: m.expand,
          joined_at: m.joined_at,
          created: m.created,
          is_member: isMember,
          left_at: m.left_at || localLeftAt || null,
          membership_status: memStatus
        };
        sMap.set(userId, sm);
        return sm;
      });

      try {
        localStorage.setItem(`cached_server_members_${serverId}`, JSON.stringify(mappedMembers));
      } catch (err) {}

      return mappedMembers;
    } catch (e) {
      return [];
    }
  }

  async updateMemberRole(serverId: string, memberIdOrUserId: string, roleIdOrName: string): Promise<boolean> {
    let serverRoles: ServerRole[] = [];
    try {
      serverRoles = await this.fetchServerRoles(serverId);
    } catch (e) {}

    const tokens = String(roleIdOrName || '').split(',').map(s => s.trim()).filter(Boolean);
    const resolvedRoleIds: string[] = [];
    const resolvedRoleNames: string[] = [];

    for (const tok of tokens) {
      if (tok === 'owner' || tok === 'Server Owner' || tok === 'مالك السيرفر') continue;
      const matched = serverRoles.find(r => r.id === tok || r.name === tok);
      if (matched) {
        if (!resolvedRoleIds.includes(matched.id)) resolvedRoleIds.push(matched.id);
        if (!resolvedRoleNames.includes(matched.name)) resolvedRoleNames.push(matched.name);
      } else {
        if (!resolvedRoleIds.includes(tok)) resolvedRoleIds.push(tok);
        if (!resolvedRoleNames.includes(tok)) resolvedRoleNames.push(tok);
      }
    }

    if (!this.isDemo) {
      try {
        let memberRecord: any = null;
        try {
          const members = await this.pb.collection('server_members').getFullList({
            filter: `server = "${serverId}" && (user = "${memberIdOrUserId}" || id = "${memberIdOrUserId}")`
          });
          if (members.length > 0) memberRecord = members[0];
        } catch (e) {}

        if (!memberRecord) {
          try {
            const membersByUser = await this.pb.collection('server_members').getFullList({
              filter: `server = "${serverId}" && user = "${memberIdOrUserId}"`
            });
            if (membersByUser.length > 0) memberRecord = membersByUser[0];
          } catch (e) {}
        }

        if (memberRecord) {
          try {
            await this.pb.collection('server_members').update(memberRecord.id, {
              role: resolvedRoleIds
            });
          } catch (updateErr) {
            try {
              await this.pb.collection('server_members').update(memberRecord.id, {
                role: resolvedRoleIds.join(',') || resolvedRoleNames.join(',')
              });
            } catch (fallbackErr) {
              console.warn('Failed fallback update for member role in PocketBase:', fallbackErr);
            }
          }
        } else {
          try {
            await this.pb.collection('server_members').create({
              server: serverId,
              user: memberIdOrUserId,
              role: resolvedRoleIds
            });
          } catch (createErr) {
            try {
              await this.pb.collection('server_members').create({
                server: serverId,
                user: memberIdOrUserId,
                role: resolvedRoleIds.join(',') || resolvedRoleNames.join(',')
              });
            } catch (createFallback) {
              console.warn('Failed fallback create for member role in PocketBase:', createFallback);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to update member role in PocketBase:', e);
      }
    }

    try {
      const combinedVal = resolvedRoleIds.join(',') || resolvedRoleNames.join(',') || roleIdOrName;
      localStorage.setItem(`member_role_${serverId}_${memberIdOrUserId}`, combinedVal);
      window.dispatchEvent(new CustomEvent('server-member-updated', {
        detail: { serverId, userId: memberIdOrUserId, role: combinedVal }
      }));
    } catch (e) {}

    return true;
  }

  async updateServerMemberProfile(
    serverId: string,
    userId: string,
    profileData: { member_name?: string; server_avatar?: File | string | null; server_banner?: File | string | null; server_profile_settings?: any }
  ): Promise<ServerMember> {
    if (this.isDemo) {
      return { id: 'demo-member', server: serverId, user: userId, ...profileData } as any;
    }

    let memberRecord: any = null;
    try {
      const members = await this.pb.collection('server_members').getFullList({
        filter: `server = "${serverId}" && user = "${userId}"`
      });
      if (members.length > 0) {
        memberRecord = members[0];
      }
    } catch (e) {}

    if (!memberRecord) {
      try {
        memberRecord = await this.joinServer(serverId);
      } catch (e) {}
    }

    const formData = new FormData();
    if (profileData.member_name !== undefined) {
      formData.append('member_name', profileData.member_name);
      formData.append('nickname', profileData.member_name);
    }

    if (profileData.server_avatar instanceof File) {
      formData.append('server_avatar', profileData.server_avatar);
    } else if (typeof profileData.server_avatar === 'string' && profileData.server_avatar && profileData.server_avatar !== 'REMOVE') {
      formData.append('server_avatar', profileData.server_avatar);
    } else if (profileData.server_avatar === null || profileData.server_avatar === '' || profileData.server_avatar === 'REMOVE') {
      formData.append('server_avatar', '');
    }

    if (profileData.server_banner instanceof File) {
      formData.append('server_banner', profileData.server_banner);
    } else if (typeof profileData.server_banner === 'string' && profileData.server_banner && profileData.server_banner !== 'REMOVE') {
      formData.append('server_banner', profileData.server_banner);
    } else if (profileData.server_banner === null || profileData.server_banner === '' || profileData.server_banner === 'REMOVE') {
      formData.append('server_banner', '');
    }

    if (profileData.server_profile_settings !== undefined) {
      const strSettings = typeof profileData.server_profile_settings === 'string'
        ? profileData.server_profile_settings
        : JSON.stringify(profileData.server_profile_settings);
      formData.append('server_profile_settings', strSettings);
    }

    if (memberRecord) {
      try {
        const updated = await this.pb.collection('server_members').update(memberRecord.id, formData);
        memberRecord = updated;
      } catch (err) {
        // Fallback to plain JSON object update
        try {
          const plainData: any = {};
          if (profileData.member_name !== undefined) {
            plainData.member_name = profileData.member_name;
            plainData.nickname = profileData.member_name;
          }
          if (typeof profileData.server_avatar === 'string' && profileData.server_avatar !== 'REMOVE') {
            plainData.server_avatar = profileData.server_avatar;
          } else if (profileData.server_avatar === null || profileData.server_avatar === 'REMOVE') {
            plainData.server_avatar = null;
          }

          if (typeof profileData.server_banner === 'string' && profileData.server_banner !== 'REMOVE') {
            plainData.server_banner = profileData.server_banner;
          } else if (profileData.server_banner === null || profileData.server_banner === 'REMOVE') {
            plainData.server_banner = null;
          }

          if (profileData.server_profile_settings !== undefined) {
            plainData.server_profile_settings = profileData.server_profile_settings;
          }

          const updated = await this.pb.collection('server_members').update(memberRecord.id, plainData);
          memberRecord = updated;
        } catch (err2) {
          console.warn('Failed to update server member profile in PB collection:', err2);
        }
      }
    }

    // Cache local overrides for immediate reactivity and offline fallback
    try {
      if (profileData.member_name !== undefined) {
        localStorage.setItem(`server_name_${serverId}_${userId}`, profileData.member_name);
      }

      if (profileData.server_avatar === null || profileData.server_avatar === '' || profileData.server_avatar === 'REMOVE') {
        localStorage.removeItem(`server_avatar_${serverId}_${userId}`);
      } else if (typeof profileData.server_avatar === 'string') {
        safeLocalStorageSet(`server_avatar_${serverId}_${userId}`, profileData.server_avatar);
      }

      if (profileData.server_banner === null || profileData.server_banner === '' || profileData.server_banner === 'REMOVE') {
        localStorage.removeItem(`server_banner_${serverId}_${userId}`);
      } else if (typeof profileData.server_banner === 'string') {
        safeLocalStorageSet(`server_banner_${serverId}_${userId}`, profileData.server_banner);
      }

      if (profileData.server_profile_settings !== undefined) {
        const strSettings = typeof profileData.server_profile_settings === 'string'
          ? profileData.server_profile_settings
          : JSON.stringify(profileData.server_profile_settings);
        safeLocalStorageSet(`server_profile_settings_${serverId}_${userId}`, strSettings);
        if (typeof profileData.server_profile_settings === 'object' && profileData.server_profile_settings) {
          if (profileData.server_profile_settings.cardColor) safeLocalStorageSet(`server_color1_${serverId}_${userId}`, profileData.server_profile_settings.cardColor);
          if (profileData.server_profile_settings.cardColor2) safeLocalStorageSet(`server_color2_${serverId}_${userId}`, profileData.server_profile_settings.cardColor2);
          if (profileData.server_profile_settings.avatarFrameColor) safeLocalStorageSet(`server_frame_color_${serverId}_${userId}`, profileData.server_profile_settings.avatarFrameColor);
          if (profileData.server_profile_settings.bio !== undefined) localStorage.setItem(`server_bio_${serverId}_${userId}`, profileData.server_profile_settings.bio);
        }
      }

      if (memberRecord) {
        if (!this.serverMembersCache.has(serverId)) {
          this.serverMembersCache.set(serverId, new Map());
        }
        this.serverMembersCache.get(serverId)!.set(userId, memberRecord as any as ServerMember);
      }

      window.dispatchEvent(new CustomEvent('server-member-updated', {
        detail: { serverId, userId, memberName: profileData.member_name }
      }));
    } catch (e) {}

    return memberRecord as any as ServerMember;
  }

  // --- SERVER OPTIONS & USER SPECIFIC INVITES ---

  async fetchServerOptions(serverId: string): Promise<ServerOptionInvite[]> {
    if (this.isDemo) return [];
    try {
      const records = await this.pb.collection('server_options').getFullList({
        filter: `server = "${serverId}"`,
        sort: '-created'
      });
      return records.map((r: any) => ({
        id: r.id,
        server: r.server,
        target_user_id: r.target_user_id || r.user_id,
        target_username: r.target_username || r.username,
        target_display_name: r.target_display_name,
        invited_by: r.invited_by,
        status: r.status || 'waiting',
        created: r.created
      }));
    } catch (e) {
      try {
        const stored = localStorage.getItem(`server_options_${serverId}`);
        if (stored) return JSON.parse(stored);
      } catch (err) {}
      return [];
    }
  }

  async createServerOptionInvite(
    serverId: string,
    targetUserId: string,
    targetUsername: string,
    invitedBy: string,
    targetDisplayName?: string
  ): Promise<ServerOptionInvite> {
    return this.createCustomInvite(serverId, targetUserId, targetUsername, invitedBy, targetDisplayName);
  }

  async deleteServerOptionInvite(inviteId: string, serverId: string = ''): Promise<void> {
    return this.removeCustomInvite(serverId, inviteId);
  }

  async createCustomInvite(
    serverId: string,
    targetUserId: string,
    targetUsername: string,
    invitedBy: string,
    targetDisplayName?: string
  ): Promise<ServerOptionInvite> {
    const invite: ServerOptionInvite = {
      id: 'opt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      server: serverId,
      target_user_id: targetUserId,
      target_username: targetUsername,
      target_display_name: targetDisplayName || targetUsername,
      invited_by: invitedBy,
      status: 'waiting',
      created: new Date().toISOString()
    };

    if (!this.isDemo) {
      try {
        const record = await this.pb.collection('server_options').create({
          server: serverId,
          target_user_id: targetUserId,
          target_username: targetUsername,
          target_display_name: targetDisplayName || targetUsername,
          invited_by: invitedBy,
          status: 'waiting'
        });
        invite.id = record.id;
      } catch (e) {
        console.warn('Failed to save server option invite to PocketBase, using local sync:', e);
      }
    }

    // Update local storage
    try {
      const current = await this.fetchServerOptions(serverId);
      // Replace existing invite if any, else add
      const filtered = current.filter((i) => i.target_user_id !== targetUserId);
      const updated = [invite, ...filtered];
      localStorage.setItem(`server_options_${serverId}`, JSON.stringify(updated));
    } catch (err) {}

    return invite;
  }

  async markInviteJoined(serverId: string, userId: string): Promise<void> {
    if (!this.isDemo) {
      try {
        const records = await this.pb.collection('server_options').getFullList({
          filter: `server = "${serverId}" && target_user_id = "${userId}"`
        });
        for (const r of records) {
          await this.pb.collection('server_options').update(r.id, {
            status: 'joined'
          });
        }
      } catch (e) {}
    }

    try {
      const current = await this.fetchServerOptions(serverId);
      const updated = current.map((i) => {
        if (i.target_user_id === userId) {
          return { ...i, status: 'joined' as const };
        }
        return i;
      });
      localStorage.setItem(`server_options_${serverId}`, JSON.stringify(updated));
    } catch (err) {}
  }

  async removeCustomInvite(serverId: string, inviteId: string): Promise<void> {
    if (!this.isDemo) {
      try {
        await this.pb.collection('server_options').delete(inviteId);
      } catch (e) {}
    }

    try {
      const current = await this.fetchServerOptions(serverId);
      const updated = current.filter((i) => i.id !== inviteId);
      localStorage.setItem(`server_options_${serverId}`, JSON.stringify(updated));
    } catch (err) {}
  }

  subscribeToAppConfig(callback: (newUrl: string) => void): () => void {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'sirver_pb_url' && e.newValue) {
        callback(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }

  private lastHeartbeatSent: number = 0;

  async sendHeartbeat(userId: string): Promise<void> {
    if (this.isDemo || !userId) return;
    const now = Date.now();
    // Throttle to max once per 90 seconds to avoid database write lock congestion
    if (now - this.lastHeartbeatSent < 90000) return;
    this.lastHeartbeatSent = now;
    try {
      const nowIso = new Date().toISOString();
      await this.pb.collection('users').update(userId, {
        last_seen: nowIso
      });
    } catch (e) {
      // Silently ignore heartbeat failure if network drops
    }
  }

  private userListeners = new Set<(event: any) => void>();
  private usersSubscribed = false;

  private setupUsersSubscription() {
    if (this.usersSubscribed || this.isDemo) return;

    // Do not attempt to subscribe before user is authenticated
    if (!this.pb.authStore.isValid && !this.pb.authStore.model?.id) {
      return;
    }

    this.usersSubscribed = true;

    const handleEvent = (e: any) => {
      if (e?.record?.id && this.usersCache) {
        const idx = this.usersCache.findIndex((u) => u.id === e.record.id);
        if (idx >= 0) {
          const merged = mergeUserRecord(this.usersCache[idx], e.record as unknown as User);
          this.usersCache[idx] = merged;
          this.usersMapCache.set(e.record.id, merged);
        } else {
          const newUser = e.record as unknown as User;
          this.usersCache.push(newUser);
          this.usersMapCache.set(e.record.id, newUser);
        }
      }
      this.userListeners.forEach((callback) => {
        try {
          callback(e);
        } catch (cbErr) {}
      });
    };

    try {
      // First attempt subscribing to all users ('*')
      this.pb.collection('users').subscribe('*', handleEvent).catch(() => {
        // If collection-wide subscribe is rejected by PocketBase API rules (e.g. 400/403 "Something went wrong"),
        // gracefully fall back to subscribing to the current user's individual record
        const activeUserId = this.pb.authStore.model?.id;
        if (activeUserId) {
          this.pb.collection('users').subscribe(activeUserId, handleEvent).catch(() => {
            this.usersSubscribed = false;
          });
        } else {
          this.usersSubscribed = false;
        }
      });
    } catch {
      this.usersSubscribed = false;
    }
  }

  subscribeToUsers(callback: (event: any) => void): () => void {
    if (this.isDemo) return () => {};

    this.userListeners.add(callback);
    this.setupUsersSubscription();

    return () => {
      this.userListeners.delete(callback);
    };
  }

  // --- ATTACHMENT DOWNLOAD STATE PERSISTENCE ---

  async updateAttachmentDownloadedFiles(
    attachmentId: string,
    downloadRecord: DownloadedFileRecord
  ): Promise<void> {
    if (this.isDemo || !attachmentId) return;
    try {
      const record = await this.pb.collection('attachments').getOne(attachmentId).catch(() => null);
      if (!record) return;

      let existingFiles: DownloadedFileRecord[] = [];
      if (record.downloaded_files) {
        if (typeof record.downloaded_files === 'string') {
          try {
            existingFiles = JSON.parse(record.downloaded_files);
          } catch {
            existingFiles = [];
          }
        } else if (Array.isArray(record.downloaded_files)) {
          existingFiles = record.downloaded_files;
        }
      }

      // Check if entry for user already exists to avoid duplicates
      const userIdx = existingFiles.findIndex((f) => f.user_id === downloadRecord.user_id);
      if (userIdx >= 0) {
        existingFiles[userIdx] = { ...existingFiles[userIdx], ...downloadRecord };
      } else {
        existingFiles.push(downloadRecord);
      }

      await this.pb.collection('attachments').update(attachmentId, {
        downloaded_files: existingFiles
      });
    } catch (err) {
      console.warn(`Failed to update downloaded_files for attachment ${attachmentId}:`, err);
    }
  }

  async getAttachmentDownloadedFiles(attachmentId: string): Promise<DownloadedFileRecord[]> {
    if (this.isDemo || !attachmentId) return [];
    try {
      const record = await this.pb.collection('attachments').getOne(attachmentId).catch(() => null);
      if (!record || !record.downloaded_files) return [];
      if (typeof record.downloaded_files === 'string') {
        try {
          return JSON.parse(record.downloaded_files);
        } catch {
          return [];
        }
      } else if (Array.isArray(record.downloaded_files)) {
        return record.downloaded_files;
      }
    } catch (e) {
      console.warn('Failed to fetch attachment downloaded_files:', e);
    }
    return [];
  }

  async kickServerMember(serverId: string, targetUserId: string): Promise<boolean> {
    if (!serverId || !targetUserId) return false;

    if (!this.isDemo) {
      try {
        const records = await this.pb.collection('server_members').getFullList({
          filter: `server = "${serverId}" && (user = "${targetUserId}" || id = "${targetUserId}")`
        });
        for (const r of records) {
          try {
            await this.pb.collection('server_members').update(r.id, {
              is_member: false,
              membership_status: 'kicked',
              left_at: new Date().toISOString()
            });
          } catch (e) {
            try {
              await this.pb.collection('server_members').delete(r.id);
            } catch (delErr) {}
          }
        }
      } catch (err) {
        console.warn('Failed to kick member in PocketBase:', err);
      }
    }

    try {
      localStorage.setItem(`is_member_${serverId}_${targetUserId}`, 'false');
      localStorage.setItem(`membership_status_${serverId}_${targetUserId}`, 'kicked');
      localStorage.setItem(`left_at_${serverId}_${targetUserId}`, new Date().toISOString());

      if (this.serverMembersCache.has(serverId)) {
        this.serverMembersCache.get(serverId)!.delete(targetUserId);
      }

      window.dispatchEvent(new CustomEvent('server-member-updated', {
        detail: { serverId, userId: targetUserId, status: 'kicked', isMember: false }
      }));
    } catch (e) {}

    return true;
  }

  // --- SERVER EMOJIS & STICKERS ---

  async fetchServerEmojis(serverId: string): Promise<ServerEmoji[]> {
    if (!serverId) return [];
    let localEmojis: ServerEmoji[] = [];
    try {
      const stored = localStorage.getItem(`server_emojis_${serverId}`);
      if (stored) localEmojis = JSON.parse(stored);
    } catch (e) {}

    if (this.isDemo) return localEmojis;

    try {
      const records = await this.pb.collection('server_emojis').getFullList({
        filter: `server = "${serverId}" || server_id = "${serverId}"`,
        sort: '-created'
      });
      const remote: ServerEmoji[] = records.map((r: any): ServerEmoji => ({
        id: r.id,
        server_id: r.server || r.server_id || serverId,
        name: r.name,
        url: r.file ? `${this.getServerUrl()}/api/files/server_emojis/${r.id}/${r.file}` : (r.url || ''),
        animated: !!(r.name?.endsWith('.gif') || r.file?.endsWith('.gif') || r.animated),
        type: r.type || 'emoji',
        created: r.created
      }));

      const merged: ServerEmoji[] = [...remote];
      for (const loc of localEmojis) {
        if (!merged.some(m => m.id === loc.id || m.name === loc.name)) {
          merged.push(loc);
        }
      }
      try {
        localStorage.setItem(`server_emojis_${serverId}`, JSON.stringify(merged));
      } catch (e) {}
      return merged;
    } catch (e) {
      return localEmojis;
    }
  }

  async uploadServerEmoji(serverId: string, name: string, file: File, type: 'emoji' | 'sticker' = 'emoji'): Promise<ServerEmoji> {
    const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const isAnim = file.name.endsWith('.gif') || file.type.includes('gif');
    const localUrl = URL.createObjectURL(file);

    const newEmoji: ServerEmoji = {
      id: 'emoji-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      server_id: serverId,
      name: cleanName,
      url: localUrl,
      animated: isAnim,
      type,
      created_by: this.getCurrentUser()?.id,
      created: new Date().toISOString()
    };

    try {
      const existing = await this.fetchServerEmojis(serverId);
      const updated = [newEmoji, ...existing];
      localStorage.setItem(`server_emojis_${serverId}`, JSON.stringify(updated));
    } catch (e) {}

    if (!this.isDemo) {
      try {
        const formData = new FormData();
        formData.append('server', serverId);
        formData.append('server_id', serverId);
        formData.append('name', cleanName);
        formData.append('file', file);
        formData.append('type', type);
        formData.append('animated', String(isAnim));
        const rec = await this.pb.collection('server_emojis').create(formData);
        newEmoji.id = rec.id;
        if (rec.file) {
          newEmoji.url = `${this.getServerUrl()}/api/files/server_emojis/${rec.id}/${rec.file}`;
        }
      } catch (e) {
        console.warn('Server emoji collection upload fallback:', e);
      }
    }

    return newEmoji;
  }

  async deleteServerEmoji(serverId: string, emojiId: string): Promise<boolean> {
    if (!this.isDemo) {
      try {
        await this.pb.collection('server_emojis').delete(emojiId);
      } catch (e) {}
    }
    try {
      const current = await this.fetchServerEmojis(serverId);
      const filtered = current.filter(e => e.id !== emojiId);
      localStorage.setItem(`server_emojis_${serverId}`, JSON.stringify(filtered));
    } catch (e) {}
    return true;
  }

  async updateUserSettings(userId: string, settings: any): Promise<any> {
    try {
      if (!this.isDemo) {
        return await this.pb.collection('users').update(userId, { settings });
      }
    } catch (e) {
      console.warn('Failed to update user settings in PocketBase:', e);
    }
    return null;
  }
}

export const pbService = new PocketBaseService();

export function parseChannelOptions(chan: Channel): ChannelOptions {
  if (!chan) return {};
  let opts: ChannelOptions = {};
  if (chan.channel_options) {
    if (typeof chan.channel_options === 'string') {
      try {
        opts = JSON.parse(chan.channel_options);
      } catch (e) {
        opts = {};
      }
    } else if (typeof chan.channel_options === 'object') {
      opts = chan.channel_options;
    }
  }
  try {
    const local = localStorage.getItem(`channel_options_${chan.id}`);
    if (local) {
      const parsed = JSON.parse(local);
      opts = { ...parsed, ...opts };
    }
  } catch (e) {}

  if (!opts.icon && chan.icon) opts.icon = chan.icon;
  if (!opts.visible_roles && chan.visible_roles) opts.visible_roles = chan.visible_roles;
  if (!opts.user_limit && chan.user_limit) opts.user_limit = chan.user_limit;
  return opts;
}

export default pbService;
