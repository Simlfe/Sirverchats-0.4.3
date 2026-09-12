import ENDPOINTS from '../config/endpoints';
import type {
  BackendAvailability,
  BootstrapResponse,
  Channel,
  DmSummary,
  Message,
  MessageCursor,
  MessagePage,
  Server,
  User,
} from '../types';
import { pbService } from '../pocketbase';

const REQUEST_TIMEOUT_MS = 3_000;
const CIRCUIT_BREAKER_MS = 10_000;

export interface GatewayRequestOptions {
  signal?: AbortSignal;
  /** Bypass the short circuit after a user explicitly requests a retry. */
  bypassCircuit?: boolean;
  /** Requests sharing a key use one network promise. */
  dedupeKey?: string;
  /** Optional server-side message text filter for search reads. */
  search?: string;
}

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly timedOut: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      requestId?: string;
      retryable?: boolean;
      timedOut?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'GatewayError';
    this.status = options.status || 0;
    this.code = options.code || 'gateway_unavailable';
    this.requestId = options.requestId;
    this.retryable = Boolean(options.retryable);
    this.timedOut = Boolean(options.timedOut);
  }
}

type AvailabilityListener = (state: BackendAvailability) => void;

type InFlightRequest<T> = {
  promise: Promise<T>;
  controller: AbortController;
};

/**
 * Small, shared gateway client for the latency-sensitive read path.
 *
 * It intentionally does not fall back to a second public origin after a
 * network failure. The caller can keep rendering its local cache instead of
 * multiplying requests while a home tunnel is offline.
 */
class ApiV2Client {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly circuitBreakerMs: number;
  private readonly inFlight = new Map<string, InFlightRequest<unknown>>();
  private readonly requestControllers = new Map<string, AbortController>();
  private readonly listeners = new Set<AvailabilityListener>();
  private circuitOpenUntil = 0;
  private availability: BackendAvailability = 'online';
  private refreshPromise: Promise<unknown> | null = null;

  constructor(
    baseUrl = ENDPOINTS.API_V2_BASE_URL,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    circuitBreakerMs = CIRCUIT_BREAKER_MS,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.requestTimeoutMs = requestTimeoutMs;
    this.circuitBreakerMs = circuitBreakerMs;
  }

  subscribe(listener: AvailabilityListener): () => void {
    this.listeners.add(listener);
    listener(this.availability);
    return () => this.listeners.delete(listener);
  }

  getAvailability(): BackendAvailability {
    return this.availability;
  }

  isCircuitOpen(): boolean {
    return this.circuitOpenUntil > Date.now();
  }

  cancelAllMessageRequests(): void {
    // Remove aborted entries immediately. Without this, a very fast
    // switch-away/switch-back can receive the already-aborted promise from
    // the in-flight dedupe map and leave the conversation waiting for its
    // cleanup microtask instead of issuing the fresh request.
    for (const [key, request] of this.inFlight) {
      if (key.startsWith('messages:')) {
        request.controller.abort();
        this.inFlight.delete(key);
      }
    }
    for (const [key, controller] of this.requestControllers) {
      if (key.startsWith('messages:')) {
        controller.abort();
        this.requestControllers.delete(key);
      }
    }
  }

  markOnline(): void {
    this.circuitOpenUntil = 0;
    this.setAvailability('online');
  }

  async getBootstrap(
    serverId?: string | null,
    options: GatewayRequestOptions = {},
  ): Promise<BootstrapResponse> {
    const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : '';
    return this.request<BootstrapResponse>(`/bootstrap${query}`, {
      ...options,
      dedupeKey: options.dedupeKey || `bootstrap:${serverId || ''}`,
    });
  }

  async getServers(options: GatewayRequestOptions = {}): Promise<Server[]> {
    const result = await this.request<{ items: Server[] }>('/servers', {
      ...options,
      dedupeKey: options.dedupeKey || 'servers',
    });
    return Array.isArray(result.items) ? result.items : [];
  }

  async getDms(options: GatewayRequestOptions = {}): Promise<DmSummary[]> {
    const result = await this.request<{ items: DmSummary[] }>('/dms', {
      ...options,
      dedupeKey: options.dedupeKey || 'dms',
    });
    return Array.isArray(result.items) ? result.items : [];
  }

  async getChannels(serverId: string, options: GatewayRequestOptions = {}): Promise<Channel[]> {
    const result = await this.request<{ items: Channel[] }>(`/servers/${encodeURIComponent(serverId)}/channels`, {
      ...options,
      dedupeKey: options.dedupeKey || `channels:${serverId}`,
    });
    return Array.isArray(result.items) ? result.items : [];
  }

