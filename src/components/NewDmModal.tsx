import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, X, MessageSquare, UserCheck, Sparkles, User, MessageCircleCode } from 'lucide-react';
import { User as UserType, Channel } from '../types';
import { pbService, getEffectiveUserStatus } from '../pocketbase';

interface NewDmModalProps {
  currentUser: UserType;
  onClose: () => void;
  onSelectUserToDm: (user: UserType) => void;
  lang: 'en' | 'ar';
  allDmChannels?: Channel[];
}

export default function NewDmModal({
  currentUser,
  onClose,
  onSelectUserToDm,
  lang,
  allDmChannels = []
}: NewDmModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsList, setFriendsList] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);

  // Parse current user settings & friends list
  let mySettings: any = currentUser.settings;
  if (typeof mySettings === 'string') {
    try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
  }
  if (!mySettings) mySettings = {};

  const friendIdsList: string[] = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
    ? currentUser.friends
    : (mySettings.friends || []);
  const friendIdsSet = new Set<string>(friendIdsList);

  const blockedIdsList: string[] = (Array.isArray(currentUser.blocked_users) && currentUser.blocked_users.length > 0)
    ? currentUser.blocked_users
    : (mySettings.blocked_users || []);
  const blockedIdsSet = new Set<string>(blockedIdsList);

  // Set of user IDs with existing DM channels
  const existingDmUserIds = new Set<string>();
  (allDmChannels || []).forEach((chan) => {
    if (chan.recipientUser?.id) {
      existingDmUserIds.add(chan.recipientUser.id);
    } else if (chan.recipientId) {
      existingDmUserIds.add(chan.recipientId);
    } else if (chan.members && Array.isArray(chan.members)) {
      chan.members.forEach((mId) => {
        if (mId !== currentUser.id) existingDmUserIds.add(mId);
      });
    }
  });

  useEffect(() => {
    const loadFriendsData = async () => {
      setLoading(true);
      try {
        const allUsers = await pbService.fetchAllUsers();
        // Strictly filter to confirmed friends who are NOT current user and NOT blocked
        const confirmedFriends = allUsers.filter((u) => 
          u.id !== currentUser.id && 
          friendIdsSet.has(u.id) && 
          !blockedIdsSet.has(u.id)
        );
        setFriendsList(confirmedFriends);
      } catch (e) {
        console.warn('Failed to load friends for DM modal:', e);
      } finally {
        setLoading(false);
      }
    };
    loadFriendsData();
  }, [currentUser.id, friendIdsList.join(',')]);

  const filteredUsers = friendsList.filter((u) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const username = (u.username || '').toLowerCase();
    const displayName = (u.display_name || '').toLowerCase();
    return username.includes(query) || displayName.includes(query);
  });

  const getAvatarUrl = (user: UserType) => {
    if (user.avatar) {
      if (user.avatar.startsWith('blob:') || user.avatar.startsWith('http')) {
        return user.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`;
    }
    return '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 select-none">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="w-full max-w-md bg-[var(--theme-bg-card)] border border-[var(--theme-border)] rounded-2xl shadow-2xl overflow-hidden text-[var(--theme-text-primary)] flex flex-col"
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-[var(--theme-border)] flex items-center justify-between bg-[var(--theme-bg-secondary)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-[var(--theme-text-primary)]">
                {lang === 'ar' ? 'بدء محادثة خاصة مع صديق' : 'Start Direct Message'}
              </h3>
              <p className="text-[10px] text-[var(--theme-text-muted)]">
                {lang === 'ar' ? 'اختر صديقاً من قائمة أصدقائك لبدء المحادثة' : 'Select a friend from your list to chat'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-[var(--theme-bg-tertiary)] hover:opacity-80 text-[var(--theme-text-secondary)] transition-all cursor-pointer border-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-[var(--theme-border)] bg-[var(--theme-bg-secondary)]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[var(--theme-text-muted)] absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث عن صديق بالاسم أو اسم المستخدم...' : 'Search friends by display name or @username...'}
              className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-accent transition-all font-medium"
              autoFocus
            />
          </div>
        </div>

        {/* User List */}
        <div className="max-h-72 overflow-y-auto p-2 flex flex-col gap-1 scrollbar-thin scrollbar-none">
          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--theme-text-muted)] flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span>{lang === 'ar' ? 'جاري تحميل الأصدقاء...' : 'Loading friends...'}</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--theme-text-muted)] flex flex-col items-center gap-2">
              <User className="w-8 h-8 text-[var(--theme-text-muted)] opacity-60" />
              <span>
                {friendsList.length === 0
                  ? (lang === 'ar' ? 'ليس لديك أصدقاء مضافون بعد.' : 'You have no confirmed friends yet.')
                  : (lang === 'ar' ? 'لم يتم العثور على أصدقاء مطبقين لبحثك.' : 'No matching friends found.')}
              </span>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const avatar = getAvatarUrl(user);
              const hasExistingDm = existingDmUserIds.has(user.id);
              const status = getEffectiveUserStatus(user);

              return (
                <button
                  key={user.id}
                  onClick={() => {
                    onSelectUserToDm(user);
                    onClose();
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-accent/15 border border-transparent hover:border-accent/30 flex items-center justify-between gap-3 transition-all cursor-pointer text-left border-0 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* User Avatar */}
                    <div className="relative shrink-0">
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={user.display_name || user.username}
                          className="w-9 h-9 rounded-xl object-cover border border-[var(--theme-border)]"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-accent text-[var(--theme-accent-contrast,#ffffff)] font-extrabold flex items-center justify-center text-xs">
                          {(user.display_name || user.username || 'U').substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--theme-bg-primary)] ${
                        status === 'online'
                          ? 'bg-[var(--status-online)]'
                          : status === 'away'
                          ? 'bg-[var(--status-away)]'
                          : status === 'dnd'
                          ? 'bg-[var(--status-dnd)]'
                          : 'bg-[var(--status-offline)]'
                      }`} />
                    </div>

                    {/* User Details */}
                    <div className="truncate min-w-0">
                      <div className="font-extrabold text-xs text-[var(--theme-text-primary)] group-hover:text-accent truncate transition-colors flex items-center gap-1.5">
                        <span className="truncate">{user.display_name || user.username}</span>
                        {user.role === 'admin' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-mono">ADMIN</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--theme-text-muted)] font-mono truncate">
                        @{user.username}
                      </div>
                    </div>
                  </div>

                  {/* Connect / Existing DM Indicator */}
                  <div className="flex items-center gap-2 shrink-0">
                    {hasExistingDm ? (
                      <div className="px-2.5 py-1 rounded-lg bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] text-[10px] font-bold flex items-center gap-1">
                        <MessageCircleCode className="w-3 h-3 text-accent" />
                        <span>{lang === 'ar' ? 'محادثة قائمة' : 'Existing DM'}</span>
                      </div>
                    ) : (
                      <div className="px-3 py-1 rounded-lg bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] text-[11px] font-bold transition-all shadow-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>{lang === 'ar' ? 'محادثة' : 'Message'}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
