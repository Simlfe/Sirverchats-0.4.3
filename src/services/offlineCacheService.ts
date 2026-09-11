import { Server, Channel, Message } from '../types';
import { MessageDeletionService } from './messageDeletionService';

const DB_NAME = 'SirverOfflineCacheDB';
const DB_VERSION = 1;
const MESSAGE_CACHE_BUDGET_BYTES = 100 * 1024 * 1024;

const STORES = {
  SERVERS: 'servers',
  CHANNELS: 'channels',
  DM_CHANNELS: 'dm_channels',
  MESSAGES: 'messages',
  META: 'meta',
};

class OfflineCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  // High-speed Synchronous L1 In-Memory Cache for 0ms reads
  private memServers: Map<string, Server[]> = new Map();
  private memChannels: Map<string, Channel[]> = new Map();
  private memDmChannels: Map<string, Channel[]> = new Map();
  private memMessages: Map<string, { items: Message[]; hasMore: boolean; page: number; lastSyncTime: number }> = new Map();
  private messageCacheLru: Map<string, { bytes: number; lastUsed: number }> = new Map();
  private messageCacheBytes = 0;

  private estimateMessageBytes(messages: Message[]): number {
    try {
      return Math.max(1, JSON.stringify(messages).length * 2);
    } catch {
      return messages.length * 512;
    }
  }

  private touchMessageCache(channelId: string, messages?: Message[]) {
    const current = this.messageCacheLru.get(channelId);
    if (current) {
      current.lastUsed = Date.now();
      return;
    }
    const bytes = this.estimateMessageBytes(messages || this.memMessages.get(channelId)?.items || []);
    this.messageCacheLru.set(channelId, { bytes, lastUsed: Date.now() });
    this.messageCacheBytes += bytes;
  }

  private evictMessageCacheIfNeeded(protectedKey?: string) {
    if (this.messageCacheBytes <= MESSAGE_CACHE_BUDGET_BYTES) return;
    const candidates = Array.from(this.messageCacheLru.entries())
      .filter(([key]) => key !== protectedKey)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    for (const [key, entry] of candidates) {
      if (this.messageCacheBytes <= MESSAGE_CACHE_BUDGET_BYTES) break;
      this.messageCacheLru.delete(key);
      this.messageCacheBytes = Math.max(0, this.messageCacheBytes - entry.bytes);
      this.memMessages.delete(key);
      // Eviction only removes a local page. Its hasMore flag is never changed,
      // so a later visit can continue fetching remote history with a cursor.
      this.getDB().then((db) => {
        const tx = db.transaction(STORES.MESSAGES, 'readwrite');
        tx.objectStore(STORES.MESSAGES).delete(key);
      }).catch(() => {});
    }
  }

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not available in this environment'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.SERVERS)) {
          db.createObjectStore(STORES.SERVERS, { keyPath: 'userId' });
        }
        if (!db.objectStoreNames.contains(STORES.CHANNELS)) {
          db.createObjectStore(STORES.CHANNELS, { keyPath: 'serverId' });
        }
        if (!db.objectStoreNames.contains(STORES.DM_CHANNELS)) {
          db.createObjectStore(STORES.DM_CHANNELS, { keyPath: 'userId' });
        }
        if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
          db.createObjectStore(STORES.MESSAGES, { keyPath: 'channelId' });
        }
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  // --- SERVERS ---
  getServersSync(userId: string): Server[] | null {
    if (this.memServers.has(userId)) {
      return this.memServers.get(userId) || null;
    }
    try {
      const ls = localStorage.getItem(`offline_servers_${userId}`);
      if (ls) {
        const parsed = JSON.parse(ls);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.memServers.set(userId, parsed);
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  async getServers(userId: string): Promise<Server[] | null> {
    const syncRes = this.getServersSync(userId);
    if (syncRes && syncRes.length > 0) return syncRes;

    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.SERVERS, 'readonly');
        const store = tx.objectStore(STORES.SERVERS);
        const req = store.get(userId);
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.servers)) {
            this.memServers.set(userId, req.result.servers);
            resolve(req.result.servers);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('Failed to get cached servers from IndexedDB:', e);
      return null;
    }
  }

  async saveServers(userId: string, servers: Server[]): Promise<void> {
    this.memServers.set(userId, servers);

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.SERVERS, 'readwrite');
        const store = tx.objectStore(STORES.SERVERS);
        const req = store.put({ userId, servers, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to save servers to IndexedDB:', e);
    }
  }

  // --- CHANNELS ---
  getChannelsSync(serverId: string): Channel[] | null {
    if (this.memChannels.has(serverId)) {
      return this.memChannels.get(serverId) || null;
    }
    try {
      const ls = localStorage.getItem(`offline_channels_${serverId}`);
      if (ls) {
        const parsed = JSON.parse(ls);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.memChannels.set(serverId, parsed);
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  async getChannels(serverId: string): Promise<Channel[] | null> {
    const syncRes = this.getChannelsSync(serverId);
    if (syncRes && syncRes.length > 0) return syncRes;

    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.CHANNELS, 'readonly');
        const store = tx.objectStore(STORES.CHANNELS);
        const req = store.get(serverId);
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.channels)) {
            this.memChannels.set(serverId, req.result.channels);
            resolve(req.result.channels);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('Failed to get cached channels from IndexedDB:', e);
      return null;
    }
  }

  async saveChannels(serverId: string, channels: Channel[]): Promise<void> {
    this.memChannels.set(serverId, channels);

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.CHANNELS, 'readwrite');
        const store = tx.objectStore(STORES.CHANNELS);
        const req = store.put({ serverId, channels, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to save channels to IndexedDB:', e);
    }
  }

  // --- DM CHANNELS ---
  getDmChannelsSync(userId: string): Channel[] | null {
    if (this.memDmChannels.has(userId)) {
      return this.memDmChannels.get(userId) || null;
    }
    try {
      const ls = localStorage.getItem(`offline_dms_${userId}`);
      if (ls) {
        const parsed = JSON.parse(ls);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.memDmChannels.set(userId, parsed);
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  }

  async getDmChannels(userId: string): Promise<Channel[] | null> {
    const syncRes = this.getDmChannelsSync(userId);
    if (syncRes && syncRes.length > 0) return syncRes;

    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.DM_CHANNELS, 'readonly');
        const store = tx.objectStore(STORES.DM_CHANNELS);
        const req = store.get(userId);
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.channels)) {
            this.memDmChannels.set(userId, req.result.channels);
            resolve(req.result.channels);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('Failed to get cached DM channels from IndexedDB:', e);
      return null;
    }
  }

  async saveDmChannels(userId: string, channels: Channel[]): Promise<void> {
    this.memDmChannels.set(userId, channels);

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.DM_CHANNELS, 'readwrite');
        const store = tx.objectStore(STORES.DM_CHANNELS);
        const req = store.put({ userId, channels, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to save DM channels to IndexedDB:', e);
    }
  }

  // --- MESSAGES ---
  getCachedMessagesSync(channelId: string): {
    items: Message[];
    hasMore: boolean;
    page: number;
    lastSyncTime: number;
  } | null {
    const data = this.memMessages.get(channelId) || null;
    if (data) this.touchMessageCache(channelId, data.items);
    return data;
  }

  async getCachedMessages(channelId: string): Promise<{
    items: Message[];
    hasMore: boolean;
    page: number;
    lastSyncTime: number;
  } | null> {
    const syncRes = this.getCachedMessagesSync(channelId);
    if (syncRes && syncRes.items && syncRes.items.length > 0) return syncRes;

    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.MESSAGES, 'readonly');
        const store = tx.objectStore(STORES.MESSAGES);
        const req = store.get(channelId);
        req.onsuccess = () => {
          if (req.result && Array.isArray(req.result.items)) {
            const data = {
              items: req.result.items,
              hasMore: Boolean(req.result.hasMore),
              page: req.result.page || 1,
              lastSyncTime: req.result.lastSyncTime || 0,
            };
            this.memMessages.set(channelId, data);
            this.touchMessageCache(channelId, data.items);
            resolve(data);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('Failed to get cached messages from IndexedDB:', e);
      return null;
    }
  }

  async saveCachedMessages(
    channelId: string,
    messages: Message[],
    hasMore: boolean = true,
    page: number = 1
  ): Promise<void> {
    const data = {
      items: messages,
      hasMore,
      page,
      lastSyncTime: Date.now(),
    };
    this.memMessages.set(channelId, data);
    const previous = this.messageCacheLru.get(channelId);
    if (previous) this.messageCacheBytes = Math.max(0, this.messageCacheBytes - previous.bytes);
    this.messageCacheLru.set(channelId, { bytes: this.estimateMessageBytes(messages), lastUsed: Date.now() });
    this.messageCacheBytes += this.messageCacheLru.get(channelId)!.bytes;
    this.evictMessageCacheIfNeeded(channelId);

    // Persist to IndexedDB asynchronously in the background without blocking the UI
    try {
      this.getDB().then((db) => {
        const tx = db.transaction(STORES.MESSAGES, 'readwrite');
        const store = tx.objectStore(STORES.MESSAGES);
        store.put({
          channelId,
          items: messages,
          hasMore,
          page,
          lastSyncTime: Date.now(),
        });
      }).catch((e) => {
        console.warn('Failed to save cached messages to IndexedDB:', e);
      });
    } catch (e) {}
  }

  mergeChannelMessagesSync(
    channelId: string,
    incoming: Message[],
    hasMore?: boolean,
    page?: number,
    deletedMessageIds?: string[]
  ): { items: Message[]; hasMore: boolean; page: number; lastSyncTime: number } {
    const cached = this.getCachedMessagesSync(channelId) || {
      items: [],
      hasMore: true,
      page: 1,
      lastSyncTime: 0,
    };

    let existingMap = new Map<string, Message>();
    for (const m of cached.items) {
      if (!m.deleted && !m.deleted_at && !MessageDeletionService.isMessageDeleted(m.id)) {
        existingMap.set(m.id, m);
      }
    }

    // Remove deleted messages if provided
    if (deletedMessageIds && deletedMessageIds.length > 0) {
      for (const delId of deletedMessageIds) {
        existingMap.delete(delId);
      }
    }

    // Insert or update incoming items
    const realMsgSignatures = new Set<string>();
    for (const item of incoming) {
      if (item.deleted || item.deleted_at || MessageDeletionService.isMessageDeleted(item.id)) {
        existingMap.delete(item.id);
      } else {
        existingMap.set(item.id, item);
        if (!item.id.startsWith('optimistic-') && !(item as any).is_pending) {
          const sId = item.sender || (item as any).user_id || item.expand?.sender?.id;
          if (sId && item.content) {
            realMsgSignatures.add(`${sId}_${item.content.trim()}`);
          }
        }
      }
    }

    // Prune stale optimistic messages that are now fulfilled by real messages
    for (const [id, m] of existingMap.entries()) {
      if (id.startsWith('optimistic-') || (m as any).is_pending) {
        const sId = m.sender || (m as any).user_id || m.expand?.sender?.id;
        const sig = sId && m.content ? `${sId}_${m.content.trim()}` : null;
        if (sig && realMsgSignatures.has(sig)) {
          existingMap.delete(id);
        }
      }
    }

    // Sort chronologically with the record id as a deterministic tie-breaker.
    const sortedList = Array.from(existingMap.values()).sort((a, b) => {
      const tA = new Date(a.created || 0).getTime();
      const tB = new Date(b.created || 0).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });
    // Never discard older pages here. Pagination owns the memory window and
    // this store must remain a lossless source for history and offline reads.
    const mergedList = sortedList;

    const finalHasMore = hasMore !== undefined ? hasMore : cached.hasMore;
    const finalPage = page !== undefined ? Math.max(page, cached.page) : cached.page;

    this.saveCachedMessages(channelId, mergedList, finalHasMore, finalPage);

    return {
      items: mergedList,
      hasMore: finalHasMore,
      page: finalPage,
      lastSyncTime: Date.now(),
    };
  }

  async mergeChannelMessages(
    channelId: string,
    incoming: Message[],
    hasMore?: boolean,
    page?: number,
    deletedMessageIds?: string[]
  ): Promise<{ items: Message[]; hasMore: boolean; page: number; lastSyncTime: number }> {
    const memRes = this.getCachedMessagesSync(channelId);
    if (memRes) {
      return this.mergeChannelMessagesSync(channelId, incoming, hasMore, page, deletedMessageIds);
    }

    const cached = (await this.getCachedMessages(channelId)) || {
      items: [],
      hasMore: true,
      page: 1,
      lastSyncTime: 0,
    };

    let existingMap = new Map<string, Message>();
    for (const m of cached.items) {
      if (!m.deleted && !m.deleted_at && !MessageDeletionService.isMessageDeleted(m.id)) {
        existingMap.set(m.id, m);
      }
    }

    if (deletedMessageIds && deletedMessageIds.length > 0) {
      for (const delId of deletedMessageIds) {
        existingMap.delete(delId);
      }
    }

    const realMsgSignatures = new Set<string>();
    for (const item of incoming) {
      if (item.deleted || item.deleted_at || MessageDeletionService.isMessageDeleted(item.id)) {
        existingMap.delete(item.id);
      } else {
        existingMap.set(item.id, item);
        if (!item.id.startsWith('optimistic-') && !(item as any).is_pending) {
          const sId = item.sender || (item as any).user_id || item.expand?.sender?.id;
          if (sId && item.content) {
            realMsgSignatures.add(`${sId}_${item.content.trim()}`);
          }
        }
      }
    }

    for (const [id, m] of existingMap.entries()) {
      if (id.startsWith('optimistic-') || (m as any).is_pending) {
        const sId = m.sender || (m as any).user_id || m.expand?.sender?.id;
        const sig = sId && m.content ? `${sId}_${m.content.trim()}` : null;
        if (sig && realMsgSignatures.has(sig)) {
          existingMap.delete(id);
        }
      }
    }

    const mergedList = Array.from(existingMap.values()).sort((a, b) => {
      const tA = new Date(a.created || 0).getTime();
      const tB = new Date(b.created || 0).getTime();
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });

    const finalHasMore = hasMore !== undefined ? hasMore : cached.hasMore;
    const finalPage = page !== undefined ? Math.max(page, cached.page) : cached.page;

    this.saveCachedMessages(channelId, mergedList, finalHasMore, finalPage);

    return {
      items: mergedList,
      hasMore: finalHasMore,
      page: finalPage,
      lastSyncTime: Date.now(),
    };
  }

  // Prunes active UI messages when at bottom so DOM isn't overloaded with 500+ cards
  pruneActiveMessages(messages: Message[], keepCount: number = 60): Message[] {
    if (messages.length <= keepCount) {
      return messages;
    }
    // Return the latest keepCount messages
    return messages.slice(messages.length - keepCount);
  }

  // --- META & CLEAR CACHE ---
  async setMeta(key: string, value: any): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.META, 'readwrite');
        const store = tx.objectStore(STORES.META);
        const req = store.put({ key, value, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to set meta in IndexedDB:', e);
    }
  }

  async getMeta(key: string): Promise<any | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.META, 'readonly');
        const store = tx.objectStore(STORES.META);
        const req = store.get(key);
        req.onsuccess = () => {
          resolve(req.result ? req.result.value : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async clearUserCache(): Promise<void> {
    this.memMessages.clear();
    this.messageCacheLru.clear();
    this.messageCacheBytes = 0;
    try {
      const db = await this.getDB();
      const stores = [
        STORES.SERVERS,
        STORES.CHANNELS,
        STORES.DM_CHANNELS,
        STORES.MESSAGES,
        STORES.META,
      ];
      const tx = db.transaction(stores, 'readwrite');
      stores.forEach((s) => tx.objectStore(s).clear());
    } catch (e) {
      console.warn('Failed to clear user cache in IndexedDB:', e);
    }
  }
}

export const offlineCacheService = new OfflineCacheService();
