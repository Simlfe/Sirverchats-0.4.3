import { User } from '../types';
import { IncomingCallEvent, CallSignalingState } from '../types/media';
import wsService, { WSEvent } from './websocket';
import { pbService, getServerMemberAvatarUrl } from '../pocketbase';
import {
  playRingtoneSound,
  stopRingtoneSound,
  playOutgoingRingtoneSound,
  stopOutgoingRingtoneSound,
  stopAllRingtones,
  resetRingtoneMuted,
} from '../lib/sounds';

export type CallSignalingListener = (event: IncomingCallEvent) => void;

class CallSignalingService {
  private activeCallEvent: IncomingCallEvent | null = null;
  private timeoutTimer: any = null;
  private outgoingSoundTimer: any = null;
  private listeners: Set<CallSignalingListener> = new Set();
  private wsUnsub: (() => void) | null = null;
  private currentUser: User | null = null;
  private bc: BroadcastChannel | null = null;

  constructor() {
    this.init();
  }

  public setCurrentUser(user: User | null) {
    this.currentUser = user;
  }

  public getCurrentUser(): User | null {
    if (this.currentUser) return this.currentUser;
    const fromPb = pbService.getCurrentUser();
    if (fromPb) return fromPb;
    try {
      const stored = localStorage.getItem('pocketbase_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.model) return parsed.model as User;
        if (parsed?.record) return parsed.record as User;
      }
    } catch {}
    return null;
  }

  private init() {
    this.wsUnsub = wsService.subscribe((evt: WSEvent) => {
      this.handleWSEvent(evt);
    });

    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' && !this.bc) {
      try {
        this.bc = new BroadcastChannel('sirver_call_signaling_channel');
        this.bc.onmessage = (event) => {
          if (event.data) {
            this.handleIncomingCallPayload(event.data);
          }
        };
      } catch {}
    }

