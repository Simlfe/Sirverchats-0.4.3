import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { URL, fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const config = {
  port: Number.parseInt(process.env.PORT || '8080', 10),
  pbBaseUrl: (process.env.POCKETBASE_URL || 'https://api.sirverdata.top').replace(/\/+$/, ''),
  livekitTokenUrl: process.env.LIVEKIT_TOKEN_SERVICE_URL || '',
  livekitInternalToken: process.env.LIVEKIT_INTERNAL_TOKEN || '',
  chatUpstreamWs: process.env.CHAT_UPSTREAM_WS || '',
  allowedOrigins: new Set(
    (process.env.ALLOWED_ORIGINS ||
      'https://app.sirverdata.top,https://sirverdata.top,http://tauri.localhost')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
};

const tokenCache = new Map();
const accessCache = new Map();
const clients = new Set();
const recentMessageEvents = new Map();
const recentCallEvents = new Map();

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function originForRequest(origin) {
  if (!origin) return null;
  if (config.allowedOrigins.has(origin)) return origin;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && url.hostname.endsWith('.sirverdata.top')) return origin;
  } catch {
    // Ignore malformed Origin headers.
  }
  return null;
}

function setCors(req, res) {
  const matched = originForRequest(req.headers.origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '600');
  if (matched) {
    res.setHeader('Access-Control-Allow-Origin', matched);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function sendEmpty(res, status = 204) {
  res.statusCode = status;
  res.removeHeader('Content-Type');
  res.end();
}

async function readBody(req, maxBytes = 50 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req, 2 * 1024 * 1024);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function escapeFilter(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function idsFilter(field, ids) {
  return ids.map((id) => `${field} = "${escapeFilter(id)}"`).join(' || ');
}

function collectionPath(collection, suffix = '') {
  return `/api/collections/${encodeURIComponent(collection)}/records${suffix}`;
}

async function pbRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${config.pbBaseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body && !options.headers?.['Content-Type']
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers || {}),
      },
      signal: options.signal || AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new HttpError(502, 'PocketBase is unavailable.', error?.message);
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data };
}

