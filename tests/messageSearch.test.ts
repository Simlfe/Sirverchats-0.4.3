import assert from 'node:assert/strict';
import {
  getMessageSearchText,
  messageMatchesFilters,
  messageMatchesSearch,
  normalizeSearchText,
  parseMessageSearchQuery,
} from '../src/lib/messageSearch';

const channel = { id: 'channel-1', name: 'General' } as const;
const message = {
  id: 'message-1',
  content: 'Café plans for tomorrow: https://example.test/menu',
  sender: 'user-1',
  channel: channel.id,
  created: '2026-09-12T12:30:00.000Z',
  has_attachment: true,
  expand: {
    sender: { id: 'user-1', username: 'Alice', display_name: 'Alice Smith' },
    reply_to: { id: 'message-0', content: 'Old café notes', sender: 'user-2', channel: channel.id },
    attachments_via_message: [{ id: 'attachment-1', file: 'menu.PNG', type: 'image/png' }],
  },
} as any;

assert.equal(normalizeSearchText('  CAFÉ  '), 'cafe');
assert.match(getMessageSearchText(message), /cafe plans/);
assert.match(getMessageSearchText(message), /menu\.png/);

const parsed = parseMessageSearchQuery('"café plans" from:alice in:#general after:2026-09-01 has:image');
assert.deepEqual(parsed, {
  text: 'café plans',
  from: 'alice',
  inChannel: 'general',
  before: '',
  after: '2026-09-01',
  has: 'image',
});

assert.equal(messageMatchesSearch(message, 'cafe', { channel }), true);
assert.equal(messageMatchesSearch(message, 'from:alice in:general has:image', { channel }), true);
assert.equal(messageMatchesSearch(message, 'from:bob', { channel }), false);
assert.equal(messageMatchesSearch(message, 'has:link', { channel }), true);
assert.equal(messageMatchesSearch(message, 'has:video', { channel }), false);
assert.equal(messageMatchesSearch(message, 'before:2026-09-12', { channel }), false);
assert.equal(messageMatchesSearch(message, 'after:2026-09-13', { channel }), false);
assert.equal(messageMatchesSearch(message, 'in:random', { channel }), false);

assert.equal(messageMatchesFilters(message, { text: 'old café', from: 'user-2' }, { channel }), false);
assert.equal(messageMatchesFilters(message, { text: 'café', has: 'file' }, { channel }), true);

console.log('message search tests passed');
