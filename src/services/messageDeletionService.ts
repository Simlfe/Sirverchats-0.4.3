import { pbService } from '../pocketbase';
import { Channel, Message } from '../types';

export interface DeleteMessageOptions {
  channelId?: string;
  activeChannel?: Channel | null;
  lang?: string;
  onChannelUpdated?: (updatedChannel: Channel) => void;
  onMessageDeletedStateUpdate?: (deletedMessageId: string) => void;
}

export class MessageDeletionService {
  private static deletedMessageIdsSet: Set<string> = new Set();

  static isMessageDeleted(messageId: string): boolean {
    return MessageDeletionService.deletedMessageIdsSet.has(messageId);
  }

  /**
   * Complete resilient message deletion pipeline:
   * Step 1: Instant UI Removal (0ms latency for optimal UX).
   * Step 2: Delete message record FIRST so PocketBase broadcasts 'delete' to all users atomically.
   * Step 3: Remove pinned reference if pinned.
   * Step 4: Clean up referenced attachments from DB & storage in background.
   */
  static async deleteMessage(
    messageId: string,
    options: DeleteMessageOptions = {}
  ): Promise<boolean> {
    if (!messageId) return false;

    // Track locally so any transient realtime updates ignore this message
    MessageDeletionService.deletedMessageIdsSet.add(messageId);

    // 1. Instant UI Removal (0ms latency for optimal UX)
    if (options.onMessageDeletedStateUpdate) {
      options.onMessageDeletedStateUpdate(messageId);
    }

    // 2. Perform database, unpin, and attachment cleanup in background
    const bgCleanup = async () => {
      const pb = pbService.getPbInstance();
      const isDemo = pbService.getIsDemo();

      let messageRecord: any = null;
      let channelId = options.channelId;

      if (!isDemo && pb) {
        try {
          messageRecord = await pb.collection('messages').getOne(messageId, {
            expand: 'attachments(message),private_attachments(message)'
          }).catch(() => null);

          if (!messageRecord) {
            messageRecord = await pb.collection('private_messages').getOne(messageId, {
              expand: 'attachments(message),private_attachments(message)'
            }).catch(() => null);
          }
        } catch (err) {
          console.warn('MessageDeletionService: Error loading message details:', err);
        }
      }

      if (messageRecord?.channel && !channelId) {
        channelId = messageRecord.channel;
      }

      // Step A: Delete message record FIRST so clients receive atomic 'delete' event immediately
      if (isDemo) {
        pbService.triggerDemoListeners({
          action: 'delete',
          record: { id: messageId }
        });
      } else if (pb) {
        try {
          await pb.collection('messages').delete(messageId);
        } catch (e1) {
          try {
            await pb.collection('private_messages').delete(messageId);
          } catch (e2) {
            console.warn('MessageDeletionService: Failed to delete message record from DB:', e2);
          }
        }
      }

      // Step B: Unpin if pinned
      if (channelId) {
        try {
          await MessageDeletionService.unpinIfPinned(messageId, channelId, options);
        } catch (err) {
          console.warn('MessageDeletionService: Error in unpin check/removal:', err);
        }
      }

      // Step C: Delete referenced attachments from DB & storage in background
      try {
        await MessageDeletionService.deleteAttachmentsForMessage(messageId, messageRecord);
      } catch (err) {
        console.warn('MessageDeletionService: Error cleaning up attachments:', err);
      }
    };

    // Run background cleanup asynchronously without blocking UI
    bgCleanup().catch((err) => {
      console.warn('MessageDeletionService: Background cleanup error:', err);
    });

    return true;
  }