async function queryCollection(collection, params, token) {
  const search = new URLSearchParams(params);
  const result = await pbRequest(`${collectionPath(collection)}?${search.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!result.response.ok) {
    throw new HttpError(result.response.status, result.data?.message || `Unable to read ${collection}.`, result.data);
  }
  return Array.isArray(result.data?.items) ? result.data.items : [];
}

async function validateToken(token) {
  if (!token) throw new HttpError(401, 'Authentication is required.');
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.record;
  const result = await pbRequest('/api/collections/users/auth-refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.response.ok || !result.data?.record?.id) {
    throw new HttpError(401, 'Session is expired or invalid.');
  }
  const record = result.data.record;
  tokenCache.set(token, { record, expiresAt: Date.now() + 30_000 });
  return record;
}

async function requireAuth(req) {
  const token = bearerToken(req);
  const record = await validateToken(token);
  return { token, record };
}

function sessionEnvelope(data) {
  return {
    accessToken: data.token || data.access_token || '',
    refreshToken: data.refreshToken || data.refresh_token || null,
    expiresAt: data.expiresAt || data.expires_at || null,
    user: data.record || data.user || data.model || null,
  };
}

async function login(body) {
  const result = await pbRequest('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({
      identity: body.email || body.identity || '',
      password: body.password || '',
    }),
  });
  if (!result.response.ok || !result.data?.token || !result.data?.record) {
    throw new HttpError(401, result.data?.message || 'Invalid email or password.', result.data);
  }
  return sessionEnvelope(result.data);
}

async function refresh(body, req) {
  const token = body?.refreshToken || body?.refresh_token || bearerToken(req);
  if (!token) throw new HttpError(401, 'Refresh token is required.');
  const result = await pbRequest('/api/collections/users/auth-refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!result.response.ok || !result.data?.record) {
    throw new HttpError(401, 'Session is expired or invalid.', result.data);
  }
  // PocketBase rotates the bearer token during auth-refresh. Preserve the
  // returned value and only fall back to the old token for deployments that
  // use a non-rotating 0.22-compatible auth store.
  return sessionEnvelope({
    ...result.data,
    token: result.data.token || result.data.access_token || token,
  });
}

async function findServerMembership(userId, serverId, token) {
  const key = `${userId}:${serverId}`;
  const cached = accessCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let allowed = false;
  try {
    const memberships = await queryCollection(
      'server_members',
      { filter: `(user = "${escapeFilter(userId)}" && server = "${escapeFilter(serverId)}")`, perPage: '1' },
      token,
    );
    allowed = memberships.length > 0;
  } catch {
    const servers = await queryCollection(
      'servers',
      { filter: `id = "${escapeFilter(serverId)}" && members ~ "${escapeFilter(userId)}"`, perPage: '1' },
      token,
    );
    allowed = servers.length > 0;
  }
  accessCache.set(key, { value: allowed, expiresAt: Date.now() + 30_000 });
  return allowed;
}

async function ensureChannelAccess(channelId, userId, token) {
  const channels = await queryCollection('channels', { filter: `id = "${escapeFilter(channelId)}"`, perPage: '1' }, token);
  const channel = channels[0];
  if (!channel) throw new HttpError(404, 'Channel not found.');
  if (!(await findServerMembership(userId, channel.server, token))) {
    throw new HttpError(403, 'You are not a member of this server.');
  }
  return channel;
}

async function ensureDmAccess(chatServerId, userId, token) {
  const key = `dm:${userId}:${chatServerId}`;
  const cached = accessCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.value) throw new HttpError(403, 'You are not a member of this conversation.');
    return;
  }
  const memberships = await queryCollection(
    'private_chat_members',
    { filter: `(user = "${escapeFilter(userId)}" && chat_server = "${escapeFilter(chatServerId)}")`, perPage: '1' },
    token,
  );
  const allowed = memberships.length > 0;
  accessCache.set(key, { value: allowed, expiresAt: Date.now() + 30_000 });
  if (!allowed) throw new HttpError(403, 'You are not a member of this conversation.');
}

async function listServers(userId, token) {
  let serverIds = [];
  try {
    const memberships = await queryCollection('server_members', { filter: `user = "${escapeFilter(userId)}"`, perPage: '200' }, token);
    serverIds = memberships.map((membership) => membership.server).filter(Boolean);
  } catch {
    const legacy = await queryCollection('servers', { filter: `members ~ "${escapeFilter(userId)}"`, perPage: '200' }, token);
    return legacy;
  }
  if (!serverIds.length) return [];
  return queryCollection('servers', { filter: idsFilter('id', [...new Set(serverIds)]), perPage: '200', sort: 'name' }, token);
}

async function listDms(userId, token) {
  const memberships = await queryCollection('private_chat_members', { filter: `user = "${escapeFilter(userId)}"`, perPage: '200' }, token);
  const ids = [...new Set(memberships.map((membership) => membership.chat_server).filter(Boolean))];
  if (!ids.length) return [];
  return queryCollection('private_chat_servers', { filter: idsFilter('id', ids), perPage: '200', sort: '-updated' }, token);
}

function pbFileUrl(collection, recordId, filename, query = '') {
  if (!filename) return '';
  if (/^(https?:|data:|blob:)/i.test(filename)) return filename;
  return `${config.pbBaseUrl}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}${query ? `?${query}` : ''}`;
}

function normalizeAttachment(raw, collection) {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw.file || raw.filename || raw.url || '';
  const url = raw.url || pbFileUrl(raw.collectionName || collection, raw.id, file);
  return {
    id: raw.id || file,
    url,
    thumbnail_url: raw.thumbnail_url || (url ? `${url}${url.includes('?') ? '&' : '?'}thumb=400x300` : ''),
    name: raw.name || raw.title || raw.displayName || file,
    mime_type: raw.mime_type || raw.type || null,
    size: raw.size || null,
    width: raw.width || null,
    height: raw.height || null,
  };
}

function normalizeMessage(record, kind, conversationId) {
  const collection = kind === 'dm' ? 'private_messages' : 'messages';
  const expand = record.expand || {};
  const sender = expand.sender || expand.user || record.sender || record.user_record || null;
  const rawAttachments = expand.attachments_via_message ||
    expand.private_attachments_via_message ||
    expand.attachments ||
    expand.private_attachments ||
    [];
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments.map((item) => normalizeAttachment(item, kind === 'dm' ? 'private_attachments' : 'attachments')).filter(Boolean)
    : [];
  return {
    id: record.id,
    conversation_kind: kind,
    conversation_id: conversationId,
    content: record.content || '',
    sender_id: record.user || record.sender || record.sender_id || '',
    sender,
    created: record.created,
    updated: record.updated,
    reply_to: record.reply_to || null,
    edited: Boolean(record.edited || record.edited_at),
    edited_at: record.edited_at || null,
    deleted: Boolean(record.deleted || record.deleted_at),
    deleted_at: record.deleted_at || null,
    attachments,
  };
}

async function fetchMessagePage(kind, conversationId, query, token, userId) {
  const relation = kind === 'dm' ? 'chat_server' : 'channel';
  const attachmentExpand = kind === 'dm'
    ? 'private_attachments_via_message'
    : 'attachments_via_message';
  if (kind === 'dm') await ensureDmAccess(conversationId, userId, token);
  else await ensureChannelAccess(conversationId, userId, token);

  const requestedLimit = Math.min(100, Math.max(1, Number.parseInt(query.get('limit') || '30', 10) || 30));
  const records = await queryCollection(
    kind === 'dm' ? 'private_messages' : 'messages',
    {
      filter: buildMessageFilter(
        relation,
        conversationId,
        query.get('beforeCreated'),
        query.get('beforeId'),
      ),
      sort: '-created,-id',
      perPage: String(requestedLimit + 1),
      page: '1',
      expand: `user,sender,reply_to,${attachmentExpand}`,
    },
    token,
  );
  const hasMore = records.length > requestedLimit;
  const page = records.slice(0, requestedLimit);
  const items = page.map((record) => normalizeMessage(record, kind, conversationId)).reverse();
  const oldest = page.at(-1);
  return {
    items,
    nextCursor: hasMore && oldest ? { created: oldest.created, id: oldest.id } : null,
    hasMore,
  };
}

function buildMessageFilter(relation, conversationId, beforeCreated, beforeId) {
  const predicates = [`${relation} = "${escapeFilter(conversationId)}"`];
  if (beforeCreated && beforeId) {
    const created = escapeFilter(beforeCreated.replace('T', ' '));
    predicates.push(
      `(created < "${created}" || (created = "${created}" && id < "${escapeFilter(beforeId)}"))`,
    );
  }
  return predicates.join(' && ');
}

async function createMessage(kind, conversationId, body, userId, token) {
  if (kind === 'dm') await ensureDmAccess(conversationId, userId, token);
  else await ensureChannelAccess(conversationId, userId, token);
  const content = String(body.content || '').trim();
  if (!content) throw new HttpError(400, 'Message content is required.');
  if (content.length > 20_000) throw new HttpError(413, 'Message content is too long.');
  const recordBody = {
    content,
    user: userId,
    ...(kind === 'dm' ? { chat_server: conversationId } : { channel: conversationId }),
    ...(body.replyTo || body.reply_to ? { reply_to: body.replyTo || body.reply_to } : {}),
  };
  const attachmentExpand = kind === 'dm'
    ? 'private_attachments_via_message'
    : 'attachments_via_message';
  const result = await pbRequest(`${collectionPath(kind === 'dm' ? 'private_messages' : 'messages')}?expand=user,sender,reply_to,${attachmentExpand}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(recordBody),
  });
  if (!result.response.ok || !result.data?.id) {
    throw new HttpError(result.response.status, result.data?.message || 'Unable to send message.', result.data);
  }
  return normalizeMessage(result.data, kind, conversationId);
}

