import React, { useState, useEffect } from 'react';
import { User, Server } from '../types';
import { 
  Search, 
  UserPlus, 
  Check, 
  X, 
  Server as ServerIcon, 
  Users, 
  Compass, 
  Copy, 
  Plus, 
  CheckCircle,
  Menu,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  Clock,
  Lock,
  MessageSquare,
  Phone,
  User as UserIcon,
  Trash2
} from 'lucide-react';
import { pbService, getEffectiveUserStatus, getServerIconUrl, mergeUserRecord } from '../pocketbase';
import { getServerPassword, stripServerPassword } from '../lib/serverPassword';

interface DiscoveryCenterProps {
  currentUser: User;
  onJoinServerSuccess: (serverId: string) => void;
  joinedServers: Server[];
  t: (key: string) => string;
  lang: 'en' | 'ar';
  theme?: string;
  onSelectUser?: (user: User, anchor?: any) => void;
  onToggleSidebar?: () => void;
  onStartDm?: (user: User) => void;
  onStartCall?: (user: User) => void;
  channelsDrawer?: React.ReactNode;
  mode?: 'friends' | 'servers';
  initialTab?: 'friends' | 'servers';
}

interface FriendRequest {
  id: string; // Target user id
  username: string;
  display_name?: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  type: 'incoming' | 'outgoing';
}

