import wsService, { WSEvent } from './websocket';
import { pbService } from '../pocketbase';

export interface VoiceParticipantInfo {
  channelId: string;
  serverId?: string;
  userId: string;
  userRef?: any;
  displayName: string;
  avatar?: string;
  isMuted: boolean;
  isDeafened?: boolean;
  isSpeaking: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  joinedAt: number;
  lastHeartbeat?: number;
}

class VoicePresenceStore {
  // Map of channelId -> Map of userId -> VoiceParticipantInfo
  private store: Map<string, Map<string, VoiceParticipantInfo>> = new Map();
  // Map of userId -> { currentChannelId: string, updatedAt: number } to strictly track latest channel assignment per user
  private userChannelStateMap: Map<string, { currentChannelId: string; updatedAt: number }> = new Map();
  private listeners: Set<() => void> = new Set();
  private localParticipant: VoiceParticipantInfo | null = null;
  private bc: BroadcastChannel | null = null;
  private pruneTimer: any = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.initWebSocketListener();
    this.initBroadcastChannel();
    this.initPocketBaseSubscription();
    this.initUnloadListeners();
    this.startHeartbeatAndPruning();
    this.fetchInitialPresences();
  }

  private async fetchInitialPresences() {
    try {
      const records = await pbService.fetchVoicePresences();
      if (Array.isArray(records)) {
        const currentAuthUser = pbService.getCurrentUser();
        records.forEach((r) => {
          if (r.channelId && r.userId) {
            // Strict Check for Local User
            if (currentAuthUser && r.userId === currentAuthUser.id) {
              if (!this.localParticipant || r.channelId !== this.localParticipant.channelId) {
                // Ignore and delete stale record from PocketBase
                pbService.deleteVoicePresence(r.userId).catch(() => {});
                return;
              }
            }

            // Strict Check for Remote User: If user is already active in another channel with a newer or current state, ignore
            const activeState = this.userChannelStateMap.get(r.userId);
            if (activeState && activeState.currentChannelId !== r.channelId) {
              return;
            }

            this.handlePresenceEvent({
              status: 'joined',
              ...r
            });
          }
        });
      }
    } catch (e) {}
  }

  private initPocketBaseSubscription() {
    try {
      pbService.subscribeToVoicePresences((evt) => {
        this.handlePresenceEvent(evt);
      });
    } catch (e) {}
  }

  private initUnloadListeners() {
    if (typeof window === 'undefined') return;
    const handleUnload = () => {
      if (this.localParticipant) {
        const prev = this.localParticipant;
        const msg = {
          type: 'voice_presence',
          channelId: prev.channelId,
          serverId: prev.serverId,
          userId: prev.userId,
          status: 'left',
        };
        wsService.send(msg as any);
        try { this.bc?.postMessage(msg); } catch (e) {}
        pbService.deleteVoicePresence(prev.userId).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
  }

  private initBroadcastChannel() {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel('voice_presence_channel');
      this.bc.onmessage = (event) => {
        if (event.data?.type === 'voice_presence') {
          this.handlePresenceEvent(event.data);
        } else if (event.data?.type === 'voice_presence_query') {
          if (this.localParticipant) {
            this.broadcastSelfPresence(this.localParticipant);
          }
        }
      };
    } catch (e) {}
  }

  private startHeartbeatAndPruning() {
    if (typeof window === 'undefined') return;

    let tick = 0;
    // Prune stale participants (> 30s without heartbeat) & broadcast local presence (every 3s)
    const PRESENCE_GRACE_PERIOD_MS = 30000;

    this.pruneTimer = setInterval(() => {
      tick++;
      const now = Date.now();
      let changed = false;

      this.store.forEach((channelMap, channelId) => {
        channelMap.forEach((p, userId) => {
          // If participant is not local participant and hasn't updated heartbeat in > 30 seconds
          if (p.userId !== this.localParticipant?.userId && p.lastHeartbeat && (now - p.lastHeartbeat > PRESENCE_GRACE_PERIOD_MS)) {
            console.log(`[VOICE_LIFECYCLE] Presence heartbeat stale (>30s) for userId=${userId} in channel=${channelId}. Pruning from presence store (media connection remains authoritative).`);
            channelMap.delete(userId);
            changed = true;
          }
        });
        if (channelMap.size === 0) {
          this.store.delete(channelId);
          changed = true;
        }
      });

      if (changed) {
        this.notify();
      }

      // Periodically refresh initial presences as fallback (every 6s)
      if (tick % 2 === 0) {
        this.fetchInitialPresences();
      }

      // Heartbeat for local participant if connected
      if (this.localParticipant) {
        this.localParticipant.lastHeartbeat = Date.now();
        this.broadcastSelfPresence(this.localParticipant);
      }
    }, 3000);
  }

  private initWebSocketListener() {
    if (typeof window === 'undefined') return;

    wsService.subscribe((evt: WSEvent) => {
      if (evt.type === ('voice_presence' as any)) {
        this.handlePresenceEvent(evt);
      } else if (evt.type === ('voice_presence_query' as any)) {
        if (this.localParticipant) {
          this.broadcastSelfPresence(this.localParticipant);
        }
      }
    });
  }

  public handlePresenceEvent(evt: any) {
    const {
      channelId,
      userId,
      status,
      displayName,
      avatar,
      isMuted,
      isDeafened,
      isSpeaking,
      isCameraEnabled,
      isScreenSharing,
      serverId,
      userRef,
      lastHeartbeat
    } = evt;

    if (!channelId || !userId) return;

    const currentAuthUser = pbService.getCurrentUser();
    const isLocalUser = currentAuthUser && userId === currentAuthUser.id;

    // Check 1: Strict Local User Filter
    if (isLocalUser) {
      if (!this.localParticipant) {
        // Local user is disconnected - purge local user from ALL channels immediately
        let removed = false;
        this.store.forEach((channelMap, cId) => {
          if (channelMap.has(userId)) {
            channelMap.delete(userId);
            if (channelMap.size === 0) this.store.delete(cId);
            removed = true;
          }
        });
        if (removed) this.notify();
        return;
      }

      if (this.localParticipant.channelId !== channelId) {
        // Event is for an outdated channel for the local user - ignore and purge from outdated channel
        const channelMap = this.store.get(channelId);
        if (channelMap && channelMap.has(userId)) {
          channelMap.delete(userId);
          if (channelMap.size === 0) this.store.delete(channelId);
          this.notify();
        }
        return;
      }
    }

    // Check 2: Heartbeat Stale Check (> 30 seconds old)
    const eventTime = lastHeartbeat || Date.now();
    if (lastHeartbeat && Date.now() - lastHeartbeat > 30000) {
      console.log(`[VOICE_LIFECYCLE] Stale presence heartbeat (>30s) received for user=${userId} in channel=${channelId}`);
      const channelMap = this.store.get(channelId);
      if (channelMap && channelMap.has(userId)) {
        channelMap.delete(userId);
        if (channelMap.size === 0) this.store.delete(channelId);
        this.notify();
      }
      return;
    }

    // Check 3: Stale Remote Event Check via userChannelStateMap
    const knownState = this.userChannelStateMap.get(userId);
    if (knownState) {
      if (knownState.currentChannelId !== channelId && eventTime < knownState.updatedAt) {
        // Discard stale event for an old channel
        return;
      }
    }

    console.log(`[VOICE_LIFECYCLE] Presence update: ${status || 'updated'} user=${userId} channel=${channelId} muted=${isMuted} explicit=${!!(evt.reason === 'explicit_leave' || evt.explicit)}`);

    if (status === 'left') {
      const channelMap = this.store.get(channelId);
      if (channelMap) {
        channelMap.delete(userId);
        if (channelMap.size === 0) {
          this.store.delete(channelId);
        }
      }
      if (knownState && knownState.currentChannelId === channelId) {
        this.userChannelStateMap.delete(userId);
      }
      this.notify();

      if (evt.reason === 'explicit_leave' || evt.explicit) {
        console.log(`[VOICE_LIFECYCLE] Explicit leave presence signal received for user=${userId}. Forwarding explicit removal to media provider.`);
        try {
          // Lazy import to avoid circular dependency
          import('../media/RealtimeMediaProvider').then(({ realtimeMediaProvider }) => {
            realtimeMediaProvider.removeParticipant(userId, true, 'explicit_leave');
          });
        } catch (e) {}
      } else {
        console.log(`[VOICE_LIFECYCLE] Non-explicit presence 'left' for user=${userId}. Preserving media connection state as authority.`);
      }
    } else {
      // status === 'joined' || status === 'updated'
      // Remove user from ALL other channels across store so user never appears in two channels
      this.store.forEach((channelMap, cId) => {
        if (cId !== channelId && channelMap.has(userId)) {
          channelMap.delete(userId);
          if (channelMap.size === 0) this.store.delete(cId);
        }
      });

      this.userChannelStateMap.set(userId, {
        currentChannelId: channelId,
        updatedAt: eventTime,
      });

      if (!this.store.has(channelId)) {
        this.store.set(channelId, new Map());
      }
      const channelMap = this.store.get(channelId)!;
      const existing = channelMap.get(userId);

      const info: VoiceParticipantInfo = {
        channelId,
        serverId: serverId || existing?.serverId,
        userId,
        userRef: userRef || existing?.userRef,
        displayName: displayName || existing?.displayName || 'User',
        avatar: avatar !== undefined ? avatar : existing?.avatar,
        isMuted: typeof isMuted === 'boolean' ? isMuted : existing?.isMuted ?? false,
        isDeafened: typeof isDeafened === 'boolean' ? isDeafened : existing?.isDeafened ?? false,
        isSpeaking: typeof isSpeaking === 'boolean' ? isSpeaking : existing?.isSpeaking ?? false,
        isCameraEnabled: typeof isCameraEnabled === 'boolean' ? isCameraEnabled : existing?.isCameraEnabled ?? false,
        isScreenSharing: typeof isScreenSharing === 'boolean' ? isScreenSharing : existing?.isScreenSharing ?? false,
        joinedAt: existing?.joinedAt || evt.joinedAt || Date.now(),
        lastHeartbeat: eventTime,
      };

      channelMap.set(userId, info);
      this.notify();
    }
  }

  public setLocalPresence(info: VoiceParticipantInfo | null) {
    if (!info) {
      if (this.localParticipant) {
        const prev = this.localParticipant;
        this.localParticipant = null;
        this.userChannelStateMap.delete(prev.userId);

        const msg = {
          type: 'voice_presence',
          channelId: prev.channelId,
          serverId: prev.serverId,
          userId: prev.userId,
          status: 'left',
          reason: 'explicit_leave',
        };
        wsService.send(msg as any);
        try { this.bc?.postMessage(msg); } catch (e) {}
        pbService.deleteVoicePresence(prev.userId).catch(() => {});

        // Synchronously remove local user from all channels in store
        this.store.forEach((channelMap, cId) => {
          if (channelMap.has(prev.userId)) {
            channelMap.delete(prev.userId);
            if (channelMap.size === 0) this.store.delete(cId);
          }
        });
        this.notify();
      }
      return;
    }

    // If local user switched channels, broadcast 'left' for previous channel and clean store
    if (this.localParticipant && this.localParticipant.channelId !== info.channelId) {
      const prev = this.localParticipant;
      const msg = {
        type: 'voice_presence',
        channelId: prev.channelId,
        serverId: prev.serverId,
        userId: prev.userId,
        status: 'left',
      };
      wsService.send(msg as any);
      try { this.bc?.postMessage(msg); } catch (e) {}
      pbService.deleteVoicePresence(prev.userId).catch(() => {});

      this.store.forEach((channelMap, cId) => {
        if (cId !== info.channelId && channelMap.has(prev.userId)) {
          channelMap.delete(prev.userId);
          if (channelMap.size === 0) this.store.delete(cId);
        }
      });
    }

    info.lastHeartbeat = Date.now();
    this.localParticipant = info;
    this.userChannelStateMap.set(info.userId, {
      currentChannelId: info.channelId,
      updatedAt: info.lastHeartbeat,
    });

    if (!this.store.has(info.channelId)) {
      this.store.set(info.channelId, new Map());
    }
    this.store.get(info.channelId)?.set(info.userId, info);

    this.broadcastSelfPresence(info);
    this.notify();
  }

  public broadcastSelfPresence(info: VoiceParticipantInfo) {
    const msg = {
      type: 'voice_presence',
      channelId: info.channelId,
      serverId: info.serverId,
      userId: info.userId,
      userRef: info.userRef,
      displayName: info.displayName,
      avatar: info.avatar,
      isMuted: info.isMuted,
      isDeafened: info.isDeafened || false,
      isSpeaking: info.isSpeaking,
      isCameraEnabled: info.isCameraEnabled,
      isScreenSharing: info.isScreenSharing,
      status: 'joined',
      lastHeartbeat: info.lastHeartbeat || Date.now(),
    };
    wsService.send(msg as any);
    try { this.bc?.postMessage(msg); } catch (e) {}
    pbService.syncVoicePresence(info).catch(() => {});
  }

  public queryAllPresence(serverId?: string) {
    const msg = {
      type: 'voice_presence_query',
      serverId,
    };
    wsService.send(msg as any);
    try { this.bc?.postMessage(msg); } catch (e) {}
    this.fetchInitialPresences();
  }

  public getLocalPresence(): VoiceParticipantInfo | null {
    return this.localParticipant;
  }

  public getChannelParticipants(channelId: string): VoiceParticipantInfo[] {
    const channelMap = this.store.get(channelId);
    if (!channelMap) return [];
    return Array.from(channelMap.values());
  }

  public getChannelParticipantCount(channelId: string): number {
    return this.store.get(channelId)?.size || 0;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}

export const voicePresenceStore = new VoicePresenceStore();
export default voicePresenceStore;