async function proxyLiveKit(body) {
  if (!config.livekitTokenUrl || !config.livekitInternalToken) {
    throw new HttpError(503, 'LiveKit token service is not configured.');
  }
  let response;
  try {
    response = await fetch(config.livekitTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.livekitInternalToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new HttpError(502, 'LiveKit token service is unavailable.', error?.message);
  }
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new HttpError(response.status, data?.error || 'LiveKit token request failed.', data);
  return data;
}

function conversationFromEvent(event) {
  const nested = event.data && typeof event.data === 'object' ? event.data : {};
  const conversation = event.conversation || nested.conversation || {};
  const record = event.record || event.message || nested.record || nested.message || {};
  const id = conversation.id || event.conversation_id || event.channel_id || event.channelId || event.chat_server ||
    nested.conversation_id || nested.channel_id || nested.channelId || nested.chat_server ||
    record.conversation_id || record.channel || record.chat_server || record.private_chat_id;
  if (!id) return null;
  return {
    kind: conversation.kind || event.conversation_kind || nested.conversation_kind ||
      (event.chat_server || nested.chat_server || record.chat_server || record.private_chat_id ? 'dm' : 'channel'),
    id: String(id),
  };
}

function publish(event, conversation) {
  if (event?.type?.startsWith('message.') && event.message?.id) {
    const version = event.message.updated || event.message.created || '';
    const key = `${event.type}:${event.message.id}:${version}`;
    const now = Date.now();
    const previous = recentMessageEvents.get(key);
    if (previous && now - previous < 15_000) return;
    recentMessageEvents.set(key, now);
    for (const [staleKey, timestamp] of recentMessageEvents) {
      if (now - timestamp > 60_000) recentMessageEvents.delete(staleKey);
    }
  }
  if (event?.type?.startsWith('call.')) {
    const callData = event.data && typeof event.data === 'object' ? event.data : {};
    const callId = callData.callId || callData.call_id || '';
    const senderId = event.sender_id || callData.userId || callData.user_id || '';
    if (callId) {
      const key = `${event.type}:${callId}:${senderId}`;
      const now = Date.now();
      const previous = recentCallEvents.get(key);
      if (previous && now - previous < 5_000) return;
      recentCallEvents.set(key, now);
      for (const [staleKey, timestamp] of recentCallEvents) {
        if (now - timestamp > 30_000) recentCallEvents.delete(staleKey);
      }
    }
  }
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (!client.authenticated || client.socket.readyState !== WebSocket.OPEN) continue;
    if (conversation && client.conversations.size > 0 && !client.conversations.has(`${conversation.kind}:${conversation.id}`)) continue;
    try {
      client.socket.send(payload);
    } catch {
      // The close handler removes dead clients.
    }
  }
}