    if (typeof window !== 'undefined') {
      try {
        window.addEventListener('storage', (e) => {
          if (e.key === 'sirver_call_signal_pulse' && e.newValue) {
            try {
              const parsed = JSON.parse(e.newValue);
              if (parsed && parsed.payload) {
                this.handleIncomingCallPayload(parsed.payload);
              }
            } catch {}
          }
        });
      } catch {}
    }
  }

  private broadcastLocal(payload: any) {
    try {
      this.bc?.postMessage(payload);
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(
          'sirver_call_signal_pulse',
          JSON.stringify({ payload, timestamp: Date.now(), rand: Math.random() })
        );
      }
    } catch {}
  }

  public subscribe(listener: CallSignalingListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public sendCallInvite(params: {
    caller: User;
    targetUser: User;
    conversationId: string;
    callType: 'voice' | 'video';
    existingEvent?: IncomingCallEvent;
  }): IncomingCallEvent {
    let event = params.existingEvent;
    const callerAvatarUrl =
      getServerMemberAvatarUrl(null, params.caller, undefined) ||
      (params.caller.avatar
        ? params.caller.avatar.startsWith('http') || params.caller.avatar.startsWith('blob:') || params.caller.avatar.startsWith('data:')
          ? params.caller.avatar
          : `${pbService.getServerUrl()}/api/files/users/${params.caller.id}/${params.caller.avatar}`
        : '');

    if (!event) {
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      event = {
        callId,
        callerId: params.caller.id,
        callerName: params.caller.display_name || params.caller.username,
        callerAvatar: callerAvatarUrl,
        callerUser: params.caller,
        targetUser: params.targetUser,
        targetUserId: params.targetUser.id,
        callType: params.callType,
        conversationId: params.conversationId,
        state: 'ringing',
        timestamp: Date.now(),
      };
    }

    const callId = event.callId;
    this.activeCallEvent = event;

    // Reset mute state so ringback tone can be heard
    resetRingtoneMuted();

    // Start outgoing ringback tone for caller with responsive 350ms delay
    this.clearOutgoingSoundTimer();
    this.outgoingSoundTimer = setTimeout(() => {
      if (this.activeCallEvent && this.activeCallEvent.callId === callId && this.activeCallEvent.state === 'ringing') {
        playOutgoingRingtoneSound();
      }
      this.outgoingSoundTimer = null;
    }, 350);

    // Immediately notify caller UI that outgoing call is ringing
    this.notify(event);

    // Broadcast locally for instant multi-tab sync
    this.broadcastLocal({
      type: 'call_invite',
      ...event,
      targetUserId: params.targetUser.id,
    });

    // Send call invite via WebSocket signaling
    wsService.send({
      type: 'call_invite',
      channelId: params.conversationId,
      userId: params.targetUser.id,
      username: params.caller.username,
      callData: {
        ...event,
        targetUserId: params.targetUser.id,
      },
    });

    // Also push real-time call notification to target user in background without blocking
    pbService
      .addNotificationToUser(params.targetUser.id, {
        id: `call_${callId}`,
        type: 'system',
        sender_id: params.caller.id,
        sender_name: params.caller.display_name || params.caller.username,
        sender_avatar: callerAvatarUrl,
        channel_id: params.conversationId,
        message_content: `INCOMING_CALL:${JSON.stringify({ ...event, targetUserId: params.targetUser.id })}`,
        created: new Date().toISOString(),
        read: false,
      })
      .catch((e) => {
        console.warn('Call notification dispatch warning:', e);
      });

    // Also dispatch direct signaling via private message for guaranteed real-time delivery
    if (params.targetUser?.id) {
      pbService
        .createPrivateMessage(
          params.targetUser.id,
          `INCOMING_CALL:${JSON.stringify({ ...event, targetUserId: params.targetUser.id })}`,
          params.conversationId
        )
        .catch(() => {});
    }

    // Record call start in PocketBase DB in background without blocking
    pbService.startOrJoinCall(params.conversationId).catch((e) => {
      console.warn('Call DB recording warning:', e);
    });

    // Auto-timeout after 30 seconds if unanswered
    this.clearTimeoutTimer();
    this.timeoutTimer = setTimeout(() => {
      if (this.activeCallEvent && this.activeCallEvent.callId === callId && this.activeCallEvent.state === 'ringing') {
        this.cancelCall(callId, 'timeout');
      }
    }, 30000);

    return event;
  }

  public acceptCall(callId: string, fallbackEvent?: IncomingCallEvent) {
    const baseEvent =
      this.activeCallEvent && this.activeCallEvent.callId === callId
        ? this.activeCallEvent
        : fallbackEvent;
    if (!baseEvent) return;

    this.clearOutgoingSoundTimer();
    this.clearTimeoutTimer();
    stopAllRingtones();

    const user = this.getCurrentUser();
    const callerId = baseEvent.callerId;
    const conversationId = baseEvent.conversationId;

    this.activeCallEvent = {
      ...baseEvent,
      state: 'accepted',
    };

    const payload = {
      type: 'call_accept',
      callId,
      state: 'accepted',
      conversationId,
      callerId,
      targetUserId: baseEvent.targetUserId || user?.id,
    };

    this.broadcastLocal(payload);

    wsService.send({
      type: 'call_accept',
      channelId: conversationId,
      userId: callerId,
      callData: { callId, state: 'accepted', callerId, conversationId },
    });

    if (callerId && user?.id && callerId !== user.id) {
      pbService
        .addNotificationToUser(callerId, {
          id: `signal_${Date.now()}`,
          type: 'system',
          sender_id: user.id,
          sender_name: user.display_name || user.username,
          channel_id: conversationId,
          message_content: `CALL_SIGNAL:${JSON.stringify(payload)}`,
          created: new Date().toISOString(),
          read: false,
        })
        .catch(() => {});

      pbService
        .createPrivateMessage(
          callerId,
          `CALL_SIGNAL:${JSON.stringify(payload)}`,
          conversationId
        )
        .catch(() => {});
    }

    this.notify(this.activeCallEvent);
  }

  public declineCall(callId: string, state: CallSignalingState = 'declined', fallbackEvent?: IncomingCallEvent) {
    const baseEvent =
      this.activeCallEvent && this.activeCallEvent.callId === callId
        ? this.activeCallEvent
        : fallbackEvent;
    if (!baseEvent) return;

    this.clearOutgoingSoundTimer();
    this.clearTimeoutTimer();
    stopAllRingtones();

    const user = this.getCurrentUser();
    const currentEvent = { ...baseEvent, state };
    const counterpartId =
      currentEvent.callerId === user?.id
        ? currentEvent.targetUserId || currentEvent.targetUser?.id
        : currentEvent.callerId;

    const payload = {
      type: 'call_decline',
      callId,
      state,
      conversationId: currentEvent.conversationId,
    };

    this.broadcastLocal(payload);

    wsService.send({
      type: 'call_decline',
      channelId: currentEvent.conversationId,
      userId: currentEvent.callerId,
      callData: { callId, state },
    });

    if (counterpartId && user?.id && counterpartId !== user.id) {
      pbService
        .addNotificationToUser(counterpartId, {
          id: `signal_${Date.now()}`,
          type: 'system',
          sender_id: user.id,
          sender_name: user.display_name || user.username,
          channel_id: currentEvent.conversationId,
          message_content: `CALL_SIGNAL:${JSON.stringify(payload)}`,
          created: new Date().toISOString(),
          read: false,
        })
        .catch(() => {});

      pbService
        .createPrivateMessage(
          counterpartId,
          `CALL_SIGNAL:${JSON.stringify(payload)}`,
          currentEvent.conversationId
        )
        .catch(() => {});
    }

    this.notify(currentEvent);
    this.activeCallEvent = null;
  }

  public cancelCall(callId: string, state: CallSignalingState = 'cancelled', fallbackEvent?: IncomingCallEvent) {
    const baseEvent =
      this.activeCallEvent && this.activeCallEvent.callId === callId
        ? this.activeCallEvent
        : fallbackEvent;
    if (!baseEvent) return;

    this.clearOutgoingSoundTimer();
    this.clearTimeoutTimer();
    stopAllRingtones();

    const user = this.getCurrentUser();
    const currentEvent = { ...baseEvent, state };
    const counterpartId =
      currentEvent.callerId === user?.id
        ? currentEvent.targetUserId || currentEvent.targetUser?.id
        : currentEvent.callerId;

    const payload = {
      type: 'call_cancel',
      callId,
      state,
      conversationId: currentEvent.conversationId,
    };

    this.broadcastLocal(payload);

    wsService.send({
      type: 'call_cancel',
      channelId: currentEvent.conversationId,
      callData: { callId, state },
    });

    if (counterpartId && user?.id && counterpartId !== user.id) {
      pbService
        .addNotificationToUser(counterpartId, {
          id: `signal_${Date.now()}`,
          type: 'system',
          sender_id: user.id,
          sender_name: user.display_name || user.username,
          channel_id: currentEvent.conversationId,
          message_content: `CALL_SIGNAL:${JSON.stringify(payload)}`,
          created: new Date().toISOString(),
          read: false,
        })
        .catch(() => {});

      pbService
        .createPrivateMessage(
          counterpartId,
          `CALL_SIGNAL:${JSON.stringify(payload)}`,
          currentEvent.conversationId
        )
        .catch(() => {});
    }

    this.notify(currentEvent);
    this.activeCallEvent = null;
  }

  public endCall(callId: string, fallbackEvent?: IncomingCallEvent) {
    this.clearOutgoingSoundTimer();
    this.clearTimeoutTimer();
    stopAllRingtones();

    const user = this.getCurrentUser();
    const currentEvent = this.activeCallEvent
      ? { ...this.activeCallEvent, state: 'ended' as CallSignalingState }
      : fallbackEvent
      ? { ...fallbackEvent, state: 'ended' as CallSignalingState }
      : ({ callId, state: 'ended' as CallSignalingState, conversationId: '' } as any);

    const counterpartId =
      currentEvent.callerId === user?.id
        ? currentEvent.targetUserId || currentEvent.targetUser?.id
        : currentEvent.callerId;

    const payload = {
      type: 'call_end',
      callId,
      state: 'ended',
      conversationId: currentEvent.conversationId,
    };

    this.broadcastLocal(payload);

    wsService.send({
      type: 'call_end',
      channelId: currentEvent.conversationId,
      callData: { callId, state: 'ended' },
    });

    if (counterpartId && user?.id && counterpartId !== user.id) {
      pbService
        .addNotificationToUser(counterpartId, {
          id: `signal_${Date.now()}`,
          type: 'system',
          sender_id: user.id,
          sender_name: user.display_name || user.username,
          channel_id: currentEvent.conversationId,
          message_content: `CALL_SIGNAL:${JSON.stringify(payload)}`,
          created: new Date().toISOString(),
          read: false,
        })
        .catch(() => {});

      pbService
        .createPrivateMessage(
          counterpartId,
          `CALL_SIGNAL:${JSON.stringify(payload)}`,
          currentEvent.conversationId
        )
        .catch(() => {});
    }

    this.notify(currentEvent);
    this.activeCallEvent = null;
  }

  public getActiveCall(): IncomingCallEvent | null {
    return this.activeCallEvent;
  }

  public handleIncomingCallPayload(rawPayload: string | any) {
    const user = this.getCurrentUser() || pbService.getCurrentUser();
    if (!user) return;
    try {
      let data: any = null;

      const safeParseJson = (str: string): any => {
        if (!str || typeof str !== 'string') return null;
        const trimmed = str.trim();
        try {
          return JSON.parse(trimmed);
        } catch {
          // Attempt extracting balanced JSON object if wrapped with extraneous characters
          const startIdx = trimmed.indexOf('{');
          const endIdx = trimmed.lastIndexOf('}');
          if (startIdx !== -1 && endIdx > startIdx) {
            try {
              return JSON.parse(trimmed.substring(startIdx, endIdx + 1));
            } catch {
              return null;
            }
          }
          return null;
        }
      };

      if (typeof rawPayload === 'string') {
        const trimmed = rawPayload.trim();
        if (trimmed.includes('CALL_SIGNAL:')) {
          const idx = trimmed.indexOf('CALL_SIGNAL:');
          const jsonStr = trimmed.slice(idx + 'CALL_SIGNAL:'.length).trim();
          data = safeParseJson(jsonStr);
        } else if (trimmed.includes('INCOMING_CALL:')) {
          const idx = trimmed.indexOf('INCOMING_CALL:');
          const jsonStr = trimmed.slice(idx + 'INCOMING_CALL:'.length).trim();
          data = safeParseJson(jsonStr);
        } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          data = safeParseJson(trimmed);
        }
      } else if (rawPayload && typeof rawPayload === 'object') {
        if (rawPayload.message_content && typeof rawPayload.message_content === 'string') {
          return this.handleIncomingCallPayload(rawPayload.message_content);
        } else if (rawPayload.callId) {
          data = rawPayload;
        }
      }

      if (!data || !data.callId) return;

      const sigType = data.type || data.action;
      if (['call_decline', 'call_cancel', 'call_end', 'call_accept', 'call_busy'].includes(sigType)) {
        this.handleWSEvent({
          type: sigType as any,
          channelId: data.conversationId,
          userId: data.userId,
          callData: data,
        });
        return;
      }

      const myId = String(user?.id || '').trim();
      const callerId = String(data.callerId || data.callerUser?.id || '').trim();
      const targetId = String(data.targetUserId || data.targetUser?.id || '').trim();

      // Check if call is for this user and caller is someone else
      // Never ring if caller is current user!
      if (callerId && myId && callerId === myId) return;
      if (targetId && myId && targetId !== myId) return;

      // If already ringing this exact call, ignore duplicate trigger
      if (this.activeCallEvent && this.activeCallEvent.callId === data.callId) {
        return;
      }

      // If in another active call, reply busy
      if (this.activeCallEvent && ['ringing', 'accepted'].includes(this.activeCallEvent.state)) {
        wsService.send({
          type: 'call_busy',
          channelId: data.conversationId,
          userId: data.callerId,
          callData: { callId: data.callId, state: 'busy' },
        });
        return;
      }

      // Check if call is expired (older than 45 seconds)
      if (data.timestamp && Date.now() - data.timestamp > 45000) {
        return;
      }

      const incoming: IncomingCallEvent = {
        callId: data.callId,
        callerId: data.callerId,
        callerName: data.callerName || (data.callerUser?.display_name || data.callerUser?.username || 'User'),
        callerAvatar: data.callerAvatar || (data.callerUser?.avatar ? `${pbService.getServerUrl()}/api/files/users/${data.callerId}/${data.callerUser.avatar}` : ''),
        callerUser: data.callerUser || { id: data.callerId, username: data.callerName || 'user', display_name: data.callerName } as any,
        targetUser: user,
        targetUserId: user.id,
        callType: data.callType || 'voice',
        conversationId: data.conversationId,
        state: 'ringing',
        timestamp: data.timestamp || Date.now(),
      };

      this.activeCallEvent = incoming;
      resetRingtoneMuted();
      playRingtoneSound();

      // Auto timeout after 30s
      this.clearTimeoutTimer();
      this.timeoutTimer = setTimeout(() => {
        if (this.activeCallEvent && this.activeCallEvent.callId === incoming.callId && this.activeCallEvent.state === 'ringing') {
          this.declineCall(incoming.callId, 'missed', incoming);
        }
      }, 30000);

      this.notify(incoming);
    } catch (e) {
      // Gracefully handle malformed payloads without unhandled exception
    }
  }

  private handleWSEvent(evt: WSEvent) {
    const user = this.getCurrentUser();
    if (!user) return;

    const data = evt.callData;
    const myId = String(user.id || '').trim();

    switch (evt.type) {
      case 'call_invite': {
        if (!data) return;
        const callerId = String(data.callerId || data.callerUser?.id || '').trim();
        const targetId = String(data.targetUserId || data.targetUser?.id || '').trim();

        // Never trigger incoming call for the caller themselves
        if (callerId && myId && callerId === myId) return;
        if (targetId && myId && targetId !== myId) return;

        // If current user is already in a call, signal busy back
        if (this.activeCallEvent && ['ringing', 'accepted'].includes(this.activeCallEvent.state)) {
          wsService.send({
            type: 'call_busy',
            channelId: data.conversationId,
            userId: data.callerId,
            callData: { callId: data.callId, state: 'busy' },
          });
          return;
        }

        const incoming: IncomingCallEvent = {
          callId: data.callId,
          callerId: data.callerId,
          callerName: data.callerName,
          callerAvatar: data.callerAvatar,
          callerUser: data.callerUser,
          targetUser: user,
          targetUserId: user.id,
          callType: data.callType || 'voice',
          conversationId: data.conversationId,
          state: 'ringing',
          timestamp: data.timestamp || Date.now(),
        };

        this.activeCallEvent = incoming;
        resetRingtoneMuted();
        playRingtoneSound();

        // Auto timeout incoming call ring after 30s
        this.clearTimeoutTimer();
        this.timeoutTimer = setTimeout(() => {
          if (this.activeCallEvent && this.activeCallEvent.callId === incoming.callId && this.activeCallEvent.state === 'ringing') {
            this.declineCall(incoming.callId, 'missed', incoming);
          }
        }, 30000);

        this.notify(incoming);
        break;
      }

      case 'call_accept': {
        const acceptCallId = data?.callId || (evt as any).callId;
        if (this.activeCallEvent && (!acceptCallId || acceptCallId === this.activeCallEvent.callId)) {
          this.clearOutgoingSoundTimer();
          this.clearTimeoutTimer();
          stopAllRingtones();
          this.activeCallEvent = { ...this.activeCallEvent, state: 'accepted' };
          this.notify(this.activeCallEvent);
        } else if (acceptCallId) {
          this.clearOutgoingSoundTimer();
          this.clearTimeoutTimer();
          stopAllRingtones();
          this.notify({
            callId: acceptCallId,
            callerId: data?.callerId || '',
            callerName: data?.callerName || '',
            callerAvatar: '',
            callerUser: data?.callerUser || ({ id: data?.callerId || '', username: data?.callerName || 'user', display_name: data?.callerName } as any),
            targetUserId: user.id,
            callType: data?.callType || 'voice',
            conversationId: evt.channelId || data?.conversationId || '',
            state: 'accepted',
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'call_decline':
      case 'call_busy': {
        if (this.activeCallEvent && (!data?.callId || data.callId === this.activeCallEvent.callId)) {
          this.clearOutgoingSoundTimer();
          this.clearTimeoutTimer();
          stopAllRingtones();
          const state: CallSignalingState = evt.type === 'call_busy' ? 'busy' : (data?.state || 'declined');
          const updated: IncomingCallEvent = { ...this.activeCallEvent, state };
          this.notify(updated);
          this.activeCallEvent = null;
        }
        break;
      }

      case 'call_cancel':
      case 'call_end': {
        if (this.activeCallEvent && (!data?.callId || data.callId === this.activeCallEvent.callId)) {
          this.clearOutgoingSoundTimer();
          this.clearTimeoutTimer();
          stopAllRingtones();
          const state: CallSignalingState = evt.type === 'call_cancel' ? 'cancelled' : 'ended';
          const updated: IncomingCallEvent = { ...this.activeCallEvent, state };
          this.notify(updated);
          this.activeCallEvent = null;
        }
        break;
      }
    }
  }

  private clearOutgoingSoundTimer() {
    if (this.outgoingSoundTimer) {
      clearTimeout(this.outgoingSoundTimer);
      this.outgoingSoundTimer = null;
    }
  }

  private clearTimeoutTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private notify(event: IncomingCallEvent) {
    this.listeners.forEach((fn) => fn(event));
  }
}

export const callSignalingService = new CallSignalingService();
export default callSignalingService;

