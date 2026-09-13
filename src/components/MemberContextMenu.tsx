import React, { useState } from 'react';
import { User, Server, ServerRole, ServerMember } from '../types';
import { Shield, UserMinus, Crown, MessageSquare, UserCheck, Ban, VolumeX, Check } from 'lucide-react';
import { pbService } from '../pocketbase';

interface MemberContextMenuProps {
  member: ServerMember;
  user: User;
  server: Server;
  currentUser: User | null;
  serverRoles: ServerRole[];
  assignedRoleIds: string[];
  x: number;
  y: number;
  onClose: () => void;
  onOpenProfile: (u: User) => void;
  onStartDm?: (u: User) => void;
  onRolesUpdated?: () => void;
  lang?: 'en' | 'ar';
}

export default function MemberContextMenu({
  member,
  user,
  server,
  currentUser,
  serverRoles,
  assignedRoleIds,
  x,
  y,
  onClose,
  onOpenProfile,
  onStartDm,
  onRolesUpdated,
  lang = 'en'
}: MemberContextMenuProps) {
  const [showRoleSubmenu, setShowRoleSubmenu] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isKicking, setIsKicking] = useState(false);

  const isSelf = currentUser?.id === user.id;
  const isOwner = server.owner === currentUser?.id || localStorage.getItem(`server_owner_${server.id}`) === currentUser?.id;
  const targetIsOwner = server.owner === user.id || localStorage.getItem(`server_owner_${server.id}`) === user.id;
  const isAppAdmin = currentUser?.role === 'admin' || currentUser?.role === 'half-admin';
  const canManageRoles = (isOwner || isAppAdmin) && !targetIsOwner;
  const canKick = (isOwner || isAppAdmin) && !isSelf && !targetIsOwner;
  const canTransferOwnership = isOwner && !isSelf;

  const handleToggleRole = async (role: ServerRole) => {
    const isAssigned = assignedRoleIds.includes(role.id) || assignedRoleIds.includes(role.name);
    let next: string[];
    if (isAssigned) {
      next = assignedRoleIds.filter((id) => id !== role.id && id !== role.name);
    } else {
      next = [...assignedRoleIds, role.id];
    }
    await pbService.updateMemberRole(server.id, user.id, next.join(','));
    if (onRolesUpdated) onRolesUpdated();
  };

  const handleKick = async () => {
    if (window.confirm(lang === 'ar' ? `هل أنت متأكد من طرد @${user.username} من السيرفر؟` : `Are you sure you want to kick @${user.username} from this server?`)) {
      setIsKicking(true);
      await pbService.kickServerMember(server.id, user.id);
      if (onRolesUpdated) onRolesUpdated();
      onClose();
    }
  };

  const handleTransfer = async () => {
    if (window.confirm(lang === 'ar' ? `هل أنت متأكد من نقل ملكية السيرفر بالكامل إلى @${user.username}؟ ستفقد صلاحيات المالك.` : `Are you sure you want to transfer total server ownership to @${user.username}? You will lose owner privileges.`)) {
      setIsTransferring(true);
      await pbService.transferServerOwnership(server.id, user.id);
      if (onRolesUpdated) onRolesUpdated();
      onClose();
    }
  };

  // Clamp positioning inside the current viewport. Math.min(x, viewport -
  // width) alone becomes negative on a narrow phone, which placed the menu
  // partly off-screen; the lower bound must win when the viewport is smaller
  // than the nominal menu size.
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
  const menuWidth = 224;
  const menuMargin = 10;
  const clampedX = Math.max(menuMargin, Math.min(x, Math.max(menuMargin, viewportWidth - menuWidth - menuMargin)));
  const clampedY = Math.max(menuMargin, Math.min(y, Math.max(menuMargin, viewportHeight - 280 - menuMargin)));

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-transparent cursor-default"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
        className="fixed z-55 w-56 max-h-[calc(100vh-20px)] max-h-[calc(100dvh-20px)] overflow-y-auto rounded-2xl bg-[var(--theme-bg-popup)] border border-[var(--theme-border)] shadow-2xl p-1.5 flex flex-col gap-1 text-xs text-[var(--theme-text-primary)] animate-in fade-in zoom-in-95 duration-100 select-none isolate"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--theme-text-muted)] border-b border-[var(--theme-border)] flex items-center justify-between">
          <span className="truncate">{user.display_name || user.username}</span>
          {targetIsOwner && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
        </div>

        {/* View Profile */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenProfile(user);
          }}
          className="w-full px-2.5 py-1.5 rounded-xl hover:bg-[var(--theme-channel-hover-bg)] flex items-center gap-2 text-start font-bold text-[var(--theme-text-primary)] transition-colors cursor-pointer border-0 bg-transparent"
        >
          <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{lang === 'ar' ? 'عرض الملف الشخصي' : 'View Profile'}</span>
        </button>

        {/* Direct Message */}
        {!isSelf && onStartDm && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartDm(user);
            }}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-[var(--theme-channel-hover-bg)] flex items-center gap-2 text-start font-bold text-accent transition-colors cursor-pointer border-0 bg-transparent"
          >
            <MessageSquare className="w-4 h-4 text-accent shrink-0" />
            <span>{lang === 'ar' ? 'إرسال رسالة خاصة' : 'Direct Message'}</span>
          </button>
        )}

        {/* Roles Submenu */}
        {canManageRoles && serverRoles.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRoleSubmenu(!showRoleSubmenu)}
              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-[var(--theme-channel-hover-bg)] flex items-center justify-between text-start font-bold text-[var(--theme-text-primary)] transition-colors cursor-pointer border-0 bg-transparent"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{lang === 'ar' ? 'إدارة الرتب' : 'Manage Roles'}</span>
              </div>
              <span className="text-[10px] text-[var(--theme-text-muted)]">›</span>
            </button>

            {showRoleSubmenu && (
              <div className="mt-1 p-1 rounded-xl bg-[var(--theme-bg-card)] border border-[var(--theme-border)] flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar shadow-lg">
                {serverRoles.map((role) => {
                  const isChecked = assignedRoleIds.includes(role.id) || assignedRoleIds.includes(role.name);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleToggleRole(role)}
                      className={`w-full px-2 py-1 rounded-lg flex items-center justify-between text-[11px] font-bold transition-all cursor-pointer border-0 ${
                        isChecked
                          ? 'bg-accent/15 text-[var(--theme-text-primary)]'
                          : 'hover:bg-[var(--theme-channel-hover-bg)] text-[var(--theme-text-secondary)]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5" style={{ color: role.color || undefined }}>
                        <span>{role.emoji || '🛡️'}</span>
                        <span className="truncate">{role.name}</span>
                      </span>
                      {isChecked && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Kick Member */}
        {canKick && (
          <button
            type="button"
            onClick={handleKick}
            disabled={isKicking}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-red-500/20 text-red-400 flex items-center gap-2 text-start font-bold transition-colors cursor-pointer border-0 bg-transparent mt-1 border-t border-[var(--theme-border)]"
          >
            <UserMinus className="w-4 h-4 shrink-0" />
            <span>{lang === 'ar' ? 'طرد من السيرفر' : 'Kick from Server'}</span>
          </button>
        )}

        {/* Transfer Ownership */}
        {canTransferOwnership && (
          <button
            type="button"
            onClick={handleTransfer}
            disabled={isTransferring}
            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-amber-500/20 text-amber-400 flex items-center gap-2 text-start font-bold transition-colors cursor-pointer border-0 bg-transparent"
          >
            <Crown className="w-4 h-4 shrink-0" />
            <span>{lang === 'ar' ? 'نقل ملكية السيرفر' : 'Transfer Ownership'}</span>
          </button>
        )}
      </div>
    </>
  );
}
