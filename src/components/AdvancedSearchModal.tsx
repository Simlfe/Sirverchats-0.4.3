import React, { useState, useEffect, useRef } from 'react';
import { Channel, Message, User, Server } from '../types';
import { Search, X, Calendar, User as UserIcon, Hash, Filter, Image, FileText, ArrowRight, CornerDownRight } from 'lucide-react';
import { apiV2Client, GatewayError } from '../services/apiV2Client';
import { messageMatchesFilters, parseMessageSearchQuery, type MessageSearchHas } from '../lib/messageSearch';

interface AdvancedSearchModalProps {
  server: Server | null;
  currentChannel: Channel;
  serverChannels: Channel[];
  currentUser: User;
  onClose: () => void;
  onSelectMessage: (channelId: string, messageId: string) => void;
  /** Render the active conversation cache before remote search completes. */
  cachedMessages?: Message[];
  lang?: 'en' | 'ar';
}

export default function AdvancedSearchModal({
  server,
  currentChannel,
  serverChannels,
  currentUser,
  onClose,
  onSelectMessage,
  cachedMessages = [],
  lang = 'en'
}: AdvancedSearchModalProps) {
  const [query, setQuery] = useState('');
  const [targetChannelId, setTargetChannelId] = useState<string>(currentChannel.id);
  const [searchScope, setSearchScope] = useState<'current' | 'all_server'>('current');
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterBefore, setFilterBefore] = useState<string>('');
  const [filterAfter, setFilterAfter] = useState<string>('');
  const [filterHas, setFilterHas] = useState<MessageSearchHas>('all');

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Message[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchGenerationRef = useRef(0);

  useEffect(() => {
    // ChatPanel stays mounted across navigation; keep the modal's current
    // scope aligned with the newly selected conversation.
    setTargetChannelId(currentChannel.id);
  }, [currentChannel.id]);

  // Search through the same gateway read path as the chat feed. Results from
  // the active cache render first, while channel reads run in parallel and
  // obsolete query generations are cancelled/ignored.
  useEffect(() => {
    const generation = ++searchGenerationRef.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const parsed = parseMessageSearchQuery(query);
      const allChannels = [currentChannel, ...serverChannels]
        .filter((chan, index, list) => list.findIndex((candidate) => candidate.id === chan.id) === index);
      const requestedChannel = parsed.inChannel
        ? allChannels.find((chan) =>
            chan.id === parsed.inChannel ||
            chan.name.replace(/^#/, '').toLowerCase() === parsed.inChannel.toLowerCase(),
          )
        : null;
      const invalidChannelToken = Boolean(parsed.inChannel && !requestedChannel);
      const targetChannels = invalidChannelToken
        ? []
        : requestedChannel
          ? [requestedChannel]
          : searchScope === 'all_server'
            ? allChannels.filter((chan) => chan.type === 'text')
            : [allChannels.find((chan) => chan.id === targetChannelId) || currentChannel];
      const filters = {
        text: parsed.text,
        from: filterUser.trim() || parsed.from,
        before: filterBefore.trim() || parsed.before,
        after: filterAfter.trim() || parsed.after,
        has: filterHas === 'all' ? parsed.has : filterHas,
      };
      const resultMap = new Map<string, Message>();
      const addMatches = (chan: Channel, items: Message[]) => {
        for (const msg of items) {
          if (msg.deleted || msg.deleted_at) continue;
          if (!messageMatchesFilters(msg, { ...filters, inChannel: '' }, { channel: chan })) continue;
          resultMap.set(`${chan.id}:${msg.id}`, { ...msg, channel: chan.id });
        }
      };

      // Cache-first rendering keeps Advanced Search useful in offline/degraded
      // mode and avoids replacing visible results with a spinner.
      if (!invalidChannelToken && cachedMessages.length > 0) {
        const currentTarget = targetChannels.find((chan) => chan.id === currentChannel.id);
        if (currentTarget) addMatches(currentTarget, cachedMessages);
      }
      setSearchError(invalidChannelToken ? 'The channel in the in: filter was not found.' : null);
      setResults(Array.from(resultMap.values()).slice(0, 50));
      setIsLoading(!invalidChannelToken && targetChannels.length > 0 && resultMap.size === 0);

      const runSearch = async () => {
        if (invalidChannelToken || targetChannels.length === 0) {
          if (generation === searchGenerationRef.current) setIsLoading(false);
          return;
        }

        const responses = await Promise.allSettled(targetChannels.map(async (chan) => {
          const isDm = chan.server === 'dm' || chan.id.startsWith('dm-') || chan.id.startsWith('private-') || chan.name.startsWith('@') || Boolean(chan.recipientUser);
          const target = isDm
            ? chan.id.startsWith('dm-server-')
              ? { kind: 'dm' as const, id: chan.id.slice('dm-server-'.length) }
              : chan.id.startsWith('private-')
                ? { kind: 'dm' as const, id: chan.id.slice('private-'.length) }
                : null
            : { kind: 'channel' as const, id: chan.id };
          if (!target) return { chan, items: [] as Message[] };
          const page = await apiV2Client.getMessages(target.kind, target.id, 100, undefined, {
            signal: controller.signal,
            search: parsed.text || undefined,
            dedupeKey: `search:${generation}:${target.kind}:${target.id}`,
          });
          return { chan, items: page.items };
        }));

        if (generation !== searchGenerationRef.current) return;
        let failed = false;
        responses.forEach((response) => {
          if (response.status === 'fulfilled') addMatches(response.value.chan, response.value.items);
          else if (!(response.reason instanceof GatewayError && response.reason.code === 'cancelled')) failed = true;
        });
        const sorted = Array.from(resultMap.values()).sort((a, b) => {
          const time = Date.parse(b.created || '') - Date.parse(a.created || '');
          return time || b.id.localeCompare(a.id);
        });
        setResults(sorted.slice(0, 50));
        setSearchError(failed ? 'Some search sources are unavailable; showing cached results.' : null);
        setIsLoading(false);
      };

      void runSearch().catch((error) => {
        if (generation !== searchGenerationRef.current) return;
        if (!(error instanceof GatewayError && error.code === 'cancelled')) {
          console.warn('Advanced search error:', error);
          setSearchError('Search is temporarily unavailable; showing cached results.');
        }
        setIsLoading(false);
      });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, targetChannelId, searchScope, filterUser, filterBefore, filterAfter, filterHas, currentChannel.id, serverChannels, cachedMessages]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="advanced-search-title"
      className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
    >
      <div
        className="w-full max-w-3xl min-w-0 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-1rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100vh-2rem)] sm:max-h-[calc(100dvh-2rem)] text-[var(--theme-text-primary)] animate-in zoom-in-95 duration-150"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Header with Search Input */}
        <div className="p-3 sm:p-4 border-b border-[var(--theme-border)] flex flex-col gap-3 shrink-0 bg-[var(--theme-bg-primary)]/80">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Search className="w-5 h-5 text-accent" />
              <h2 id="advanced-search-title" className="text-sm font-black uppercase tracking-wider text-[var(--theme-text-primary)] truncate">
                {lang === 'ar' ? 'البحث المتقدم والفلاتر' : 'Advanced Search & Filters'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer border-0 bg-transparent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] focus-within:border-accent shadow-inner">
            <Search className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'ابحث عن نص، أو اكتب from:user أو in:channel أو before:2026-08-01...'
                  : 'Search text, or type from:user in:general before:2026-08-01...'
              }
              className="flex-1 bg-transparent text-sm text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] p-1 cursor-pointer bg-transparent border-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Filter Modifiers */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Scope */}
            {server && serverChannels.length > 1 && (
              <div className="flex items-center gap-1 bg-[var(--theme-bg-secondary)] p-1 rounded-xl border border-[var(--theme-border)]">
                <button
                  type="button"
                  onClick={() => setSearchScope('current')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer border-0 ${
                    searchScope === 'current' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-xs' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] bg-transparent'
                  }`}
                >
                  #{currentChannel.name}
                </button>
                <button
                  type="button"
                  onClick={() => setSearchScope('all_server')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer border-0 ${
                    searchScope === 'all_server' ? 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-xs' : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] bg-transparent'
                  }`}
                >
                  {lang === 'ar' ? 'كل قنوات السيرفر' : 'All Server Channels'}
                </button>
              </div>
            )}

            {/* From Filter */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)]">
              <UserIcon className="w-3.5 h-3.5 text-sky-400" />
              <input
                type="text"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                placeholder="from:username"
                className="bg-transparent text-xs text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none w-24"
              />
            </div>

            {/* After Date Filter */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)]">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] text-[var(--theme-text-muted)]">{lang === 'ar' ? 'بعد:' : 'After:'}</span>
              <input
                type="date"
                value={filterAfter}
                onChange={(e) => setFilterAfter(e.target.value)}
                className="bg-transparent text-xs text-[var(--theme-text-primary)] focus:outline-none"
              />
            </div>

            {/* Before Date Filter */}
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)]">
              <Calendar className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[10px] text-[var(--theme-text-muted)]">{lang === 'ar' ? 'قبل:' : 'Before:'}</span>
              <input
                type="date"
                value={filterBefore}
                onChange={(e) => setFilterBefore(e.target.value)}
                className="bg-transparent text-xs text-[var(--theme-text-primary)] focus:outline-none"
              />
            </div>

            {/* Has Filter */}
            <select
              value={filterHas}
              onChange={(e) => setFilterHas(e.target.value as any)}
              className="px-2.5 py-1 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-secondary)] focus:outline-none cursor-pointer"
            >
              <option value="all">{lang === 'ar' ? 'كل أنواع المحتوى' : 'All Content'}</option>
              <option value="file">{lang === 'ar' ? 'يحتوي على ملفات' : 'Has Files'}</option>
              <option value="image">{lang === 'ar' ? 'يحتوي على صور' : 'Has Images'}</option>
              <option value="video">{lang === 'ar' ? 'يحتوي على فيديوهات' : 'Has Videos'}</option>
              <option value="link">{lang === 'ar' ? 'يحتوي على روابط' : 'Has Links'}</option>
            </select>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-2.5 hover-scrollbar">
          {searchError && (
            <div className="mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {searchError}
            </div>
          )}
          {isLoading ? (
            <div className="py-12 text-center text-[var(--theme-text-muted)] text-sm animate-pulse">
              {lang === 'ar' ? 'جارٍ البحث...' : 'Searching...'}
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-[var(--theme-text-muted)] text-sm flex flex-col items-center gap-2">
              <Filter className="w-8 h-8 opacity-40" />
              <span>{lang === 'ar' ? 'لم يتم العثور على رسائل تطابق معايير البحث.' : 'No messages matched your search filters.'}</span>
            </div>
          ) : (
            results.map((msg) => {
              const matchedChan = serverChannels.find((c) => c.id === msg.channel) || currentChannel;
              const sender = msg.expand?.sender || (typeof (msg as any).sender === 'object' ? (msg as any).sender : undefined);
              const senderName = sender?.display_name || sender?.username || 'User';
              const attachmentCount = [
                msg.attachments,
                msg.expand?.attachments_via_message,
                msg.expand?.private_attachments_via_message,
                msg.expand?.attachments,
                msg.expand?.private_attachments,
              ].reduce((count, items) => count + (Array.isArray(items) ? items.length : 0), 0);

              return (
                <div
                  key={msg.id}
                  onClick={() => {
                    onSelectMessage(msg.channel, msg.id);
                    onClose();
                  }}
                  className="p-3 rounded-2xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] hover:border-accent/60 hover:bg-[var(--theme-bg-tertiary)] transition-all cursor-pointer flex flex-col gap-1.5 group"
                >
                  <div className="flex items-start justify-between gap-2 text-xs text-[var(--theme-text-muted)] min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap font-bold">
                      <span className="text-[var(--theme-text-primary)] font-extrabold max-w-[42%] truncate">{senderName}</span>
                      {sender?.username && <span className="text-[10px] text-[var(--theme-text-muted)] max-w-[35%] truncate">@{sender.username}</span>}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-accent font-mono max-w-[42%] truncate">
                        #{matchedChan.name}
                      </span>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-right text-[10px] font-mono text-[var(--theme-text-muted)]">
                      {new Date(msg.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--theme-text-secondary)] line-clamp-2 leading-relaxed break-words font-medium">
                    {msg.content || (attachmentCount > 0 ? (lang === 'ar' ? '📎 [مرفق]' : '📎 [Attachment]') : '')}
                  </p>

                  <div className="flex items-center justify-end gap-1 text-[10px] text-accent opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                    <span>{lang === 'ar' ? 'الانتقال إلى الرسالة' : 'Jump to message'}</span>
                    <ArrowRight className={`w-3 h-3 ${lang === 'ar' ? 'rotate-180' : ''}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
