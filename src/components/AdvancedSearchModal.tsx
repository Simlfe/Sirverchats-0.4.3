import React, { useState, useMemo, useEffect } from 'react';
import { Channel, Message, User, Server } from '../types';
import { Search, X, Calendar, User as UserIcon, Hash, Filter, Image, FileText, ArrowRight, CornerDownRight } from 'lucide-react';
import { pbService } from '../pocketbase';

interface AdvancedSearchModalProps {
  server: Server | null;
  currentChannel: Channel;
  serverChannels: Channel[];
  currentUser: User;
  onClose: () => void;
  onSelectMessage: (channelId: string, messageId: string) => void;
  lang?: 'en' | 'ar';
}

export default function AdvancedSearchModal({
  server,
  currentChannel,
  serverChannels,
  currentUser,
  onClose,
  onSelectMessage,
  lang = 'en'
}: AdvancedSearchModalProps) {
  const [query, setQuery] = useState('');
  const [targetChannelId, setTargetChannelId] = useState<string>(currentChannel.id);
  const [searchScope, setSearchScope] = useState<'current' | 'all_server'>('current');
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterBefore, setFilterBefore] = useState<string>('');
  const [filterAfter, setFilterAfter] = useState<string>('');
  const [filterHas, setFilterHas] = useState<'all' | 'file' | 'image' | 'link'>('all');

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Message[]>([]);

  // Parse inline search tokens like `from:username`, `in:channel`, `before:YYYY-MM-DD`, `after:YYYY-MM-DD`
  useEffect(() => {
    const handleSearch = async () => {
      setIsLoading(true);
      try {
        let textQuery = query;
        let fromUser = filterUser;
        let inChan = searchScope === 'current' ? targetChannelId : '';
        let beforeDate = filterBefore;
        let afterDate = filterAfter;
        let hasType = filterHas;

        // Parse query string tokens
        const fromMatch = textQuery.match(/from:([^\s]+)/i);
        if (fromMatch) {
          fromUser = fromMatch[1];
          textQuery = textQuery.replace(fromMatch[0], '').trim();
        }

        const inMatch = textQuery.match(/in:([^\s]+)/i);
        if (inMatch) {
          const chanName = inMatch[1].replace('#', '');
          const matchedChan = serverChannels.find((c) => c.name.toLowerCase() === chanName.toLowerCase() || c.id === chanName);
          if (matchedChan) inChan = matchedChan.id;
          textQuery = textQuery.replace(inMatch[0], '').trim();
        }

        const beforeMatch = textQuery.match(/before:([^\s]+)/i);
        if (beforeMatch) {
          beforeDate = beforeMatch[1];
          textQuery = textQuery.replace(beforeMatch[0], '').trim();
        }

        const afterMatch = textQuery.match(/after:([^\s]+)/i);
        if (afterMatch) {
          afterDate = afterMatch[1];
          textQuery = textQuery.replace(afterMatch[0], '').trim();
        }

        const hasMatch = textQuery.match(/has:(file|image|link|video)/i);
        if (hasMatch) {
          hasType = hasMatch[1] as any;
          textQuery = textQuery.replace(hasMatch[0], '').trim();
        }

        const searchChannels = inChan
          ? [serverChannels.find((c) => c.id === inChan) || currentChannel]
          : (searchScope === 'all_server' && serverChannels.length > 0 ? serverChannels : [currentChannel]);

        const allMatched: Message[] = [];

        for (const chan of searchChannels) {
          try {
            const list = await pbService.fetchMessages(chan.id, 1, 100);
            for (const msg of list.items) {
              if (msg.deleted || msg.deleted_at) continue;

              // Text query matching
              if (textQuery.trim()) {
                const qLower = textQuery.trim().toLowerCase();
                const contentMatch = msg.content?.toLowerCase().includes(qLower);
                if (!contentMatch) continue;
              }

              // From user matching
              if (fromUser) {
                const uLower = fromUser.toLowerCase();
                const senderName = (msg.expand?.sender?.username || msg.expand?.sender?.display_name || '').toLowerCase();
                if (!senderName.includes(uLower)) continue;
              }

              // Date filtering
              if (beforeDate) {
                const msgTime = new Date(msg.created).getTime();
                const beforeTime = new Date(beforeDate).getTime();
                if (!isNaN(beforeTime) && msgTime > beforeTime + 86400000) continue;
              }

              if (afterDate) {
                const msgTime = new Date(msg.created).getTime();
                const afterTime = new Date(afterDate).getTime();
                if (!isNaN(afterTime) && msgTime < afterTime) continue;
              }

              // Media / Has filtering
              if (hasType === 'file') {
                const hasAttach = (msg.attachments && msg.attachments.length > 0) || (msg.expand?.attachments && msg.expand.attachments.length > 0);
                if (!hasAttach) continue;
              } else if (hasType === 'image') {
                const hasImg = msg.attachments?.some((a: any) => typeof a === 'string' && /\.(jpg|jpeg|png|gif|webp)$/i.test(a)) ||
                  msg.expand?.attachments?.some((a: any) => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file || ''));
                if (!hasImg) continue;
              } else if (hasType === 'link') {
                const hasLink = /(https?:\/\/[^\s]+)/gi.test(msg.content || '');
                if (!hasLink) continue;
              }

              allMatched.push({ ...msg, channel: chan.id });
            }
          } catch (e) {}
        }

        allMatched.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        setResults(allMatched.slice(0, 50));
      } catch (err) {
        console.warn('Advanced search error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(handleSearch, 250);
    return () => clearTimeout(timer);
  }, [query, targetChannelId, searchScope, filterUser, filterBefore, filterAfter, filterHas, currentChannel.id, serverChannels]);

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="w-full max-w-3xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[var(--theme-text-primary)] animate-in zoom-in-95 duration-150"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Header with Search Input */}
        <div className="p-4 border-b border-[var(--theme-border)] flex flex-col gap-3 bg-[var(--theme-bg-primary)]/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-accent" />
              <h2 className="text-sm font-black uppercase tracking-wider text-[var(--theme-text-primary)]">
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
              <option value="link">{lang === 'ar' ? 'يحتوي على روابط' : 'Has Links'}</option>
            </select>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 hover-scrollbar min-h-[300px]">
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
              const sender = msg.expand?.sender;
              const senderName = sender?.display_name || sender?.username || 'User';

              return (
                <div
                  key={msg.id}
                  onClick={() => {
                    onSelectMessage(msg.channel, msg.id);
                    onClose();
                  }}
                  className="p-3 rounded-2xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border)] hover:border-accent/60 hover:bg-[var(--theme-bg-tertiary)] transition-all cursor-pointer flex flex-col gap-1.5 group"
                >
                  <div className="flex items-center justify-between text-xs text-[var(--theme-text-muted)]">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="text-[var(--theme-text-primary)] font-extrabold">{senderName}</span>
                      <span className="text-[10px] text-[var(--theme-text-muted)]">@{sender?.username}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)] text-accent font-mono">
                        #{matchedChan.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[var(--theme-text-muted)]">
                      {new Date(msg.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--theme-text-secondary)] line-clamp-2 leading-relaxed break-words font-medium">
                    {msg.content || (msg.attachments && msg.attachments.length > 0 ? (lang === 'ar' ? '📎 [مرفق]' : '📎 [Attachment]') : '')}
                  </p>

                  <div className="flex items-center justify-end gap-1 text-[10px] text-accent opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                    <span>{lang === 'ar' ? 'الانتقال إلى الرسالة' : 'Jump to message'}</span>
                    <ArrowRight className="w-3 h-3" />
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
