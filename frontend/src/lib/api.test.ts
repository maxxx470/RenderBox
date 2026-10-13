// api(): the per-request timeout option (étape 3B.4). Only the timeout is
// covered here — refresh, CSRF and retries are untouched by it. fetch is
// faked: it never answers on its own and rejects once its signal aborts, as
// the browser's fetch does.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from './api';

const fakeFetch = vi.fn(
  (_url: string, init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    }),
);

beforeEach(() => {
  vi.useFakeTimers();
  fakeFetch.mockClear();
  vi.stubGlobal('fetch', fakeFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function signalOfCall(n = 0): AbortSignal | undefined {
  return (fakeFetch.mock.calls[n]?.[1] as RequestInit | undefined)?.signal ?? undefined;
}

describe('api — timeoutMs', () => {
  it('gives up after 30 s by default, as before', async () => {
    const outcome = api('/api/x', { method: 'POST', body: {} }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signalOfCall()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await outcome;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 0,
      message: 'The request timed out. Check your connection and try again.',
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('waits as long as timeoutMs says (a generation: 310 s), then gives up the same way', async () => {
    const outcome = api('/api/x', { method: 'POST', body: {}, timeoutMs: 310_000 }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(309_999);
    expect(signalOfCall()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signalOfCall()?.aborted).toBe(true);
    expect(await outcome).toMatchObject({ status: 0 });
    // A POST is still never retried.
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('returns the response that arrives in time', async () => {
    fakeFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify({ ok: true }))), 60_000),
        ),
    );
    const outcome = api<{ ok: boolean }>('/api/x', {
      method: 'POST',
      body: {},
      timeoutMs: 310_000,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(outcome).resolves.toEqual({ ok: true });
    expect(signalOfCall()?.aborted).toBe(false);
  });
});

// Étape 3B.5: a route answering { code } (not { error }) still reaches the UI
// whole — status and body are kept, so the code can be read from body.code.
describe('api — error bodies under `code`', () => {
  it('keeps the status and the { code } body of a 504 GENERATION_TIMEOUT', async () => {
    fakeFetch.mockImplementationOnce(async () =>
      Response.json(
        { code: 'GENERATION_TIMEOUT', message: 'Generation timed out' },
        { status: 504 },
      ),
    );
    const err = await api('/api/x', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 504,
      body: { code: 'GENERATION_TIMEOUT', message: 'Generation timed out' },
      // ApiError.code reads `error` only — unchanged by design.
      code: '',
    });
  });

  it('keeps a 502 GENERATION_FAILED apart from it', async () => {
    fakeFetch.mockImplementationOnce(async () =>
      Response.json({ code: 'GENERATION_FAILED', message: 'Generation failed' }, { status: 502 }),
    );
    const err = await api('/api/x', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, body: { code: 'GENERATION_FAILED' } });
  });
});
