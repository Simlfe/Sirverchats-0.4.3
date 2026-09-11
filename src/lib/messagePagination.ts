import type { Message, MessageCursor } from '../types';

export function buildMessageCursorFilter(
  relationField: string,
  relationId: string,
  before?: MessageCursor,
): string {
  const base = `${relationField} = "${relationId}"`;
  if (!before?.created || !before.id) return base;
  const created = before.created.includes('T') ? before.created.replace('T', ' ') : before.created;
  return `${base} && (created < "${created}" || (created = "${created}" && id < "${before.id}"))`;
}

export function pageItemsChronological(items: Message[], limit: number): {
  items: Message[];
  hasMore: boolean;
  nextCursor: MessageCursor | null;
} {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const hasMore = items.length > safeLimit;
  const page = items.slice(0, safeLimit).reverse();
  const oldest = page[0];
  return {
    items: page,
    hasMore,
    nextCursor: hasMore && oldest?.created ? { created: oldest.created, id: oldest.id } : null,
  };
}

export function mergeMessagesChronologically(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  [...existing, ...incoming].forEach((message) => {
    if (message.id && !message.deleted && !message.deleted_at) byId.set(message.id, message);
  });
  return Array.from(byId.values()).sort((a, b) => {
    const created = new Date(a.created || 0).getTime() - new Date(b.created || 0).getTime();
    return created || a.id.localeCompare(b.id);
  });
}