  async getMessages(
    kind: 'channel' | 'dm',
    conversationId: string,
    limit = 30,
    before?: MessageCursor,
    options: GatewayRequestOptions = {},
  ): Promise<MessagePage> {
    const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(100, Math.floor(limit)))) });
    if (before?.created && before.id) {
      params.set('beforeCreated', before.created);
      params.set('beforeId', before.id);
    }
    if (options.search?.trim()) {
      params.set('search', options.search.trim().slice(0, 500));
    }
    const result = await this.request<MessagePage>(
      `/conversations/${kind}/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
      {
        ...options,
        // An older-page request must not be deduped with a different cursor.
        dedupeKey:
          options.dedupeKey ||
          `messages:${kind}:${conversationId}:${before?.created || ''}:${before?.id || ''}:${limit}:${options.search?.trim() || ''}`,
      },
    );
    return {
      items: Array.isArray(result.items) ? (result.items as Message[]) : [],
      nextCursor: result.nextCursor || null,
      hasMore: Boolean(result.hasMore),
    };
  }

  async createDm(recipientId: string, options: GatewayRequestOptions = {}): Promise<{ conversation: DmSummary }> {
    return this.request<{ conversation: DmSummary }>('/dms', {
      ...options,
      dedupeKey: options.dedupeKey || `create-dm:${recipientId}`,
      method: 'POST',
      body: { recipientId },
    });
  }

  private async request<T>(
    path: string,
    options: GatewayRequestOptions & {
      method?: string;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const dedupeKey = options.dedupeKey;
    if (dedupeKey) {
      const existing = this.inFlight.get(dedupeKey);
      if (existing) return existing.promise as Promise<T>;
    }

    if (!options.bypassCircuit && this.isCircuitOpen()) {
      throw new GatewayError('The chat server is temporarily unavailable.', {
        code: 'circuit_open',
        retryable: true,
      });
    }

    const controllerKey = dedupeKey || `anonymous:${path}`;
    const controller = new AbortController();
    const promise = this.performRequest<T>(path, options, controller);
    if (dedupeKey) {
      this.inFlight.set(dedupeKey, { promise, controller });
      promise.finally(() => {
        if (this.inFlight.get(dedupeKey)?.promise === promise) this.inFlight.delete(dedupeKey);
      }).catch(() => {});
    }
    this.requestControllers.set(controllerKey, controller);
    promise.finally(() => {
      if (this.requestControllers.get(controllerKey) === controller) this.requestControllers.delete(controllerKey);
    }).catch(() => {});
    return promise;
  }

  private async performRequest<T>(
    path: string,
    options: GatewayRequestOptions & { method?: string; body?: unknown },
    parentController: AbortController,
  ): Promise<T> {
    const method = options.method || 'GET';
    const externalSignal = options.signal;
    let refreshed = false;

    while (true) {
      const controller = parentController;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.requestTimeoutMs);
      const abortExternal = () => controller.abort();
      if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener('abort', abortExternal, { once: true });
      }

      try {
        const token = pbService.getPbInstance().authStore.token;
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
          credentials: 'omit',
        });

        const requestId = response.headers.get('x-request-id') || undefined;
        const text = await response.text();
        let payload: any = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = text;
        }

        if (response.status === 401 && !refreshed) {
          refreshed = true;
          await this.refreshAuthOnce();
          continue;
        }

        if (!response.ok) {
          const retryable = response.status === 530 || response.status >= 500;
          if (retryable) this.markFailure();
          else this.setAvailability('degraded');
          throw new GatewayError(
            typeof payload?.error === 'string' ? payload.error : `Gateway request failed (${response.status}).`,
            {
              status: response.status,
              code: typeof payload?.code === 'string' ? payload.code : retryable ? 'gateway_unavailable' : 'gateway_error',
              requestId: typeof payload?.requestId === 'string' ? payload.requestId : requestId,
              retryable,
            },
          );
        }

        this.markOnline();
        return (payload ?? {}) as T;
      } catch (error: any) {
        if (error instanceof GatewayError) throw error;
        if (externalSignal?.aborted) {
          throw new GatewayError('Request cancelled.', { code: 'cancelled' });
        }
        if (controller.signal.aborted && !timedOut) {
          throw new GatewayError('Request cancelled.', { code: 'cancelled' });
        }
        const unavailable = new GatewayError(
          timedOut ? 'The chat server did not respond in time.' : 'The chat server is unreachable.',
          { code: timedOut ? 'timeout' : 'network_error', retryable: true, timedOut },
        );
        this.markFailure();
        throw unavailable;
      } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', abortExternal);
      }
    }
  }

  private async refreshAuthOnce(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = Promise.resolve(pbService.refreshAuth()).finally(() => {
        this.refreshPromise = null;
      });
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new GatewayError('Authentication refresh timed out.', {
          code: 'auth_refresh_timeout',
          retryable: true,
          timedOut: true,
        })),
        this.requestTimeoutMs,
      );
    });
    try {
      await Promise.race([this.refreshPromise, timeout]);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError('Authentication refresh failed.', {
        status: 401,
        code: 'unauthorized',
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private markFailure(): void {
    this.circuitOpenUntil = Date.now() + this.circuitBreakerMs;
    this.setAvailability('offline');
  }

  private setAvailability(next: BackendAvailability): void {
    if (this.availability === next) return;
    this.availability = next;
    this.listeners.forEach((listener) => {
      try {
        listener(next);
      } catch {
        // A UI subscriber must never break the request path.
      }
    });
  }
}

export { ApiV2Client };
export const apiV2Client = new ApiV2Client();
