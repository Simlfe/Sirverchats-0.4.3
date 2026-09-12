import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiV2Client, GatewayError } from '../src/services/apiV2Client';

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test.after(() => {
  globalThis.fetch = originalFetch;
});

test('coalesces identical gateway reads into one request', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return jsonResponse(200, { items: [{ id: 's1', name: 'One' }] });
  }) as typeof fetch;

  const client = new ApiV2Client('https://gateway.test', 100, 100);
  const [first, second] = await Promise.all([client.getServers(), client.getServers()]);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.equal(client.getAvailability(), 'online');
});

test('normalizes Cloudflare 530 and opens the short circuit', async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(530, 'error code: 1033');
  }) as typeof fetch;

  const client = new ApiV2Client('https://gateway.test', 100, 1000);
  await assert.rejects(client.getServers(), (error: unknown) => {
    return error instanceof GatewayError && error.status === 530 && error.retryable;
  });
  assert.equal(client.getAvailability(), 'offline');

  await assert.rejects(client.getServers(), (error: unknown) => {
    return error instanceof GatewayError && error.code === 'circuit_open';
  });
  assert.equal(calls, 1);
});

test('times out an unresponsive read and keeps cancellation separate from outage state', async () => {
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  })) as typeof fetch;

  const timedOutClient = new ApiV2Client('https://gateway.test', 10, 1000);
  await assert.rejects(timedOutClient.getServers(), (error: unknown) => {
    return error instanceof GatewayError && error.code === 'timeout' && error.timedOut;
  });
  assert.equal(timedOutClient.getAvailability(), 'offline');

  const cancelledClient = new ApiV2Client('https://gateway.test', 1000, 1000);
  const abort = new AbortController();
  const request = cancelledClient.getServers({ signal: abort.signal });
  abort.abort();
  await assert.rejects(request, (error: unknown) => {
    return error instanceof GatewayError && error.code === 'cancelled';
  });
  assert.equal(cancelledClient.getAvailability(), 'online');
});
