export interface NotificationItem {
  id: string;
  type?: 'dm' | 'reply' | 'mention' | 'friend_request' | 'system';
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  channel_id?: string;
  channel_name?: string;
  server_id?: string;
  private_chat_id?: string;
  message_id?: string;
  message_content?: string;
  message?: string;
  created: string;
  read: boolean;
}

export interface CustomStatus {
  text?: string;
  emoji?: string;
  activityType?: 'custom' | 'playing' | 'listening' | 'streaming' | 'watching';
  expiresAt?: string;
}

export interface ProfileFrame {
  id: string;
  name: string;
  nameAr: string;
  category: 'anime' | 'gaming' | 'cyberpunk' | 'aesthetic' | 'special';
  borderGradient: string;
  glowEffect: string;
  badgeIcon?: string;
  animationClass?: string;
}

export interface ServerEmoji {
  id: string;
  server_id: string;
  name: string;
  url: string;
  animated?: boolean;
  type?: 'emoji' | 'sticker';
  created_by?: string;
  created?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  avatar_processed?: boolean;
  avatar_original?: string;
  banner?: string;
  role: 'admin' | 'user' | 'half-admin';
  display_name?: string;
  status: 'online' | 'offline' | 'away' | 'dnd';
  custom_status?: CustomStatus | string;
  profile_frame?: string;
  last_seen?: string;
  preferred_language?: string;
  preferredLanguage?: string;
  bio?: string;
  language?: string;
  friends?: string[];
  blocked_users?: string[];
  in_servers?: string[];
  expand?: { in_servers?: Server[]; [key: string]: any };
  settings?: any;
  notifications?: NotificationItem[] | string;
  created?: string;
  updated?: string;
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  banner?: string;
  owner?: string;
  default_channel?: string;
  created?: string;
  cooldown?: number;
}

export type PermissionState = 'allow' | 'deny' | 'inherit';

export interface ChannelPermissionOverride {
  [permissionKey: string]: PermissionState;
}

export interface ChannelOptions {
  icon?: string;
  visible_roles?: string[];
  denied_roles?: string[];
  user_limit?: number;
  permission_overrides?: Record<string, ChannelPermissionOverride>;
}

export interface Channel {
  id: string;
  name: string;
  server: string;
  type: 'text' | 'voice' | 'stream';
  position?: string;
  topic?: string;
  description?: string;
  created?: string;
  cooldown?: number;
  user_limit?: number;
  Pinned_messages?: string[];
  pinned_messages?: string[];
  channel_options?: ChannelOptions | string;
  icon?: string;
  visible_roles?: string[];
  denied_roles?: string[];
  permission_overrides?: Record<string, ChannelPermissionOverride>;
  recipientUser?: User;
  recipientId?: string;
  members?: string[];
  updated?: string;
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  channel: string;
  reply_to?: string;
  reactions?: Record<string, string[]> | { emoji: string; users: string[] }[] | string;
  edited?: boolean;
  deleted?: boolean;
  deleted_at?: string;
  pinned?: boolean;
  has_attachment?: boolean;
  attachments?: (Attachment | string)[];
  is_spoiler?: boolean;
  created?: string;
  updated?: string;
  edited_at?: string;
  expand?: {
    sender?: User;
    reply_to?: Message;
    'attachments(message)'?: Attachment[];
    'private_attachments(message)'?: Attachment[];
    attachments?: Attachment[];
    private_attachments?: Attachment[];
    [key: string]: any;
  };
  is_pending?: boolean; // For local echo
}

export interface DownloadedFileRecord {
  user_id: string;
  original_filename: string;
  saved_filename: string;
  local_path: string;
  download_status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'missing';
  downloaded_at: string;
  file_size?: number;
  attachment_version?: string;
  checksum?: string;
}

export interface Attachment {
  id: string;
  file: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
  cover_url?: string;
  displayName?: string;
  uploader?: string;
  message?: string;
  type?: string;
  size?: string;
  width?: string;
  height?: string;
  duration?: string;
  created?: string;
  downloaded_files?: DownloadedFileRecord[] | string;
  collectionName?: string;
  isPrivate?: boolean;
  is_spoiler?: boolean;
  '@collectionName'?: string;
  url?: string;
}

export interface Call {
  id: string;
  call?: string;
  channel: string;
  started_by: string;
  created?: string;
}

export interface ServerRole {
  id: string;
  server: string;
  name: string;
  emoji?: string;
  color?: string;
  is_default?: boolean;
  role_settings?: any;
  permissions?: {
    send_messages?: boolean;
    manage_channels?: boolean;
    manage_roles?: boolean;
    manage_server?: boolean;
    kick_members?: boolean;
    pin_messages?: boolean;
  };
  created?: string;
}

export interface ServerOptionInvite {
  id: string;
  server: string;
  target_user_id: string;
  target_username: string;
  target_display_name?: string;
  invited_by: string;
  status: 'waiting' | 'joined';
  created?: string;
}

export interface ServerMember {
  id: string;
  member_name?: string;
  server: string;
  user: string;
  nickname?: string;
  server_avatar?: string;
  server_banner?: string;
  server_profile_settings?: any;
  joined_at?: string;
  muted?: boolean;
  banned?: boolean;
  role?: string;
  role_id?: string;
  expand?: {
    user?: User;
    role?: ServerRole;
  };
  last_visited_channel?: string;
  created?: string;
  is_member?: boolean;
  left_at?: string | null;
  membership_status?: 'active' | 'left' | 'banned' | 'kicked';
}

export interface Translation {
  key: string;
  en: string;
  ar: string;
  category?: string;
  translations?: Record<string, string>;
}

export interface AppLanguageConfig {
  [key: string]: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist?: string;
  url: string;
  duration?: string;
  coverUrl?: string;
  senderAvatar?: string;
  filename?: string;
  mimeType?: string;
  playlist?: MusicTrack[];
  playlistIndex?: number;
}

export interface UnreadChannelInfo {
  channelId: string;
  serverId: string;
  count: number;
  hasMention: boolean;
  lastMentionMsgId?: string;
}

export interface AppUpdateRecord {
  id: string;
  version: string;
  channel: 'stable' | 'beta' | 'nightly' | string;
  platform: 'windows' | 'linux' | 'mac' | 'android' | 'web' | string;
  download_url: string;
  checksum?: string;
  file_size?: number;
  mandatory?: boolean;
  release_notes?: string;
  published?: boolean;
  release_date?: string;
  minimum_version?: string;
  filename?: string;
  created?: string;
  updated?: string;
}