function sendSocket(client, payload) {
  if (client.socket.readyState === WebSocket.OPEN) client.socket.send(JSON.stringify(payload));
}

function sendUpstreamSubscriptions(client) {
  if (client.upstream?.readyState !== WebSocket.OPEN) return;
  try {
    client.upstream.send(JSON.stringify({
      type: 'subscribe',
      conversations: [...client.conversations].map((key) => {
        const [kind, ...id] = key.split(':');
        return { kind, id: id.join(':') };
      }),
    }));
  } catch {
    // The upstream close handler will clear the bridge.
  }
}

function normalizeUpstreamEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const eventType = raw.type || raw.action || '';
  const record = raw.record || raw.message;
  if (record && (eventType.includes('message') || record.content !== undefined)) {
    const conversation = conversationFromEvent(raw);
    if (!conversation) return null;
    return {
      type: eventType.includes('delete') ? 'message.deleted' : eventType.includes('update') ? 'message.updated' : 'message.created',
      conversation,
      message: normalizeMessage(record, conversation.kind === 'dm' ? 'dm' : 'channel', conversation.id),
    };
  }
  return raw;
}

function attachUpstream(client) {
  if (!config.chatUpstreamWs) return;
  let upstream;
  try {
    upstream = new WebSocket(config.chatUpstreamWs, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
  } catch {
    return;
  }
  client.upstream = upstream;
  upstream.on('open', () => {
    try {
      upstream.send(JSON.stringify({ type: 'auth', token: client.token }));
      sendUpstreamSubscriptions(client);
    } catch {
      // Close handler will clean up the bridge.
    }
  });
  upstream.on('message', (data) => {
    try {
      const raw = JSON.parse(data.toString());
      const event = normalizeUpstreamEvent(raw);
      if (event) publish(event, conversationFromEvent(event));
    } catch {
      // Ignore malformed upstream frames.
    }
  });
  upstream.on('close', () => {
    if (client.upstream === upstream) client.upstream = null;
  });
  upstream.on('error', () => {
    try { upstream.close(); } catch {}
  });
}

async function handleSocketMessage(client, raw) {
  let event;
  try {
    event = JSON.parse(raw.toString());
  } catch {
    sendSocket(client, { type: 'error', error: 'Invalid JSON frame.' });
    return;
  }
  if (!client.authenticated) {
    if (event.type !== 'auth' || typeof event.token !== 'string') {
      sendSocket(client, { type: 'error', error: 'Authenticate before sending frames.' });
      return;
    }
    try {
      const record = await validateToken(event.token);
      client.authenticated = true;
      client.token = event.token;
      client.user = record;
      sendSocket(client, { type: 'ready', user: { id: record.id, username: record.username } });
      attachUpstream(client);
    } catch (error) {
      sendSocket(client, { type: 'error', error: error.message });
      client.socket.close(1008, 'Authentication failed');
    }
    return;
  }
  if (event.type === 'subscribe') {
    const list = Array.isArray(event.conversations) ? event.conversations : [];
    client.conversations = new Set(
      list
        .map((item) => `${item.kind === 'dm' ? 'dm' : 'channel'}:${String(item.id || '')}`)
        .filter((value) => !value.endsWith(':')),
    );
    sendUpstreamSubscriptions(client);
    sendSocket(client, { type: 'subscribed', count: client.conversations.size });
    return;
  }
  if (event.type?.startsWith('call.')) {
    const conversation = conversationFromEvent(event);
    publish({ ...event, sender_id: client.user.id }, conversation);
    if (client.upstream?.readyState === WebSocket.OPEN) client.upstream.send(JSON.stringify(event));
    return;
  }
  if (client.upstream?.readyState === WebSocket.OPEN) {
    client.upstream.send(JSON.stringify(event));
  }
}

async function handleRequest(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204);
    return;
  }
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const path = requestUrl.pathname;
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  try {
    if (path === '/health' || path === '/api/v2/health') {
      let pocketbase = false;
      try {
        const result = await fetch(`${config.pbBaseUrl}/api/health`, { signal: AbortSignal.timeout(3_000) });
        pocketbase = result.ok;
      } catch {}
      sendJson(res, pocketbase ? 200 : 503, {
        ok: pocketbase,
        service: 'sirverchats-api-v2',
        pocketbase,
        livekitConfigured: Boolean(config.livekitTokenUrl),
        requestId,
      });
      return;
    }

    if (path === '/livekit/token' && req.method === 'POST') {
      const body = await readJson(req);
      const token = bearerToken(req);
      // Keep the legacy route available for 0.4.x clients, but do not expose
      // the LiveKit broker to anonymous callers.
      const user = await validateToken(token);
      if (body.identity && String(body.identity) !== String(user.id)) {
        throw new HttpError(403, 'LiveKit identity must match the authenticated user.');
      }
      const response = await proxyLiveKit(body);
      sendJson(res, 200, response);
      return;
    }
    if (path === '/livekit/token') {
      throw new HttpError(405, 'Use POST for LiveKit token requests.');
    }

    if (!path.startsWith('/api/v2')) {
      sendJson(res, 404, { error: 'Not found.', requestId });
      return;
    }

    if (path === '/api/v2/auth/login' && req.method === 'POST') {
      sendJson(res, 200, await login(await readJson(req)));
      return;
    }
    if (path === '/api/v2/auth/refresh' && req.method === 'POST') {
      sendJson(res, 200, await refresh(await readJson(req), req));
      return;
    }
    if (path === '/api/v2/auth/logout' && req.method === 'POST') {
      sendEmpty(res);
      return;
    }

    const { token, record: user } = await requireAuth(req);
    if (path === '/api/v2/me' && req.method === 'GET') {
      sendJson(res, 200, { user });
      return;
    }
    if (path === '/api/v2/servers' && req.method === 'GET') {
      sendJson(res, 200, { items: await listServers(user.id, token) });
      return;
    }
    if (path === '/api/v2/dms' && req.method === 'GET') {
      sendJson(res, 200, { items: await listDms(user.id, token) });
      return;
    }
    if (path === '/api/v2/users' && req.method === 'GET') {
      const ids = (requestUrl.searchParams.get('ids') || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 200);
      sendJson(res, 200, { items: ids.length ? await queryCollection('users', { filter: idsFilter('id', ids), perPage: String(ids.length) }, token) : [] });
      return;
    }
    if (path === '/api/v2/notifications' && req.method === 'GET') {
      const result = await pbRequest(`${collectionPath('users', `/${encodeURIComponent(user.id)}`)}`, { headers: { Authorization: `Bearer ${token}` } });
      const value = result.data?.notifications;
      let items = [];
      try { items = Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch {}
      sendJson(res, 200, { items: Array.isArray(items) ? items : [] });
      return;
    }

    const channelMatch = path.match(/^\/api\/v2\/servers\/([^/]+)\/channels$/);
    if (channelMatch && req.method === 'GET') {
      const serverId = decodeURIComponent(channelMatch[1]);
      if (!(await findServerMembership(user.id, serverId, token))) throw new HttpError(403, 'You are not a member of this server.');
      sendJson(res, 200, { items: await queryCollection('channels', { filter: `server = "${escapeFilter(serverId)}"`, sort: 'position', perPage: '200' }, token) });
      return;
    }

    const messageMatch = path.match(/^\/api\/v2\/conversations\/(channel|dm)\/([^/]+)\/messages$/);
    if (messageMatch) {
      const kind = messageMatch[1];
      const conversationId = decodeURIComponent(messageMatch[2]);
      if (req.method === 'GET') {
        sendJson(res, 200, await fetchMessagePage(kind, conversationId, requestUrl.searchParams, token, user.id));
        return;
      }
      if (req.method === 'POST') {
        const message = await createMessage(kind, conversationId, await readJson(req), user.id, token);
        const event = { type: 'message.created', conversation: { kind, id: conversationId }, message };
        publish(event, { kind, id: conversationId });
        sendJson(res, 201, { message });
        return;
      }
    }

    if (path === '/api/v2/attachments' && req.method === 'POST') {
      const body = await readBody(req);
      const collection = requestUrl.searchParams.get('kind') === 'dm' ? 'private_attachments' : 'attachments';
      const result = await pbRequest(collectionPath(collection), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        },
        body,
      });
      if (!result.response.ok) throw new HttpError(result.response.status, result.data?.message || 'Attachment upload failed.', result.data);
      const attachment = normalizeAttachment(result.data, collection);
      sendJson(res, 201, { ...result.data, ...attachment });
      return;
    }

    const tokenMatch = path === '/api/v2/calls/token';
    if (tokenMatch && req.method === 'POST') {
      const body = await readJson(req);
      if (!body.identity || !body.room) throw new HttpError(400, 'identity and room are required.');
      if (String(body.identity) !== String(user.id)) {
        throw new HttpError(403, 'LiveKit identity must match the authenticated user.');
      }
      sendJson(res, 200, await proxyLiveKit(body));
      return;
    }

    const callMatch = path.match(/^\/api\/v2\/calls\/([^/]+)\/transition$/);
    if (callMatch && req.method === 'POST') {
      const callId = decodeURIComponent(callMatch[1]);
      const body = await readJson(req);
      const state = String(body.state || '');
      if (!['ringing', 'accepted', 'declined', 'cancelled', 'ended'].includes(state)) throw new HttpError(400, 'Invalid call lifecycle state.');
      const conversation = body.conversation && typeof body.conversation === 'object' ? body.conversation : null;
      const update = await pbRequest(`${collectionPath('calls', `/${encodeURIComponent(callId)}`)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state, updated: new Date().toISOString() }),
      });
      if (!update.response.ok && update.response.status !== 404) {
        throw new HttpError(update.response.status, update.data?.message || 'Call transition failed.', update.data);
      }
      if (update.response.status === 404) {
        // Native calls can begin with a generated ID. Create the durable row
        // on the first lifecycle transition when the collection permits it;
        // the media/ringing path remains usable on older schemas that reject
        // this optional persistence write.
        const createBody = {
          id: callId,
          state,
          started_by: user.id,
          ...(body.room ? { call: String(body.room) } : {}),
          ...(conversation?.kind === 'channel' && conversation.id
            ? { channel: String(conversation.id) }
            : {}),
        };
        try {
          await pbRequest(collectionPath('calls'), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(createBody),
          });
        } catch {
          // Lifecycle persistence is best-effort for older calls schemas. The
          // WebSocket event below remains the source of ephemeral call state.
        }
      }
      publish({ type: `call.${state}`, data: { callId, state, userId: user.id } }, null);
      sendEmpty(res);
      return;
    }

    sendJson(res, 404, { error: 'Not found.', requestId });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Internal server error.';
    if (!(error instanceof HttpError)) console.error(`[${requestId}]`, error);
    sendJson(res, status, { error: message, requestId, ...(error instanceof HttpError && error.details ? { details: error.details } : {}) });
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

function registerSocketServer(wss) {
  wss.on('connection', (socket) => {
  const client = {
    socket,
    token: '',
    user: null,
    authenticated: false,
    conversations: new Set(),
    upstream: null,
  };
  clients.add(client);
  const authTimer = setTimeout(() => {
    if (!client.authenticated) socket.close(1008, 'Authentication timeout');
  }, 10_000);
  socket.on('message', (raw) => {
    handleSocketMessage(client, raw).catch(() => socket.close(1011, 'Frame handling failed'));
  });
  socket.on('close', () => {
    clearTimeout(authTimer);
    clients.delete(client);
    try { client.upstream?.close(); } catch {}
  });
  });
}

const verifySocketOrigin = ({ origin }) => !origin || originForRequest(origin) !== null;
registerSocketServer(new WebSocketServer({
  server,
  path: '/api/v2/ws',
  verifyClient: verifySocketOrigin,
}));
// Keep the legacy path available while existing 0.4.x clients are migrated.
registerSocketServer(new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: verifySocketOrigin,
}));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`SirverChats API v2 listening on 127.0.0.1:${config.port}`);
  });
}

function cursorForRecord(record) {
  return { created: record.created, id: record.id };
}

export {
  config,
  buildMessageFilter,
  cursorForRecord,
  normalizeMessage,
  normalizeUpstreamEvent,
  originForRequest,
};
