import { User, Server, Channel, ServerRole, ServerMember, ChannelPermissionOverride } from '../types';

export interface EvaluatedChannelPermissions {
  canView: boolean;
  canSendMessages: boolean;
  canConnect: boolean;
  canManage: boolean;
}

/**
 * Parses channel_options if stored as a JSON string
 */
export function getParsedChannelOptions(channel: Channel): any {
  if (!channel) return {};
  let options = channel.channel_options;
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options);
    } catch {
      options = {};
    }
  }
  return options || {};
}

/**
 * Extracts visible roles from channel directly or parsed channel_options or topic flags
 */
export function getChannelVisibleRoles(channel: Channel): string[] {
  if (!channel) return [];
  if (Array.isArray(channel.visible_roles) && channel.visible_roles.length > 0) {
    return channel.visible_roles;
  }
  const opts = getParsedChannelOptions(channel);
  if (Array.isArray(opts.visible_roles) && opts.visible_roles.length > 0) {
    return opts.visible_roles;
  }
  // Topic string parse fallback e.g. [roles:role1,role2] or [private:role1,role2]
  if (channel.topic) {
    const match = channel.topic.match(/\[(?:roles|private):([^\]]+)\]/i);
    if (match && match[1]) {
      return match[1].split(',').map((r) => r.trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * Extracts permission overrides from channel or parsed channel_options
 */
export function getChannelPermissionOverrides(channel: Channel): Record<string, ChannelPermissionOverride> {
  if (!channel) return {};
  if (channel.permission_overrides && typeof channel.permission_overrides === 'object') {
    return channel.permission_overrides;
  }
  const opts = getParsedChannelOptions(channel);
  if (opts.permission_overrides && typeof opts.permission_overrides === 'object') {
    return opts.permission_overrides;
  }
  return {};
}

/**
 * Evaluates full permissions for a user in a specific channel.
 */
export function evaluateChannelPermissions(
  channel: Channel | null,
  user: User | null,
  server: Server | null,
  userRoles: ServerRole[] = [],
  memberRecord?: ServerMember | null
): EvaluatedChannelPermissions {
  const fullAccess: EvaluatedChannelPermissions = {
    canView: true,
    canSendMessages: true,
    canConnect: true,
    canManage: true,
  };

  const noAccess: EvaluatedChannelPermissions = {
    canView: false,
    canSendMessages: false,
    canConnect: false,
    canManage: false,
  };

  if (!channel || !user) return fullAccess;

  // DM / Private Channels always accessible to recipient
  if (channel.server === 'dm' || channel.name.startsWith('@') || channel.id.startsWith('dm-')) {
    return fullAccess;
  }

  // 1. SERVER OWNER & GLOBAL ADMIN & SERVER ADMIN OVERRIDE
  const isOwner = server?.owner === user.id;
  const isGlobalAdmin = user.role === 'admin' || user.role === 'half-admin';

  const userRolePermissions = userRoles.map((r) => r.permissions || {});
  const hasManageServer = userRolePermissions.some((p) => p.manage_server || p.manage_channels);

  if (isOwner || isGlobalAdmin || hasManageServer) {
    return fullAccess;
  }

  // 2. PRIVATE CHANNEL CHECK (visible_roles)
  const visibleRoles = getChannelVisibleRoles(channel);
  if (visibleRoles.length > 0) {
    const userRoleIds = new Set(userRoles.map((r) => r.id));
    const userRoleNames = new Set(userRoles.map((r) => r.name.toLowerCase()));

    const hasMatchingRole = visibleRoles.some(
      (vr) => userRoleIds.has(vr) || userRoleNames.has(vr.toLowerCase())
    );

    if (!hasMatchingRole) {
      return noAccess;
    }
  }

  // 3. USER-SPECIFIC OVERRIDES
  const overrides = getChannelPermissionOverrides(channel);
  const userOverride = overrides[user.id];

  let canView = true;
  let canSend = true;
  let canConnect = true;

  if (userOverride) {
    if (userOverride.view_channel === 'deny' || userOverride.view === 'deny') canView = false;
    if (userOverride.view_channel === 'allow' || userOverride.view === 'allow') canView = true;

    if (userOverride.send_messages === 'deny') canSend = false;
    if (userOverride.send_messages === 'allow') canSend = true;

    if (userOverride.connect === 'deny') canConnect = false;
    if (userOverride.connect === 'allow') canConnect = true;

    return {
      canView,
      canSendMessages: canView && canSend,
      canConnect: canView && canConnect,
      canManage: false,
    };
  }

  // 4. ROLE-BASED OVERRIDES
  let roleViewDeny = false;
  let roleViewAllow = false;
  let roleSendDeny = false;
  let roleSendAllow = false;

  for (const role of userRoles) {
    const roleOverride = overrides[role.id];
    if (roleOverride) {
      if (roleOverride.view_channel === 'deny' || roleOverride.view === 'deny') roleViewDeny = true;
      if (roleOverride.view_channel === 'allow' || roleOverride.view === 'allow') roleViewAllow = true;

      if (roleOverride.send_messages === 'deny') roleSendDeny = true;
      if (roleOverride.send_messages === 'allow') roleSendAllow = true;
    }

    // Role base permissions
    if (role.permissions) {
      if (role.permissions.send_messages === false) roleSendDeny = true;
      if (role.permissions.send_messages === true) roleSendAllow = true;
    }
  }

  if (roleViewDeny && !roleViewAllow) canView = false;
  if (roleSendDeny && !roleSendAllow) canSend = false;

  return {
    canView,
    canSendMessages: canView && canSend,
    canConnect: canView && canConnect,
    canManage: false,
  };
}

/**
 * Filters a list of channels for a user based on view permissions.
 */
export function filterAccessibleChannels(
  channels: Channel[],
  user: User | null,
  server: Server | null,
  userRoles: ServerRole[] = []
): Channel[] {
  if (!channels || channels.length === 0) return [];
  if (!user) return channels;

  return channels.filter((ch) => {
    const perms = evaluateChannelPermissions(ch, user, server, userRoles);
    return perms.canView;
  });
}
