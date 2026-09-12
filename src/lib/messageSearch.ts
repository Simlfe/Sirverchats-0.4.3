import type { Attachment, Channel, Message, User } from '../types';

export type MessageSearchHas = 'all' | 'file' | 'image' | 'link' | 'video';

export interface ParsedMessageSearch {
  text: string;
  from: string;
  inChannel: string;
  before: string;
  after: string;
  has: MessageSearchHas;
}

export interface MessageSearchContext {
  channel?: Pick<Channel, 'id' | 'name'> | null;
}

const TOKEN_PATTERN = /(?:^|\s)(from|in|before|after|has):("[^"]+"|'[^']+'|[^\s]+)/gi;
const IMAGE_EXTENSIONS = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;
const VIDEO_EXTENSIONS = /\.(?:3gp|avi|m4v|mkv|mov|mp4|mpeg|mpg|webm|wmv)(?:$|[?#])/i;
const LINK_PATTERN = /https?:\/\/[^\s<>]+/i;

/**
 * Normalize user-entered search text without changing the original message.
 * NFKC handles full-width/compatibility characters and removing combining
 * marks makes searches behave consistently for accented Latin text.
 */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/** Parse inline modifiers while retaining ordinary text as the free query. */
export function parseMessageSearchQuery(value: string): ParsedMessageSearch {
  const parsed: ParsedMessageSearch = {
    text: '',
    from: '',
    inChannel: '',
    before: '',
    after: '',
    has: 'all',
  };

  const source = String(value ?? '');
  const text = source.replace(TOKEN_PATTERN, (match, key: string, rawValue: string) => {
    const modifier = key.toLowerCase();
    const modifierValue = unquote(rawValue);
    if (!modifierValue) return match;

    if (modifier === 'from') parsed.from = modifierValue;
    else if (modifier === 'in') parsed.inChannel = modifierValue.replace(/^#/, '');
    else if (modifier === 'before') parsed.before = modifierValue;
    else if (modifier === 'after') parsed.after = modifierValue;
    else if (modifier === 'has') {
      const contentType = modifierValue.toLowerCase() as MessageSearchHas;
      if (contentType === 'file' || contentType === 'image' || contentType === 'link' || contentType === 'video') {
        parsed.has = contentType;
      } else {
        // Keep an unsupported modifier visible as ordinary text instead of
        // silently returning unrelated messages.
        return match;
      }
    }
    return ' ';
  });

  parsed.text = unquote(text.replace(/\s+/g, ' ').trim());
  return parsed;
}

function asUser(value: unknown): Partial<User> | null {
  return value && typeof value === 'object' ? value as Partial<User> : null;
}

function senderValues(message: Message): string[] {
  const expanded = asUser(message.expand?.sender);
  const sender = asUser((message as any).sender);
  const user = asUser((message as any).user);
  const values = [
    expanded?.username,
    expanded?.display_name,
    expanded?.id,
    sender?.username,
    sender?.display_name,
    sender?.id,
    user?.username,
    user?.display_name,
    user?.id,
    typeof (message as any).sender === 'string' ? (message as any).sender : undefined,
    (message as any).sender_id,
    (message as any).user_id,
  ];
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function attachmentValues(message: Message): Array<Attachment | string> {
  const expand = message.expand || {};
  const values: Array<Attachment | string> = [];
  const sources: unknown[] = [
    message.attachments,
    expand.attachments_via_message,
    expand.private_attachments_via_message,
    expand['attachments(message)'],
    expand['private_attachments(message)'],
    expand.attachments,
    expand.private_attachments,
  ];

  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const value of source) {
      if (typeof value === 'string' || (value && typeof value === 'object')) {
        values.push(value as Attachment | string);
      }
    }
  }
  return values;
}

function attachmentText(value: Attachment | string): string[] {
  if (typeof value === 'string') return [value];
  return [
    value.file,
    value.title,
    value.displayName,
    value.artist,
    value.uploader,
    value.type,
    value.url,
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function attachmentName(value: Attachment | string): string {
  return attachmentText(value).join(' ');
}

function attachmentMime(value: Attachment | string): string {
  if (typeof value === 'string') return '';
  return String(value.type || (value as any).mime_type || '').toLowerCase();
}

function hasImageAttachment(attachments: Array<Attachment | string>): boolean {
  return attachments.some((attachment) => {
    const name = attachmentName(attachment);
    return attachmentMime(attachment).startsWith('image/') || IMAGE_EXTENSIONS.test(name);
  });
}

function hasVideoAttachment(attachments: Array<Attachment | string>): boolean {
  return attachments.some((attachment) => {
    const name = attachmentName(attachment);
    return attachmentMime(attachment).startsWith('video/') || VIDEO_EXTENSIONS.test(name);
  });
}

/** Build the text index used by both quick search and Advanced Search. */
export function getMessageSearchText(message: Message): string {
  const reply = message.expand?.reply_to;
  return normalizeSearchText([
    message.content,
    ...senderValues(message),
    reply?.content,
    ...(attachmentValues(message).flatMap(attachmentText)),
  ].filter(Boolean).join(' '));
}

function matchesChannelToken(token: string, channel?: Pick<Channel, 'id' | 'name'> | null): boolean {
  if (!token) return true;
  if (!channel) return false;
  const normalizedToken = normalizeSearchText(token).replace(/^#/, '');
  return normalizedToken === normalizeSearchText(channel.id) || normalizedToken === normalizeSearchText(channel.name).replace(/^#/, '');
}

function parseBoundary(value: string, mode: 'before' | 'after'): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  // Date-only `before:` follows the conventional exclusive boundary at
  // midnight; `after:` remains inclusive from the selected day.
  return timestamp;
}

function matchesDateFilters(message: Message, parsed: ParsedMessageSearch): boolean {
  const messageTime = Date.parse(message.created || '');
  if (Number.isNaN(messageTime)) return !parsed.before && !parsed.after;

  if (parsed.before) {
    const before = parseBoundary(parsed.before, 'before');
    if (before === null || messageTime >= before) return false;
  }
  if (parsed.after) {
    const after = parseBoundary(parsed.after, 'after');
    if (after === null || messageTime < after) return false;
  }
  return true;
}

function matchesHasFilter(message: Message, has: MessageSearchHas): boolean {
  if (has === 'all') return true;
  const attachments = attachmentValues(message);
  if (has === 'link') return LINK_PATTERN.test(message.content || '');
  if (has === 'image') return hasImageAttachment(attachments);
  if (has === 'video') return hasVideoAttachment(attachments);
  return Boolean(message.has_attachment) || attachments.length > 0;
}

/** Apply the same matching rules to quick and advanced search. */
export function messageMatchesParsedSearch(
  message: Message,
  parsed: ParsedMessageSearch,
  context: MessageSearchContext = {},
): boolean {
  if (parsed.text && !getMessageSearchText(message).includes(normalizeSearchText(parsed.text))) return false;

  const from = normalizeSearchText(parsed.from).replace(/^@/, '');
  if (from && !senderValues(message).some((value) => normalizeSearchText(value).replace(/^@/, '').includes(from))) return false;
  if (!matchesChannelToken(parsed.inChannel, context.channel)) return false;
  if (!matchesDateFilters(message, parsed)) return false;
  return matchesHasFilter(message, parsed.has);
}

export function messageMatchesSearch(
  message: Message,
  query: string,
  context: MessageSearchContext = {},
): boolean {
  return messageMatchesParsedSearch(message, parseMessageSearchQuery(query), context);
}

export interface MessageSearchFilters {
  text?: string;
  from?: string;
  inChannel?: string;
  before?: string;
  after?: string;
  has?: MessageSearchHas;
}

/** Match fields supplied by filter controls without reparsing a query. */
export function messageMatchesFilters(
  message: Message,
  filters: MessageSearchFilters,
  context: MessageSearchContext = {},
): boolean {
  const parsed: ParsedMessageSearch = {
    text: filters.text || '',
    from: filters.from || '',
    inChannel: filters.inChannel || '',
    before: filters.before || '',
    after: filters.after || '',
    has: filters.has || 'all',
  };
  return messageMatchesParsedSearch(message, parsed, context);
}
