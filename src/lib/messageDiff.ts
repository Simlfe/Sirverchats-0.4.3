import { Message } from '../types';
import { parseReactions } from '../components/MessageReactions';

export function isSingleMessageEqual(p: Message, n: Message): boolean {
  if (p === n) return true;
  if (p.id !== n.id) return false;
  if (p.content !== n.content) return false;
  if (p.pinned !== n.pinned) return false;
  if (p.deleted !== n.deleted) return false;
  if (p.deleted_at !== n.deleted_at) return false;

  // Compare reactions using normalized parser
  const pReactionsRaw = (p as any).reactions ?? p.expand?.reactions ?? (p as any).reactions_list ?? (p as any).message_reactions;
  const nReactionsRaw = (n as any).reactions ?? n.expand?.reactions ?? (n as any).reactions_list ?? (n as any).message_reactions;
  if (pReactionsRaw !== nReactionsRaw) {
    const pParsed = parseReactions(pReactionsRaw);
    const nParsed = parseReactions(nReactionsRaw);
    if (JSON.stringify(pParsed) !== JSON.stringify(nParsed)) {
      return false;
    }
  }

  // Compare attachments count
  const pAtts = ((p as any).attachments || p.expand?.['attachments_via_message'] || p.expand?.['private_attachments_via_message'] || p.expand?.['attachments(message)'] || p.expand?.['private_attachments(message)'] || []) as any[];
  const nAtts = ((n as any).attachments || n.expand?.['attachments_via_message'] || n.expand?.['private_attachments_via_message'] || n.expand?.['attachments(message)'] || n.expand?.['private_attachments(message)'] || []) as any[];
  if (pAtts.length !== nAtts.length) return false;

  return true;
}

export function areMessagesEqual(prev: Message[], next: Message[]): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    if (!isSingleMessageEqual(prev[i], next[i])) {
      return false;
    }
  }
  return true;
}

export function mergeMessageListPreservingReferences(prev: Message[], incoming: Message[]): Message[] {
  if (!prev || prev.length === 0) {
    if (!incoming || incoming.length === 0) return [];
    const seen = new Set<string>();
    return incoming.filter((m) => {
      const k = m.id;
      const t = (m as any).temp_id;
      if (k && seen.has(k)) return false;
      if (t && seen.has(t)) return false;
      if (k) seen.add(k);
      if (t) seen.add(t);
      return true;
    });
  }
  if (!incoming || incoming.length === 0) return prev;

  const seenIds = new Set<string>();
  const uniqueIncoming: Message[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const item = incoming[i];
    const key = item.id;
    const tempKey = (item as any).temp_id;
    if (key && seenIds.has(key)) continue;
    if (tempKey && seenIds.has(tempKey)) continue;
    if (key) seenIds.add(key);
    if (tempKey) seenIds.add(tempKey);
    uniqueIncoming.push(item);
  }

  if (areMessagesEqual(prev, uniqueIncoming)) {
    return prev;
  }

  const prevMap = new Map<string, Message>();
  for (const m of prev) {
    const k = m.id || (m as any).temp_id;
    if (k) prevMap.set(k, m);
  }

  const result: Message[] = new Array(uniqueIncoming.length);
  let hasAnyDiff = prev.length !== uniqueIncoming.length;

  for (let i = 0; i < uniqueIncoming.length; i++) {
    const inc = uniqueIncoming[i];
    const k = inc.id || (inc as any).temp_id;
    const old = k ? prevMap.get(k) : undefined;
    if (old && isSingleMessageEqual(old, inc)) {
      result[i] = old;
    } else {
      result[i] = inc;
      hasAnyDiff = true;
    }
  }

  return hasAnyDiff ? result : prev;
}
