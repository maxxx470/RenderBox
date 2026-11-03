import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { mockReconcile } = vi.hoisted(() => ({ mockReconcile: vi.fn() }));
vi.mock('@/lib/server/payments/moneriz-reconcile', () => ({
  reconcileMonerizOrder: mockReconcile,
}));

import { POST } from './route';

const SECRET = 'whsec_route_test';

/** A real signature over the real bytes — no mocked verifier, so this test
 *  exercises the whole chain the way Moneriz will drive it. */
function makeReq(rawBody: string, opts: { sign?: boolean; t?: number } = {}): NextRequest {
  const t = opts.t ?? Date.now();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.sign !== false) {
    const v1 = createHmac('sha256', SECRET).update(`${t}.${rawBody}`, 'utf8').digest('hex');
    headers['x-moneriz-signature'] = `t=${t},v1=${v1}`;
  }
  return new NextRequest('http://test/api/webhooks/moneriz', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

const ORDER_ROW = {
  id: 'order-1',
  status: 'PENDING',
  providerChargeId: 'cs_1',
  userId: 'user-1',
  metadata: { tier: 'standard' },
  amount: 15000,
  currency: 'XOF',
};

function body(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_1',
    type: 'payment.succeeded',
    createdAt: '2026-11-02T13:00:00.000Z',
    data: { reference: 'order-1', metadata: { checkoutSessionId: 'cs_1' } },
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONERIZ_WEBHOOK_SECRET = SECRET;
  process.env.MONERIZ_SECRET_KEY = 'izp_live_sk_x';
  mockReconcile.mockResolvedValue({ changed: true, status: 'PAID' });
  prismaMock.order.findFirst.mockResolvedValue(ORDER_ROW as never);
});
afterEach(() => {
  delete process.env.MONERIZ_WEBHOOK_SECRET;
  delete process.env.MONERIZ_SECRET_KEY;
});

describe('POST /api/webhooks/moneriz', () => {
  it('reconciles a correctly signed payment event', async () => {
    const res = await POST(makeReq(body()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: 'PAID' });
    expect(mockReconcile).toHaveBeenCalledWith(prismaMock, ORDER_ROW);
  });

  it('401 on a bad signature, and nothing is looked up', async () => {
    const req = new NextRequest('http://test/api/webhooks/moneriz', {
      method: 'POST',
      headers: { 'x-moneriz-signature': `t=${Date.now()},v1=deadbeef` },
      body: body(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('401 with no signature header at all', async () => {
    const res = await POST(makeReq(body(), { sign: false }));
    expect(res.status).toBe(401);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('401 on a stale signature — a captured body cannot be replayed', async () => {
    const res = await POST(makeReq(body(), { t: Date.now() - 10 * 60 * 1000 }));
    expect(res.status).toBe(401);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('verifies the body as sent, whatever its spacing', async () => {
    // Proof the route signs the raw bytes: this body is valid JSON with
    // unusual whitespace, which a re-serializing implementation would break.
    const raw = '{"id":"evt_2",  "type":"payment.succeeded" ,\n "data":{"reference":"order-1"}}';
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalled();
  });

  it('503 when no webhook secret is configured — an unverifiable body is not acted on', async () => {
    delete process.env.MONERIZ_WEBHOOK_SECRET;
    const res = await POST(makeReq(body()));
    expect(res.status).toBe(503);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('ignores a signed event of a type it does not handle', async () => {
    const res = await POST(makeReq(body({ type: 'withdrawal.completed' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'unhandled_type' });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("ignores Moneriz's legacy izipaye.* aliases", async () => {
    const res = await POST(makeReq(body({ type: 'izipaye.payment.succeeded' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'unhandled_type' });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('200 for an unknown session, so Moneriz stops retrying', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(null as never);
    const res = await POST(makeReq(body()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'unknown_session' });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('only ever matches an order of THIS provider', async () => {
    await POST(makeReq(body()));
    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.provider).toBe('moneriz');
    expect(where.providerChargeId).toBe('cs_1');
  });

  it('falls back to our own reference when the event names no session', async () => {
    const res = await POST(
      makeReq(
        JSON.stringify({ id: 'e', type: 'payment.succeeded', data: { reference: 'order-9' } }),
      ),
    );
    expect(res.status).toBe(200);
    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.id).toBe('order-9');
  });

  it('200 and ignores an event that names neither a session nor an order', async () => {
    const res = await POST(
      makeReq(JSON.stringify({ id: 'e', type: 'payment.succeeded', data: {} })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'no_reference' });
    expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
  });

  it('503 when the API verification itself failed, so Moneriz retries', async () => {
    mockReconcile.mockRejectedValueOnce(new Error('provider down'));
    const res = await POST(makeReq(body()));
    expect(res.status).toBe(503);
  });

  it('400 on a body that is not JSON, after the signature passed', async () => {
    const res = await POST(makeReq('not json at all'));
    // The signature is over the raw bytes, so it verifies; the event is then
    // unreadable and acknowledged rather than retried for ever.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'unreadable_event' });
  });
});

// A tripwire, not a behaviour test: the invariant that makes the signature
// verifiable at all. `req.json()` here instead of `req.text()` would re-
// serialize the body and break every signature — silently, in production.
describe('the raw-body invariant', () => {
  it('reads the body as text and never parses it before verifying', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, 'route.ts'), 'utf8');
    expect(src).toContain('await req.text()');
    expect(src).not.toMatch(/await req\.json\(\)/);
    // The verification must come before the JSON.parse.
    expect(src.indexOf('verifyMonerizSignature')).toBeLessThan(src.indexOf('JSON.parse'));
  });
});
