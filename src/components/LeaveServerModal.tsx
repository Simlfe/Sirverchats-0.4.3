import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, Crown, Search, AlertTriangle, Check, X, ShieldAlert, Users, Loader2 } from 'lucide-react';
import { Server, User } from '../types';
import { pbService } from '../pocketbase';

interface LeaveServerModalProps {
  isOpen: boolean;
  server: Server | null;
  currentUser: User;
  lang: 'en' | 'ar';
  onClose: () => void;
  onSuccess: (server: Server, newOwnerId?: string) => void;
}

export default function LeaveServerModal({
  isOpen,
  server,
  currentUser,
  lang,
  onClose,
  onSuccess
}: LeaveServerModalProps) {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ownership Transfer State
  const [members, setMembers] = useState<{ id: string; user: User; is_member: boolean }[]>([]);
  const [fetchingMembers, setFetchingMembers] = useState(false);
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isOwner = Boolean(
    server && (server.owner === currentUser.id || (!server.owner && (server as any).created_by === currentUser.id))
  );

  useEffect(() => {
    if (!isOpen || !server) {
      setError(null);
      setSelectedNewOwnerId(null);
      setSearchQuery('');
      setLoading(false);
      return;
    }

    if (isOwner) {
      const loadMembers = async () => {
        setFetchingMembers(true);
        setError(null);
        try {
          const list = await pbService.getServerMembers(server.id);
          // Filter out current owner, bots, and inactive/left members
          const eligible = list.filter((m) => {
            if (!m.user || !m.user.id) return false;
            if (m.user.id === currentUser.id) return false;
            if ((m.user as any).is_bot) return false;
            if (m.is_member === false) return false;
            return true;
          });
          setMembers(eligible);
        } catch (err) {
          console.error('Failed to load server members for transfer:', err);
          setError(isAr ? 'فشل تحميل أعضاء السيرفر.' : 'Failed to load server members.');
        } finally {
          setFetchingMembers(false);
        }
      };
      loadMembers();
    }
  }, [isOpen, server?.id, isOwner, currentUser.id, isAr]);

  if (!isOpen || !server) return null;

  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const name = (m.user.display_name || '').toLowerCase();
    const uname = (m.user.username || '').toLowerCase();
    return name.includes(q) || uname.includes(q);
  });

  const handleConfirmLeave = async () => {
    if (!server || !currentUser) return;
    setLoading(true);
    setError(null);

    try {
      if (isOwner) {
        // If there are eligible members, owner MUST select a new owner first
        if (members.length > 0) {
          if (!selectedNewOwnerId) {
            setError(isAr ? 'يرجى تحديد العضو الجديد لنقل الملكية له أولاً.' : 'Please select a new owner before transferring and leaving.');
            setLoading(false);
            return;
          }

          // Step 1: Transfer ownership atomically
          await pbService.transferServerOwnership(server.id, selectedNewOwnerId);

          // Step 2: Leave server
          await pbService.leaveServer(server.id, currentUser.id);

          onSuccess(server, selectedNewOwnerId);
          onClose();
        } else {
          // Owner is the sole member
          await pbService.leaveServer(server.id, currentUser.id);
          onSuccess(server);
          onClose();
        }
      } else {
        // Normal member leave
        await pbService.leaveServer(server.id, currentUser.id);
        onSuccess(server);
        onClose();
      }
    } catch (err: any) {
      console.error('Leave server action failed:', err);
      setError(err?.message || (isAr ? 'حدث خطأ أثناء إجراء المغادرة.' : 'An error occurred while leaving the server.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 select-none">
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          className="relative w-full max-w-md rounded-3xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] text-[var(--theme-text-primary)] shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 pb-4 flex items-start gap-4 border-b border-[var(--theme-border)]">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                isOwner
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
              }`}
            >
              {isOwner ? <Crown className="w-6 h-6 animate-pulse" /> : <LogOut className="w-6 h-6" />}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-extrabold text-[var(--theme-text-primary)] truncate">
                {isOwner
                  ? isAr
                    ? `نقل ملكية السيرفر: ${server.name}`
                    : `Transfer Server Ownership: ${server.name}`
                  : isAr
                    ? `مغادرة السيرفر: ${server.name}`
                    : `Leave Server: ${server.name}`}
              </h3>
              <p className="text-xs text-[var(--theme-text-secondary)] font-medium mt-1 leading-relaxed">
                {isOwner
                  ? isAr
                    ? 'بصفتك المالك، يجب عليك نقل الملكية إلى عضو آخر قبل مغادرة السيرفر.'
                    : 'As the owner, you must transfer server ownership to another member before leaving.'
                  : isAr
                    ? 'ستفقد إمكانية الوصول إلى هذا السيرفر وقنواته ورسائله فوراً ما لم تتم دعوتك مجدداً.'
                    : 'You will immediately lose access to this server, its channels, and messages unless invited again.'}
              </p>
            </div>

            <button
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded-xl hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer border-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {isOwner ? (
              <div className="space-y-3">
                {fetchingMembers ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-[var(--theme-text-muted)]">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    <span className="text-xs font-medium">
                      {isAr ? 'جاري تحميل أعضاء السيرفر...' : 'Loading server members...'}
                    </span>
                  </div>
                ) : members.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed space-y-2">
                    <div className="flex items-center gap-2 font-bold text-amber-400">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>{isAr ? 'أنت العضو الوحيد في هذا السيرفر' : 'You are the only member'}</span>
                    </div>
                    <p>
                      {isAr
                        ? 'لا يوجد أعضاء آخرون لنقل الملكية لهم. يمكنك المغادرة مباشرة وسيظل السيرفر محفوضاً.'
                        : 'There are no other eligible members in this server. You can leave the server directly.'}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={isAr ? 'البحث عن عضو...' : 'Search members...'}
                        className="w-full ps-9 pe-4 py-2.5 rounded-2xl bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border)] text-xs text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    <p className="text-[11px] font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider">
                      {isAr ? 'حدد المالك الجديد للمتابعة:' : 'Select new server owner:'}
                    </p>

                    {/* Member List */}
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pe-1">
                      {filteredMembers.length === 0 ? (
                        <p className="py-4 text-center text-xs text-[var(--theme-text-muted)]">
                          {isAr ? 'لا يوجد أعضاء مطابقون للبحث.' : 'No members found.'}
                        </p>
                      ) : (
                        filteredMembers.map(({ user }) => {
                          const isSelected = selectedNewOwnerId === user.id;
                          const avatar = user.avatar
                            ? user.avatar.startsWith('http') || user.avatar.startsWith('blob:')
                              ? user.avatar
                              : `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`
                            : null;

                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => setSelectedNewOwnerId(user.id)}
                              className={`w-full p-3 rounded-2xl border text-start flex items-center justify-between gap-3 transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-500/15 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                                  : 'bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] hover:bg-[var(--theme-channel-hover-bg)]'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {avatar ? (
                                  <img src={avatar} alt="Avatar" className="w-8 h-8 rounded-xl object-cover shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                                    {(user.display_name || user.username || 'U').substring(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-[var(--theme-text-primary)] truncate">
                                    {user.display_name || user.username}
                                  </h4>
                                  <p className="text-[10px] text-[var(--theme-text-muted)] truncate">@{user.username}</p>
                                </div>
                              </div>

                              <div
                                className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                                  isSelected ? 'bg-amber-500 border-amber-400 text-slate-950' : 'border-[var(--theme-border)]'
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs leading-relaxed flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-rose-200 mb-1">
                    {isAr ? 'تأكيد الخروج من السيرفر' : 'Confirm Leaving Server'}
                  </span>
                  <span>
                    {isAr
                      ? `بمجرد الخروج من "${server.name}"، لن تظهر قنواته أو رسائله في شريطك الجانبي.`
                      : `Once you leave "${server.name}", its channels and messages will no longer appear in your sidebar.`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--theme-border)] bg-[var(--theme-bg-tertiary)] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-2xl bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] font-bold text-xs transition-all cursor-pointer border border-[var(--theme-border)]"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleConfirmLeave}
              disabled={loading || (isOwner && members.length > 0 && !selectedNewOwnerId)}
              className={`px-5 py-2.5 rounded-2xl font-extrabold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg border-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                isOwner
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري تنفيذ الطلب...' : 'Processing...'}</span>
                </>
              ) : isOwner ? (
                <>
                  <Crown className="w-4 h-4" />
                  <span>
                    {members.length > 0
                      ? isAr
                        ? 'نقل الملكية والمغادرة'
                        : 'Transfer & Leave'
                      : isAr
                        ? 'مغادرة السيرفر'
                        : 'Leave Server'}
                  </span>
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  <span>{isAr ? 'مغادرة السيرفر' : 'Leave Server'}</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
