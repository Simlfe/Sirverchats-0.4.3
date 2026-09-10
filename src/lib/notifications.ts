import { notificationService } from '../services/notificationService';
import { NotificationItem } from '../types';

/**
 * Requests browser and native Android notification permissions
 */
export async function requestNotificationPermission() {
  try {
    await notificationService.requestPermission();
  } catch (e) {
    console.warn('Failed to request notification permission:', e);
  }
}

/**
 * Triggers a desktop/Android notification and plays the in-app synthesized notification sound
 */
export function sendInAppNotification(
  title: string,
  body: string,
  icon?: string,
  onClick?: () => void,
  notifItem?: NotificationItem
) {
  const item: NotificationItem = notifItem || {
    id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    type: 'system',
    sender_id: 'system',
    sender_name: title,
    sender_avatar: icon,
    message_content: body,
    created: new Date().toISOString(),
    read: false
  };

  if (onClick) {
    const unsub = notificationService.onNotificationTapped((tappedItem) => {
      if (tappedItem.id === item.id || tappedItem.message_id === item.message_id) {
        unsub();
        onClick();
      }
    });
  }

  notificationService.sendNotification(item);
}

