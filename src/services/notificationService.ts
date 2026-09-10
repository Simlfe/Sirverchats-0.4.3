import { LocalNotifications, PermissionStatus } from '@capacitor/local-notifications';
import { NotificationItem } from '../types';
import { playPingSound } from '../lib/sounds';
import { showAndFocusWindow } from '../lib/tauriDesktopService';
import { parseCallLog, getCallLogSnippet } from './callLogService';

type NotificationTapListener = (notification: NotificationItem) => void;

class NotificationService {
  private isNative: boolean = false;
  private channelsCreated: boolean = false;
  private processedNotifIds: Set<string> = new Set();
  private tapListeners: Set<NotificationTapListener> = new Set();
  private isInitialized: boolean = false;

  constructor() {
    this.isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
  }

  /**
   * Initialize native notification channels and click listeners
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (this.isNative) {
      try {
        await this.createChannels();
        await this.setupNativeListeners();
      } catch (err) {
        console.warn('[NOTIFICATION_SERVICE] Failed to initialize native local notifications:', err);
      }
    }
  }

  /**
   * Create Android notification channels with distinct importance levels and stable IDs
   */
  private async createChannels(): Promise<void> {
    if (this.channelsCreated || !this.isNative) return;
    try {
      await LocalNotifications.createChannel({
        id: 'friend_requests',
        name: 'Friend Requests',
        description: 'Notifications for incoming friend requests and acceptances',
        importance: 4, // High
        visibility: 1, // Public
        vibration: true,
        sound: 'default'
      });

      await LocalNotifications.createChannel({
        id: 'messages',
        name: 'Messages & Mentions',
        description: 'Notifications for direct messages, mentions, and replies',
        importance: 4, // High
        visibility: 1,
        vibration: true,
        sound: 'default'
      });

      await LocalNotifications.createChannel({
        id: 'calls',
        name: 'Calls & Voice',
        description: 'Notifications for incoming voice and video calls',
        importance: 5, // Max
        visibility: 1,
        vibration: true,
        sound: 'default'
      });

      await LocalNotifications.createChannel({
        id: 'system',
        name: 'System Alerts',
        description: 'System updates and general announcements',
        importance: 3, // Default
        visibility: 1,
        vibration: true,
        sound: 'default'
      });

      this.channelsCreated = true;
      console.log('[NOTIFICATION_SERVICE] Android notification channels created successfully.');
    } catch (err) {
      console.warn('[NOTIFICATION_SERVICE] Error creating Android notification channels:', err);
    }
  }

