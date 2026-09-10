import React, { useState, useEffect } from 'react';
import { Server, Channel, User, ServerRole, ServerOptionInvite, ServerMember, ChannelOptions } from '../types';
import { pbService, getServerIconUrl, getServerBannerUrl, parseChannelOptions } from '../pocketbase';
import { X, Save, Trash2, Edit3, Plus, Shield, Hash, Volume2, Lock, Users, AlertTriangle, Upload, Eye, UserPlus, Check, Clock, Sparkles, User as UserIcon, Camera, RotateCcw, UserX, LogOut } from 'lucide-react';
import { setServerPassword, getServerPassword } from '../lib/serverPassword';
import { optimizeImage } from '../lib/imageOptimizer';
import { safeLocalStorageSet, safeLocalStorageGet } from '../lib/storageManager';

const ROLE_EMOJI_PRESETS = ['👑', '🛡️', '⭐', '🚀', '🎨', '💎', '⚡', '🌟', '🎮', '⚔️', '🔮', '🔊', '📜', '👾', '🎯', '🏆', '🎖️', '🌐', '🔒', '⚜️', '☣️', '🐉'];
const CHANNEL_ICON_PRESETS = [
  '💬', '📢', '🔊', '🎮', '🤖', '📌', '🎨', '💡', '🔒', '📜',
  '🏆', '🎵', '🌟', '🔮', '⚔️', '🎯', '🎁', '🚀', '💻', '⚙️',
  '📁', '🧠', '🍿', '🌐', '🍔', '⚡', '🛡️', '💎', '👑', '🛠️',
  '📊', '🎧', '🎬', '📚', '☕', '🔥', '✨', '🕹️', '#'
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface ServerSettingsModalProps {
  server: Server;
  channels: Channel[];
  currentUser: User;
  onClose: () => void;
  onServerUpdated: (updatedServer: Server) => void;
  onServerDeleted: (serverId: string) => void;
  onChannelCreated: (channel: Channel) => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelDeleted: (channelId: string) => void;
  t: (key: string) => string;
  lang?: 'en' | 'ar';
  theme?: string;
  onLeaveServer?: (server: Server) => void;
}

export default function ServerSettingsModal({
  server,
  channels,
  currentUser,
  onClose,
  onServerUpdated,
  onServerDeleted,
  onChannelCreated,
  onChannelUpdated,
  onChannelDeleted,
  t,
  lang = 'en',
  theme = 'slate',
  onLeaveServer
}: ServerSettingsModalProps) {
  const isLight = theme === 'light';
  const isAr = lang === 'ar';

  const [activeTab, setActiveTab] = useState<'overview' | 'server_profile' | 'channels' | 'roles' | 'invites' | 'ownership' | 'danger'>('overview');
  const [transferTargetUserId, setTransferTargetUserId] = useState<string>('');
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferringOwnership, setTransferringOwnership] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  // Overview state
  const [serverName, setServerName] = useState(server.name || '');
  const [serverDesc, setServerDesc] = useState(server.description || '');
  const [serverPassword, setServerPasswordState] = useState(() => getServerPassword(server.description) || '');
  const [serverCooldown, setServerCooldown] = useState(server.cooldown || 0);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  // Server Profile Override state for current user
  const defaultMainColor1 = localStorage.getItem('user_card_color1') || (currentUser as any)?.settings?.cardColor || (currentUser as any)?.color1 || (currentUser as any)?.cardColor || '#1e293b';
  const defaultMainColor2 = localStorage.getItem('user_card_color2') || (currentUser as any)?.settings?.cardColor2 || (currentUser as any)?.color2 || (currentUser as any)?.cardColor2 || '#0f172a';
  const defaultMainFrame = localStorage.getItem('user_frame_color') || (currentUser as any)?.settings?.avatarFrameColor || (currentUser as any)?.frameColor || defaultMainColor1;

  const [myServerNickname, setMyServerNickname] = useState('');
  const [myServerAvatarPreview, setMyServerAvatarPreview] = useState<string | null>(null);
  const [myServerBannerPreview, setMyServerBannerPreview] = useState<string | null>(null);
  const [myServerAvatarFile, setMyServerAvatarFile] = useState<File | null>(null);
  const [myServerBannerFile, setMyServerBannerFile] = useState<File | null>(null);
  const [myServerColor1, setMyServerColor1] = useState(defaultMainColor1);
  const [myServerColor2, setMyServerColor2] = useState(defaultMainColor2);
  const [myServerFrameColor, setMyServerFrameColor] = useState(defaultMainFrame);
  const [myServerBio, setMyServerBio] = useState('');

  // Editing channel state
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editChanName, setEditChanName] = useState('');
  const [editChanTopic, setEditChanTopic] = useState('');
  const [editChanCooldown, setEditChanCooldown] = useState(0);
  const [editChanIcon, setEditChanIcon] = useState('💬');
  const [editChanRoles, setEditChanRoles] = useState<string[]>([]);
  const [editChanDeniedRoles, setEditChanDeniedRoles] = useState<string[]>([]);
  const [editChanUserLimit, setEditChanUserLimit] = useState<number>(8);

  // New channel state
  const [showNewChan, setShowNewChan] = useState(false);
  const [newChanName, setNewChanName] = useState('');
  const [newChanType, setNewChanType] = useState<'text' | 'voice'>('text');
  const [newChanTopic, setNewChanTopic] = useState('');
  const [newChanIcon, setNewChanIcon] = useState('💬');
  const [newChanRoles, setNewChanRoles] = useState<string[]>([]);
  const [newChanDeniedRoles, setNewChanDeniedRoles] = useState<string[]>([]);
  const [newChanUserLimit, setNewChanUserLimit] = useState<number>(8);

  // Roles state
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

  // User Invites state (server_options)
  const [serverOptions, setServerOptions] = useState<ServerOptionInvite[]>([]);
  const [inviteSearchUser, setInviteSearchUser] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Confirmation dialog state
  const [deleteChannelConfirm, setDeleteChannelConfirm] = useState<Channel | null>(null);
  const [deleteServerConfirm, setDeleteServerConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isRoleDefault, setIsRoleDefault] = useState(false);

  // Compute permissions to manage server settings
  const isOwner = Boolean(server.owner === currentUser.id || !server.owner);
  const currentMember = serverMembers.find((m) => m.user === currentUser.id || m.id === currentUser.id);
  const myRoleId = currentMember?.role_id || currentMember?.role;
  const myRole = rolesList.find((r) => r.id === myRoleId || r.name === myRoleId);
  const hasManagePermission = isOwner || Boolean(
    myRole?.permissions?.manage_server ||
    myRole?.permissions?.manage_channels ||
    myRole?.permissions?.manage_roles
  );

  useEffect(() => {
    // If current member is not owner/manager, default tab to server_profile
    if (!hasManagePermission) {
      setActiveTab('server_profile');
    }
  }, [hasManagePermission]);

  useEffect(() => {
    // Initialize server profile overrides
    const m = serverMembers.find((mem) => mem.user === currentUser.id || mem.id === currentUser.id);
    const localName = localStorage.getItem(`server_name_${server.id}_${currentUser.id}`);
    const localAvatar = localStorage.getItem(`server_avatar_${server.id}_${currentUser.id}`);
    const localBanner = localStorage.getItem(`server_banner_${server.id}_${currentUser.id}`);

    setMyServerNickname(m?.member_name || m?.nickname || localName || '');
    setMyServerAvatarPreview(m?.server_avatar || localAvatar || null);
    setMyServerBannerPreview(m?.server_banner || localBanner || null);

    let sSettings: any = {};
    if (m?.server_profile_settings) {
      if (typeof m.server_profile_settings === 'string') {
        try { sSettings = JSON.parse(m.server_profile_settings); } catch {}
      } else if (typeof m.server_profile_settings === 'object') {
        sSettings = m.server_profile_settings;
      }
    }
    const cachedS = localStorage.getItem(`server_profile_settings_${server.id}_${currentUser.id}`);
    if (cachedS) {
      try { sSettings = { ...sSettings, ...JSON.parse(cachedS) }; } catch {}
    }

    const defaultMainColor1 = localStorage.getItem('user_card_color1') || (currentUser as any)?.settings?.cardColor || (currentUser as any)?.color1 || (currentUser as any)?.cardColor || '#1e293b';
    const defaultMainColor2 = localStorage.getItem('user_card_color2') || (currentUser as any)?.settings?.cardColor2 || (currentUser as any)?.color2 || (currentUser as any)?.cardColor2 || '#0f172a';
    const defaultMainFrame = localStorage.getItem('user_frame_color') || (currentUser as any)?.settings?.avatarFrameColor || (currentUser as any)?.frameColor || defaultMainColor1;

    setMyServerColor1(sSettings.cardColor || localStorage.getItem(`server_color1_${server.id}_${currentUser.id}`) || defaultMainColor1);
    setMyServerColor2(sSettings.cardColor2 || localStorage.getItem(`server_color2_${server.id}_${currentUser.id}`) || defaultMainColor2);
    setMyServerFrameColor(sSettings.avatarFrameColor || localStorage.getItem(`server_frame_color_${server.id}_${currentUser.id}`) || defaultMainFrame);
    setMyServerBio(sSettings.bio || localStorage.getItem(`server_bio_${server.id}_${currentUser.id}`) || '');
  }, [serverMembers, server.id, currentUser.id]);

  useEffect(() => {
    // Load server roles, members, and user-specific invites (server_options)
    loadRolesAndMembers();
    loadServerOptions();
  }, [server.id]);

  const loadRolesAndMembers = async () => {
    try {
      const [roles, members, allUsers] = await Promise.all([
        pbService.fetchServerRoles(server.id),
        pbService.fetchServerMembers(server.id),
        pbService.fetchAllUsers()
      ]);
      const defaultRoleId = localStorage.getItem(`default_role_${server.id}`);
      setRolesList(roles.map((r) => ({
        ...r,
        is_default: r.id === defaultRoleId
      })));

      const memberUserIds = new Set(members.map((m) => m.user));
      const mergedMembers = [...members];

      allUsers.forEach((u) => {
        if (!memberUserIds.has(u.id)) {
          const cachedRole = localStorage.getItem(`member_role_${server.id}_${u.id}`) || '';
          mergedMembers.push({
            id: `member-${u.id}`,
            server: server.id,
            user: u.id,
            member_name: u.display_name || u.username,
            role: cachedRole,
            role_id: cachedRole,
            expand: { user: u }
          } as any);
        }
      });

      setServerMembers(mergedMembers);
    } catch (e) {
      console.warn('Failed to load roles or members:', e);
    }
  };

  const loadServerOptions = async () => {
    try {
      const options = await pbService.fetchServerOptions(server.id);
      setServerOptions(options);
    } catch (e) {
      console.warn('Failed to load server options:', e);
    }
  };

  const handleSearchUsersToInvite = async (q: string) => {
    setInviteSearchUser(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const users = await pbService.fetchAllUsers();
      const filtered = users.filter((u) => 
        u.id !== currentUser.id &&
        (u.username?.toLowerCase().includes(q.toLowerCase()) ||
         u.display_name?.toLowerCase().includes(q.toLowerCase()))
      );
      setSearchResults(filtered.slice(0, 5));
    } catch (e) {
      console.warn(e);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSendSpecificInvite = async (targetUser: User) => {
    try {
      const invite = await pbService.createCustomInvite(
        server.id,
        targetUser.id,
        targetUser.username,
        currentUser.id,
        targetUser.display_name || targetUser.username
      );

      // Send notification to target user
      await pbService.addNotificationToUser(targetUser.id, {
        id: 'notif-inv-' + Date.now(),
        type: 'system',
        sender_id: currentUser.id,
        sender_name: currentUser.display_name || currentUser.username,
        server_id: server.id,
        message_content: isAr
          ? `دعوة إلى ${targetUser.display_name || targetUser.username} للانضمام إلى سيرفر "${server.name}"`
          : `Invite to ${targetUser.display_name || targetUser.username} to join server "${server.name}"`,
        created: new Date().toISOString(),
        read: false
      });

      setServerOptions((prev) => [invite, ...prev.filter((i) => i.target_user_id !== targetUser.id)]);
      setInviteSearchUser('');
      setSearchResults([]);
      setSuccess(isAr ? `تم إرسال الدعوة إلى ${targetUser.display_name || targetUser.username}` : `Sent invite to ${targetUser.display_name || targetUser.username}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to send invite');
    }
  };

  const handleRemoveInvite = async (inviteId: string) => {
    try {
      await pbService.removeCustomInvite(server.id, inviteId);
      setServerOptions((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (e) {
      console.warn(e);
    }
  };

  const handleToggleDefaultRole = (roleId: string) => {
    const currentDefault = localStorage.getItem(`default_role_${server.id}`);
    if (currentDefault === roleId) {
      localStorage.removeItem(`default_role_${server.id}`);
      setRolesList((prev) => prev.map((r) => ({ ...r, is_default: false })));
      setSuccess(isAr ? 'تم إلغاء تعيين الرتبة الافتراضية' : 'Default role unset');
    } else {
      localStorage.setItem(`default_role_${server.id}`, roleId);
      setRolesList((prev) => prev.map((r) => ({ ...r, is_default: r.id === roleId })));
      setSuccess(isAr ? 'تم تعيين هذه الرتبة كرتبة افتراضية للأعضاء الجدد عند الانضمام ⭐' : 'Set as default role for new members!');
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;
    setLoading(true);
    try {
      let savedRoleId = editingRole?.id;
      if (editingRole) {
        const updated = await pbService.updateServerRole(server.id, editingRole.id, {
          name: roleName.trim(),
          emoji: roleEmoji,
          color: roleColor,
          permissions: rolePerms
        });
        savedRoleId = updated.id;
        setRolesList((prev) => prev.map((r) => r.id === editingRole.id ? { ...updated, is_default: isRoleDefault } : (isRoleDefault ? { ...r, is_default: false } : r)));
        setEditingRole(null);
        setSuccess(isAr ? 'تم تحديث الرتبة!' : 'Role updated!');
      } else {
        const created = await pbService.createServerRole(server.id, {
          name: roleName.trim(),
          emoji: roleEmoji,
          color: roleColor,
          permissions: rolePerms
        });
        savedRoleId = created.id;
        setRolesList((prev) => [{ ...created, is_default: isRoleDefault }, ...prev.map((r) => isRoleDefault ? { ...r, is_default: false } : r)]);
        setShowCreateRole(false);
        setSuccess(isAr ? 'تمت إضافة الرتبة الجديدة!' : 'New role created!');
      }

      if (isRoleDefault && savedRoleId) {
        localStorage.setItem(`default_role_${server.id}`, savedRoleId);
      } else if (!isRoleDefault && savedRoleId && localStorage.getItem(`default_role_${server.id}`) === savedRoleId) {
        localStorage.removeItem(`default_role_${server.id}`);
      }

      setRoleName('');
      setIsRoleDefault(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save role');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      await pbService.deleteServerRole(server.id, roleId);
      setRolesList((prev) => prev.filter((r) => r.id !== roleId));
      setSuccess(isAr ? 'تم حذف الرتبة' : 'Role deleted');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleAssignMemberRole = async (memberUserId: string, roleIdOrName: string) => {
    try {
      await pbService.updateMemberRole(server.id, memberUserId, roleIdOrName);
      setServerMembers((prev) => prev.map((m) => {
        if (m.user === memberUserId || m.id === memberUserId) {
          return { ...m, role: roleIdOrName, role_id: roleIdOrName };
        }
        return m;
      }));
      setSuccess(isAr ? 'تم تعيين الرتبة للعضو!' : 'Role assigned to member!');
    } catch (e) {
      console.warn(e);
    }
  };

  const getServerBannerUrl = () => {
    if (bannerPreview) return bannerPreview;
    const cached = localStorage.getItem(`server_banner_${server.id}`);
    if (cached) return cached;
    if (server.banner) {
      if (server.banner.startsWith('blob:') || server.banner.startsWith('http') || server.banner.startsWith('data:')) {
        return server.banner;
      }
      return `${pbService.getServerUrl()}/api/files/servers/${server.id}/${server.banner}`;
    }
    return '';
  };

  const getServerIconDisplayUrl = () => {
    if (iconPreview) return iconPreview;
    const cached = localStorage.getItem(`server_icon_${server.id}`);
    if (cached) return cached;
    return getServerIconUrl(server);
  };

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const originalFile = e.target.files[0];
      const file = await optimizeImage(originalFile, { maxWidth: 512, maxHeight: 512 });
      setIconFile(file);
      if (iconPreview && iconPreview.startsWith('blob:')) {
        try { URL.revokeObjectURL(iconPreview); } catch (err) {}
      }
      setIconPreview(URL.createObjectURL(file));
    }
  };

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const originalFile = e.target.files[0];
      const file = await optimizeImage(originalFile, { maxWidth: 1200, maxHeight: 400 });
      setBannerFile(file);
      if (bannerPreview && bannerPreview.startsWith('blob:')) {
        try { URL.revokeObjectURL(bannerPreview); } catch (err) {}
      }
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const finalDesc = setServerPassword(serverDesc.trim(), serverPassword.trim() || undefined);

      if (iconFile) {
        try {
          const iconDataUrl = await readFileAsDataUrl(iconFile);
          safeLocalStorageSet(`server_icon_${server.id}`, iconDataUrl);
        } catch (e) {
          console.warn('Failed to read icon file', e);
        }
      }

      if (bannerFile) {
        try {
          const bannerDataUrl = await readFileAsDataUrl(bannerFile);
          safeLocalStorageSet(`server_banner_${server.id}`, bannerDataUrl);
        } catch (e) {
          console.warn('Failed to read banner file', e);
        }
      }

      const updated = await pbService.updateServer(server.id, {
        name: serverName.trim(),
        description: finalDesc,
        cooldown: serverCooldown
      });

      if (iconFile || bannerFile) {
        try {
          const formData = new FormData();
          if (iconFile) formData.append('icon', iconFile);
          if (bannerFile) formData.append('banner', bannerFile);
          await pbService.getPbInstance().collection('servers').update(server.id, formData);
        } catch (e) {
          console.warn('PocketBase server update notice:', e);
        }
      }

      let freshServer: Server = updated;
      try {
        const fetched = await pbService.getPbInstance().collection('servers').getOne(server.id);
        if (fetched) freshServer = fetched as any as Server;
      } catch (e) {}

      onServerUpdated(freshServer);
      setSuccess(isAr ? 'تم حفظ التغييرات بنجاح!' : 'Server updated successfully!');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to update server');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let avatarVal: File | string | null = myServerAvatarFile;
      if (!avatarVal) {
        if (myServerAvatarPreview === 'REMOVE') {
          avatarVal = null;
        } else if (myServerAvatarPreview) {
          avatarVal = myServerAvatarPreview;
        }
      }

      let bannerVal: File | string | null = myServerBannerFile;
      if (!bannerVal) {
        if (myServerBannerPreview === 'REMOVE') {
          bannerVal = null;
        } else if (myServerBannerPreview) {
          bannerVal = myServerBannerPreview;
        }
      }

      const serverProfileSettingsObj = {
        cardColor: myServerColor1,
        cardColor2: myServerColor2,
        avatarFrameColor: myServerFrameColor,
        bio: myServerBio.trim()
      };

      await pbService.updateServerMemberProfile(server.id, currentUser.id, {
        member_name: myServerNickname.trim(),
        server_avatar: avatarVal,
        server_banner: bannerVal,
        server_profile_settings: serverProfileSettingsObj
      });

      setSuccess(isAr ? 'تم حفظ البروفايل الخاص بالسيرفر بنجاح!' : 'Server profile updated successfully!');
      await loadRolesAndMembers();
    } catch (err: any) {
      console.error('Failed to update server profile:', err);
      setError(err?.message || 'Failed to update server profile');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTransferOwnership = async () => {
    if (!transferTargetUserId || transferringOwnership) return;
    setTransferringOwnership(true);
    setTransferError(null);
    setTransferSuccess(null);
    try {
      const updatedServer = await pbService.transferServerOwnership(server.id, transferTargetUserId);
      onServerUpdated(updatedServer);
      setTransferSuccess(
        isAr ? 'تم نقل الملكية بنجاح!' : 'Ownership transferred successfully!'
      );
      setShowTransferConfirm(false);
      setActiveTab('server_profile');
    } catch (err: any) {
      console.error('Failed to transfer ownership:', err);
      setTransferError(
        err?.message || (isAr ? 'فشل نقل الملكية. يرجى المحاولة لاحقاً.' : 'Failed to transfer ownership.')
      );
    } finally {
      setTransferringOwnership(false);
    }
  };

  const handleResetServerProfile = async () => {
    if (!server || !currentUser) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      localStorage.removeItem(`server_name_${server.id}_${currentUser.id}`);
      localStorage.removeItem(`server_avatar_${server.id}_${currentUser.id}`);
      localStorage.removeItem(`server_banner_${server.id}_${currentUser.id}`);
      localStorage.removeItem(`server_color1_${server.id}_${currentUser.id}`);
      localStorage.removeItem(`server_color2_${server.id}_${currentUser.id}`);
      localStorage.removeItem(`server_frame_color_${server.id}_${currentUser.id}`);
      localStorage.removeItem(`server_bio_${server.id}_${currentUser.id}`);
      localStorage.removeItem(`server_profile_settings_${server.id}_${currentUser.id}`);

      await pbService.updateServerMemberProfile(server.id, currentUser.id, {
        member_name: '',
        server_avatar: null,
        server_banner: null,
        server_profile_settings: null
      });

      setMyServerNickname('');
      setMyServerAvatarPreview(null);
      setMyServerBannerPreview(null);
      setMyServerAvatarFile(null);
      setMyServerBannerFile(null);
      const defCol1 = (currentUser as any)?.cardColor || (currentUser as any)?.color1 || '#1e293b';
      const defCol2 = (currentUser as any)?.cardColor2 || (currentUser as any)?.color2 || '#0f172a';
      const defFrame = (currentUser as any)?.avatarFrameColor || (currentUser as any)?.frameColor || defCol1;
      setMyServerColor1(defCol1);
      setMyServerColor2(defCol2);
      setMyServerFrameColor(defFrame);
      setMyServerBio('');

      setSuccess(isAr ? 'تمت إزالة التعديلات واستعادة بروفايلك الافتراضي بنجاح!' : 'Server profile reset to default successfully!');
      await loadRolesAndMembers();
    } catch (err: any) {
      console.error('Failed to reset server profile:', err);
      setError(err?.message || 'Failed to reset server profile');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditChannel = (ch: Channel) => {
    const opts = parseChannelOptions(ch);
    setEditingChannel(ch);
    setEditChanName(ch.name);
    setEditChanTopic(ch.topic || '');
    setEditChanCooldown(ch.cooldown || 0);
    setEditChanIcon(opts.icon || '💬');
    setEditChanRoles(opts.visible_roles || (ch as any).visible_roles || []);
    setEditChanDeniedRoles(opts.denied_roles || (ch as any).denied_roles || []);
    setEditChanUserLimit(opts.user_limit || ch.user_limit || 8);
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel || !editChanName.trim()) return;
    setLoading(true);

    try {
      const channelOptionsObj: ChannelOptions = {
        icon: editChanIcon.trim() || '💬',
        visible_roles: editChanRoles,
        denied_roles: editChanDeniedRoles,
        user_limit: editingChannel.type === 'voice' ? editChanUserLimit : undefined
      };

      const updated = await pbService.updateChannel(editingChannel.id, {
        name: editChanName.trim().toLowerCase().replace(/\s+/g, '-'),
        topic: editChanTopic.trim(),
        cooldown: editChanCooldown,
        channel_options: channelOptionsObj,
        icon: editChanIcon.trim(),
        visible_roles: editChanRoles,
        denied_roles: editChanDeniedRoles,
        user_limit: editingChannel.type === 'voice' ? editChanUserLimit : undefined
      });

      const finalUpdated: Channel = {
        ...updated,
        channel_options: channelOptionsObj,
        icon: editChanIcon.trim(),
        visible_roles: editChanRoles,
        denied_roles: editChanDeniedRoles,
        user_limit: editingChannel.type === 'voice' ? editChanUserLimit : undefined
      };

      onChannelUpdated(finalUpdated);
      setEditingChannel(null);
      setSuccess(isAr ? 'تم تحديث القناة وحفظ الإعدادات!' : 'Channel updated!');
    } catch (err: any) {
      setError(err?.message || 'Failed to update channel');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChanName.trim()) return;
    setLoading(true);

    try {
      const created = await pbService.createChannel(
        server.id,
        newChanName.trim(),
        newChanType,
        newChanTopic.trim()
      );

      const channelOptionsObj: ChannelOptions = {
        icon: newChanIcon.trim() || '💬',
        visible_roles: newChanRoles,
        user_limit: newChanType === 'voice' ? newChanUserLimit : undefined
      };

      const updated = await pbService.updateChannel(created.id, {
        channel_options: channelOptionsObj,
        icon: newChanIcon.trim(),
        visible_roles: newChanRoles,
        user_limit: newChanType === 'voice' ? newChanUserLimit : undefined
      });

      const finalChan: Channel = {
        ...updated,
        channel_options: channelOptionsObj,
        icon: newChanIcon.trim(),
        visible_roles: newChanRoles,
        user_limit: newChanType === 'voice' ? newChanUserLimit : undefined
      };

      onChannelCreated(finalChan);
      setShowNewChan(false);
      setNewChanName('');
      setNewChanTopic('');
      setNewChanIcon('💬');
      setNewChanRoles([]);
      setNewChanUserLimit(8);
      setSuccess(isAr ? 'تم إنشاء القناة وحفظ الإعدادات!' : 'Channel created!');
    } catch (err: any) {
      setError(err?.message || 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteChannel = async () => {
    if (!deleteChannelConfirm) return;
    setLoading(true);
    try {
      await pbService.deleteChannel(deleteChannelConfirm.id);
      onChannelDeleted(deleteChannelConfirm.id);
      setDeleteChannelConfirm(null);
      setSuccess(isAr ? 'تم حذف القناة!' : 'Channel deleted!');
    } catch (err: any) {
      setError(err?.message || 'Failed to delete channel');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteServer = async () => {
    setLoading(true);
    try {
      await pbService.notifyServerUsersDeleted(server.id, server.name, currentUser?.id, isAr ? 'ar' : 'en');
      await pbService.deleteServer(server.id);
      onServerDeleted(server.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 select-none" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl h-[88vh] max-h-[850px] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden border bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
        {/* Sidebar Nav */}
        <div className="w-full md:w-56 p-4 border-b md:border-b-0 md:border-r shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto scrollbar-none bg-[var(--theme-bg-primary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)]">
          <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-accent">
            {isAr ? 'إعدادات السيرفر' : 'Server Settings'}
          </div>

          {/* Server Profile Tab - Always visible to all members */}
          <button
            onClick={() => setActiveTab('server_profile')}
            className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border-0 text-left ${
              activeTab === 'server_profile'
                ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-md'
                : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>{isAr ? 'بروفايل السيرفر' : 'Server Profile'}</span>
          </button>

          {/* Management options - Only visible to Owners or members with manage permissions */}
          {hasManagePermission && (
            <>
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border-0 text-left ${
                  activeTab === 'overview'
                    ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-md'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>{isAr ? 'نظرة عامة' : 'Overview'}</span>
              </button>

              <button
                onClick={() => setActiveTab('channels')}
                className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border-0 text-left ${
                  activeTab === 'channels'
                    ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-md'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <Hash className="w-4 h-4" />
                <span>{isAr ? 'إدارة القنوات' : 'Channels'}</span>
              </button>

              <button
                onClick={() => setActiveTab('roles')}
                className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border-0 text-left ${
                  activeTab === 'roles'
                    ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-md'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>{isAr ? 'الرتب والإذونات' : 'Roles & Members'}</span>
              </button>

              <button
                onClick={() => setActiveTab('invites')}
                className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border-0 text-left ${
                  activeTab === 'invites'
                    ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-md'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span>{isAr ? 'الأمان والكلمة السرية' : 'Security & Access'}</span>
              </button>

              {server.owner === currentUser.id && (
                <button
                  onClick={() => setActiveTab('ownership')}
                  className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border-0 text-left ${
                    activeTab === 'ownership'
                      ? 'bg-amber-500 text-white shadow-md'
                      : 'text-amber-500 hover:bg-amber-500/10'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isAr ? 'نقل الملكية' : 'Transfer Ownership'}</span>
                </button>
              )}

              <div className="mt-auto pt-2 border-t border-[var(--theme-border)]">
                <button
                  onClick={() => setActiveTab('danger')}
                  className={`w-full px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer border-0 text-left ${
                    activeTab === 'danger'
                      ? 'bg-red-600 text-white shadow-md'
                      : 'text-red-400 hover:bg-red-500/10'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isAr ? 'حذف السيرفر' : 'Delete Server'}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto hover-scrollbar scrollbar-none relative bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]">
          {/* Header */}
          <div className="p-4 border-b flex justify-between items-center sticky top-0 z-20 bg-[var(--theme-bg-secondary)]/95 backdrop-blur-xs border-[var(--theme-border)] text-[var(--theme-text-primary)] shadow-xs">
            <h3 className="font-extrabold text-sm uppercase tracking-wide">
              {activeTab === 'server_profile' && (isAr ? 'تعديل البروفايل الخاص بالسيرفر' : 'Server Profile Overrides')}
              {activeTab === 'overview' && (isAr ? 'إعدادات السيرفر العامة' : 'Server Overview')}
              {activeTab === 'channels' && (isAr ? 'إدارة القنوات والتنظيم' : 'Channel Management')}
              {activeTab === 'roles' && (isAr ? 'الأعضاء والرتب' : 'Roles & Permissions')}
              {activeTab === 'invites' && (isAr ? 'حماية السيرفر والأذونات' : 'Security & Access')}
              {activeTab === 'danger' && (isAr ? 'منطقة الخطر' : 'Danger Zone')}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl transition-all cursor-pointer border-0 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Banner */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 border-0 bg-transparent"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {success && (
            <div className="mx-6 mt-4 p-3 bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-accent text-xs rounded-xl flex items-center justify-between">
              <span>{success}</span>
              <button onClick={() => setSuccess(null)} className="text-accent border-0 bg-transparent"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <div className="p-6 space-y-6">
            {/* TAB 0: SERVER PROFILE OVERRIDES */}
            {activeTab === 'server_profile' && (
              <form onSubmit={handleSaveServerProfile} className="space-y-6">
                <div className="p-5 rounded-2xl border space-y-5 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)]">
                  <div className="flex items-start gap-3 pb-4 border-b border-[var(--theme-border)]">
                    <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0 mt-0.5">
                      <UserIcon className="w-5 h-5 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h4 className="font-extrabold text-base text-[var(--theme-text-primary)]">
                        {isAr ? 'تعديل بروفايلك في هذا السيرفر' : 'Server Profile Overrides'}
                      </h4>
                      <p className="text-xs text-[var(--theme-text-muted)] font-medium leading-relaxed">
                        {isAr ? 'هذه الخيارات تغير اسمك المستعار، صورتك الشخصية، وغلافك داخل هذا السيرفر فقط دون تغيير حسابك الرئيسي. إذا لم تختر أي منها يتم الاعتماد على بيانات حسابك الرئيسية.' : 'Customize your nickname, avatar, and banner for this specific server. Defaults to your global profile if empty.'}
                      </p>
                    </div>
                  </div>

                  {/* Live Vertical Server Profile Card Preview */}
                  <div className="space-y-3 pt-2">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)] block tracking-wide">
                      {isAr ? 'معاينة بطاقة بروفايلك بالسيرفر:' : 'Server Profile Preview:'}
                    </label>
                    <div 
                      className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-5 flex flex-col gap-4 text-white"
                      style={{
                        backgroundColor: myServerColor1,
                        backgroundImage: `linear-gradient(180deg, ${myServerColor1}, ${myServerColor2})`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'top left',
                        backgroundSize: '100% 100%'
                      }}
                    >
                      {/* Banner Preview Background */}
                      <div className="relative h-28 w-full rounded-2xl overflow-hidden shadow-md">
                        {myServerBannerPreview && myServerBannerPreview !== 'REMOVE' ? (
                          <img src={myServerBannerPreview} alt="Banner Preview" className="w-full h-full object-cover" />
                        ) : currentUser.banner ? (
                          <img src={currentUser.banner.startsWith('http') || currentUser.banner.startsWith('blob:') ? currentUser.banner : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.banner}`} alt="Banner Preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-black/20 flex items-center justify-center text-xs font-bold text-white/60">
                            {isAr ? 'غلاف افتراضي' : 'Default Banner'}
                          </div>
                        )}
                      </div>

                      {/* Avatar Preview */}
                      <div className="flex items-end justify-between -mt-10 px-2 relative z-10">
                        <div 
                          style={{ background: myServerFrameColor }}
                          className="p-[3px] rounded-2xl shadow-2xl relative shrink-0"
                        >
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-900 border border-slate-950">
                            {myServerAvatarPreview && myServerAvatarPreview !== 'REMOVE' ? (
                              <img src={myServerAvatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                            ) : currentUser.avatar ? (
                              <img
                                src={currentUser.avatar.startsWith('http') || currentUser.avatar.startsWith('blob:') ? currentUser.avatar : `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`}
                                alt="Avatar Preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-black text-slate-400">
                                {(myServerNickname || currentUser.display_name || currentUser.username).substring(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-white/10 text-xs font-extrabold flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-online)] animate-pulse" />
                          <span>{isAr ? 'بروفايل السيرفر' : 'Server Profile'}</span>
                        </div>
                      </div>

                      {/* Names (1. Server Nickname/Name, 2. @username, 3. Default Name) */}
                      <div className="px-2 space-y-1 bg-black/25 p-3 rounded-2xl border border-white/10">
                        <h3 className="font-black text-lg text-white drop-shadow-sm">
                          {myServerNickname.trim() || currentUser.display_name || currentUser.username}
                        </h3>
                        <p className="text-xs font-mono text-white/80">@{currentUser.username}</p>
                        {myServerNickname.trim() && currentUser.display_name && myServerNickname.trim() !== currentUser.display_name && (
                          <p className="text-[11px] font-bold text-[var(--theme-text-secondary)] pt-1 border-t border-white/10 mt-1">
                            <span className="opacity-75">{isAr ? 'الاسم الأصلي: ' : 'Default Name: '}</span>
                            <span>{currentUser.display_name}</span>
                          </p>
                        )}
                      </div>

                      {/* Server Bio */}
                      <div className="px-2">
                        <p className="text-xs text-white/90 bg-black/25 p-3 rounded-2xl border border-white/10 font-medium">
                          {myServerBio.trim() || currentUser.bio || (isAr ? 'لا توجد نبذة شخصية مخصصة للسيرفر.' : 'No server-specific bio set.')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Nickname Input */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">{isAr ? 'الاسم المستعار في السيرفر' : 'Server Nickname'}</label>
                    <input
                      type="text"
                      value={myServerNickname}
                      onChange={(e) => setMyServerNickname(e.target.value)}
                      maxLength={35}
                      placeholder={currentUser.display_name || currentUser.username}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-bold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    />
                    <span className="text-[10px] text-[var(--theme-text-muted)]">
                      {isAr ? 'إذا تركته فارغاً سيظهر اسمك الرئيسي للجميع.' : 'If left empty, your global display name will be shown.'}
                    </span>
                  </div>

                  {/* Server Profile Colors Customization */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      <span>{isAr ? 'ألوان بطاقة بروفايل السيرفر' : 'Server Profile Colors'}</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Color 1 */}
                      <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2 bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[11px] font-extrabold truncate text-[var(--theme-text-primary)]">
                            {isAr ? 'بداية التدرج' : 'Color 1'}
                          </span>
                          <span className="text-[9px] font-mono uppercase text-[var(--theme-text-muted)]">{myServerColor1}</span>
                        </div>
                        <input
                          type="color"
                          value={myServerColor1}
                          onChange={(e) => setMyServerColor1(e.target.value)}
                          className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent shrink-0"
                        />
                      </div>

                      {/* Color 2 */}
                      <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2 bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[11px] font-extrabold truncate text-[var(--theme-text-primary)]">
                            {isAr ? 'نهاية التدرج' : 'Color 2'}
                          </span>
                          <span className="text-[9px] font-mono uppercase text-[var(--theme-text-muted)]">{myServerColor2}</span>
                        </div>
                        <input
                          type="color"
                          value={myServerColor2}
                          onChange={(e) => setMyServerColor2(e.target.value)}
                          className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent shrink-0"
                        />
                      </div>

                      {/* Frame Color */}
                      <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2 bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[11px] font-extrabold truncate text-[var(--theme-text-primary)]">
                            {isAr ? 'إطار الصورة' : 'Avatar Frame'}
                          </span>
                          <span className="text-[9px] font-mono uppercase text-[var(--theme-text-muted)]">{myServerFrameColor}</span>
                        </div>
                        <input
                          type="color"
                          value={myServerFrameColor}
                          onChange={(e) => setMyServerFrameColor(e.target.value)}
                          className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent shrink-0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Member Custom Server Bio */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">
                      {isAr ? 'نبذة شخصية خاصة بالسيرفر (Server Bio)' : 'Server Custom Bio'}
                    </label>
                    <textarea
                      rows={2}
                      value={myServerBio}
                      onChange={(e) => setMyServerBio(e.target.value)}
                      maxLength={500}
                      placeholder={currentUser.bio || (isAr ? 'اكتب نبذة خاصة بهذا السيرفر...' : 'Write a bio for this server...')}
                      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    />
                  </div>

                  {/* Avatar Upload */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">{isAr ? 'صورة السيرفر الشخصية' : 'Server Avatar'}</label>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:opacity-90 text-[var(--theme-text-primary)] text-xs font-bold cursor-pointer transition-all border border-[var(--theme-border)] flex items-center gap-2">
                        <Camera className="w-4 h-4 text-accent" />
                        <span>{isAr ? 'تغيير صورة السيرفر' : 'Upload Server Avatar'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              const file = e.target.files[0];
                              setMyServerAvatarFile(file);
                              setMyServerAvatarPreview(URL.createObjectURL(file));
                            }
                          }}
                        />
                      </label>
                      {(myServerAvatarPreview || myServerAvatarFile) && (
                        <button
                          type="button"
                          onClick={() => {
                            setMyServerAvatarFile(null);
                            setMyServerAvatarPreview('REMOVE');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold cursor-pointer border border-rose-500/20 flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isAr ? 'إعادة للافتراضي' : 'Reset to Default'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Banner Upload */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)]">{isAr ? 'غلاف السيرفر الشخصي' : 'Server Banner'}</label>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:opacity-90 text-[var(--theme-text-primary)] text-xs font-bold cursor-pointer transition-all border border-[var(--theme-border)] flex items-center gap-2">
                        <Upload className="w-4 h-4 text-accent" />
                        <span>{isAr ? 'تغيير غلاف السيرفر الشخصي' : 'Upload Server Banner'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              const file = e.target.files[0];
                              setMyServerBannerFile(file);
                              setMyServerBannerPreview(URL.createObjectURL(file));
                            }
                          }}
                        />
                      </label>
                      {(myServerBannerPreview || myServerBannerFile) && (
                        <button
                          type="button"
                          onClick={() => {
                            setMyServerBannerFile(null);
                            setMyServerBannerPreview('REMOVE');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold cursor-pointer border border-rose-500/20 flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isAr ? 'إعادة للافتراضي' : 'Reset to Default'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleResetServerProfile}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 text-red-300 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إزالة التعديلات واستعادة الافتراضي' : 'Reset Server Profile'}</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs transition-all cursor-pointer border-0 shadow-lg flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isAr ? 'حفظ بروفايل السيرفر' : 'Save Server Profile'}</span>
                  </button>
                </div>
              </form>
            )}
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <form onSubmit={handleSaveOverview} className="space-y-6">
                {/* Banner & Icon Preview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Icon Upload Card */}
                  <div className="p-4 rounded-2xl border space-y-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-accent" />
                      <span>{isAr ? 'أيقونة السيرفر (Server Icon)' : 'Server Icon'}</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-2xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                        {getServerIconDisplayUrl() ? (
                          <img src={getServerIconDisplayUrl()} alt="Icon" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-accent text-[var(--theme-accent-contrast,#ffffff)] flex items-center justify-center font-black text-sm">
                            {serverName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <label className="px-3.5 py-2.5 rounded-xl bg-[var(--theme-bg-tertiary)] hover:opacity-90 text-[var(--theme-text-primary)] text-xs font-bold transition-all cursor-pointer border border-[var(--theme-border)] flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5 text-accent" />
                        <span>{isAr ? 'تغيير أيقونة السيرفر' : 'Upload Icon'}</span>
                        <input type="file" accept="image/*" onChange={handleIconChange} className="hidden" />
                      </label>
                    </div>
                  </div>

                  {/* Banner Upload Card */}
                  <div className="p-4 rounded-2xl border space-y-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                    <label className="text-xs font-bold text-[var(--theme-text-muted)] flex items-center gap-2">
                      <Upload className="w-4 h-4 text-accent" />
                      <span>{isAr ? 'غلاف السيرفر (Server Banner)' : 'Server Banner'}</span>
                    </label>
                    <div className="space-y-2">
                      <div className="h-16 w-full rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] overflow-hidden relative flex items-center justify-center shadow-md">
                        {getServerBannerUrl() ? (
                          <img src={getServerBannerUrl()} alt="Banner" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-[10px] text-[var(--theme-text-muted)] italic">{isAr ? 'لا يوجد غلاف مرفوع' : 'No banner set'}</span>
                        )}
                      </div>
                      <label className="w-full px-3.5 py-2 rounded-xl bg-[var(--theme-bg-tertiary)] hover:opacity-90 text-[var(--theme-text-primary)] text-xs font-bold transition-all cursor-pointer border border-[var(--theme-border)] flex items-center justify-center gap-2">
                        <Upload className="w-3.5 h-3.5 text-accent" />
                        <span>{isAr ? 'تغيير غلاف السيرفر' : 'Upload Banner'}</span>
                        <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[var(--theme-text-muted)]">{isAr ? 'اسم السيرفر' : 'Server Name'}</label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    maxLength={35}
                    className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    required
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[var(--theme-text-muted)]">{isAr ? 'وصف السيرفر' : 'Server Description'}</label>
                  <textarea
                    value={serverDesc}
                    onChange={(e) => setServerDesc(e.target.value)}
                    maxLength={150}
                    rows={3}
                    className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border resize-none focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                  />
                </div>

                {/* Cooldown */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[var(--theme-text-muted)]">{isAr ? 'تباطؤ الرسائل بالسيرفر (بالثواني)' : 'Server Message Cooldown (seconds)'}</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={serverCooldown}
                    onChange={(e) => setServerCooldown(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-bold text-xs transition-all cursor-pointer border-0 shadow-lg flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isAr ? 'حفظ التغييرات' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: CHANNELS */}
            {activeTab === 'channels' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[var(--theme-text-muted)]">{isAr ? 'قنوات السيرفر' : 'Server Channels'}</span>
                  <button
                    onClick={() => setShowNewChan(true)}
                    className="px-3.5 py-2 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-0 shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isAr ? 'إنشاء قناة جديدة' : 'Create Channel'}</span>
                  </button>
                </div>

                {/* New channel inline form */}
                {showNewChan && (
                  <form onSubmit={handleCreateChannel} className="p-4 rounded-2xl border space-y-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs">{isAr ? 'إنشاء قناة جديدة' : 'New Channel Details'}</span>
                      <button type="button" onClick={() => setShowNewChan(false)} className="text-[var(--theme-text-muted)] border-0 bg-transparent cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder={isAr ? 'اسم القناة' : 'channel-name'}
                        value={newChanName}
                        onChange={(e) => setNewChanName(e.target.value)}
                        maxLength={35}
                        className="rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                        required
                      />
                      <select
                        value={newChanType}
                        onChange={(e) => setNewChanType(e.target.value as any)}
                        className="rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                      >
                        <option value="text">{isAr ? 'قناة نصية' : 'Text Channel'}</option>
                        <option value="voice">{isAr ? 'قناة صوتية' : 'Voice Channel'}</option>
                      </select>
                    </div>

                    {newChanType === 'voice' && (
                      <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-accent/20 bg-accent/5">
                        <label className="text-xs font-bold text-[var(--theme-text-secondary)]">
                          {isAr ? 'الحد الأقصى للمستخدمين (من 2 إلى 8):' : 'Max User Limit (Min 2, Max 8):'}
                        </label>
                        <select
                          value={newChanUserLimit}
                          onChange={(e) => setNewChanUserLimit(parseInt(e.target.value, 10))}
                          className="rounded-lg px-3 py-1.5 text-xs font-extrabold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-accent"
                        >
                          {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                            <option key={num} value={num}>
                              {num} {isAr ? 'أعضاء' : 'users'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder={isAr ? 'موضوع القناة (اختياري)' : 'Channel topic (optional)'}
                      value={newChanTopic}
                      onChange={(e) => setNewChanTopic(e.target.value)}
                      maxLength={150}
                      className="w-full rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                    />

                    {/* Channel Icon Picker */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-[var(--theme-text-muted)] flex items-center justify-between">
                        <span>{isAr ? 'أيقونة القناة:' : 'Channel Icon:'}</span>
                        <input
                          type="text"
                          value={newChanIcon}
                          onChange={(e) => setNewChanIcon(e.target.value)}
                          placeholder="💬"
                          className="w-16 px-2 py-0.5 rounded-lg text-center text-xs border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]"
                        />
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {CHANNEL_ICON_PRESETS.map((ic) => (
                          <button
                            key={ic}
                            type="button"
                            onClick={() => setNewChanIcon(ic)}
                            className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center cursor-pointer transition-all ${
                              newChanIcon === ic
                                ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold scale-110 shadow-md ring-2 ring-[var(--theme-border)]'
                                : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-primary)]'
                            }`}
                          >
                            {ic}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Role Restricted Access */}
                    <div className="p-3 rounded-xl border bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                          <span>{isAr ? 'مرئي فقط لأصحاب رتبة (Visible only to Role):' : 'Visible only to people with Role:'}</span>
                        </label>
                        <span className="text-[10px] text-[var(--theme-text-muted)] font-medium">
                          {isAr ? '(اتركه فارغاً ليراه الجميع)' : '(Leave empty for everyone)'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1 max-h-32 overflow-y-auto">
                        {rolesList.length === 0 ? (
                          <span className="text-[11px] text-[var(--theme-text-muted)] italic">
                            {isAr ? 'لا توجد رتب مخصصة بالسيرفر بعد (يمكنك إنشاء رتب في تبويب "الرتب والإذونات")' : 'No custom roles in server yet'}
                          </span>
                        ) : (
                          rolesList.map((r) => {
                            const isChecked = newChanRoles.includes(r.id) || newChanRoles.includes(r.name);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  if (isChecked) {
                                    setNewChanRoles(prev => prev.filter(id => id !== r.id && id !== r.name));
                                  } else {
                                    setNewChanRoles(prev => [...prev, r.id]);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                                  isChecked
                                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                                    : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                                }`}
                              >
                                <span>{r.emoji || '🛡️'}</span>
                                <span>{r.name}</span>
                                {isChecked && <Check className="w-3 h-3 text-amber-400" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowNewChan(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-tertiary)] cursor-pointer border-0"
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-1.5 rounded-lg bg-accent text-[var(--theme-accent-contrast,#ffffff)] text-xs font-bold cursor-pointer border-0 shadow-md"
                      >
                        {isAr ? 'إنشاء' : 'Create'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Edit Channel inline modal */}
                {editingChannel && (
                  <form onSubmit={handleSaveChannel} className="p-4 rounded-2xl border space-y-3 bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs">{isAr ? `تعديل القناة: #${editingChannel.name}` : `Edit Channel: #${editingChannel.name}`}</span>
                      <button type="button" onClick={() => setEditingChannel(null)} className="text-[var(--theme-text-muted)] border-0 bg-transparent cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editChanName}
                        onChange={(e) => setEditChanName(e.target.value)}
                        maxLength={35}
                        className="w-full rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Channel Topic"
                        value={editChanTopic}
                        onChange={(e) => setEditChanTopic(e.target.value)}
                        maxLength={150}
                        className="w-full rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)]"
                      />
                      {editingChannel.type === 'voice' && (
                        <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-accent/20 bg-accent/5">
                          <label className="text-xs font-bold text-[var(--theme-text-secondary)]">
                            {isAr ? 'الحد الأقصى للمستخدمين (من 2 إلى 8):' : 'Max User Limit (Min 2, Max 8):'}
                          </label>
                          <select
                            value={editChanUserLimit}
                            onChange={(e) => setEditChanUserLimit(parseInt(e.target.value, 10))}
                            className="rounded-lg px-3 py-1.5 text-xs font-extrabold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-accent"
                          >
                            {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                              <option key={num} value={num}>
                                {num} {isAr ? 'أعضاء' : 'users'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Channel Icon Picker */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-[var(--theme-text-muted)] flex items-center justify-between">
                          <span>{isAr ? 'أيقونة القناة:' : 'Channel Icon:'}</span>
                          <input
                            type="text"
                            value={editChanIcon}
                            onChange={(e) => setEditChanIcon(e.target.value)}
                            placeholder="💬"
                            className="w-16 px-2 py-0.5 rounded-lg text-center text-xs border border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]"
                          />
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {CHANNEL_ICON_PRESETS.map((ic) => (
                            <button
                              key={ic}
                              type="button"
                              onClick={() => setEditChanIcon(ic)}
                              className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center cursor-pointer transition-all ${
                                editChanIcon === ic
                                  ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold scale-110 shadow-md ring-2 ring-[var(--theme-border)]'
                                  : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-primary)]'
                              }`}
                            >
                              {ic}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Role Restricted Access */}
                      <div className="p-3 rounded-xl border bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[var(--theme-text-secondary)] flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                            <span>{isAr ? 'مرئي فقط لأصحاب رتبة (Visible only to Role):' : 'Visible only to people with Role:'}</span>
                          </label>
                          <span className="text-[10px] text-[var(--theme-text-muted)] font-medium">
                            {isAr ? '(اتركه فارغاً ليراه الجميع)' : '(Leave empty for everyone)'}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1 max-h-32 overflow-y-auto">
                          {rolesList.length === 0 ? (
                            <span className="text-[11px] text-[var(--theme-text-muted)] italic">
                              {isAr ? 'لا توجد رتب مخصصة بالسيرفر بعد (يمكنك إنشاء رتب في تبويب "الرتب والإذونات")' : 'No custom roles in server yet'}
                            </span>
                          ) : (
                            rolesList.map((r) => {
                              const isChecked = editChanRoles.includes(r.id) || editChanRoles.includes(r.name);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => {
                                    if (isChecked) {
                                      setEditChanRoles(prev => prev.filter(id => id !== r.id && id !== r.name));
                                    } else {
                                      setEditChanRoles(prev => [...prev, r.id]);
                                    }
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                                    isChecked
                                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                                      : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                                  }`}
                                >
                                  <span>{r.emoji || '🛡️'}</span>
                                  <span>{r.name}</span>
                                  {isChecked && <Check className="w-3 h-3 text-amber-400" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Denied Roles (Hide Channel From Roles) */}
                      <div className="p-3 rounded-xl border bg-red-500/5 border-red-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-red-400" />
                            <span>{isAr ? 'إخفاء القناة عن هذه الرتب (Denied Roles):' : 'Hide channel from these Roles (Denied Roles):'}</span>
                          </label>
                          <span className="text-[10px] text-red-300/70 font-medium">
                            {isAr ? '(المنع يلغي السماح دائماً)' : '(Deny always overrides Allow)'}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1 max-h-32 overflow-y-auto">
                          {rolesList.length === 0 ? (
                            <span className="text-[11px] text-[var(--theme-text-muted)] italic">
                              {isAr ? 'لا توجد رتب مخصصة بالسيرفر بعد' : 'No custom roles in server yet'}
                            </span>
                          ) : (
                            rolesList.map((r) => {
                              const isChecked = editChanDeniedRoles.includes(r.id) || editChanDeniedRoles.includes(r.name);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => {
                                    if (isChecked) {
                                      setEditChanDeniedRoles(prev => prev.filter(id => id !== r.id && id !== r.name));
                                    } else {
                                      setEditChanDeniedRoles(prev => [...prev, r.id]);
                                    }
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                                    isChecked
                                      ? 'bg-red-500/20 border-red-500/60 text-red-300 shadow-sm'
                                      : 'bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
                                  }`}
                                >
                                  <span>{r.emoji || '🛡️'}</span>
                                  <span>{r.name}</span>
                                  {isChecked && <Check className="w-3 h-3 text-red-400" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingChannel(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--theme-text-muted)] cursor-pointer border-0"
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-1.5 rounded-lg bg-accent text-[var(--theme-accent-contrast,#ffffff)] text-xs font-bold cursor-pointer border-0 shadow-md"
                      >
                        {isAr ? 'حفظ' : 'Save'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Channel List */}
                <div className="space-y-2">
                  {channels.map((chan) => {
                    const opts = parseChannelOptions(chan);
                    const chIcon = opts.icon || chan.icon || (chan.type === 'text' ? '💬' : '🔊');
                    const visRoles = opts.visible_roles || chan.visible_roles || [];

                    return (
                      <div
                        key={chan.id}
                        className="p-3 rounded-xl border flex items-center justify-between transition-all bg-[var(--theme-bg-secondary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base shrink-0 select-none">{chIcon}</span>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs truncate">{chan.name}</span>
                              {visRoles.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>{isAr ? `${visRoles.length} رتبة` : `${visRoles.length} roles`}</span>
                                </span>
                              )}
                            </div>
                            {chan.topic && <span className="text-[10px] text-[var(--theme-text-muted)] truncate">{chan.topic}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleStartEditChannel(chan)}
                            className="p-1.5 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-all cursor-pointer border-0"
                            title={isAr ? 'تعديل' : 'Edit Channel'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteChannelConfirm(chan)}
                            className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-600 transition-all cursor-pointer border-0"
                            title={isAr ? 'حذف' : 'Delete Channel'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: ROLES & MEMBERS */}
            {activeTab === 'roles' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                      {isAr ? 'رتب السيرفر' : 'Server Roles'}
                    </span>
                    <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isAr ? 'أنشئ رتباً مخصصة مع رموز تعبيرية وألوان وصلاحيات محددة' : 'Create custom roles with emojis, colors, and permissions'}
                    </span>
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
                    <span>{isAr ? 'إضافة رتبة جديدة' : 'Create Role'}</span>
                  </button>
                </div>

                {/* Role Creation / Editing Form */}
                {(showCreateRole || editingRole) && (
                  <form
                    onSubmit={handleSaveRole}
                    className={`p-5 rounded-2xl border space-y-4 shadow-md transition-all ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/80'
                        : 'bg-slate-900 border-slate-800 text-slate-100 shadow-black'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs flex items-center gap-2">
                        <Shield className="w-4 h-4 text-accent" />
                        <span>{editingRole ? (isAr ? `تعديل رتبة: ${editingRole.name}` : `Edit Role: ${editingRole.name}`) : (isAr ? 'رتبة جديدة' : 'New Role')}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateRole(false);
                          setEditingRole(null);
                        }}
                        className={`p-1 rounded-lg cursor-pointer border-0 bg-transparent transition-all ${
                          isLight ? 'text-slate-400 hover:text-slate-800' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="flex flex-col gap-2">
                        <label className={`text-[10px] font-bold flex items-center justify-between ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          <span>{isAr ? 'رمز الرتبة (Emoji / Icon)' : 'Role Emoji / Icon'}</span>
                          <input
                            type="text"
                            value={roleEmoji}
                            onChange={(e) => setRoleEmoji(e.target.value)}
                            placeholder="👑"
                            className={`w-16 px-2 py-0.5 rounded-lg text-center text-xs border font-bold focus:outline-none focus:border-accent ${
                              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
                            }`}
                          />
                        </label>
                        <div className={`flex flex-wrap gap-1.5 p-2 rounded-xl border max-h-28 overflow-y-auto ${
                          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
                        }`}>
                          {ROLE_EMOJI_PRESETS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => setRoleEmoji(e)}
                              className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center cursor-pointer transition-all border-0 ${
                                roleEmoji === e
                                  ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-bold scale-110 shadow-md ring-2 ring-accent/40'
                                  : isLight
                                    ? 'bg-white text-slate-700 hover:bg-slate-200'
                                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                              }`}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Name */}
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className={`text-[10px] font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{isAr ? 'اسم الرتبة' : 'Role Name'}</label>
                        <input
                          type="text"
                          placeholder={isAr ? 'مثال: مشرف، VIP، مصمم' : 'e.g. Moderator, VIP, Designer'}
                          value={roleName}
                          onChange={(e) => setRoleName(e.target.value)}
                          maxLength={35}
                          className={`rounded-xl px-3.5 py-2 text-xs font-medium border focus:outline-none focus:border-accent ${
                            isLight ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400' : 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                          }`}
                          required
                        />
                      </div>
                    </div>

                    {/* Color Picker Presets */}
                    <div className="flex flex-col gap-1.5">
                      <label className={`text-[10px] font-bold flex items-center justify-between ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        <span>{isAr ? 'لون اسم المستخدم لهذه الرتبة' : 'Role & Username Color'}</span>
                        <span className="text-[9px] font-mono opacity-80">{roleColor}</span>
                      </label>
                      <p className={`text-[10px] font-medium leading-tight ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isAr
                          ? 'حدد لون اسم المستخدم في قائمة الأعضاء لهذه الرتبة. الرتبة المطبقة أخيراً هي التي تحدد لون الاسم.'
                          : 'Select the color for member usernames with this role. The last applied role defines the username color.'}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap pt-0.5">
                        {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#777777', '#64748b'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setRoleColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-7 h-7 rounded-xl cursor-pointer border-2 transition-all ${
                              roleColor === c ? 'border-white scale-110 shadow-md ring-2 ring-accent/50' : 'border-transparent opacity-80 hover:opacity-100'
                            }`}
                          />
                        ))}
                        <input
                          type="color"
                          value={roleColor}
                          onChange={(e) => setRoleColor(e.target.value)}
                          className="w-8 h-8 rounded-xl cursor-pointer border-0 p-0 bg-transparent"
                          title={isAr ? 'اختر لون مخصص لاسم المستخدم' : 'Choose custom username color'}
                        />
                      </div>
                    </div>

                    {/* Permissions Toggles */}
                    <div className={`space-y-2 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isAr ? 'الصلاحيات المسموحة' : 'Allowed Permissions'}
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-medium">
                        <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100' : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-950'
                        }`}>
                          <input
                            type="checkbox"
                            checked={rolePerms.send_messages}
                            onChange={(e) => setRolePerms({ ...rolePerms, send_messages: e.target.checked })}
                            className="rounded accent-accent"
                          />
                          <span>{isAr ? 'إرسال الرسائل' : 'Send Messages'}</span>
                        </label>
                        <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100' : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-950'
                        }`}>
                          <input
                            type="checkbox"
                            checked={rolePerms.manage_channels}
                            onChange={(e) => setRolePerms({ ...rolePerms, manage_channels: e.target.checked })}
                            className="rounded accent-accent"
                          />
                          <span>{isAr ? 'إدارة القنوات' : 'Manage Channels'}</span>
                        </label>
                        <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100' : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-950'
                        }`}>
                          <input
                            type="checkbox"
                            checked={rolePerms.manage_roles}
                            onChange={(e) => setRolePerms({ ...rolePerms, manage_roles: e.target.checked })}
                            className="rounded accent-accent"
                          />
                          <span>{isAr ? 'إدارة الرتب' : 'Manage Roles'}</span>
                        </label>
                        <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100' : 'bg-slate-950/60 border-slate-800 text-slate-200 hover:bg-slate-950'
                        }`}>
                          <input
                            type="checkbox"
                            checked={rolePerms.pin_messages}
                            onChange={(e) => setRolePerms({ ...rolePerms, pin_messages: e.target.checked })}
                            className="rounded accent-accent"
                          />
                          <span>{isAr ? 'تثبيت الرسائل' : 'Pin Messages'}</span>
                        </label>
                      </div>

                      <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer pt-2 text-xs font-bold ${
                        isLight ? 'bg-amber-50/80 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isRoleDefault}
                          onChange={(e) => setIsRoleDefault(e.target.checked)}
                          className="rounded accent-amber-500"
                        />
                        <span>{isAr ? 'رتبة افتراضية للأعضاء الجدد (تُمنح تلقائياً عند الانضمام) ⭐' : 'Default role for new members (Auto-assigned upon joining) ⭐'}</span>
                      </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateRole(false);
                          setEditingRole(null);
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border-0 transition-all ${
                          isLight ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4.5 py-2 rounded-xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] text-xs font-bold cursor-pointer border-0 shadow-md hover:opacity-90 transition-all"
                      >
                        {isAr ? 'حفظ الرتبة' : 'Save Role'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Roles List Display */}
                <div className="space-y-2.5">
                  {rolesList.length === 0 ? (
                    <div className={`p-6 rounded-2xl border border-dashed text-center text-xs ${
                      isLight ? 'border-slate-300 bg-white text-slate-500' : 'border-slate-800 bg-slate-900/50 text-slate-400'
                    }`}>
                      {isAr ? 'لا توجد رتب مخصصة بالسيرفر بعد. انقر على "إضافة رتبة جديدة" لإنشاء رتبة!' : 'No custom roles in server yet. Click "Create Role" to add one!'}
                    </div>
                  ) : (
                    rolesList.map((r) => (
                      <div
                        key={r.id}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                          isLight
                            ? 'bg-white border-slate-200 shadow-sm hover:border-slate-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 shadow-md hover:border-slate-700 text-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            style={{ backgroundColor: `${r.color}20`, borderColor: `${r.color}40`, color: r.color }}
                            className="px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 shadow-xs"
                          >
                            <span>{r.emoji || '🛡️'}</span>
                            <span>{r.name}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleDefaultRole(r.id)}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all border cursor-pointer ${
                              r.is_default
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-xs ring-1 ring-amber-500/30'
                                : isLight
                                  ? 'bg-slate-100 border-slate-300 text-slate-600 hover:text-amber-600 hover:border-amber-400'
                                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-amber-300 hover:border-amber-500/30'
                            }`}
                            title={isAr ? 'تعيين كـ رتبة افتراضية عند الانضمام' : 'Set as Default Role'}
                          >
                            <span>⭐</span>
                            <span>{r.is_default ? (isAr ? 'افتراضية (تمنح تلقائياً)' : 'Default Role') : (isAr ? 'جعلها افتراضية' : 'Set Default')}</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingRole(r);
                              setRoleName(r.name);
                              setRoleEmoji(r.emoji || '🛡️');
                              setRoleColor(r.color || '#3b82f6');
                              setRolePerms(r.permissions || { send_messages: true });
                              setIsRoleDefault(Boolean(r.is_default));
                              setShowCreateRole(false);
                            }}
                            className={`p-2 rounded-xl transition-all cursor-pointer border-0 ${
                              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                            title={isAr ? 'تعديل الرتبة' : 'Edit Role'}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRole(r.id)}
                            className="p-2 rounded-xl text-red-500 hover:text-white hover:bg-red-600 transition-all cursor-pointer border-0"
                            title={isAr ? 'حذف الرتبة' : 'Delete Role'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Member Role Assignment Section */}
                <div className={`pt-5 border-t space-y-3.5 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    <Users className="w-4 h-4 text-accent" />
                    <span>{isAr ? 'تعيين الرتب لأعضاء السيرفر' : 'Assign Roles to Server Members'}</span>
                  </span>

                  <div className="space-y-2.5">
                    {serverMembers.length === 0 ? (
                      <div className={`text-xs italic p-3 rounded-xl border ${isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                        {isAr ? 'جاري تحميل قائمة الاعضاء...' : 'Loading members list...'}
                      </div>
                    ) : (
                      serverMembers.map((m) => {
                        const memberUserId = typeof m.user === 'object' && m.user ? (m.user as any).id : (m.user || (m as any).user_id || m.id);
                        const rawRole = m.role || m.role_id || '';
                        const roleStr = typeof rawRole === 'string' ? rawRole : (typeof rawRole === 'object' && rawRole ? (rawRole.name || rawRole.id || '') : String(rawRole || ''));
                        const memberRoles = roleStr.split(',').map((s) => s.trim()).filter(Boolean);

                        return (
                          <div
                            key={m.id}
                            className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-medium transition-all ${
                              isLight ? 'bg-white border-slate-200 shadow-sm text-slate-900' : 'bg-slate-900 border-slate-800 shadow-md text-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-extrabold truncate text-sm">
                                {m.expand?.user?.display_name || m.expand?.user?.username || (typeof m.user === 'string' ? m.user : 'Member')}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                              {rolesList.length === 0 ? (
                                <span className={`text-[10px] italic ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {isAr ? 'أنشئ رتبة أولاً' : 'Create a role first'}
                                </span>
                              ) : (
                                rolesList.map((r) => {
                                  const isSelected = memberRoles.includes(r.id) || memberRoles.includes(r.name);
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => {
                                        let nextRoles: string[];
                                        if (isSelected) {
                                          nextRoles = memberRoles.filter((tok) => tok !== r.id && tok !== r.name);
                                        } else {
                                          nextRoles = [...memberRoles, r.name];
                                        }
                                        handleAssignMemberRole(memberUserId, nextRoles.join(','));
                                      }}
                                      style={{
                                        backgroundColor: isSelected ? (r.color ? `${r.color}30` : 'rgba(119,119,119,0.3)') : 'transparent',
                                        borderColor: isSelected ? (r.color || 'var(--accent-color)') : (isLight ? '#cbd5e1' : 'rgba(255,255,255,0.15)'),
                                        color: isSelected ? (r.color || 'var(--accent-color)') : 'inherit'
                                      }}
                                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-all ${
                                        isSelected ? 'shadow-xs ring-1 ring-accent' : 'opacity-70 hover:opacity-100'
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
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: SECURITY & USER SPECIFIC INVITES */}
            {activeTab === 'invites' && (
              <div className="space-y-6">
                {/* Server Password Configuration */}
                <form onSubmit={handleSaveOverview} className="p-4 rounded-2xl border space-y-3 bg-amber-500/5 border-amber-500/20">
                  <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-amber-500" />
                    <span>{isAr ? 'كلمة سر السيرفر (قفل حماية خاص)' : 'Server Access Password'}</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={isAr ? 'كلمة السر للسيرفر الخاص (اتركه فارغاً للسماح بالعام)' : 'Password for private server (leave blank for public)'}
                      value={serverPassword}
                      onChange={(e) => setServerPasswordState(e.target.value)}
                      className={`flex-1 rounded-xl px-4 py-2 text-xs font-medium border focus:outline-none focus:border-amber-500 ${
                        isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs cursor-pointer border-0 shadow-md flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isAr ? 'حفظ القفل' : 'Save Lock'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {isAr
                      ? 'عند وضع كلمة سر، سيتم إلغاء إدراج السيرفر من القائمة العامة (Unlisted) ولن يمكن الدخول إليه إلا عبر كلمة السر أو رابط/دعوة خاصة.'
                      : 'Setting a password unlists the server from public discovery. Users can only join with the password or direct user invite.'}
                  </p>
                </form>

                {/* Specific User Invites Section (Collections > servers > server_options) */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-accent" />
                      <span>{isAr ? 'دعوات مخصصة لأشخاص محددين (User Invites)' : 'User-Specific Direct Invites'}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {isAr
                        ? 'يمكن لمالك السيرفر إرسال دعوة خاصة باسم الشخص المني بها لعدم إمكانية مشاركتها مع الآخرين. تبقى الدعوة حالة "Waiting for Person B" حتى ينضم الشخص ثم تُحذف من الانتظار.'
                        : 'Server owner can send direct invites containing user ID so they cannot share them. The invite remains marked as "Waiting for Person B" until they join.'}
                    </span>
                  </div>

                  {/* Search user to invite */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={isAr ? 'ابحث باسم المستخدم لإرسال دعوة خاصة (مثال: Person B)...' : 'Search user to send invite (e.g. Person B)...'}
                      value={inviteSearchUser}
                      onChange={(e) => handleSearchUsersToInvite(e.target.value)}
                      className={`w-full rounded-xl px-4 py-2.5 text-xs font-medium border focus:outline-none focus:border-accent ${
                        isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    />

                    {/* Live Search Results Dropdown */}
                    {searchResults.length > 0 && (
                      <div className={`absolute left-0 right-0 top-full mt-1.5 rounded-2xl border shadow-2xl p-2 z-30 flex flex-col gap-1 ${
                        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
                      }`}>
                        {searchResults.map((u) => (
                          <div key={u.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5">
                            <span className="text-xs font-bold">
                              {u.display_name || u.username} <span className="text-[10px] text-slate-400">(@{u.username})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSendSpecificInvite(u)}
                              className="px-3 py-1.5 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-extrabold text-[10px] cursor-pointer border-0 shadow-sm"
                            >
                              {isAr ? `دعوة إلى ${u.display_name || u.username}` : `invite to ${u.display_name || u.username}`}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Invites list (server_options markings) */}
                  <div className="space-y-2 pt-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      {isAr ? 'قائمة الدعوات والعلامات المخصصة (Server Options)' : 'Active Sent Invites (Server Options)'}
                    </span>

                    {serverOptions.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                        {isAr ? 'لا توجد دعوات خاصة معلقة بعد' : 'No direct user invites sent yet.'}
                      </div>
                    ) : (
                      serverOptions.map((opt) => {
                        const isWaiting = opt.status === 'waiting';
                        return (
                          <div
                            key={opt.id}
                            className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                              isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-850'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-xs font-black truncate">
                                {isAr ? `دعوة إلى ${opt.target_display_name || opt.target_username}` : `invite to ${opt.target_display_name || opt.target_username}`}
                              </span>

                              {/* Status Badge */}
                              {isWaiting ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center gap-1 shadow-xs">
                                  <Clock className="w-3 h-3 animate-pulse" />
                                  <span>{isAr ? `في انتظار ${opt.target_display_name || opt.target_username}` : `Waiting for ${opt.target_display_name || opt.target_username}`}</span>
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-accent flex items-center gap-1 shadow-xs">
                                  <Check className="w-3 h-3 text-accent" />
                                  <span>{isAr ? 'تم الانضمام' : 'Joined'}</span>
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveInvite(opt.id)}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer border-0"
                              title={isAr ? 'إلغاء الدعوة' : 'Cancel Invite'}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: TRANSFER OWNERSHIP */}
            {activeTab === 'ownership' && server.owner === currentUser.id && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
                    <Sparkles className="w-5 h-5" />
                    <span>{isAr ? 'نقل ملكية السيرفر' : 'Transfer Server Ownership'}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {isAr
                      ? 'اختر عضواً لنقل ملكية هذا السيرفر إليه. ستبقى عضواً في السيرفر وتعتفظ بكل رتبك العادية، ولكنك ستتخلى عن صلاحيات المالك.'
                      : 'Select an active member to transfer ownership of this server to. You will remain a member with your regular roles, but lose owner-only control.'}
                  </p>
                </div>

                {transferError && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold">
                    {transferError}
                  </div>
                )}

                {transferSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                    {transferSuccess}
                  </div>
                )}

                <div className="space-y-3">
                  <label className="text-xs font-bold text-[var(--theme-text-muted)] block">
                    {isAr ? 'اختر العضو الجديد للملكية' : 'Select New Owner'}
                  </label>
                  <select
                    value={transferTargetUserId}
                    onChange={(e) => setTransferTargetUserId(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none focus:border-accent bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] text-[var(--theme-text-primary)] cursor-pointer"
                  >
                    <option value="">{isAr ? '-- اختر عضواً --' : '-- Select Member --'}</option>
                    {serverMembers
                      .filter((m) => m.user !== currentUser.id && m.id !== currentUser.id)
                      .map((m) => {
                        const mUser = (m.expand as any)?.user || m;
                        const name = m.member_name || m.nickname || mUser.display_name || mUser.username || m.user;
                        return (
                          <option key={m.id || m.user} value={m.user || m.id}>
                            {name} ({mUser.username || m.user})
                          </option>
                        );
                      })}
                  </select>

                  <button
                    type="button"
                    disabled={!transferTargetUserId || transferringOwnership}
                    onClick={() => setShowTransferConfirm(true)}
                    className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-extrabold text-xs transition-all shadow-lg cursor-pointer border-0 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{isAr ? 'بدء نقل الملكية' : 'Transfer Ownership Now'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: DANGER ZONE */}
            {activeTab === 'danger' && (
              <div className="space-y-4">
                {onLeaveServer && (
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
                    <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm">
                      <LogOut className="w-5 h-5" />
                      <span>{isAr ? 'مغادرة السيرفر' : 'Leave Server'}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {isAr
                        ? 'ستقوم بمغادرة السيرفر. سيتم الحفاظ على بيانات عضويتك ورتبك وسجل إعداداتك بحيث إذا عدت لاحقاً سيتم استعادتها بالكامل.'
                        : 'You will leave the server. Your membership data, roles, nickname, and server settings will be preserved so that if you rejoin later, everything can be restored.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onLeaveServer(server)}
                      className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all cursor-pointer border-0 shadow-lg flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{isAr ? 'مغادرة السيرفر' : 'Leave Server'}</span>
                    </button>
                  </div>
                )}

                <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-4">
                  <div className="flex items-center gap-2 text-red-400 font-extrabold text-sm">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{isAr ? 'حذف السيرفر نهائياً' : 'Delete Server Permanently'}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {isAr
                      ? 'سيؤدي حذف السيرفر إلى إزالة جميع القنوات والرسائل والمرفقات نهائياً. لا يمكن التراجع عن هذا الإجراء.'
                      : 'Deleting the server will permanently remove all channels, messages, and attachments. This action cannot be undone.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDeleteServerConfirm(true)}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all cursor-pointer border-0 shadow-lg"
                  >
                    {isAr ? 'تأكيد حذف السيرفر' : 'Delete Server'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Channel Deletion */}
      {deleteChannelConfirm && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-60 p-4">
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <h4 className="font-bold text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{isAr ? 'تأكيد حذف القناة' : 'Confirm Channel Deletion'}</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isAr
                ? `هل أنت متأكد من حذف القناة #${deleteChannelConfirm.name}؟`
                : `Are you sure you want to delete channel #${deleteChannelConfirm.name}?`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteChannelConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800/20 cursor-pointer border-0"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmDeleteChannel}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer border-0 shadow-md"
              >
                {isAr ? 'حذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Ownership Transfer */}
      {showTransferConfirm && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-60 p-4">
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <h4 className="font-extrabold text-sm text-amber-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>{isAr ? 'تأكيد نقل ملكية السيرفر' : 'Confirm Ownership Transfer'}</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isAr
                ? `هل أنت متأكد من نقل ملكية السيرفر "${server.name}" إلى العضو المحدد؟ ستفقد صلاحيات المالك ولكنك ستظل عضواً بالسيرفر.`
                : `Are you sure you want to transfer ownership of "${server.name}" to the selected member? You will remain a member but lose owner privileges.`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTransferConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800/20 cursor-pointer border-0"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmTransferOwnership}
                disabled={transferringOwnership}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold cursor-pointer border-0 shadow-md flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? 'تأكيد النقل' : 'Confirm Transfer'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Server Deletion */}
      {deleteServerConfirm && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-60 p-4">
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <h4 className="font-bold text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{isAr ? 'تأكيد حذف السيرفر' : 'Confirm Server Deletion'}</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isAr
                ? `هل أنت متأكد من حذف السيرفر ${server.name} بالكامل؟`
                : `Are you sure you want to delete the entire server "${server.name}"?`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteServerConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800/20 cursor-pointer border-0"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirmDeleteServer}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer border-0 shadow-md"
              >
                {isAr ? 'حذف السيرفر' : 'Delete Server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
