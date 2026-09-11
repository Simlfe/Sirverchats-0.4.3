import APP_URLS from '../config/urls';

export interface WSEvent {
  type:
    | 'presence'
    | 'typing'
    | 'read_receipt'
    | 'message_delivery'
    | 'call_invite'
    | 'call_accept'
    | 'call_decline'
    | 'call_cancel'
    | 'call_busy'
    | 'call_end'
    | 'voice_presence'
    | 'voice_presence_query';
  channelId?: string;
  channel_id?: string;
  userId?: string;
  user_id?: string;
  username?: string;
  displayName?: string;
  display_name?: string;
  isTyping?: boolean;
  status?: string;
  messageId?: string;
  message_id?: string;
  callData?: any;
  [key: string]: any;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private listeners: Set<(evt: WSEvent) => void> = new Set();
  private reconnectTimer: any = null;
  private serverUrl: string = '';
  private bc: BroadcastChannel | null = null;
  private currentUserId: string | null = null;
  private pendingSocketEvents: WSEvent[] = [];

  private instanceId: string = Math.random().toString(36).substring(2, 10);
  private reconnectDelay: number = 3000;
  private maxReconnectDelay: number = 30000;
  private shouldConnect = false;
  private readonly queuedEventTypes = new Set<WSEvent['type']>([
    'call_invite',
    'call_accept',
    'call_decline',
    'call_cancel',
    'call_busy',
    'call_end',
  ]);

  constructor() {
    this.initBroadcastChannel();
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' && !this.bc) {
      try {
        this.bc = new BroadcastChannel('app_websocket_channel');
        this.bc.onmessage = (event) => {
          if (event.data && event.data.senderInstanceId !== this.instanceId) {
            this.emitLocal(event.data);
          }
        };
      } catch (e) {
        // BroadcastChannel fallback
      }
    }
  }

  public connect(userId?: string) {
    this.shouldConnect = true;
    if (typeof window === 'undefined') return;

    const nextUserId = userId || this.currentUserId || null;
    // A user switch must not reuse the previous user's routing identity.
    if (this.ws && this.currentUserId && nextUserId && this.currentUserId !== nextUserId) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
      this.pendingSocketEvents = [];
    }
    this.currentUserId = nextUserId;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    try {
      const baseUrl = APP_URLS.getWebSocketUrl(window.location.protocol, window.location.host);
      const parsedUrl = new URL(baseUrl, window.location.href);
      if (this.currentUserId) {
        parsedUrl.searchParams.set('user_id', this.currentUserId);
      }
      this.serverUrl = parsedUrl.toString();
      
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected successfully to', this.serverUrl);
        this.reconnectDelay = 3000;
        // Call invites/answers can be created while a mobile connection is
        // still handshaking. Flush them as soon as the socket is usable.
        const queued = this.pendingSocketEvents.splice(0);
        queued.forEach((payload) => this.sendSocketPayload(payload));
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (!raw) return;
          if (raw.senderInstanceId && raw.senderInstanceId === this.instanceId) {
            return; // Ignore echo: local listeners already processed this synchronously
          }
          const channelId = raw.channelId || raw.channel_id || raw.channel || raw.target_id || '';
          const userId = raw.userId || raw.user_id || raw.sender_id || raw.sender || raw.user || '';
          const messageId = raw.messageId || raw.message_id || '';
          const username = raw.username || raw.user_name || raw.displayName || raw.display_name || raw.name || 'User';
          let callData = raw.callData || raw.call_data;
          if (!callData && raw.data !== undefined && raw.data !== null) {
            callData = raw.data;
            if (typeof callData === 'string') {
              try { callData = JSON.parse(callData); } catch {}
            }
          }
          const normalized: WSEvent = {
            ...raw,
            channelId,
            channel_id: channelId,
            userId,
            user_id: userId,
            username,
            messageId,
            message_id: messageId,
            ...(callData && String(raw.type || '').startsWith('call_') ? { callData } : {}),
          };

          this.emit(normalized);
        } catch (e) {
          // ignore invalid json
        }
      };

      this.ws.onerror = () => {
        // Silent catch for unavailable WS endpoint
      };

      this.ws.onclose = () => {
        if (this.shouldConnect && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect(this.currentUserId || undefined);
          }, this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        }
      };
    } catch (e) {
      console.warn('WebSocket fallback active:', e);
    }
  }

  public disconnect() {
    this.shouldConnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.currentUserId = null;
    this.pendingSocketEvents = [];
  }

  public send(event: WSEvent) {
    const channelId = event.channelId || event.channel_id || event.channel || '';
    const userId = event.userId || event.user_id || event.user || '';
    const messageId = event.messageId || event.message_id || '';
    const username = event.username || event.user_name || event.displayName || event.display_name || '';
    const payload: WSEvent = {
      ...event,
      senderInstanceId: this.instanceId,
      channelId,
      channel_id: channelId,
      userId,
      user_id: userId,
      username,
      messageId,
      message_id: messageId,
    };

    // Broadcast locally to other components/listeners
    this.emitLocal(payload);
    try { this.bc?.postMessage(payload); } catch (e) {}

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSocketPayload(payload);
    } else if (this.shouldConnect && this.queuedEventTypes.has(payload.type)) {
      // Keep a small bounded queue for signaling events. Dropping an invite
      // while reconnecting leaves the callee with no ring UI at all.
      if (this.pendingSocketEvents.length >= 64) {
        this.pendingSocketEvents.shift();
      }
      this.pendingSocketEvents.push(payload);
    }
  }

  private sendSocketPayload(payload: WSEvent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      if (this.shouldConnect && this.queuedEventTypes.has(payload.type)) {
        if (this.pendingSocketEvents.length >= 64) this.pendingSocketEvents.shift();
        this.pendingSocketEvents.unshift(payload);
      }
      return false;
    }
  }

  public sendPresence(userId: string, status: string) {
    this.send({ type: 'presence', userId, status });
  }

  public sendTyping(channelId: string, userId: string, username: string, isTyping: boolean, displayName?: string) {
    if (!channelId || !userId) return;
    this.send({
      type: 'typing',
      channelId,
      channel_id: channelId,
      userId,
      user_id: userId,
      username,
      displayName: displayName || username,
      display_name: displayName || username,
      isTyping,
    });
  }

  public subscribe(callback: (evt: WSEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emitLocal(data: WSEvent) {
    this.listeners.forEach((fn) => fn(data));
  }

  private emit(data: WSEvent) {
    this.emitLocal(data);
  }
}

export const wsService = new WebSocketService();
export default wsService;
