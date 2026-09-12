import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMessageFilter,
  normalizeMessage,
  normalizeUpstreamEvent,
  originForRequest,
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
