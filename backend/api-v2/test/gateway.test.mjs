import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMessageFilter,
  normalizeMessage,
  normalizeUpstreamEvent,
  originForRequest,
  participantIds,
  toDmSummary,
  messageExpand,
  pbFileUrl,
  listDms,
  fetchMessagePage,
  createMessage,
} from '../server.mjs';

test('CORS accepts the production app, root domain, tauri, and sirverdata subdomains', () => {
  assert.equal(originForRequest('https://app.sirverdata.top'), 'https://app.sirverdata.top');
  assert.equal(originForRequest('https://sirverdata.top'), 'https://sirverdata.top');
  assert.equal(originForRequest('http://tauri.localhost'), 'http://tauri.localhost');
  assert.equal(originForRequest('https://preview.sirverdata.top'), 'https://preview.sirverdata.top');
  assert.equal(originForRequest('https://evil.example'), null);
});

test('message normalization emits the single v2 message shape with thumbnail URLs', () => {
  const message = normalizeMessage(
    {
      id: 'm1',
      user: 'u1',
      content: 'hello',
      created: '2026-01-01 12:00:00.000Z',
      expand: {
        user: { id: 'u1', username: 'alice' },
        attachments_via_message: [{ id: 'a1', file: 'photo.jpg', type: 'image/jpeg' }],
      },
    },
    'channel',
    'general',
  );
  assert.equal(message.conversation_kind, 'channel');
  assert.equal(message.conversation_id, 'general');
  assert.equal(message.sender_id, 'u1');
  assert.equal(message.attachments[0].thumbnail_url.includes('thumb=400x300'), true);
});

test('PocketBase realtime records normalize from their relation fields once', () => {
  const event = normalizeUpstreamEvent({
    action: 'create',
    record: {
      id: 'm2',
      chat_server: 'dm-2',
      user: 'u2',
      content: 'realtime',
      created: '2026-01-01 12:00:00.000Z',
    },
  });
  assert.equal(event.type, 'message.created');
  assert.deepEqual(event.conversation, { kind: 'dm', id: 'dm-2' });
  assert.equal(event.message.id, 'm2');
});

test('message cursor filter includes the ID tie-breaker for equal timestamps', () => {
  assert.equal(
    buildMessageFilter(
      'channel',
      'general',
      '2026-01-01T12:00:00.000Z',
      'm2',
    ),
    'channel = "general" && (created < "2026-01-01 12:00:00.000Z" || (created = "2026-01-01 12:00:00.000Z" && id < "m2"))',
  );
});

test('DM summaries select one counterpart from the normalized participant list', () => {
  const record = {
    id: 'dm-1',
    users: ['me', 'other'],
    updated: '2026-01-01 12:00:00.000Z',
    __currentUserId: 'me',
    expand: {
      users: [
        { id: 'me', username: 'me' },
        { id: 'other', username: 'other', display_name: 'Other User' },
      ],
    },
  };
  assert.deepEqual(participantIds(record), ['me', 'other']);
  const summary = toDmSummary(record, new Map());
  assert.equal(summary.id, 'dm-1');
  assert.equal(summary.counterpart.id, 'other');
  assert.equal(summary.recipientUser.username, 'other');
  assert.equal(summary.__currentUserId, undefined);
});

test('DM bootstrap matches the production users relation without a per-DM user waterfall', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname.includes('/private_chat_members/records')) {
      return new Response(JSON.stringify({ items: [{ chat_server: 'dm-1' }] }), { status: 200 });
    }
    if (url.pathname.includes('/private_chat_servers/records')) {
      assert.equal(url.searchParams.get('expand'), 'users');
      return new Response(JSON.stringify({
        items: [{
          id: 'dm-1',
          users: ['me', 'other'],
          updated: '2026-01-01 12:00:00.000Z',
          expand: {
            users: [
              { id: 'me', username: 'me' },
              { id: 'other', username: 'other', display_name: 'Other User' },
            ],
          },
        }],
      }), { status: 200 });
    }
    throw new Error(`unexpected PocketBase request: ${url}`);
  };
  try {
    const summaries = await listDms('me', 'test-token');
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].counterpart.username, 'other');
    assert.equal(requests.filter((url) => url.pathname.includes('/users/records')).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public message pages request only relations present on the production schema', async () => {
  assert.equal(messageExpand('channel').includes('user'), false);
  assert.equal(messageExpand('dm').includes('user'), true);
  assert.equal(pbFileUrl('attachments', 'a1', 'photo.jpg').startsWith('https://api.sirverdata.top/'), true);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/channels/records')) {
      return new Response(JSON.stringify({ items: [{ id: 'c1', server: 's1' }] }), { status: 200 });
    }
    if (url.pathname.includes('/server_members/records')) {
      return new Response(JSON.stringify({ items: [{ id: 'member-1', server: 's1', user: 'me' }] }), { status: 200 });
    }
    if (url.pathname.includes('/messages/records')) {
      assert.equal(url.searchParams.get('expand'), 'sender,reply_to,attachments_via_message');
      assert.match(url.searchParams.get('filter'), /content ~ "new"/);
      return new Response(JSON.stringify({ items: [
        { id: 'm2', channel: 'c1', sender: 'other', content: 'new', created: '2026-01-01 12:01:00.000Z' },
        { id: 'm1', channel: 'c1', sender: 'other', content: 'old', created: '2026-01-01 12:00:00.000Z' },
      ] }), { status: 200 });
    }
    throw new Error(`unexpected PocketBase request: ${url}`);
  };
  try {
    const page = await fetchMessagePage(
      'channel',
      'c1',
      new URLSearchParams({ limit: '1', search: 'new' }),
      'test-token',
      'me',
    );
    assert.deepEqual(page.items.map((item) => item.id), ['m2']);
    assert.equal(page.hasMore, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('message writes use the production sender relation for public channels', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    requests.push({ url, options });
    if (url.pathname.includes('/channels/records')) {
      return new Response(JSON.stringify({ items: [{ id: 'c-create', server: 's-create' }] }), { status: 200 });
    }
    if (url.pathname.includes('/server_members/records')) {
      return new Response(JSON.stringify({ items: [{ id: 'member-create', server: 's-create', user: 'me-create' }] }), { status: 200 });
    }
    if (url.pathname.includes('/messages/records')) {
      const body = JSON.parse(String(options.body));
      assert.deepEqual(body, { content: 'hello', sender: 'me-create', channel: 'c-create' });
      return new Response(JSON.stringify({
        id: 'm-create',
        content: body.content,
        sender: body.sender,
        channel: body.channel,
        created: '2026-01-01 12:00:00.000Z',
      }), { status: 200 });
    }
    throw new Error(`unexpected PocketBase request: ${url}`);
  };
  try {
    const message = await createMessage('channel', 'c-create', { content: 'hello' }, 'me-create', 'test-token');
    assert.equal(message.id, 'm-create');
    assert.equal(requests.at(-1).url.searchParams.get('expand'), 'sender,reply_to,attachments_via_message');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
