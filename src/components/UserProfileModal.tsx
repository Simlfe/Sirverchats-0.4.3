import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { User, Server, ServerRole, ServerMember } from '../types';
import { pbService, getEffectiveUserStatus, getServerMemberAvatarUrl, getServerMemberBannerUrl, getServerMemberDisplayName, getServerMemberProfileSettings, getEffectiveProfile, getPrimaryServerRole, mergeUserRecord } from '../pocketbase';
import { isAndroidPlatform, isMobilePlatform } from '../lib/tauriDesktopService';
import { X, Calendar, Globe, Award, Mail, MessageSquare, Phone, UserX, UserPlus, UserCheck, Clock, UserMinus, Shield, Camera, Edit3, Check, Loader2, Flag, Ban, AlertTriangle, MoreVertical } from 'lucide-react';

// In-memory lightweight profile card cache to eliminate loading flashes on re-open
const profileCardCache = new Map<string, {
  user: User;
  serverMember: ServerMember | null;
  assignedRoles: { id: string; name: string; emoji?: string; color?: string }[];
  timestamp: number;
}>();
const cardHeightCache = new Map<string, number>();
import { motion, AnimatePresence } from 'motion/react';
import Avatar from './Avatar';
import GifImage from './GifImage';
import { optimizeImage } from '../lib/imageOptimizer';

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  isMemberListDesktop?: boolean;
  memberListLeft?: number;
  memberListRight?: number;
}

export function calculatePopoutPosition(
  anchorRect: AnchorRect | null,
  cardWidth: number,
  cardHeight: number,
  windowWidth: number,
  windowHeight: number,
  preferredPlacement?: 'above' | 'right' | 'left' | 'below'
) {
  const PADDING = 12;
  const GAP = 10;

  // On mobile screens (<768px), center the user profile card horizontally and vertically in the viewport
  if (windowWidth < 768) {
    const clampedWidth = Math.min(cardWidth, windowWidth - 24);
    const clampedHeight = Math.min(cardHeight, windowHeight - 32);
    const posX = (windowWidth - clampedWidth) / 2;
    const posY = (windowHeight - clampedHeight) / 2;

    return {
      x: Math.max(12, posX),
      y: Math.max(16, posY),
      placement: 'below' as const,
      transformOrigin: 'center center',
    };
  }

  const target = anchorRect || {
    left: windowWidth / 2,
    top: windowHeight / 2,
    right: windowWidth / 2,
    bottom: windowHeight / 2,
    width: 0,
    height: 0,
  };

  // Special case: Desktop Server Member List positioning
  if (anchorRect?.isMemberListDesktop) {
    const memberListLeft = anchorRect.memberListLeft ?? target.left;
    const memberListRight = anchorRect.memberListRight ?? target.right;
    const isMemberListOnRight = memberListLeft > windowWidth / 2;

    // Align vertically with avatar center
    const avatarCenterY = target.top + (target.height ? target.height / 2 : 0);
    const posY = avatarCenterY - cardHeight / 2;

    let posX = 0;
    let placement: 'right' | 'left' | 'below' | 'above' = 'left';

    if (isMemberListOnRight) {
      // Place to the LEFT of the Member List panel (toward chat area)
      placement = 'left';
      const desiredRight = memberListLeft - GAP;
      posX = desiredRight - cardWidth;

      if (posX < PADDING) {
        posX = Math.max(PADDING, target.left - cardWidth - GAP);
      }
    } else {
      // Member list is on left side (RTL) -> place to the RIGHT of the Member List panel
      placement = 'right';
      posX = memberListRight + GAP;

      if (posX + cardWidth > windowWidth - PADDING) {
        posX = Math.min(windowWidth - cardWidth - PADDING, posX);
      }
    }

    const maxAllowedX = Math.max(PADDING, windowWidth - cardWidth - PADDING);
    const maxAllowedY = Math.max(PADDING, windowHeight - cardHeight - PADDING);

    const clampedX = Math.max(PADDING, Math.min(maxAllowedX, posX));
    const clampedY = Math.max(PADDING, Math.min(maxAllowedY, posY));

    // Compute avatar center in viewport
    const avatarCenterX = target.left + (target.width ? target.width / 2 : 0);

    // Convert avatar center to card coordinate system for smooth transform origin animation
    const originXInCard = Math.round(avatarCenterX - clampedX);
    const originYInCard = Math.round(avatarCenterY - clampedY);

    const transformOrigin = `${originXInCard}px ${originYInCard}px`;

    return {
      x: clampedX,
      y: clampedY,
      placement,
      transformOrigin,
    };
  }

  const rightSpace = windowWidth - target.right - GAP - PADDING;
  const leftSpace = target.left - GAP - PADDING;
  const bottomSpace = windowHeight - target.bottom - GAP - PADDING;
  const topSpace = target.top - GAP - PADDING;

  let effectivePreferred = preferredPlacement;

  // Only auto-prefer "above" if no explicit preferred placement was provided AND horizontal space is restricted on both sides
  if (!effectivePreferred && anchorRect && target.bottom >= windowHeight - 100 && rightSpace < cardWidth && leftSpace < cardWidth) {
    effectivePreferred = 'above';
  }

  let placement: 'right' | 'left' | 'below' | 'above' = effectivePreferred || 'right';
  let posX = 0;
  let posY = 0;

  if (effectivePreferred === 'above') {
    placement = 'above';
    posX = target.left + target.width / 2 - cardWidth / 2;
    posY = target.top - cardHeight - GAP;
  } else if (effectivePreferred === 'below') {
    placement = 'below';
    posX = target.left + target.width / 2 - cardWidth / 2;
    posY = target.bottom + GAP;
  } else if (effectivePreferred === 'left') {
    placement = 'left';
    posX = target.left - cardWidth - GAP;
    posY = target.top + target.height / 2 - cardHeight / 2;
  } else if (effectivePreferred === 'right') {
    placement = 'right';
    posX = target.right + GAP;
    posY = target.top + target.height / 2 - cardHeight / 2;
  } else {
    // Auto placement: Prefer side positioning (right, then left) for messages/avatars in chat
    if (rightSpace >= Math.min(cardWidth, 220)) {
      placement = 'right';
      posX = target.right + GAP;
      posY = target.top + target.height / 2 - cardHeight / 2;
    } else if (leftSpace >= Math.min(cardWidth, 220)) {
      placement = 'left';
      posX = target.left - cardWidth - GAP;
      posY = target.top + target.height / 2 - cardHeight / 2;
    } else if (bottomSpace >= cardHeight) {
      placement = 'below';
      posX = target.left + target.width / 2 - cardWidth / 2;
      posY = target.bottom + GAP;
    } else if (topSpace >= cardHeight) {
      placement = 'above';
      posX = target.left + target.width / 2 - cardWidth / 2;
      posY = target.top - cardHeight - GAP;
    } else {
      if (rightSpace >= leftSpace) {
        placement = 'right';
        posX = target.right + GAP;
        posY = target.top + target.height / 2 - cardHeight / 2;
      } else {
        placement = 'left';
        posX = target.left - cardWidth - GAP;
        posY = target.top + target.height / 2 - cardHeight / 2;
      }
    }
  }

  const maxAllowedX = Math.max(PADDING, windowWidth - cardWidth - PADDING);
  const maxAllowedY = Math.max(PADDING, windowHeight - cardHeight - PADDING);

  const clampedX = Math.max(PADDING, Math.min(maxAllowedX, posX));
  const clampedY = Math.max(PADDING, Math.min(maxAllowedY, posY));

  // Compute avatar center in viewport
  const avatarCenterX = target.left + (target.width ? target.width / 2 : 0);
  const avatarCenterY = target.top + (target.height ? target.height / 2 : 0);

  // Convert avatar center to card coordinate system
  const originXInCard = Math.round(avatarCenterX - clampedX);
  const originYInCard = Math.round(avatarCenterY - clampedY);

  const transformOrigin = `${originXInCard}px ${originYInCard}px`;

  return {
    x: clampedX,
    y: clampedY,
    placement,
    transformOrigin,
  };
}