  /**
   * Attach native click/tap listeners for system notifications
   */
  private async setupNativeListeners(): Promise<void> {
    try {
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        console.log('[NOTIFICATION_SERVICE] Native notification tapped:', action);
        showAndFocusWindow();

        const extraData = action.notification?.extra;
        if (extraData && typeof extraData === 'object') {
          const notifItem = (extraData.notifItem || extraData) as NotificationItem;
          if (notifItem && notifItem.id) {
            this.notifyTapListeners(notifItem);
          }
        }
      });
    } catch (err) {
      console.warn('[NOTIFICATION_SERVICE] Error setting up native listeners:', err);
    }
  }

  /**
   * Check notification permissions status across Android / Web
   */
  public async checkPermission(): Promise<boolean> {
    if (this.isNative) {
      try {
        const status: PermissionStatus = await LocalNotifications.checkPermissions();
        return status.display === 'granted';
      } catch (e) {
        console.warn('[NOTIFICATION_SERVICE] Check permission failed on native:', e);
        return false;
      }
    } else {
      return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
    }
  }

  /**
   * Request notification permissions when prompted or needed
   */
  public async requestPermission(): Promise<boolean> {
    if (this.isNative) {
      try {
        const status: PermissionStatus = await LocalNotifications.requestPermissions();
        if (status.display === 'granted') {
          await this.createChannels();
          return true;
        }
        return false;
      } catch (e) {
        console.warn('[NOTIFICATION_SERVICE] Request permission failed on native:', e);
        return false;
      }
    } else {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          const perm = await Notification.requestPermission();
          return perm === 'granted';
        } catch (e) {
          console.warn('[NOTIFICATION_SERVICE] Request permission failed on web:', e);
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Generate a stable 32-bit positive integer hash for Capacitor local notification ID
   */
  private hashStringToInt(str: string): number {
    let hash = 0;
    if (!str || str.length === 0) return Math.floor(Math.random() * 2000000000) + 1;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) || 1;
  }

  /**
   * Dispatch a notification across In-App Sound, Native Android Tray, and Desktop Notification
   */
  public async sendNotification(
    notif: NotificationItem,
    options?: { skipSound?: boolean; lang?: string }
  ): Promise<void> {
    if (!notif || !notif.id) return;

    // Ephemeral call signaling is handled directly by CallSignalingService & FloatingCallWindow UI
    if (
      notif.message_content?.includes('INCOMING_CALL:') ||
      (notif.id?.startsWith('call_') && !notif.message_content?.includes('[CALL_LOG:'))
    ) {
      return;
    }

    // Deduplicate rapid repeat deliveries
    if (this.processedNotifIds.has(notif.id)) {
      return;
    }
    this.processedNotifIds.add(notif.id);
    if (this.processedNotifIds.size > 300) {
      const iterator = this.processedNotifIds.values();
      const first = iterator.next().value;
      if (first) this.processedNotifIds.delete(first);
    }

    // Play synthesized sound effect
    if (!options?.skipSound) {
      playPingSound();
    }

    const isAr = options?.lang === 'ar';

    // Format title & channel based on notification type
    let title = notif.sender_name || 'Sirver Notification';
    let body = notif.message_content || notif.message || '';
    let channelId = 'system';

    const callLog = parseCallLog(body);
    if (callLog) {
      const isVideo = callLog.type === 'video';
      const isMissed = callLog.status === 'missed' || callLog.status === 'declined';
      title = isAr
        ? (isMissed ? `مكالمة ${isVideo ? 'فيديو' : 'صوتية'} فائتة` : `مكالمة ${isVideo ? 'فيديو' : 'صوتية'}`)
        : (isMissed ? `Missed ${isVideo ? 'Video' : 'Voice'} Call` : `${isVideo ? 'Video' : 'Voice'} Call`);
      body = getCallLogSnippet(notif.message_content || notif.message || '', isAr ? 'ar' : 'en') || (isAr ? 'سجل مكالمة' : 'Call Log');
      channelId = 'calls';
    } else if (notif.id?.startsWith('call_') || notif.message_content?.startsWith('INCOMING_CALL:')) {
      title = isAr ? `مكالمة واردة من ${notif.sender_name}` : `Incoming Call from ${notif.sender_name}`;
      body = isAr ? 'انقر لفتح المكالمة أو الرد' : 'Tap to open call or answer';
      channelId = 'calls';
    } else if (notif.type === 'friend_request' || notif.channel_name === 'Friend Request') {
      title = isAr ? `طلب صداقة من ${notif.sender_name}` : `Friend Request from ${notif.sender_name}`;
      body = body || (isAr ? `أرسل لك ${notif.sender_name} طلب صداقة!` : `${notif.sender_name} sent you a friend request!`);
      channelId = 'friend_requests';
    } else if (notif.type === 'dm' || notif.channel_id === 'dm' || notif.private_chat_id) {
      title = isAr ? `رسالة خاصة من ${notif.sender_name}` : `Direct Message from ${notif.sender_name}`;
      body = body || (isAr ? 'رسالة جديدة' : 'New message');
      channelId = 'messages';
    } else if (notif.type === 'mention') {
      title = isAr ? `إشارة من ${notif.sender_name}` : `Mention from ${notif.sender_name}`;
      channelId = 'messages';
    } else if (notif.type === 'reply') {
      title = isAr ? `رد من ${notif.sender_name}` : `Reply from ${notif.sender_name}`;
      channelId = 'messages';
    }

    // 1. Native Android / iOS Delivery via @capacitor/local-notifications
    if (this.isNative) {
      try {
        const hasPerm = await this.checkPermission();
        if (hasPerm) {
          const numericId = this.hashStringToInt(notif.id);
          await LocalNotifications.schedule({
            notifications: [
              {
                id: numericId,
                title: title,
                body: body,
                channelId: channelId,
                extra: { notifItem: notif },
                sound: 'default'
              }
            ]
          });
          console.log(`[NOTIFICATION_SERVICE] Scheduled native Android notification: id=${numericId}, channel=${channelId}`);
        }
      } catch (err) {
        console.warn('[NOTIFICATION_SERVICE] Error scheduling native notification:', err);
      }
    }

    // 2. Desktop Web Browser Notification
    if (!this.isNative && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const options: any = {
          body: body,
          icon: notif.sender_avatar || '/favicon.ico',
          tag: notif.id,
          renotify: true
        };
        const webNotif = new Notification(title, options);


        webNotif.onclick = (event) => {
          event.preventDefault();
          showAndFocusWindow();
          this.notifyTapListeners(notif);
        };
      } catch (e) {
        console.warn('[NOTIFICATION_SERVICE] Desktop web notification error:', e);
      }
    }
  }

  /**
   * Subscribe to notification tap/click actions
   */
  public onNotificationTapped(listener: NotificationTapListener): () => void {
    this.tapListeners.add(listener);
    return () => {
      this.tapListeners.delete(listener);
    };
  }

  /**
   * Notify registered tap listeners
   */
  private notifyTapListeners(notif: NotificationItem): void {
    this.tapListeners.forEach((listener) => {
      try {
        listener(notif);
      } catch (e) {
        console.warn('[NOTIFICATION_SERVICE] Error in notification tap listener:', e);
      }
    });
  }
}

export const notificationService = new NotificationService();