function DiscoveryCenter({
  currentUser,
  onJoinServerSuccess,
  joinedServers,
  t,
  lang,
  theme,
  onSelectUser,
  onToggleSidebar,
  onStartDm,
  onStartCall,
  channelsDrawer,
  mode,
  initialTab
}: DiscoveryCenterProps) {
  const isLight = theme === 'light';
  const isAr = lang === 'ar';

  // State
  const [activeTab, setActiveTab] = useState<'friends' | 'servers'>(mode || initialTab || 'friends');
  const [friendsSubTab, setFriendsSubTab] = useState<'online' | 'all' | 'pending' | 'blocked' | 'add'>('all');

  useEffect(() => {
    if (mode) {
      setActiveTab(mode);
    }
  }, [mode]);
  
  // Search query states
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  // Loaded database items
  const [allDbUsers, setAllDbUsers] = useState<User[]>([]);
  const [allDbServers, setAllDbServers] = useState<Server[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingServers, setIsLoadingServers] = useState(false);

  // Friends Storage (Simulated with robust localStorage per currentUser)
  const [friends, setFriends] = useState<User[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  
  // Alert/success notifications state
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [, setPresenceTick] = useState(0);

  useEffect(() => {
    const handleUserPresenceChanged = (e: any) => {
      const updatedUser = e.detail;
      if (updatedUser?.id) {
        setAllDbUsers((prev) =>
          prev.map((u) => (u.id === updatedUser.id ? mergeUserRecord(u, updatedUser) : u))
        );
        setFriends((prev) =>
          prev.map((u) => (u.id === updatedUser.id ? mergeUserRecord(u, updatedUser) : u))
        );
      }
    };

    window.addEventListener('user-presence-changed', handleUserPresenceChanged);
    const timer = setInterval(() => {
      setPresenceTick((t) => t + 1);
    }, 15000);

    return () => {
      window.removeEventListener('user-presence-changed', handleUserPresenceChanged);
      clearInterval(timer);
    };
  }, []);

  // Server Password Prompts
  const [passwordPromptServer, setPasswordPromptServer] = useState<Server | null>(null);
  const [passwordInputVal, setPasswordInputVal] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Load & Sync Friends & Requests across database users
  const syncFriendsAndRequests = async () => {
    if (!currentUser) return;

    try {
      // 1. Fetch latest all users
      const users = await pbService.fetchAllUsers();
      const filtered = users.filter((u) => 
        u.id !== currentUser.id && 
        !u.id.startsWith('demo-') && 
        !u.id.startsWith('mock-') &&
        u.username !== 'john_doe' &&
        u.username !== 'mari_smith' &&
        u.username !== 'alex_dev' &&
        u.username !== 'sarah_m'
      );
      setAllDbUsers(filtered);

      // 2. Fetch our latest profile from server to make sure we have up-to-date settings
      let myProfile: User = currentUser;
      if (!pbService.isDemoMode()) {
        try {
          const latestUsers = await pbService.searchUsers(currentUser.username);
          const matched = latestUsers.find(u => u.id === currentUser.id);
          if (matched) {
            myProfile = matched;
          }
        } catch (e) {
          console.warn('Error fetching current user profile:', e);
        }
      }

      // Parse our own settings
      let mySettings = myProfile.settings;
      if (typeof mySettings === 'string') {
        try {
          mySettings = JSON.parse(mySettings);
        } catch {
          mySettings = {};
        }
      }
      if (!mySettings) mySettings = {};

      let myFriendsList: string[] = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
        ? (currentUser.friends as string[])
        : (mySettings.friends || []);
      let myReqs: { targetId: string; status: 'pending' | 'accepted' | 'declined'; type: 'incoming' | 'outgoing' }[] = mySettings.friend_requests || [];

      // 3. Scan other users to find if any user sent us an outgoing request or if they have accepted our request
      let updatedFriendsSet = new Set<string>(myFriendsList);
      let updatedReqsMap = new Map<string, typeof myReqs[0]>();
      myReqs.forEach(r => updatedReqsMap.set(r.targetId, r));

      users.forEach(otherUser => {
        if (otherUser.id === currentUser.id) return;

        // Parse other user's settings
        let otherSettings = otherUser.settings;
        if (typeof otherSettings === 'string') {
          try {
            otherSettings = JSON.parse(otherSettings);
          } catch {
            otherSettings = {};
          }
        }
        if (!otherSettings) otherSettings = {};

        const otherFriends: string[] = (Array.isArray(otherUser.friends) && otherUser.friends.length > 0)
          ? (otherUser.friends as string[])
          : (otherSettings.friends || []);
        const otherReqs: typeof myReqs = otherSettings.friend_requests || [];

        // CASE A: The other user sent us a pending request
        const hasOutgoingToMe = otherReqs.some(r => (r.targetId === currentUser.id || (r as any).id === currentUser.id) && r.type === 'outgoing' && r.status === 'pending');
        if (hasOutgoingToMe && !updatedFriendsSet.has(otherUser.id)) {
          // Ensure we have an incoming pending request from them
          updatedReqsMap.set(otherUser.id, {
            targetId: otherUser.id,
            type: 'incoming',
            status: 'pending'
          });
        }

        // CRITICAL FIX: If we previously had an incoming request from this user,
        // BUT they NO LONGER HAVE an outgoing request to us (because they cancelled it!), remove it!
        const existingReqInMap = updatedReqsMap.get(otherUser.id);
        if (existingReqInMap && existingReqInMap.type === 'incoming' && !hasOutgoingToMe && !updatedFriendsSet.has(otherUser.id)) {
          updatedReqsMap.delete(otherUser.id);
        }

        // CASE B: They accepted our outgoing request (meaning they added us to their friends)
        const theyHaveUsAsFriend = otherFriends.includes(currentUser.id);
        const weHaveOutgoingToThem = updatedReqsMap.get(otherUser.id)?.type === 'outgoing';
        if (theyHaveUsAsFriend && (weHaveOutgoingToThem || updatedFriendsSet.has(otherUser.id))) {
          // Promote to friends!
          updatedFriendsSet.add(otherUser.id);
          // Remove from pending requests
          updatedReqsMap.delete(otherUser.id);
        }

        // CASE C: We accepted their request, and they now see it (mutual friend)
        if (myFriendsList.includes(otherUser.id) && theyHaveUsAsFriend) {
          updatedFriendsSet.add(otherUser.id);
        }
      });

      // Assemble final lists
      const finalFriendsIds = Array.from(updatedFriendsSet);
      const finalReqsArray = Array.from(updatedReqsMap.values());

      // Find the user objects for friends
      const friendsUserObjects = finalFriendsIds.map(id => {
        const found = users.find(u => u.id === id);
        return found || null;
      }).filter(Boolean) as User[];

      // Construct FriendRequest objects
      const finalFriendRequests = finalReqsArray.map(r => {
        const foundUser = users.find(u => u.id === r.targetId);
        if (!foundUser) return null;
        return {
          id: foundUser.id,
          username: foundUser.username,
          display_name: foundUser.display_name,
          avatar: foundUser.avatar,
          status: foundUser.status || 'online',
          type: r.type
        } as FriendRequest;
      }).filter(Boolean) as FriendRequest[];

      // Update state
      setFriends(friendsUserObjects);
      setFriendRequests(finalFriendRequests);

      // If our state changed from what we loaded, save our profile settings back to PocketBase to keep in sync!
      const finalMyFriendsIdsStr = JSON.stringify(finalFriendsIds.sort());
      const loadedMyFriendsIdsStr = JSON.stringify(myFriendsList.sort());
      const finalMyReqsStr = JSON.stringify(finalReqsArray.map(r => ({ targetId: r.targetId, type: r.type, status: r.status })).sort());
      const loadedMyReqsStr = JSON.stringify(myReqs.map(r => ({ targetId: r.targetId, type: r.type, status: r.status })).sort());

      if (finalMyFriendsIdsStr !== loadedMyFriendsIdsStr || finalMyReqsStr !== loadedMyReqsStr) {
        const updatedSettings = {
          ...mySettings,
          friends: finalFriendsIds,
          friend_requests: finalReqsArray
        };
        await pbService.updateProfile(currentUser.id, {
          friends: finalFriendsIds,
          settings: updatedSettings
        });
        currentUser.friends = finalFriendsIds;
        currentUser.settings = updatedSettings;
      }

    } catch (err) {
      console.warn('Error during friends sync:', err);
    }
  };

  // Poll for changes
  useEffect(() => {
    syncFriendsAndRequests();
    const interval = setInterval(syncFriendsAndRequests, 15000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Fetch all servers from PocketBase
  const loadAllServers = async () => {
    setIsLoadingServers(true);
    try {
      const servers = await pbService.fetchAllServers();
      setAllDbServers(servers);
    } catch (err) {
      console.warn('Failed to load DB servers', err);
    } finally {
      setIsLoadingServers(false);
    }
  };

  useEffect(() => {
    loadAllServers();
  }, []);

  const triggerNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Send a Friend Request
  const handleSendFriendRequest = async (targetUser: User) => {
    // Check if already friends
    if (friends.some((f) => f.id === targetUser.id)) {
      triggerNotification(isAr ? 'أنت بالفعل صديق لهذا المستخدم!' : 'You are already friends with this user!', 'error');
      return;
    }

    // Check if request already pending
    if (friendRequests.some((r) => r.id === targetUser.id)) {
      triggerNotification(isAr ? 'الطلب معلق بالفعل!' : 'A request is already pending!', 'error');
      return;
    }

    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = [...currentReqs.filter((r: any) => r.targetId !== targetUser.id), {
        targetId: targetUser.id,
        type: 'outgoing',
        status: 'pending'
      }];

      const updatedSettings = {
        ...mySettings,
        friend_requests: updatedReqs
      };

      await pbService.updateProfile(currentUser.id, { settings: updatedSettings });
      currentUser.settings = updatedSettings;

      const myAvatarUrl = getAvatarUrl(currentUser) || undefined;

      // Notify target user
      await pbService.addNotificationToUser(targetUser.id, {
        id: 'notif-fr-' + Date.now(),
        type: 'friend_request',
        sender_id: currentUser.id,
        sender_name: currentUser.display_name || currentUser.username,
        sender_avatar: myAvatarUrl,
        channel_id: 'dm',
        channel_name: 'Friend Request',
        message_id: 'fr-' + Date.now(),
        message_content: isAr ? `أرسل لك ${currentUser.display_name || currentUser.username} طلب صداقة!` : `${currentUser.display_name || currentUser.username} sent you a friend request!`,
        created: new Date().toISOString(),
        read: false
      });

      await syncFriendsAndRequests();

      triggerNotification(
        isAr 
          ? `تم إرسال طلب الصداقة إلى ${targetUser.display_name || targetUser.username} بنجاح!` 
          : `Friend request sent to ${targetUser.display_name || targetUser.username} successfully!`
      );
    } catch (err) {
      console.error(err);
      triggerNotification(isAr ? 'فشل إرسال طلب الصداقة.' : 'Failed to send friend request.', 'error');
    }
  };

  // Cancel an outgoing friend request
  const handleCancelRequest = async (targetId: string, targetName: string) => {
    try {
      if (friends.some((f) => f.id === targetId)) {
        triggerNotification(isAr ? 'أنتما أصدقاء بالفعل!' : 'You are already friends!', 'error');
        return;
      }

      await pbService.cancelFriendRequest(currentUser.id, targetId);

      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = currentReqs.filter((r: any) => r.targetId !== targetId && r.id !== targetId);
      const updatedSettings = {
        ...mySettings,
        friend_requests: updatedReqs
      };
      currentUser.settings = updatedSettings;

      setFriendRequests((prev) => prev.filter((r) => r.id !== targetId));

      await syncFriendsAndRequests();

      triggerNotification(
        isAr 
          ? `تم إلغاء طلب الصداقة الموجه إلى ${targetName}` 
          : `Cancelled friend request to ${targetName}`
      );
    } catch (err) {
      console.error('Failed to cancel friend request:', err);
      triggerNotification(isAr ? 'فشل إلغاء طلب الصداقة.' : 'Failed to cancel friend request.', 'error');
    }
  };

  // Accept request
  const handleAcceptRequest = async (req: FriendRequest) => {
    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentFriends = mySettings.friends || [];
      const updatedFriends = Array.from(new Set([...currentFriends, req.id]));

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = currentReqs.filter((r: any) => r.targetId !== req.id);

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

      // Update target user's friends list as well (bidirectional friendship)
      try {
        const targetUserRecord = await pbService.fetchUserById(req.id);
        if (targetUserRecord) {
          let tSettings = targetUserRecord.settings;
          if (typeof tSettings === 'string') {
            try { tSettings = JSON.parse(tSettings); } catch { tSettings = {}; }
          }
          if (!tSettings) tSettings = {};

          const tFriends = (Array.isArray(targetUserRecord.friends) && targetUserRecord.friends.length > 0)
            ? targetUserRecord.friends
            : (tSettings.friends || []);
          const tReqs = tSettings.friend_requests || [];

          const newTFriends = Array.from(new Set([...tFriends, currentUser.id]));
          const newTReqs = tReqs.filter((r: any) => r.targetId !== currentUser.id);

          await pbService.updateProfile(req.id, {
            friends: newTFriends,
            settings: {
              ...tSettings,
              friends: newTFriends,
              friend_requests: newTReqs
            }
          });
        }
      } catch (e) {
        console.warn('Bidirectional friend update warning:', e);
      }

      const myAvatarUrl = getAvatarUrl(currentUser) || undefined;

      // Send notification to the user whose request was accepted
      await pbService.addNotificationToUser(req.id, {
        id: 'notif-fra-' + Date.now(),
        type: 'mention',
        sender_id: currentUser.id,
        sender_name: currentUser.display_name || currentUser.username,
        sender_avatar: myAvatarUrl,
        channel_id: 'dm',
        channel_name: 'Friend Request Accepted',
        message_id: 'fra-' + Date.now(),
        message_content: isAr ? `قبل ${currentUser.display_name || currentUser.username} طلب الصداقة!` : `${currentUser.display_name || currentUser.username} accepted your friend request!`,
        created: new Date().toISOString(),
        read: false
      });

      await syncFriendsAndRequests();

      triggerNotification(
        isAr 
          ? `أنت الآن صديق لـ ${req.display_name || req.username}!` 
          : `You are now friends with ${req.display_name || req.username}!`
      );
    } catch (err) {
      console.error(err);
      triggerNotification(isAr ? 'فشل قبول طلب الصداقة.' : 'Failed to accept friend request.', 'error');
    }
  };

  // Decline request
  const handleDeclineRequest = async (req: FriendRequest) => {
    try {
      let mySettings = currentUser.settings;
      if (typeof mySettings === 'string') {
        try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
      }
      if (!mySettings) mySettings = {};

      const currentReqs = mySettings.friend_requests || [];
      const updatedReqs = currentReqs.filter((r: any) => r.targetId !== req.id);

      const updatedSettings = {
        ...mySettings,
        friend_requests: updatedReqs
      };

      await pbService.updateProfile(currentUser.id, { settings: updatedSettings });
      currentUser.settings = updatedSettings;

      await pbService.addNotificationToUser(req.id, {
        id: 'notif-frd-' + Date.now(),
        type: 'mention',
        sender_id: currentUser.id,
        sender_name: currentUser.display_name || currentUser.username,
        sender_avatar: getAvatarUrl(currentUser) || undefined,
        channel_id: 'dm',
        channel_name: 'Friend Request Declined',
        message_id: 'frd-' + Date.now(),
        message_content: isAr ? `رفض ${currentUser.display_name || currentUser.username} طلب الصداقة.` : `${currentUser.display_name || currentUser.username} declined your friend request.`,
        created: new Date().toISOString(),
        read: false
      });

      await syncFriendsAndRequests();

      triggerNotification(isAr ? 'تم رفض طلب الصداقة.' : 'Friend request declined.');
    } catch (err) {
      console.error(err);
    }
  };

  // Unfriend
  const handleUnfriend = async (friendId: string, name: string) => {
    if (window.confirm(isAr ? `هل تريد حقاً إزالة ${name} من قائمة الأصدقاء؟` : `Are you sure you want to unfriend ${name}?`)) {
      try {
        let mySettings = currentUser.settings;
        if (typeof mySettings === 'string') {
          try { mySettings = JSON.parse(mySettings); } catch { mySettings = {}; }
        }
        if (!mySettings) mySettings = {};

        const currentFriends = (Array.isArray(currentUser.friends) && currentUser.friends.length > 0)
          ? currentUser.friends
          : (mySettings.friends || []);
        const updatedFriends = currentFriends.filter((id: string) => id !== friendId);

        const currentReqs = mySettings.friend_requests || [];
        const updatedReqs = currentReqs.filter((r: any) => r.targetId !== friendId);

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
        await syncFriendsAndRequests();

        triggerNotification(isAr ? 'تمت الإزالة من الأصدقاء.' : 'Removed from friends list.');
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Join server via Invite Code / ID
  const handleJoinServer = async () => {
    const trimmedCode = inviteCodeInput.trim();
    if (!trimmedCode) return;

    // Check if already in server
    if (joinedServers.some((s) => s.id === trimmedCode)) {
      triggerNotification(isAr ? 'أنت بالفعل عضو في هذا السيرفر!' : 'You are already a member of this server!', 'error');
      return;
    }

    // Check if server exists in DB and is locked
    let targetSrv = allDbServers.find(s => s.id === trimmedCode);
    if (!targetSrv) {
      try {
        const list = await pbService.fetchAllServers();
        targetSrv = list.find(s => s.id === trimmedCode);
      } catch {}
    }

    if (targetSrv) {
      const pw = getServerPassword(targetSrv.description);
      if (pw) {
        // Prompt for password
        setPasswordPromptServer(targetSrv);
        setPasswordInputVal('');
        setPasswordError(null);
        return;
      }
    }

    try {
      await pbService.joinServer(trimmedCode);
      onJoinServerSuccess(trimmedCode);
      setInviteCodeInput('');
      triggerNotification(isAr ? 'تم الانضمام إلى السيرفر بنجاح!' : 'Joined server successfully!');
      loadAllServers();
    } catch (e) {
      console.error(e);
      triggerNotification(isAr ? 'فشل الانضمام. رمز الدعوة قد يكون خاطئاً أو غير صالح.' : 'Failed to join. Invalid invite code.', 'error');
    }
  };

  // Join a server from the public list
  const handleJoinPublicServer = async (serverId: string) => {
    const srv = allDbServers.find(s => s.id === serverId);
    if (!srv) return;

    const pw = getServerPassword(srv.description);
    if (pw) {
      // Prompt for password
      setPasswordPromptServer(srv);
      setPasswordInputVal('');
      setPasswordError(null);
      return;
    }

    try {
      await pbService.joinServer(serverId);
      onJoinServerSuccess(serverId);
      triggerNotification(isAr ? 'تم الانضمام إلى السيرفر بنجاح!' : 'Joined server successfully!');
      loadAllServers();
    } catch (e) {
      console.error(e);
      triggerNotification(isAr ? 'حدث خطأ أثناء الانضمام للسيرفر.' : 'Error joining the server.', 'error');
    }
  };

  // Submit Password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPromptServer) return;

    const correctPw = getServerPassword(passwordPromptServer.description);
    if (passwordInputVal !== correctPw) {
      setPasswordError(isAr ? 'كلمة مرور خاطئة! حاول مجدداً.' : 'Incorrect password! Please try again.');
      return;
    }

    try {
      await pbService.joinServer(passwordPromptServer.id);
      onJoinServerSuccess(passwordPromptServer.id);
      triggerNotification(isAr ? 'تم الانضمام إلى السيرفر بنجاح!' : 'Joined server successfully!');
      
      // Reset state
      setPasswordPromptServer(null);
      setPasswordInputVal('');
      setPasswordError(null);
      setInviteCodeInput('');
      loadAllServers();
    } catch (err) {
      console.error(err);
      setPasswordError(isAr ? 'حدث خطأ أثناء الانضمام للسيرفر.' : 'Error joining the server.');
    }
  };

  // Copy server invite ID to clipboard
  const copyInviteToClipboard = (serverId: string, serverName: string) => {
    navigator.clipboard.writeText(serverId);
    triggerNotification(
      isAr 
        ? `تم نسخ رمز دعوة "${serverName}" للمحفظة!` 
        : `Invite code for "${serverName}" copied to clipboard!`
    );
  };

  // Avatar utility URL
  const getAvatarUrl = (user?: User | FriendRequest) => {
    if (user?.avatar) {
      if (user.avatar.startsWith('blob:') || user.avatar.startsWith('http')) {
        return user.avatar;
      }
      return `${pbService.getServerUrl()}/api/files/users/${user.id}/${user.avatar}`;
    }
    return '';
  };

  // Filter users based on query
  const filteredUsers = allDbUsers.filter((u) => {
    const q = userSearchQuery.toLowerCase();
    return u.username?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q);
  });

  // Filter servers based on query, unlisting locked/private servers from public discovery
  const filteredServers = allDbServers.filter((s) => {
    const isLocked = Boolean(getServerPassword(s.description)) || s.description?.includes('[private:true]');
    const q = serverSearchQuery.trim().toLowerCase();
    
    // Private/locked servers are unlisted from public discovery unless exact Server ID or password match is searched
    if (isLocked) {
      if (!q) return false;
      const isExactMatch = s.id.toLowerCase() === q || getServerPassword(s.description)?.toLowerCase() === q;
      return isExactMatch;
    }

    if (!q) return true;
    return s.name?.toLowerCase().includes(q) || stripServerPassword(s.description)?.toLowerCase().includes(q);
  });

  // Theme Colors dictionary
  const themeClasses: any = {
    panelBg: 'bg-[var(--theme-bg-primary)]',
    headerBg: 'bg-[var(--theme-bg-primary)] border-[var(--theme-border)]',
    cardBg: 'bg-[var(--theme-bg-card)] border-[var(--theme-border)] hover:bg-[var(--theme-bg-tertiary)]',
    border: 'border-[var(--theme-border)]',
    textPrimary: 'text-[var(--theme-text-primary)]',
    textSecondary: 'text-[var(--theme-text-secondary)]',
    inputBg: 'bg-[var(--theme-bg-tertiary)] border-[var(--theme-border)] focus-within:border-accent',
    inputText: 'text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)]',
    activeTab: 'bg-accent/20 text-accent font-bold border-l-2 border-accent',
    btnSecondary: 'bg-[var(--theme-bg-tertiary)] hover:opacity-80 text-[var(--theme-text-primary)]',
    textAccent: 'text-accent',
    primaryBtn: 'bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)]',
    activeBtn: 'bg-accent text-[var(--theme-accent-contrast,#ffffff)] shadow-lg',
  };

  return (
    <div className={`flex-1 flex flex-col min-w-0 h-full relative overflow-hidden transition-all duration-300 ${themeClasses.panelBg}`}>
      {/* Alert / Success Toast */}
      {notification && (
        <div className={`absolute top-4 ${isAr ? 'left-4' : 'right-4'} z-50 flex items-center gap-2.5 px-4.5 py-3 rounded-xl border shadow-2xl animate-bounce ${
          notification.type === 'error'
            ? 'bg-red-950/90 text-red-300 border-red-900/50'
            : 'bg-[var(--theme-bg-card)] text-[var(--theme-text-primary)] border-[var(--theme-border)]'
        }`}>
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold font-sans">{notification.message}</span>
        </div>
      )}

      {/* Discovery Center Header */}
      <div 
        className={`px-6 flex items-center justify-between shrink-0 select-none ${themeClasses.headerBg}`}
        style={{
          paddingTop: '1.125rem',
          paddingBottom: '1.125rem',
        }}
      >
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className={`md:hidden p-1.5 rounded-lg transition-all border cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' 
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/5'
              }`}
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Compass className={`w-5 h-5 animate-spin-slow ${themeClasses.textAccent}`} />
            <h2 className={`font-extrabold text-lg tracking-tight ${themeClasses.textPrimary}`}>
              {isAr ? 'مركز الأصدقاء والاستكشاف' : 'Friends & Discovery Center'}
            </h2>
          </div>
        </div>

        {/* Outer Tabs Trigger (Only show if mode is not locked) */}
        {!mode && (
          <div className="flex gap-1 bg-black/15 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveTab('friends')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all border-0 cursor-pointer ${
                activeTab === 'friends'
                  ? themeClasses.activeBtn
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'الأصدقاء' : 'Friends'}
            </button>
            <button
              onClick={() => setActiveTab('servers')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all border-0 cursor-pointer ${
                activeTab === 'servers'
                  ? themeClasses.activeBtn
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'السيرفرات' : 'Servers'}
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row min-w-0 overflow-hidden relative">
        {/* Left Sub-Sidebar (Navigation inside the discovery hub) */}
        <div className="w-full md:w-56 shrink-0 md:h-full p-4 flex flex-col gap-1 select-none">
          {activeTab === 'friends' ? (
            <>
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-2.5 mb-2.5 block">
                {isAr ? 'خيارات الأصدقاء' : 'Friends Navigation'}
              </span>

              <button
                onClick={() => setFriendsSubTab('online')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${
                  friendsSubTab === 'online'
                    ? themeClasses.activeTab
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--status-online)] shrink-0" />
                  <span>{isAr ? 'متصل الآن' : 'Online'}</span>
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/20 text-slate-300 font-bold">
                  {friends.filter((f) => getEffectiveUserStatus(f) === 'online').length}
                </span>
              </button>

              <button
                onClick={() => setFriendsSubTab('all')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${
                  friendsSubTab === 'all'
                    ? themeClasses.activeTab
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'جميع الأصدقاء' : 'All Friends'}</span>
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/20 text-slate-300 font-bold">
                  {friends.length}
                </span>
              </button>

              <button
                onClick={() => setFriendsSubTab('pending')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${
                  friendsSubTab === 'pending'
                    ? themeClasses.activeTab
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'طلبات معلقة' : 'Pending Requests'}</span>
                </div>
                {friendRequests.length > 0 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold animate-pulse">
                    {friendRequests.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setFriendsSubTab('blocked')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${
                  friendsSubTab === 'blocked'
                    ? themeClasses.activeTab
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{isAr ? 'المحظورون' : 'Blocked'}</span>
                </div>
                {(() => {
                  let mySet: any = currentUser.settings;
                  if (typeof mySet === 'string') { try { mySet = JSON.parse(mySet); } catch { mySet = {}; } }
                  const bCount = (currentUser.blocked_users || mySet?.blocked_users || []).length;
                  return bCount > 0 ? (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold">
                      {bCount}
                    </span>
                  ) : null;
                })()}
              </button>

              <button
                onClick={() => setFriendsSubTab('add')}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${
                  friendsSubTab === 'add'
                    ? themeClasses.activeTab
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>{isAr ? 'إضافة أصدقاء' : 'Add Friend'}</span>
              </button>
            </>
          ) : (
            <>
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-2.5 mb-2.5 block">
                {isAr ? 'الانضمام والرموز' : 'Server Actions'}
              </span>
              <div className="flex flex-col gap-3 p-3 rounded-2xl bg-black/15 border border-white/5">
                <div className="flex flex-col gap-1">
                  <span className={`text-[10px] font-extrabold uppercase tracking-wider ${themeClasses.textAccent}`}>
                    {isAr ? 'الانضمام برمز دعوة' : 'Join via Invite ID'}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {isAr ? 'أدخل رمز دعوة السيرفر للانضمام' : 'Paste server ID code to join instantly'}
                  </span>
                </div>
                <input
                  type="text"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value)}
                  placeholder={isAr ? 'رمز السيرفر...' : 'Server code...'}
                  className={`w-full p-2.5 text-xs rounded-xl focus:outline-none border font-mono ${
                    isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                />
                <button
                  onClick={handleJoinServer}
                  className={`w-full py-2 text-white rounded-xl text-xs font-bold border-0 cursor-pointer transition-all shadow-lg ${themeClasses.primaryBtn}`}
                >
                  {isAr ? 'انضم الآن' : 'Join Server'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Details Panel (Interactive View) */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          
          {/* TAB 1: FRIENDS NAVIGATOR */}
          {activeTab === 'friends' && (
            <div className="flex flex-col gap-5">
              
              {/* SUB-TAB A: ONLINE FRIENDS */}
              {friendsSubTab === 'online' && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center select-none">
                    <h3 className={`font-extrabold text-sm ${themeClasses.textPrimary}`}>
                      {isAr ? 'الأصدقاء المتصلون الآن' : 'Online Friends'}
                    </h3>
                    <span className="text-[10px] text-slate-400">
                      {isAr ? 'عرض الأصدقاء المتواجدين حالياً' : 'Showing friends active right now'}
                    </span>
                  </div>

                  {(() => {
                    const onlineFriends = friends.filter((f) => getEffectiveUserStatus(f) === 'online');
                    if (onlineFriends.length === 0) {
                      return (
                        <div className="py-12 border border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-2 select-none border-slate-800">
                          <Users className="w-8 h-8 text-slate-600" />
                          <span className="text-xs font-medium">
                            {isAr ? 'لا يوجد أصدقاء متصلون حالياً.' : 'No friends online right now.'}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {onlineFriends.map((friend) => (
                          <div 
                            key={friend.id}
                            className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${themeClasses.cardBg}`}
                          >
                            <div 
                              onClick={(e) => onSelectUser?.(friend, e.currentTarget)}
                              className="flex items-center gap-3 cursor-pointer hover:opacity-90 min-w-0"
                            >
                              <div className="relative shrink-0">
                                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
                                  {friend.avatar ? (
                                    <img src={getAvatarUrl(friend)} alt="Avatar" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-bold text-xs text-slate-400">
                                      {friend.username.substring(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 bg-[var(--status-online)]" />
                              </div>
                              <div className="min-w-0">
                                <div className={`font-bold text-xs truncate ${themeClasses.textPrimary}`}>
                                  {friend.display_name || friend.username}
                                </div>
                                <div className="text-[10px] text-emerald-400 font-medium truncate">
                                  {isAr ? 'متصل الآن' : 'Online now'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {onStartDm && (
                                <button
                                  onClick={() => onStartDm(friend)}
                                  title={isAr ? 'إرسال رسالة' : 'Send Message'}
                                  className="p-2 bg-accent/10 hover:bg-accent text-accent hover:text-[var(--theme-accent-contrast,#ffffff)] rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onStartCall && (
                                <button
                                  onClick={() => onStartCall(friend)}
                                  title={isAr ? 'بدء مكالمة' : 'Start Call'}
                                  className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleUnfriend(friend.id, friend.display_name || friend.username)}
                                title={isAr ? 'حذف من الأصدقاء' : 'Remove Friend'}
                                className="p-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* SUB-TAB B: ALL FRIENDS */}
              {friendsSubTab === 'all' && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center select-none">
                    <h3 className={`font-extrabold text-sm ${themeClasses.textPrimary}`}>
                      {isAr ? 'جميع الأصدقاء المضافين' : 'Your Friends List'}
                    </h3>
                    <span className="text-[10px] text-slate-400">
                      {isAr ? 'انقر على المستخدم لعرض ملفه الشخصي' : 'Click any friend to view profile details'}
                    </span>
                  </div>

                  {friends.length === 0 ? (
                    <div className="py-12 border border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-2 select-none border-slate-800">
                      <Users className="w-8 h-8 text-slate-600" />
                      <span className="text-xs font-medium">
                        {isAr ? 'لا يوجد أصدقاء بعد. انتقل إلى "إضافة أصدقاء" للبحث!' : 'No friends added yet. Visit "Add Friend" to search users!'}
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {friends.map((friend) => {
                        const status = getEffectiveUserStatus(friend);

                        const formatLastSeen = (u: User) => {
                          if (status === 'online') return isAr ? 'متصل الآن' : 'Online now';
                          if (status === 'away') return isAr ? 'خامل' : 'Away';
                          if (status === 'dnd') return isAr ? 'عدم الإزعاج' : 'Do Not Disturb';

                          const lastSeenTs = u.last_seen || u.updated || u.created;
                          if (!lastSeenTs) return isAr ? 'غير متصل' : 'Offline';

                          const date = new Date(lastSeenTs);
                          if (isNaN(date.getTime())) return isAr ? 'غير متصل' : 'Offline';

                          const now = new Date();
                          const diffMs = now.getTime() - date.getTime();
                          const diffMins = Math.floor(diffMs / (1000 * 60));
                          const diffHours = Math.floor(diffMins / 60);

                          if (diffMins < 1) return isAr ? 'آخر ظهور: الآن' : 'Last seen: Just now';
                          if (diffMins < 60) return isAr ? `آخر ظهور: منذ ${diffMins} دقيقة` : `Last seen: ${diffMins} mins ago`;

                          const yesterday = new Date(now);
                          yesterday.setDate(now.getDate() - 1);
                          if (yesterday.getDate() === date.getDate() && yesterday.getMonth() === date.getMonth() && yesterday.getFullYear() === date.getFullYear()) {
                            return isAr ? 'آخر ظهور: أمس' : 'Last seen: Yesterday';
                          }

                          const formattedDate = date.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          return isAr ? `آخر ظهور: ${formattedDate}` : `Last seen on ${formattedDate}`;
                        };

                        return (
                          <div 
                            key={friend.id}
                            className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${themeClasses.cardBg}`}
                          >
                            <div 
                              onClick={(e) => onSelectUser?.(friend, e.currentTarget)}
                              className="flex items-center gap-3 cursor-pointer hover:opacity-90 min-w-0"
                            >
                              <div className="relative shrink-0">
                                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center">
                                  {friend.avatar ? (
                                    <img src={getAvatarUrl(friend)} alt="Avatar" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-bold text-xs text-slate-400">
                                      {friend.username.substring(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                                  status === 'online' ? 'bg-[var(--status-online)]' : status === 'away' ? 'bg-[var(--status-away)]' : 'bg-[var(--status-offline)]'
                                }`} />
                              </div>
                              <div className="min-w-0">
                                <div className={`font-bold text-xs truncate ${themeClasses.textPrimary}`}>
                                  {friend.display_name || friend.username}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono truncate">
                                  {formatLastSeen(friend)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {onStartDm && (
                                <button
                                  onClick={() => onStartDm(friend)}
                                  title={isAr ? 'إرسال رسالة' : 'Send Message'}
                                  className="p-2 bg-accent/10 hover:bg-accent text-accent hover:text-[var(--theme-accent-contrast,#ffffff)] rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onStartCall && (
                                <button
                                  onClick={() => onStartCall(friend)}
                                  title={isAr ? 'بدء مكالمة' : 'Start Call'}
                                  className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleUnfriend(friend.id, friend.display_name || friend.username)}
                                title={isAr ? 'حذف من الأصدقاء' : 'Remove Friend'}
                                className="p-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB C: BLOCKED USERS */}
              {friendsSubTab === 'blocked' && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center select-none">
                    <h3 className={`font-extrabold text-sm ${themeClasses.textPrimary}`}>
                      {isAr ? 'المستخدمون المحظورون' : 'Blocked Users'}
                    </h3>
                    <span className="text-[10px] text-slate-400">
                      {isAr ? 'المستخدمون المضافون لقائمة الحظر' : 'Users on your block list'}
                    </span>
                  </div>

                  {(() => {
                    let mySet: any = currentUser.settings;
                    if (typeof mySet === 'string') { try { mySet = JSON.parse(mySet); } catch { mySet = {}; } }
                    const blockedIds: string[] = (currentUser.blocked_users || mySet?.blocked_users || []);
                    const blockedUsers = allDbUsers.filter((u) => blockedIds.includes(u.id));

                    if (blockedUsers.length === 0) {
                      return (
                        <div className="py-12 border border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-2 select-none border-slate-800">
                          <ShieldAlert className="w-8 h-8 text-slate-600" />
                          <span className="text-xs font-medium">
                            {isAr ? 'لا يوجد مستخدمون محظورون.' : 'No blocked users.'}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col gap-2.5">
                        {blockedUsers.map((u) => (
                          <div key={u.id} className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${themeClasses.cardBg}`}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                                {u.avatar ? (
                                  <img src={getAvatarUrl(u)} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="font-bold text-xs text-slate-400">
                                    {(u.username || 'U').substring(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 text-left">
                                <span className={`font-bold text-xs block ${themeClasses.textPrimary}`}>
                                  {u.display_name || u.username}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  @{u.username}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={async () => {
                                try {
                                  const updatedBlocked = blockedIds.filter((id) => id !== u.id);
                                  mySet.blocked_users = updatedBlocked;
                                  await pbService.updateUserSettings(currentUser.id, mySet);
                                  triggerNotification(isAr ? 'تم إلغاء حظر المستخدم' : 'User unblocked');
                                  syncFriendsAndRequests();
                                } catch (err) {
                                  console.warn('Failed to unblock:', err);
                                }
                              }}
                              className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white rounded-xl text-xs font-bold border border-rose-500/30 cursor-pointer transition-all shrink-0"
                            >
                              {isAr ? 'إلغاء الحظر' : 'Unblock'}
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* SUB-TAB B: PENDING REQUESTS */}
              {friendsSubTab === 'pending' && (
                <div className="flex flex-col gap-4">
                  <h3 className={`font-extrabold text-sm ${themeClasses.textPrimary}`}>
                    {isAr ? 'طلبات الصداقة المعلقة' : 'Pending Friend Requests'}
                  </h3>

                  {friendRequests.length === 0 ? (
                    <div className="py-12 border border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-2 select-none border-slate-800">
                      <Clock className="w-8 h-8 text-slate-600" />
                      <span className="text-xs font-medium">
                        {isAr ? 'لا توجد طلبات صداقة معلقة.' : 'No pending friend requests.'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {friendRequests.map((req) => (
                        <div 
                          key={req.id}
                          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${themeClasses.cardBg}`}
                        >
                          <div 
                            onClick={(e) => onSelectUser?.({ id: req.id, username: req.username, display_name: req.display_name, avatar: req.avatar, status: req.status } as User, e.currentTarget)}
                            className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-90"
                          >
                            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                              {req.avatar ? (
                                <img src={getAvatarUrl(req)} alt="Avatar" className="w-full h-full object-cover" />
                              ) : (
                                <span className="font-bold text-xs text-slate-400">
                                  {req.username.substring(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 text-left">
                              <span className={`font-bold text-xs block ${themeClasses.textPrimary}`}>
                                {req.display_name || req.username}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {req.type === 'incoming' 
                                  ? (isAr ? 'طلب صداقة وارد' : 'Incoming friend request') 
                                  : (isAr ? 'طلب صداقة صادر' : 'Outgoing request sent')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {req.type === 'incoming' ? (
                              <>
                                <button
                                  onClick={() => handleAcceptRequest(req)}
                                  className="px-3 py-1.5 bg-accent text-[var(--theme-bg-primary)] hover:opacity-90 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'قبول' : 'Accept'}</span>
                                </button>
                                <button
                                  onClick={() => handleDeclineRequest(req)}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold border-0 cursor-pointer transition-all flex items-center gap-1"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'رفض' : 'Decline'}</span>
                                </button>
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded-lg">
                                  <Clock className="w-3 h-3 animate-spin-slow" />
                                  <span>{isAr ? 'معلق' : 'Pending'}</span>
                                </span>
                                <button
                                  onClick={() => handleCancelRequest(req.id, req.display_name || req.username)}
                                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold border border-rose-500/30 cursor-pointer transition-all flex items-center gap-1"
                                  title={isAr ? 'إلغاء طلب الصداقة' : 'Cancel Friend Request'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'إلغاء الطلب' : 'Cancel Request'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB C: ADD FRIEND (SEARCH USERS) */}
              {friendsSubTab === 'add' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <h3 className={`font-extrabold text-sm ${themeClasses.textPrimary}`}>
                      {isAr ? 'البحث عن مستخدمين' : 'Search and Discover Users'}
                    </h3>
                    <span className="text-xs text-slate-400 select-none">
                      {isAr ? 'أدخل اسم المستخدم للبحث والتعرف على مستخدمين جدد على السيرفر' : 'Enter a username to discover and connect with other users in the workspace'}
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div className={`p-3 rounded-2xl border flex items-center gap-2.5 transition-all ${themeClasses.inputBg}`}>
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder={isAr ? 'ابحث عن مستخدم بالاسم أو المعرف...' : 'Search users by display name or username...'}
                      className={`w-full text-xs focus:outline-none bg-transparent ${themeClasses.inputText}`}
                    />
                  </div>

                  {/* Users matching display */}
                  {isLoadingUsers ? (
                    <div className="py-12 flex items-center justify-center gap-2 select-none">
                      <Compass className="w-5 h-5 text-accent animate-spin" />
                      <span className="text-xs font-semibold text-slate-400">{isAr ? 'جاري التحميل...' : 'Searching registered users...'}</span>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="py-12 border border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-2 select-none border-slate-800">
                      <ShieldAlert className="w-8 h-8 text-slate-600" />
                      <span className="text-xs font-medium">
                        {isAr ? 'لم يتم العثور على مستخدمين يطابقون بحثك.' : 'No users found matching your search.'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {filteredUsers.map((user) => {
                        const isFriend = friends.some((f) => f.id === user.id);
                        const activeReq = friendRequests.find((r) => r.id === user.id);

                        return (
                          <div 
                            key={user.id}
                            className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${themeClasses.cardBg}`}
                          >
                            <div 
                              onClick={(e) => onSelectUser?.(user, e.currentTarget)}
                              className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-90"
                            >
                              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                                {user.avatar ? (
                                  <img src={getAvatarUrl(user)} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="font-bold text-xs text-slate-400">
                                    {user.username.substring(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 text-left">
                                <span className={`font-bold text-xs block ${themeClasses.textPrimary}`}>
                                  {user.display_name || user.username}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  @{user.username}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {onStartDm && (
                                <button
                                  onClick={() => onStartDm(user)}
                                  title={isAr ? 'إرسال رسالة' : 'Send Message'}
                                  className="p-2 bg-accent/10 hover:bg-accent text-accent hover:text-[var(--theme-accent-contrast,#ffffff)] rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onStartCall && (
                                <button
                                  onClick={() => onStartCall(user)}
                                  title={isAr ? 'بدء مكالمة' : 'Start Call'}
                                  className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-xl text-xs transition-all border-0 cursor-pointer flex items-center justify-center"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {isFriend ? (
                                <span className="text-xs font-bold text-accent flex items-center gap-1 bg-[var(--theme-bg-tertiary)] px-2.5 py-1.5 rounded-xl">
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'صديق' : 'Friends'}</span>
                                </span>
                              ) : activeReq ? (
                                activeReq.type === 'outgoing' ? (
                                  <button
                                    onClick={() => handleCancelRequest(user.id, user.display_name || user.username)}
                                    className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold border border-rose-500/30 cursor-pointer transition-all flex items-center gap-1"
                                    title={isAr ? 'إلغاء طلب الصداقة' : 'Cancel Friend Request'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{isAr ? 'إلغاء الطلب' : 'Cancel Request'}</span>
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleAcceptRequest(activeReq)}
                                      className="px-2.5 py-1.5 bg-accent text-[var(--theme-bg-primary)] hover:opacity-90 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all flex items-center gap-1"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>{isAr ? 'قبول' : 'Accept'}</span>
                                    </button>
                                    <button
                                      onClick={() => handleDeclineRequest(activeReq)}
                                      className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold border-0 cursor-pointer transition-all flex items-center gap-1"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      <span>{isAr ? 'رفض' : 'Decline'}</span>
                                    </button>
                                  </div>
                                )
                              ) : (
                                <button
                                  onClick={() => handleSendFriendRequest(user)}
                                  className={`px-3 py-1.5 text-white rounded-xl text-xs font-bold border-0 cursor-pointer transition-all flex items-center gap-1 ${themeClasses.primaryBtn}`}
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>{isAr ? 'إرسال طلب' : 'Add Friend'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: SERVERS DIRECTORY */}
          {activeTab === 'servers' && (
            <div className="flex flex-col gap-5">
              
              <div className="flex flex-col gap-1.5">
                <h3 className={`font-extrabold text-sm ${themeClasses.textPrimary}`}>
                  {isAr ? 'استكشاف السيرفرات المتاحة' : 'Discover Public Servers'}
                </h3>
                <span className="text-xs text-slate-400 select-none">
                  {isAr ? 'تصفح جميع السيرفرات النشطة على المنصة وانضم إليها بنقرة واحدة!' : 'Browse any public servers registered on Sirver and join them with a single click!'}
                </span>
              </div>

              {/* Server Search bar */}
              <div className={`p-3 rounded-2xl border flex items-center gap-2.5 transition-all ${themeClasses.inputBg}`}>
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={serverSearchQuery}
                  onChange={(e) => setServerSearchQuery(e.target.value)}
                  placeholder={isAr ? 'ابحث عن سيرفر بالاسم أو الوصف...' : 'Search public servers...'}
                  className={`w-full text-xs focus:outline-none bg-transparent ${themeClasses.inputText}`}
                />
              </div>

              {/* Server Cards Lists */}
              {isLoadingServers ? (
                <div className="py-12 flex items-center justify-center gap-2 select-none">
                  <Compass className="w-5 h-5 text-accent animate-spin" />
                  <span className="text-xs font-semibold text-slate-400">{isAr ? 'جاري تحميل السيرفرات...' : 'Loading servers list...'}</span>
                </div>
              ) : filteredServers.length === 0 ? (
                <div className="py-12 border border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-2 select-none border-slate-800">
                  <Compass className="w-8 h-8 text-slate-600" />
                  <span className="text-xs font-medium">
                    {isAr ? 'لا توجد سيرفرات مطابقة للبحث.' : 'No servers found matching search query.'}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredServers.map((srv) => {
                    const isJoined = joinedServers.some((s) => s.id === srv.id);
                    const isLocked = !!getServerPassword(srv.description);
                    return (
                      <div 
                        key={srv.id}
                        className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all ${themeClasses.cardBg}`}
                      >
                        <div className="flex gap-3 text-left">
                          {getServerIconUrl(srv) ? (
                            <img
                              src={getServerIconUrl(srv)}
                              alt={srv.name}
                              className="w-11 h-11 rounded-2xl object-cover shrink-0 border border-[var(--theme-border)]"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-2xl bg-[var(--theme-bg-tertiary)] text-accent font-extrabold flex items-center justify-center shrink-0 border border-[var(--theme-border)] text-sm">
                              {srv.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className={`font-bold text-sm ${themeClasses.textPrimary} truncate flex items-center gap-1.5`}>
                              <span className="truncate">{srv.name}</span>
                              {isLocked && (
                                <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" title={isAr ? 'مغلق بكلمة مرور' : 'Password protected'} />
                              )}
                            </h4>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {stripServerPassword(srv.description) || (isAr ? 'لا يوجد وصف متاح.' : 'No description provided.')}
                            </p>
                          </div>
                        </div>

                        {/* Card control footer */}
                        <div className="flex items-center justify-between border-t border-slate-800/60 pt-3 mt-1 text-[11px] select-none">
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">
                            ID: {srv.id.substring(0, 6)}...
                          </span>

                          <div className="flex items-center gap-1.5">
                            {/* Copy Invite Code button */}
                            <button
                              onClick={() => copyInviteToClipboard(srv.id, srv.name)}
                              title={isAr ? 'نسخ رمز الدعوة' : 'Copy Invite Code'}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all border-0 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                            </button>

                            {isJoined ? (
                              <span className="px-3.5 py-1.5 bg-[var(--theme-bg-tertiary)] text-accent rounded-xl font-extrabold flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>{isAr ? 'عضو' : 'Member'}</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleJoinPublicServer(srv.id)}
                                className={`px-3.5 py-1.5 text-white rounded-xl font-extrabold border-0 cursor-pointer transition-all shadow-lg flex items-center gap-1 ${
                                  isLocked 
                                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/10' 
                                    : themeClasses.primaryBtn
                                }`}
                              >
                                {isLocked && <Lock className="w-3 h-3" />}
                                <span>{isAr ? 'انضمام' : 'Join'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Password Prompt Modal */}
      {passwordPromptServer && (
        <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center z-55 p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative select-none">
            <button
              onClick={() => {
                setPasswordPromptServer(null);
                setPasswordError(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer border-0"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center gap-3 text-center mb-5 mt-2">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-500">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-white text-sm">
                  {isAr ? 'سيرفر مغلق بكلمة مرور' : 'Password Protected Server'}
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr 
                    ? `أدخل كلمة المرور للانضمام إلى "${passwordPromptServer.name}"` 
                    : `Enter password to join "${passwordPromptServer.name}"`}
                </p>
              </div>
            </div>

            {passwordError && (
              <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-400 text-xs rounded-xl mb-4 font-semibold text-center">
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
              <input
                type="password"
                value={passwordInputVal}
                onChange={(e) => {
                  setPasswordInputVal(e.target.value);
                  setPasswordError(null);
                }}
                placeholder={isAr ? 'أدخل كلمة المرور...' : 'Enter password...'}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-all font-medium text-center"
                autoFocus
                required
              />

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordPromptServer(null);
                    setPasswordError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold transition-all border-0 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-amber-500/10 border-0 cursor-pointer"
                >
                  {isAr ? 'انضمام' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(DiscoveryCenter);
