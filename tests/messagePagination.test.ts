import assert from 'node:assert/strict';
import { buildMessageCursorFilter, mergeMessagesChronologically, pageItemsChronological } from '../src/lib/messagePagination';

const sameTime = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  content: id,
  sender: 'u',
  channel: 'c',
  created: '2026-09-12T10:00:00.000Z',
}));

assert.equal(
  buildMessageCursorFilter('channel', 'c', { created: sameTime[2].created!, id: sameTime[2].id }),
  'channel = "c" && (created < "2026-09-12 10:00:00.000Z" || (created = "2026-09-12 10:00:00.000Z" && id < "c"))',
);

const first = pageItemsChronological([...sameTime].reverse(), 2);
assert.deepEqual(first.items.map((message) => message.id), ['c', 'd']);
assert.equal(first.hasMore, true);
assert.deepEqual(first.nextCursor, { created: sameTime[2].created, id: 'c' });

// Simulate the API returning newest-first pages. The cursor must walk every
// equal-timestamp record exactly once instead of skipping the tie boundary.
const newestFirst = [...sameTime].sort((a, b) => b.id.localeCompare(a.id));
const loaded: string[] = [];
let cursor = undefined as { created: string; id: string } | undefined;
for (;;) {
  const eligible = newestFirst.filter((message) => !cursor || message.created < cursor.created || (message.created === cursor.created && message.id < cursor.id));
  const page = pageItemsChronological(eligible.slice(0, 3), 2);
  loaded.push(...page.items.map((message) => message.id));
  if (!page.hasMore) break;
  cursor = page.nextCursor!;
}
assert.deepEqual(loaded.sort(), ['a', 'b', 'c', 'd']);
assert.equal(new Set(loaded).size, 4);

const merged = mergeMessagesChronologically([sameTime[0]], [sameTime[1], sameTime[2], sameTime[0], sameTime[3]]);
assert.deepEqual(merged.map((message) => message.id), ['a', 'b', 'c', 'd']);

console.log('message pagination tests passed');