interface UserProfileModalProps {
  key?: React.Key;
  user: User;
  onClose: () => void;
  lang: 'en' | 'ar';
  t: (key: string) => string;
  theme?: string;
  currentUser?: User | null;
  currentServer?: Server | null;
  onTransferOwnership?: (newOwnerId: string) => void;
  onKickMember?: (userId: string) => void;
  onStartDm?: (targetUser: User) => void;
  onStartCall?: (targetUser: User) => void;
  animations?: string;
  anchorRect?: AnchorRect | null;
  preferredPlacement?: 'above' | 'right' | 'left' | 'below';
  onUpdateUser?: (updated: User) => void;
  isEditable?: boolean;
}

export default function UserProfileModal({
  user,
  onClose,
  lang,
  t,
  theme = 'slate',
  currentUser,
  currentServer,
  onTransferOwnership,
  onKickMember,
  onStartDm,
  onStartCall,
  animations = 'high',
  anchorRect = null,
  preferredPlacement,
  onUpdateUser,
  isEditable = false
}: UserProfileModalProps) {
  const isLight = theme === 'light';

  const getThemeClasses = (_themeName?: string) => {
    return {
      btnColor: 'bg-accent hover:opacity-90 shadow-accent/10',
      textColor: 'text-accent'
    };
  };

  const tc = getThemeClasses(theme);

  const getRoleBadgeColor = () => {
    if (user.role === 'admin') return 'bg-red-500/10 text-red-400 border-red-500/20';
    if (user.role === 'half-admin') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  };

  const cacheKey = `${user.id}_${currentServer?.id || 'global'}`;

  const [liveUser, setLiveUser] = useState<User>(() => {
    const cached = profileCardCache.get(cacheKey);
    if (cached?.user) {
      return mergeUserRecord(user, cached.user);
    }
    return user;
  });

  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const isSelf = Boolean(currentUser && user.id === currentUser.id && isEditable);

  const [mobileBannerEditing, setMobileBannerEditing] = useState(false);
  const [mobileAvatarEditing, setMobileAvatarEditing] = useState(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [selfBioInput, setSelfBioInput] = useState('');
  const [isSavingBio, setIsSavingBio] = useState(false);

  const handleSelfAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && currentUser) {
      try {
        setIsUploadingAvatar(true);
        const rawFile = e.target.files[0];
        const optimized = await optimizeImage(rawFile, { maxWidth: 512, maxHeight: 512, quality: 0.85 });
        if (!viewDefaultProfile && currentServer) {
          const updatedMember = await pbService.updateServerMemberProfile(currentServer.id, currentUser.id, {
            server_avatar: optimized
          });
          setServerMemberRecord(updatedMember);
        } else {
          const updatedUser = await pbService.updateProfile(currentUser.id, {}, optimized);
          setLiveUser((prev) => mergeUserRecord(prev, updatedUser));
          onUpdateUser?.(updatedUser);
        }
      } catch (err) {
        console.error('Failed to update avatar:', err);
      } finally {
        setIsUploadingAvatar(false);
      }
    }
  };

  const handleSelfBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && currentUser) {
      try {
        setIsUploadingBanner(true);
        const rawFile = e.target.files[0];
        const optimized = await optimizeImage(rawFile, { maxWidth: 1280, maxHeight: 720, quality: 0.85 });
        if (!viewDefaultProfile && currentServer) {
          const updatedMember = await pbService.updateServerMemberProfile(currentServer.id, currentUser.id, {
            server_banner: optimized
          });
          setServerMemberRecord(updatedMember);
        } else {
          const updatedUser = await pbService.updateProfile(currentUser.id, {}, undefined, optimized);
          setLiveUser((prev) => mergeUserRecord(prev, updatedUser));
          onUpdateUser?.(updatedUser);
        }
      } catch (err) {
        console.error('Failed to update banner:', err);
      } finally {
        setIsUploadingBanner(false);
      }
    }
  };

  const handleSaveSelfBio = async () => {
    if (!currentUser) return;
    try {
      setIsSavingBio(true);
      if (!viewDefaultProfile && currentServer) {
        const updatedMember = await pbService.updateServerMemberProfile(currentServer.id, currentUser.id, {
          server_profile_settings: {
            ...(serverMemberRecord?.server_profile_settings || {}),
            bio: selfBioInput.trim()
          }
        });
        setServerMemberRecord(updatedMember);
      } else {
        const updatedUser = await pbService.updateProfile(currentUser.id, { bio: selfBioInput.trim() });
        setLiveUser((prev) => mergeUserRecord(prev, updatedUser));
        onUpdateUser?.(updatedUser);
      }
      setIsEditingBio(false);
    } catch (err) {
      console.error('Failed to update bio:', err);
    } finally {
      setIsSavingBio(false);
    }
  };

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetType, setReportTargetType] = useState<'admin' | 'owner'>('admin');
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState('');

  const isBlocked = React.useMemo(() => {
    if (!currentUser) return false;
    const blockedList = Array.isArray(currentUser.blocked_users) ? currentUser.blocked_users : [];
    return blockedList.includes(user.id);
  }, [currentUser, user.id]);

  const handleToggleBlock = async () => {
    if (!currentUser) return;
    try {
      let updated: User;
      if (isBlocked) {
        updated = await pbService.unblockUser(user.id);
      } else {
        updated = await pbService.blockUser(user.id);
      }
      if (onUpdateUser) {
        onUpdateUser(updated);
      }
    } catch (err) {
      console.error('Failed to toggle block status:', err);
    }
  };

  const handleSendReport = async () => {
    if (!reportReason.trim() || isSubmittingReport) return;
    setIsSubmittingReport(true);
    try {
      await pbService.createReport({
        reportedUserId: user.id,
        reason: reportReason,
        details: reportDetails,
        serverId: currentServer?.id,
        targetType: reportTargetType,
      });
      setReportSuccessMsg(lang === 'ar' ? 'تم إرسال بلاغك بنجاح.' : 'Report submitted successfully.');
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccessMsg('');
        setReportReason('');
        setReportDetails('');
      }, 1500);
    } catch (err) {
      console.error('Failed to submit report:', err);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const effectiveStatus = getEffectiveUserStatus(liveUser || user, isSelf);

  const statusColor = {
    online: 'bg-[var(--status-online)]',
    away: 'bg-[var(--status-away)]',
    dnd: 'bg-[var(--status-dnd)]',
    offline: 'bg-[var(--status-offline)]'
  }[effectiveStatus] || 'bg-[var(--status-online)]';

  const statusText = {
    online: lang === 'ar' ? 'متصل' : 'Online',
    away: lang === 'ar' ? 'بعيد' : 'Away',
    dnd: lang === 'ar' ? 'عدم الإزعاج' : 'Do Not Disturb',
    offline: lang === 'ar' ? 'غير متصل' : 'Offline'
  }[effectiveStatus] || 'Online';

  // Dynamic Theme Colors for the profile modal
  const themeStyles = 'bg-[var(--theme-bg-card)] border-[var(--theme-border)] text-[var(--theme-text-primary)]';

  const textSecondary = 'text-[var(--theme-text-secondary)]';
  const textMuted = 'text-[var(--theme-text-muted)]';

  const isOwnerOfActiveServer = currentServer && currentUser && currentServer.owner === currentUser.id;
  const isViewingOtherUser = currentUser && user.id !== currentUser.id;

  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState<number>(() => cardHeightCache.get(user.id) || 460);
  const [winSize, setWinSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  useLayoutEffect(() => {
    if (cardRef.current) {
      const h = cardRef.current.offsetHeight;
      if (h > 0) {
        cardHeightCache.set(user.id, h);
        if (Math.abs(h - cardHeight) > 2) {
          setCardHeight(h);
        }
      }
    }
  });

  useEffect(() => {
    const handleResize = () => {
      setWinSize({ width: window.innerWidth, height: window.innerHeight });
      if (cardRef.current) {
        const h = cardRef.current.offsetHeight;
        if (h > 0) {
          cardHeightCache.set(user.id, h);
          setCardHeight(h);
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [cardHeight, user.id]);

  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);

  useEffect(() => {
    setIsClosing(false);
    isClosingRef.current = false;
  }, [user.id, user]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isMobileDevice = winSize.width < 1024 || isMobilePlatform() || isAndroidPlatform();

  const getFramerTransition = (animSpeed?: string) => {
    if (isAndroidPlatform() || isMobileDevice || animSpeed === 'none' || animSpeed === 'low') {
      return { duration: 0.1, ease: 'easeOut' };
    }
    return { duration: 0.12, ease: [0.16, 1, 0.3, 1] };
  };

  const cardWidth = Math.min(380, winSize.width - 24);
  const pos = calculatePopoutPosition(
    anchorRect || null,
    cardWidth,
    cardHeight,
    winSize.width,
    winSize.height,
    preferredPlacement
  );

  const [viewDefaultProfile, setViewDefaultProfile] = useState(() => !currentServer);

  useEffect(() => {
    if (!currentServer) {
      setViewDefaultProfile(true);
    } else {
      setViewDefaultProfile(false);
    }
  }, [currentServer?.id, user.id]);

  useEffect(() => {
    // If viewing self, prioritize currentUser object
    const initialUser = (currentUser && currentUser.id === user.id) ? mergeUserRecord(user, currentUser) : user;
    setLiveUser(initialUser);

    pbService.getUserById(user.id).then((fresh) => {
      if (fresh) {
        setLiveUser((prev) => {
          const merged = mergeUserRecord(prev, fresh);
          profileCardCache.set(cacheKey, {
            user: merged,
            serverMember: serverMemberRecord,
            assignedRoles: assignedRolesList,
            timestamp: Date.now(),
          });
          return merged;
        });
      }
    });
  }, [user.id, user.updated, user.avatar, user.banner, (user as any).cardColor, (user as any).color1, currentServer?.id, cacheKey]);

  useEffect(() => {
    if (!currentUser || currentUser.id === user.id) {
      setRelStatus('none');
      return;
    }
    let mySettings = currentUser.settings;
    if (typeof mySettings === 'string') {
      try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
    }
    const currentFriends = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
      ? currentUser.friends
      : (mySettings?.friends || []);
    if (currentFriends.includes(user.id)) {
      setRelStatus('friend');
    } else {
      const reqs = mySettings?.friend_requests || [];
      if (reqs.some((r: any) => r.targetId === user.id || r.id === user.id)) {
        setRelStatus('pending');
      } else {
        setRelStatus('none');
      }
    }
  }, [user.id, currentUser]);

  useEffect(() => {
    const handleUserPresenceChanged = (e: any) => {
      if (e.detail?.id === user.id) {
        setLiveUser((prev) => mergeUserRecord(prev, e.detail));
      }
    };
    window.addEventListener('user-presence-changed', handleUserPresenceChanged);
    
    // Refresh tick interval every 10s to continuously re-evaluate heartbeat timeout
    const tickInterval = setInterval(() => {
      setLiveUser((prev) => ({ ...prev }));
    }, 10000);

    return () => {
      window.removeEventListener('user-presence-changed', handleUserPresenceChanged);
      clearInterval(tickInterval);
    };
  }, [user.id]);

  // Safely parse user settings (handles JSON strings from PocketBase or standard objects)
  let settingsObj: any = liveUser.settings;
  if (typeof settingsObj === 'string') {
    try {
      settingsObj = JSON.parse(settingsObj);
    } catch (e) {
      settingsObj = {};
    }
  }

  const color1 = settingsObj?.appearance?.cardColor || liveUser.settings?.cardColor || (liveUser as any).cardColor || (liveUser as any).color1 || 'var(--accent-color)';
  const color2 = settingsObj?.appearance?.cardColor2 || liveUser.settings?.cardColor2 || (liveUser as any).cardColor2 || (liveUser as any).color2 || 'var(--accent-color)';
  const avatarFrameColor = settingsObj?.appearance?.avatarFrameColor || liveUser.settings?.avatarFrameColor || (liveUser as any).avatarFrameColor || color1;

  const [allServerRoles, setAllServerRoles] = useState<ServerRole[]>(() => {
    if (!currentServer) return [];
    try {
      const stored = localStorage.getItem(`server_roles_${currentServer.id}`);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return [];
  });

  const [assignedRolesList, setAssignedRolesList] = useState<{ id: string; name: string; emoji?: string; color?: string }[]>(() => {
    if (!currentServer) return [];
    const rolesCache: ServerRole[] = (() => {
      try {
        const stored = localStorage.getItem(`server_roles_${currentServer.id}`);
        return stored ? JSON.parse(stored) : [];
      } catch (e) { return []; }
    })();

    const cachedMember = pbService.getCachedServerMember(currentServer.id, user.id);

    const list: { id: string; name: string; emoji?: string; color?: string }[] = [];
    if (currentServer.owner === user.id) {
      list.push({
        id: 'owner',
        name: lang === 'ar' ? 'مالك السيرفر' : 'Server Owner',
        emoji: '👑',
        color: '#f59e0b'
      });
    }

    const rawAssignedRole: any = (cachedMember as any)?.role || (cachedMember as any)?.role_id || localStorage.getItem(`member_role_${currentServer.id}_${user.id}`);
    const assignedRoleStr = typeof rawAssignedRole === 'string' ? rawAssignedRole : (rawAssignedRole ? (rawAssignedRole.name || rawAssignedRole.id || '') : String(rawAssignedRole || ''));

    if (assignedRoleStr) {
      const tokens = assignedRoleStr.split(',').map((s) => s.trim()).filter(Boolean);
      tokens.forEach((tok) => {
        const matched = rolesCache.find((r) => r.id === tok || r.name === tok);
        if (matched) {
          if (!list.some((item) => item.id === matched.id || item.name === matched.name)) {
            list.push({ id: matched.id, name: matched.name, emoji: matched.emoji || '🛡️', color: matched.color || '#3b82f6' });
          }
        } else {
          if (!list.some((item) => item.id === tok || item.name === tok)) {
            list.push({ id: tok, name: tok, emoji: '🛡️', color: '#3b82f6' });
          }
        }
      });
    }
    return list;
  });

  const [serverMemberRecord, setServerMemberRecord] = useState<ServerMember | null>(() => {
    if (!currentServer) return null;
    return pbService.getCachedServerMember(currentServer.id, user.id);
  });

  const effectiveProfile = getEffectiveProfile(
    liveUser,
    (!viewDefaultProfile && currentServer) ? currentServer.id : null,
    serverMemberRecord
  );

  const primaryRole = getPrimaryServerRole(
    (!viewDefaultProfile && currentServer)
      ? ((serverMemberRecord as any)?.role || (serverMemberRecord as any)?.role_id || localStorage.getItem(`member_role_${currentServer.id}_${user.id}`))
      : undefined,
    allServerRoles,
    Boolean(currentServer && currentServer.owner === user.id),
    user.role,
    lang
  );

  const activeColor1 = effectiveProfile.cardColor1;
  const activeColor2 = effectiveProfile.cardColor2;
  const activeFrameColor = effectiveProfile.avatarFrameColor;
  const activeBio = effectiveProfile.bio;
  const activeCardGradient = `linear-gradient(180deg, ${activeColor1}, ${activeColor2})`;

  const hasCustomServerProfile = effectiveProfile.hasCustomServerProfile;

  const handleResetServerProfileToDefault = async () => {
    if (!currentServer) return;
    try {
      localStorage.removeItem(`server_name_${currentServer.id}_${user.id}`);
      localStorage.removeItem(`server_avatar_${currentServer.id}_${user.id}`);
      localStorage.removeItem(`server_banner_${currentServer.id}_${user.id}`);
      localStorage.removeItem(`server_color1_${currentServer.id}_${user.id}`);
      localStorage.removeItem(`server_color2_${currentServer.id}_${user.id}`);
      localStorage.removeItem(`server_frame_color_${currentServer.id}_${user.id}`);
      localStorage.removeItem(`server_bio_${currentServer.id}_${user.id}`);

      if (serverMemberRecord && serverMemberRecord.id !== 'cached-member') {
        await pbService.updateServerMemberProfile(currentServer.id, user.id, {
          member_name: '',
          server_avatar: '',
          server_banner: '',
          server_profile_settings: {}
        });
      }

      setServerMemberRecord(null);
      setViewDefaultProfile(true);
    } catch (err) {
      console.error('Failed to reset server profile:', err);
    }
  };

  useEffect(() => {
    if (!currentServer) {
      setServerMemberRecord(null);
      setAssignedRolesList([]);
      return;
    }

    const cachedMem = pbService.getCachedServerMember(currentServer.id, user.id);
    setServerMemberRecord(cachedMem);

    const loadMemberRoleAndData = async () => {
      try {
        const [roles, singleMember] = await Promise.all([
          pbService.fetchServerRoles(currentServer.id),
          pbService.fetchSingleServerMember(currentServer.id, user.id)
        ]);

        setAllServerRoles(roles);

        if (singleMember) {
          setServerMemberRecord(singleMember);
        }

        const member = singleMember || cachedMem;

        if (currentServer.owner === user.id) {
          const rawAssignedRole: any = (member as any)?.role || (member as any)?.role_id || localStorage.getItem(`member_role_${currentServer.id}_${user.id}`);
          const assignedRoleStr = typeof rawAssignedRole === 'string' ? rawAssignedRole : (rawAssignedRole ? (rawAssignedRole.name || rawAssignedRole.id || '') : String(rawAssignedRole || ''));
          let customMatched: any[] = [];
          if (assignedRoleStr) {
            const tokens = assignedRoleStr.split(',').map((s) => s.trim()).filter(Boolean);
            customMatched = tokens.map((tok) => {
              const r = roles.find((role) => role.id === tok || role.name === tok);
              if (r) {
                return { id: r.id, name: r.name, emoji: r.emoji || '🛡️', color: r.color || '#3b82f6' };
              }
              return { id: tok, name: tok, emoji: '🛡️', color: '#3b82f6' };
            });
          }
          setAssignedRolesList([
            {
              id: 'owner',
              name: lang === 'ar' ? 'مالك السيرفر' : 'Server Owner',
              emoji: '👑',
              color: '#f59e0b'
            },
            ...customMatched
          ]);
        } else {
          const rawAssignedRole: any = (member as any)?.role || (member as any)?.role_id || localStorage.getItem(`member_role_${currentServer.id}_${user.id}`);
          const assignedRoleStr = typeof rawAssignedRole === 'string' ? rawAssignedRole : (rawAssignedRole ? (rawAssignedRole.name || rawAssignedRole.id || '') : String(rawAssignedRole || ''));

          if (assignedRoleStr) {
            const tokens = assignedRoleStr.split(',').map((s) => s.trim()).filter(Boolean);
            const matched = tokens.map((tok) => {
              const r = roles.find((role) => role.id === tok || role.name === tok);
              if (r) {
                return { id: r.id, name: r.name, emoji: r.emoji || '🛡️', color: r.color || '#3b82f6' };
              }
              return { id: tok, name: tok, emoji: '🛡️', color: '#3b82f6' };
            });
            setAssignedRolesList(matched);
          } else {
            setAssignedRolesList([]);
          }
        }
      } catch (e) {
        console.warn('Failed to load server role for user profile:', e);
      }
    };

    loadMemberRoleAndData();
  }, [currentServer?.id, user.id]);

  const handleToggleRoleForUser = async (role: ServerRole) => {
    if (!currentServer) return;
    try {
      const isAssigned = assignedRolesList.some((r) => r.id === role.id || r.name === role.name);
      let nextRoleNames: string[];
      if (isAssigned) {
        nextRoleNames = assignedRolesList.filter((r) => r.id !== role.id && r.name !== role.name).map((r) => r.name);
      } else {
        nextRoleNames = [...assignedRolesList.map((r) => r.name), role.name];
      }
      const newRoleStr = nextRoleNames.join(',');
      await pbService.updateMemberRole(currentServer.id, user.id, newRoleStr);
      localStorage.setItem(`member_role_${currentServer.id}_${user.id}`, newRoleStr);

      const updated = nextRoleNames.map((tok) => {
        const r = allServerRoles.find((item) => item.id === tok || item.name === tok);
        if (r) return { id: r.id, name: r.name, emoji: r.emoji || '🛡️', color: r.color || '#3b82f6' };
        return { id: tok, name: tok, emoji: '🛡️', color: '#3b82f6' };
      });
      setAssignedRolesList(updated);
    } catch (err) {
      console.error('Failed to toggle role from profile card:', err);
    }
  };

  const getAvatarUrl = () => {
    if (serverMemberRecord) {
      return getServerMemberAvatarUrl(serverMemberRecord, user, currentServer?.id);
    }
    if (user.avatar) {
      if (user.avatar.startsWith('blob:') || user.avatar.startsWith('http')) {
        return user.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`;
    }
    return '';
  };

  const getBannerUrl = () => {
    if (serverMemberRecord) {
      return getServerMemberBannerUrl(serverMemberRecord, user, currentServer?.id);
    }
    if (user.banner) {
      if (user.banner.startsWith('blob:') || user.banner.startsWith('http')) {
        return user.banner;
      }
      return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.banner}`;
    }
    return '';
  };

  const [relStatus, setRelStatus] = useState<'friend' | 'pending' | 'none'>(() => {
    if (!currentUser || currentUser.id === user.id) return 'none';
    let mySettings = currentUser.settings;
    if (typeof mySettings === 'string') {
      try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
    }
    const currentFriends = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
      ? currentUser.friends
      : (mySettings?.friends || []);
    if (currentFriends.includes(user.id)) return 'friend';
    const reqs = mySettings?.friend_requests || [];
    if (reqs.some((r: any) => r.targetId === user.id || r.id === user.id)) return 'pending';
    return 'none';
  });

  const handleSendFriendRequest = async () => {
    if (!currentUser) return;
    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = [...currentReqs.filter((r: any) => r.targetId !== user.id), {
        targetId: user.id,
        type: 'outgoing',
        status: 'pending'
      }];

      const updatedSettings = {
        ...mySettings,
        friend_requests: updatedReqs
      };

      await pbService.updateProfile(currentUser.id, { settings: updatedSettings });
      currentUser.settings = updatedSettings;

      const myAvatarUrl = currentUser.avatar
        ? `${pbService.getServerUrl()}/api/files/users/${currentUser.id}/${currentUser.avatar}`
        : undefined;

      await pbService.addNotificationToUser(user.id, {
        id: 'notif-fr-' + Date.now(),
        type: 'friend_request',
        sender_id: currentUser.id,
        sender_name: currentUser.display_name || currentUser.username,
        sender_avatar: myAvatarUrl,
        channel_id: 'dm',
        channel_name: 'Friend Request',
        message_id: 'fr-' + Date.now(),
        message_content: lang === 'ar' ? `أرسل لك ${currentUser.display_name || currentUser.username} طلب صداقة!` : `${currentUser.display_name || currentUser.username} sent you a friend request!`,
        created: new Date().toISOString(),
        read: false
      });

      setRelStatus('pending');
    } catch (e) {
      console.error('Failed to send friend request from profile modal:', e);
    }
  };

  const handleCancelFriendRequest = async () => {
    if (!currentUser) return;
    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      const currentFriends = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
        ? currentUser.friends
        : (mySettings?.friends || []);
      if (currentFriends.includes(user.id)) {
        setRelStatus('friend');
        return;
      }

      await pbService.cancelFriendRequest(currentUser.id, user.id);

      if (!mySettings) mySettings = {};
      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = currentReqs.filter((r: any) => r.targetId !== user.id && r.id !== user.id);
      const updatedSettings = {
        ...mySettings,
        friend_requests: updatedReqs
      };
      currentUser.settings = updatedSettings;

      setRelStatus('none');

      try {
        window.dispatchEvent(new CustomEvent('user-presence-changed', { detail: currentUser }));
      } catch (err) {}
    } catch (e) {
      console.error('Failed to cancel friend request from profile modal:', e);
    }
  };

  const handleUnfriend = async () => {
    if (!currentUser) return;

    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentFriends = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
        ? currentUser.friends
        : (mySettings.friends || []);
      const updatedFriends = currentFriends.filter((id: string) => id !== user.id);

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = currentReqs.filter((r: any) => r.targetId !== user.id);

      const updatedSettings = {
        ...mySettings,
        friends: updatedFriends,
        friend_requests: updatedReqs
      };

      await pbService.updateProfile(currentUser.id, {
        friends: updatedFriends,
        settings: updatedSettings
      });
      currentUser.friends = updatedFriends;
      currentUser.settings = updatedSettings;

      setRelStatus('none');
    } catch (e) {
      console.error('Failed to unfriend from profile modal:', e);
    }
  };

  const getActiveAvatarUrl = () => {
    if (!viewDefaultProfile && currentServer) {
      return getAvatarUrl();
    }
    const targetUser = liveUser || user;
    if (targetUser.avatar) {
      if (targetUser.avatar.startsWith('blob:') || targetUser.avatar.startsWith('http') || targetUser.avatar.startsWith('data:')) {
        return targetUser.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${targetUser.id}/${targetUser.avatar}`;
    }
    return '';
  };

  const getActiveBannerUrl = () => {
    if (!viewDefaultProfile && currentServer) {
      return getBannerUrl();
    }
    const targetUser = liveUser || user;
    if (targetUser.banner) {
      if (targetUser.banner.startsWith('blob:') || targetUser.banner.startsWith('http') || targetUser.banner.startsWith('data:')) {
        return targetUser.banner;
      }
      return `${pbService.getServerUrl()}/api/files/users/${targetUser.id}/${targetUser.banner}`;
    }
    return '';
  };

  const activeDisplayName = (!viewDefaultProfile && currentServer)
    ? getServerMemberDisplayName(serverMemberRecord, liveUser)
    : (liveUser.display_name || liveUser.username);

  return (
    <div className="fixed inset-0 z-55 pointer-events-none select-none overflow-hidden">
      {/* Visual Overlay Backdrop (captures outside clicks to close without passing through) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isClosing ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
        className={`fixed inset-0 z-0 bg-black/30 cursor-default ${
          isClosing ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        }}
      />

      {/* Scaled Container for Profile Card */}
      <div
        style={{
          position: 'fixed',
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          transformOrigin: pos.transformOrigin,
          transform: 'scale(var(--profile-card-scale, 1))',
        }}
        className="pointer-events-none z-50"
      >
        <motion.div
          ref={cardRef}
          initial={{
            opacity: 0,
            scale: 0.85,
          }}
          animate={{
            opacity: isClosing ? 0 : 1,
            scale: isClosing ? 0.85 : 1,
          }}
          exit={{
            opacity: 0,
            scale: 0.85,
          }}
          transition={getFramerTransition(animations)}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            transformOrigin: pos.transformOrigin,
            backgroundColor: activeColor1,
            backgroundImage: activeCardGradient,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'top left',
            backgroundSize: '100% 100%',
            width: `${cardWidth}px`,
            maxWidth: 'calc(100vw - 24px)',
            minHeight: 'var(--profile-card-height, auto)',
            borderRadius: 'var(--profile-card-radius, 24px)',
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transformStyle: 'preserve-3d',
            textRendering: 'geometricPrecision',
          }}
          className={`border border-white/20 shadow-2xl flex flex-col relative text-white overflow-hidden isolate shadow-black/50 ${
            isClosing ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
            {/* Soft Ambient Radial Glow at top matching user card colors */}
            <div 
              style={{
                background: `radial-gradient(circle at 50% 0%, rgba(255,255,255,0.2) 0%, transparent 70%)`
              }}
              className="absolute inset-0 pointer-events-none z-0"
            />

            {/* Profile Card Header Banner */}
            <div className="h-36 w-full relative shrink-0 overflow-hidden z-10 group/banner">
              {effectiveProfile.bannerUrl ? (
                <GifImage 
                  src={effectiveProfile.bannerUrl} 
                  alt="User profile banner" 
                  className="w-full h-full object-cover absolute inset-0 block" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-transparent pointer-events-none" />
              )}

              {isSelf && (
                <label
                  onClick={(e) => {
                    if (isMobileDevice && !mobileBannerEditing) {
                      e.preventDefault();
                      e.stopPropagation();
                      setMobileBannerEditing(true);
                    }
                  }}
                  className={`absolute inset-0 bg-black/60 transition-opacity flex flex-col items-center justify-center gap-1 cursor-pointer text-white z-20 ${
                    isMobileDevice 
                      ? (mobileBannerEditing ? 'opacity-90 pointer-events-auto' : 'opacity-0 pointer-events-auto')
                      : 'opacity-0 group-hover/banner:opacity-100'
                  }`}
                  title={lang === 'ar' ? 'انقر لتغيير الغلاف' : 'Click or touch to change banner'}
                >
                  {isUploadingBanner ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-6 h-6" />
                      <span className="text-xs font-black">{lang === 'ar' ? 'تغيير الغلاف' : 'Change Banner'}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      handleSelfBannerChange(e);
                      setMobileBannerEditing(false);
                    }}
                    className="hidden"
                    disabled={isUploadingBanner}
                  />
                </label>
              )}

              <button
                onClick={handleClose}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all cursor-pointer border border-white/10 z-30 shadow-md"
                title={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

        {/* Profile Details Area */}
        <div className="px-6 pb-6 pt-0 flex flex-col gap-4 relative z-10">
          {/* Avatar floating overlapping the banner with Custom Frame Color */}
          <div className="flex justify-between items-end -mt-12 mb-1">
            <div 
              style={{
                background: activeFrameColor,
                width: 'var(--profile-avatar-size, 80px)',
                height: 'var(--profile-avatar-size, 80px)',
              }}
              className="p-1 rounded-2xl shadow-2xl shrink-0 relative flex items-center justify-center transition-all duration-200 group/avatar-edit overflow-hidden"
            >
              <Avatar
                src={effectiveProfile.avatarUrl}
                username={user.username}
                size="xl"
                animateOverride={true}
                frameId={(liveUser as any)?.profile_frame || user.profile_frame || (liveUser as any)?.settings?.profile_frame}
                className="w-full h-full border-2 border-slate-950 rounded-xl"
              />

              {isSelf && (
                <label
                  onClick={(e) => {
                    if (isMobileDevice && !mobileAvatarEditing) {
                      e.preventDefault();
                      e.stopPropagation();
                      setMobileAvatarEditing(true);
                    }
                  }}
                  className={`absolute inset-0 rounded-2xl bg-black/65 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer z-20 ${
                    isMobileDevice 
                      ? (mobileAvatarEditing ? 'opacity-90 pointer-events-auto' : 'opacity-0 pointer-events-auto')
                      : 'opacity-0 group-hover/avatar-edit:opacity-100'
                  }`}
                  title={lang === 'ar' ? 'انقر لتغيير الصورة' : 'Click or touch to change avatar'}
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      <span className="text-[9px] font-black">{lang === 'ar' ? 'تغيير' : 'Edit'}</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      handleSelfAvatarChange(e);
                      setMobileAvatarEditing(false);
                    }}
                    className="hidden"
                    disabled={isUploadingAvatar}
                  />
                </label>
              )}
            </div>

            {/* Status Indicator & Friend Action Badge Container */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Status Indicator Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 text-xs font-bold bg-black/60 text-white shadow-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${statusColor} ${effectiveStatus === 'online' ? 'animate-pulse' : ''}`} />
                <span>{statusText}</span>
              </div>

              {/* Friend Action Button */}
              {isViewingOtherUser && (
                <>
                  {relStatus === 'friend' && (
                    <button
                      onClick={handleUnfriend}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold bg-black/60 border-white/20 text-white hover:bg-rose-500/30 hover:border-rose-500/50 hover:text-rose-300 transition-all cursor-pointer shadow-sm group"
                    >
                      <UserCheck className="w-4 h-4 group-hover:hidden" />
                      <UserMinus className="w-4 h-4 hidden group-hover:block text-rose-300" />
                      <span className="group-hover:hidden">{lang === 'ar' ? 'صديق' : 'Friend'}</span>
                      <span className="hidden group-hover:inline text-rose-300">{lang === 'ar' ? 'إلغاء الصداقة' : 'Unfriend'}</span>
                    </button>
                  )}

                  {relStatus === 'pending' && (
                    <button
                      onClick={handleCancelFriendRequest}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold bg-rose-500/30 hover:bg-rose-500/50 border-rose-500/50 text-rose-300 hover:text-white shadow-sm transition-all cursor-pointer group"
                      title={lang === 'ar' ? 'إلغاء طلب الصداقة' : 'Cancel Friend Request'}
                    >
                      <UserX className="w-4 h-4 text-rose-300 group-hover:scale-110 transition-transform" />
                      <span>{lang === 'ar' ? 'إلغاء الطلب' : 'Cancel Request'}</span>
                    </button>
                  )}

                  {relStatus === 'none' && (
                    <button
                      onClick={handleSendFriendRequest}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-black/60 hover:bg-black/80 border border-white/20 text-white shadow-md transition-all cursor-pointer active:scale-95"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>{lang === 'ar' ? 'طلب صداقة' : 'Add Friend'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* User Names & Identifiers */}
          <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-black/40 border border-white/10">
            {/* Top: Server Name / Nickname */}
            <h3 className="text-xl font-black flex items-center gap-2 text-white flex-wrap">
              <span>{effectiveProfile.displayName}</span>
              <span
                style={primaryRole.color ? { backgroundColor: `${primaryRole.color}35`, borderColor: `${primaryRole.color}60`, color: primaryRole.color } : undefined}
                className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border font-extrabold flex items-center gap-1 ${!primaryRole.color ? getRoleBadgeColor() : ''}`}
              >
                {primaryRole.emoji && <span>{primaryRole.emoji}</span>}
                <span>{primaryRole.name}</span>
              </span>
              {currentServer && !viewDefaultProfile && (
                (serverMemberRecord && (serverMemberRecord.is_member === false || serverMemberRecord.membership_status === 'left' || serverMemberRecord.membership_status === 'banned' || serverMemberRecord.membership_status === 'kicked')) ||
                localStorage.getItem(`is_member_${currentServer.id}_${user.id}`) === 'false' ||
                localStorage.getItem(`membership_status_${currentServer.id}_${user.id}`) === 'left'
              ) && (
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1 shadow-xs">
                  <span>{lang === 'ar' ? 'ليس في السيرفر' : 'Not in server'}</span>
                </span>
              )}
            </h3>

            {/* Middle: @username */}
            <span className="text-xs font-mono font-bold text-white/75">@{user.username}</span>

            {/* Custom Activity Status */}
            {(() => {
              const rawStatus = (liveUser as any)?.custom_status || user.custom_status || (liveUser as any)?.settings?.custom_status;
              let parsed: { text?: string; emoji?: string; activityType?: string } | null = null;
              if (rawStatus) {
                if (typeof rawStatus === 'object') parsed = rawStatus;
                else {
                  try { parsed = JSON.parse(rawStatus); } catch { parsed = { text: String(rawStatus) }; }
                }
              }
              if (!parsed || (!parsed.text && !parsed.emoji)) return null;
              return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 text-xs text-white/90 font-medium mt-1">
                  {parsed.emoji && <span className="text-sm shrink-0">{parsed.emoji}</span>}
                  {parsed.text && <span className="truncate">{parsed.text}</span>}
                </div>
              );
            })()}

            {/* Bottom: Default Name / Display Name */}
            {currentServer && !viewDefaultProfile && user.display_name && effectiveProfile.displayName !== user.display_name && (
              <span className="text-[10px] font-bold text-white/80 flex items-center gap-1 leading-tight pt-1 border-t border-white/10 mt-0.5">
                <span className="opacity-75">{lang === 'ar' ? 'الاسم الأصلي:' : 'Default Name:'}</span>
                <span className="font-extrabold text-white">{user.display_name}</span>
              </span>
            )}
          </div>

          {/* Server Role Badges */}
          {currentServer && !viewDefaultProfile && (
            <div className="px-3 py-2 rounded-2xl border border-white/15 bg-black/40 flex flex-col gap-1.5 text-xs font-extrabold text-white">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/70 flex items-center gap-1 font-extrabold">
                  <Shield className="w-3 h-3 text-amber-300" />
                  <span>{lang === 'ar' ? 'رتب السيرفر:' : 'Server Roles:'}</span>
                </span>
              </div>

              <div className="flex flex-wrap gap-1 pt-0.5">
                {assignedRolesList.length > 0 ? (
                  assignedRolesList.map((r) => (
                    <span
                      key={r.id}
                      style={{
                        color: r.color || '#ffffff',
                        backgroundColor: r.color ? `${r.color}35` : 'rgba(255, 255, 255, 0.2)',
                        borderColor: r.color ? `${r.color}60` : 'rgba(255, 255, 255, 0.3)'
                      }}
                      className="px-2 py-0.5 rounded-lg border text-[11px] font-black shadow-xs flex items-center gap-1"
                    >
                      <span>{r.emoji || '🛡️'}</span>
                      <span>{r.name}</span>
                    </span>
                  ))
                ) : (
                  <span className="px-2 py-0.5 rounded-lg border border-dashed border-white/20 text-[10px] font-medium text-white/60">
                    {lang === 'ar' ? 'لا توجد رتب مخصصة' : 'No roles assigned'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* User Bio Details */}
          <div className="flex flex-col gap-1.5 p-3 rounded-2xl border border-white/10 bg-black/40 text-white relative group/bio">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-white/70">
                <Award className="w-3 h-3 text-white/70" />
                <span>{lang === 'ar' ? 'النبذة الشخصية' : 'Biography / About'}</span>
              </span>

              {isSelf && !isEditingBio && (
                <button
                  type="button"
                  onClick={() => {
                    setSelfBioInput(activeBio || '');
                    setIsEditingBio(true);
                  }}
                  className="text-[10px] font-bold text-accent hover:underline cursor-pointer border-0 bg-transparent flex items-center gap-1 p-0"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'تعديل' : 'Edit'}</span>
                </button>
              )}
            </div>

            {isEditingBio ? (
              <div className="flex flex-col gap-2 mt-1">
                <textarea
                  value={selfBioInput}
                  onChange={(e) => setSelfBioInput(e.target.value)}
                  placeholder={lang === 'ar' ? 'اكتب نبذتك الشخصية هنا...' : 'Write your biography here...'}
                  className="w-full p-2.5 text-xs rounded-xl bg-black/40 border border-white/20 text-white focus:outline-none focus:border-accent resize-none min-h-[64px]"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingBio(false)}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-all cursor-pointer border-0"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSelfBio}
                    disabled={isSavingBio}
                    className="px-3 py-1 rounded-lg bg-accent text-[var(--theme-accent-contrast,#ffffff)] text-[11px] font-bold hover:opacity-90 transition-all cursor-pointer border-0 flex items-center gap-1"
                  >
                    {isSavingBio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>{lang === 'ar' ? 'حفظ' : 'Save'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => {
                  if (isSelf) {
                    setSelfBioInput(activeBio || '');
                    setIsEditingBio(true);
                  }
                }}
                className={`text-[11px] leading-relaxed font-medium text-white/90 ${
                  isSelf ? 'cursor-pointer hover:opacity-90' : ''
                }`}
              >
                {(activeBio ? activeBio.slice(0, 500) : '') ||
                  (lang === 'ar'
                    ? isSelf
                      ? 'انقر هنا لإضافة نبذة شخصية...'
                      : 'لا توجد نبذة شخصية مكتوبة لهذا المستخدم.'
                    : isSelf
                    ? 'Click here to add your biography...'
                    : 'This user has not set a custom biography yet.')}
              </p>
            )}
          </div>

          {/* Metadata Grid (Email, Preferred Language, Joined Date) */}
          <div className="grid grid-cols-1 gap-1.5 p-2.5 rounded-2xl border border-white/10 bg-black/40 text-[11px] text-white/80">
            {/* User Email */}
            <div className="flex items-center gap-2 font-semibold text-white/80">
              <Mail className="w-3.5 h-3.5 text-white/60 shrink-0" />
              <span className="truncate">{user.email || 'Protected Email'}</span>
            </div>

            {/* Preferred Language */}
            <div className="flex items-center gap-2 font-semibold text-white/80">
              <Globe className="w-3.5 h-3.5 text-white/60 shrink-0" />
              <span>
                {lang === 'ar' ? 'اللغة المفضلة:' : 'Preferred Language:'}{' '}
                <span className="font-bold text-white">
                  {(liveUser as any)?.preferred_language || (liveUser as any)?.preferredLanguage || (user as any)?.preferred_language || (user as any)?.preferredLanguage || (user?.language === 'en' ? 'English' : 'العربية')}
                </span>
              </span>
            </div>

            {/* Date Created */}
            {user.created && (
              <div className="flex items-center gap-2 font-semibold text-white/80">
                <Calendar className="w-3.5 h-3.5 text-white/60 shrink-0" />
                <span>
                  {lang === 'ar' ? 'عضو منذ:' : 'Member Since:'}{' '}
                  <span className="font-bold text-white">{new Date(user.created).toLocaleDateString()}</span>
                </span>
              </div>
            )}
          </div>

          {/* Options & Actions Menu (...) */}
          {(isViewingOtherUser || currentServer) && (
            <div className="pt-2 flex justify-end border-t border-white/10 mt-1 relative">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/20 text-white/90 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
                  title={lang === 'ar' ? 'خيارات إضافية' : 'More options'}
                >
                  <MoreVertical className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'خيارات' : 'Options'}</span>
                </button>

                {/* Outside click dismisser */}
                {showMoreMenu && (
                  <div
                    className="fixed inset-0 z-40 bg-transparent cursor-default"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMoreMenu(false);
                    }}
                  />
                )}

                {/* Popover Dropdown Menu */}
                {showMoreMenu && (
                  <div className="absolute bottom-full mb-2 ltr:right-0 rtl:left-0 z-50 w-56 max-w-[calc(100vw-48px)] rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl p-1.5 flex flex-col gap-1 text-xs text-white animate-in fade-in zoom-in-95 duration-100">
                    {/* Default / Server Profile Toggle */}
                    {currentServer && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          setViewDefaultProfile(!viewDefaultProfile);
                        }}
                        className="w-full px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 text-start font-semibold text-slate-200 transition-colors cursor-pointer border-0 bg-transparent"
                      >
                        {viewDefaultProfile ? (
                          <>
                            <Shield className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span>{lang === 'ar' ? 'بروفايل السيرفر' : 'Server Profile'}</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>{lang === 'ar' ? 'الملف العام' : 'Default Profile'}</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Send Message */}
                    {isViewingOtherUser && onStartDm && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          onStartDm(user);
                          handleClose();
                        }}
                        className="w-full px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 text-start font-semibold text-accent transition-colors cursor-pointer border-0 bg-transparent"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span>{lang === 'ar' ? 'إرسال رسالة' : 'Send Message'}</span>
                      </button>
                    )}

                    {/* Block / Unblock User */}
                    {isViewingOtherUser && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          handleToggleBlock();
                        }}
                        className="w-full px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 text-start font-semibold text-slate-200 transition-colors cursor-pointer border-0 bg-transparent"
                      >
                        <Ban className={`w-3.5 h-3.5 ${isBlocked ? 'text-amber-400' : 'text-red-400'}`} />
                        <span>{isBlocked ? (lang === 'ar' ? 'إلغاء الحظر' : 'Unblock User') : (lang === 'ar' ? 'حظر المستخدم' : 'Block User')}</span>
                      </button>
                    )}

                    {/* Report */}
                    {isViewingOtherUser && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          setReportTargetType('admin');
                          setShowReportModal(true);
                        }}
                        className="w-full px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 text-start font-semibold text-amber-300 transition-colors cursor-pointer border-0 bg-transparent"
                      >
                        <Flag className="w-3.5 h-3.5 text-amber-400" />
                        <span>{lang === 'ar' ? 'إبلاغ (Report)' : 'Report'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Report Modal Dialog with Choice of Destination */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-60 p-4 pointer-events-auto">
          <div className="w-full max-w-sm p-5 rounded-2xl bg-slate-900 border border-slate-700 text-white space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-extrabold text-sm flex items-center gap-2 text-amber-400">
                <Flag className="w-4 h-4" />
                <span>{lang === 'ar' ? 'تقديم بلاغ' : 'Submit Report'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportSuccessMsg ? (
              <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center">
                {reportSuccessMsg}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  {lang === 'ar'
                    ? `تقديم بلاغ بخصوص المستخدم: ${user.display_name || user.username}`
                    : `Submit report regarding user: ${user.display_name || user.username}`}
                </p>

                {/* Report Destination Chooser */}
                {currentServer && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 block">
                      {lang === 'ar' ? 'وجهة البلاغ' : 'Report Destination'}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReportTargetType('admin')}
                        className={`p-2.5 rounded-xl border text-xs font-extrabold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          reportTargetType === 'admin'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Shield className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'إدارة المنصة' : 'App Admin'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReportTargetType('owner')}
                        className={`p-2.5 rounded-xl border text-xs font-extrabold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          reportTargetType === 'owner'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'مالك السيرفر' : 'Server Owner'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 block">
                    {lang === 'ar' ? 'سبب البلاغ' : 'Reason'}
                  </label>
                  <input
                    type="text"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder={lang === 'ar' ? 'مثال: محتوى غير لائق أو مضايقة...' : 'e.g. Inappropriate content or harassment...'}
                    className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 block">
                    {lang === 'ar' ? 'تفاصيل إضافية (اختياري)' : 'Additional Details (Optional)'}
                  </label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder={lang === 'ar' ? 'أضف أي تفاصيل أخرى...' : 'Add any extra details...'}
                    className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500 resize-none h-20"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 cursor-pointer border-0"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    disabled={!reportReason.trim() || isSubmittingReport}
                    onClick={handleSendReport}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer border-0 shadow-md flex items-center gap-1.5"
                  >
                    {isSubmittingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                    <span>{lang === 'ar' ? 'إرسال البلاغ' : 'Submit Report'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