  /**
   * Helper to check if message is pinned and remove it if pinned.
   */
  private static async unpinIfPinned(
    messageId: string,
    channelId: string,
    options: DeleteMessageOptions
  ): Promise<void> {
    const isDemo = pbService.getIsDemo();
    const pb = pbService.getPbInstance();

    // Check if pinned in cache or activeChannel
    const pinnedList = pbService.getPinnedMessageIds(channelId);
    const activeChan = options.activeChannel;
    const activeChanPins: string[] = activeChan
      ? (activeChan.pinned_messages || (activeChan as any).Pinned_messages || [])
      : [];

    const isPinnedInCache = pinnedList.includes(messageId);
    const isPinnedInActiveChan = activeChanPins.includes(messageId);

    if (!isPinnedInCache && !isPinnedInActiveChan) {
      // Message is not pinned, do nothing
      return;
    }

    // Message IS pinned -> automatically remove the pin
    const updatedPinnedList = (isPinnedInActiveChan ? activeChanPins : pinnedList).filter(
      (id) => id !== messageId
    );

    // Update PocketBase channel record if live
    if (!isDemo && pb && channelId && !channelId.startsWith('dm-') && !channelId.startsWith('chat-') && !channelId.startsWith('private-')) {
      try {
        await pb.collection('channels').update(channelId, {
          Pinned_messages: updatedPinnedList
        }).catch(async () => {
          await pb.collection('channels').update(channelId, {
            pinned_messages: updatedPinnedList
          });
        });
      } catch (err) {
        console.warn('MessageDeletionService: Failed to update channel record pins:', err);
      }
    }

    // Update in-memory cache & localStorage via pbService helper
    pbService.updatePinnedCache(channelId, updatedPinnedList);

    // Trigger channel state update callback if provided
    if (activeChan && options.onChannelUpdated) {
      options.onChannelUpdated({
        ...activeChan,
        pinned_messages: updatedPinnedList,
        Pinned_messages: updatedPinnedList
      });
    }
  }

  /**
   * Retrieves all attachment IDs referenced by that message and deletes corresponding records.
   * Deleting an attachment record automatically removes its file from PocketBase storage.
   * Resilient: logs errors and continues deleting remaining attachments.
   */
  private static async deleteAttachmentsForMessage(
    messageId: string,
    messageRecord?: any
  ): Promise<void> {
    const pb = pbService.getPbInstance();
    const isDemo = pbService.getIsDemo();
    if (isDemo || !pb) return;

    const attachmentIds = new Set<string>();

    // 1. Gather attachment IDs from expanded fields on messageRecord if available
    if (messageRecord) {
      const expandedPublic = messageRecord.expand?.['attachments(message)'] || [];
      const expandedPrivate = messageRecord.expand?.['private_attachments(message)'] || [];
      [...expandedPublic, ...expandedPrivate].forEach((att: any) => {
        if (att?.id) attachmentIds.add(att.id);
      });

      if (Array.isArray(messageRecord.attachments)) {
        messageRecord.attachments.forEach((att: any) => {
          if (typeof att === 'string') attachmentIds.add(att);
          else if (att?.id) attachmentIds.add(att.id);
        });
      }
    }

    // 2. Query attachments collection for message = messageId
    try {
      const atts = await pb.collection('attachments').getFullList({
        filter: `message = "${messageId}"`
      }).catch(() => []);
      atts.forEach((a: any) => {
        if (a?.id) attachmentIds.add(a.id);
      });
    } catch (err) {
      console.warn('MessageDeletionService: Error querying attachments collection:', err);
    }

    // 3. Query private_attachments collection for message = messageId
    try {
      const privAtts = await pb.collection('private_attachments').getFullList({
        filter: `message = "${messageId}"`
      }).catch(() => []);
      privAtts.forEach((a: any) => {
        if (a?.id) attachmentIds.add(a.id);
      });
    } catch (err) {
      console.warn('MessageDeletionService: Error querying private_attachments collection:', err);
    }

    // 4. Delete each attachment record (this also removes the file from PocketBase storage)
    for (const attId of attachmentIds) {
      try {
        await pb.collection('attachments').delete(attId);
      } catch (e1) {
        try {
          await pb.collection('private_attachments').delete(attId);
        } catch (e2) {
          console.warn(`MessageDeletionService: Could not delete attachment record ${attId}:`, e2);
        }
      }
    }
  }

  /**
   * Helper function to transform a messages list when a message is deleted:
   * - Removes the deleted message ID.
   * - Preserves reply messages, updating their reply_to expanded record to display the deleted placeholder.
   */
  static transformMessagesOnDeletion(
    messages: Message[],
    deletedMessageId: string,
    lang: string = 'en'
  ): Message[] {
    const placeholderText = lang === 'ar' ? 'تم حذف الرسالة الأصلية' : 'Original message was deleted';

    return messages
      .filter((m) => m.id !== deletedMessageId && !MessageDeletionService.deletedMessageIdsSet.has(m.id))
      .map((m) => {
        if (m.reply_to === deletedMessageId || m.expand?.reply_to?.id === deletedMessageId) {
          return {
            ...m,
            expand: {
              ...m.expand,
              reply_to: {
                id: deletedMessageId,
                content: placeholderText,
                deleted: true,
                sender: '',
                channel: m.channel
              }
            }
          };
        }
        return m;
      });
  }
}
