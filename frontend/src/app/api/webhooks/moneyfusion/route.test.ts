// POST /api/webhooks/moneyfusion — the one route whose body is hostile by
// construction (2026-11-01).
//
// MoneyFusion publishes NO signature, NO secret and NO shared key for its
// payin webhook. So the only thing standing between a stranger with this URL
// and a free Pro plan is that the route never believes the body: it reads a
// token out of it and asks MoneyFusion. These tests exist to make sure nobody
// later "optimises" that round trip away.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('@/lib/server/payments/moneyfusion-reconcile', () => ({
  reconcileMoneyfusionOrder: vi.fn(),
}));

import { reconcileMoneyfusionOrder } from '@/lib/server/payments/moneyfusion-reconcile';
import { POST } from './route';

const reconcile = vi.mocked(reconcileMoneyfusionOrder);
const SRC = resolve(__dirname, '../../../..');
const ROUTE = readFileSync(join(SRC, 'app/api/webhooks/moneyfusion/route.ts'), 'utf8');

const ORDER = {
  id: 'order_42',
  status: 'PENDING',
  providerChargeId: 'tok_1',
  userId: 'user_1',
  metadata: { tier: 'standard' },
  amount: 15000,
};

function post(body: unknown): NextRequest {
  return new NextRequest('https://www.renderpro.app/api/webhooks/moneyfusion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const COMPLETED = {
  event: 'payin.session.completed',
  tokenPay: 'tok_1',
  personal_Info: [{ orderId: 'order_42' }],
  Montant: 15000,
  frais: 375,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONEYFUSION_API_URL = 'https://www.pay.moneyfusion.net/RenderPro/x/pay/';
  reconcile.mockResolvedValue({ changed: true, status: 'PAID' });
});

describe('the body is never believed', () => {
  it('settles the order through the reconcile, which re-asks MoneyFusion', async () => {
    prismaMock.order.findFirst.mockResolvedValue(ORDER as never);

    const res = await POST(post(COMPLETED));

    expect(res.status).toBe(200);
    expect(reconcile).toHaveBeenCalledWith(prismaMock, ORDER);
  });

  it('a forged « completed » for an unknown token changes nothing', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);

    const res = await POST(
      post({ event: 'payin.session.completed', tokenPay: 'tok_forged', Montant: 999999 }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'unknown_payment' });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('never writes an order itself — only the reconcile does', () => {
    // A `prisma.order.update` here would be a second, unguarded way to PAID.
    expect(ROUTE).not.toMatch(/order\.update|order\.updateMany|activateTier/);
    expect(ROUTE).toContain('reconcileMoneyfusionOrder');
  });

  it('ignores the amount and the event name the body claims', () => {
    // Nothing may branch on what the sender says it paid.
    expect(ROUTE).not.toMatch(/payload\.Montant|payload\.frais/);
    expect(ROUTE).not.toMatch(/=== 'payin\.session\.completed'/);
  });

  it('looks the order up scoped to this provider', async () => {
    prismaMock.order.findFirst.mockResolvedValue(ORDER as never);
    await POST(post(COMPLETED));
    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ provider: 'moneyfusion', providerChargeId: 'tok_1' });
  });

  it('falls back to the order id when the token is missing', async () => {
    prismaMock.order.findFirst.mockResolvedValue(ORDER as never);
    await POST(post({ event: 'payin.session.pending', personal_Info: [{ orderId: 'order_42' }] }));
    const where = prismaMock.order.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ provider: 'moneyfusion', id: 'order_42' });
  });
});

describe('repeats, which MoneyFusion warns about', () => {
  it('a second identical notification is harmless', async () => {
    prismaMock.order.findFirst.mockResolvedValue(ORDER as never);
    reconcile.mockResolvedValueOnce({ changed: true, status: 'PAID' });
    reconcile.mockResolvedValueOnce({ changed: false, status: 'PAID' });

    const first = await POST(post(COMPLETED));
    const second = await POST(post(COMPLETED));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, status: 'PAID' });
  });

  it('keeps nothing of its own to deduplicate with', () => {
    // The compare-and-swap in the reconcile is the deduplication; a webhook
    // log table here would be a second mechanism to keep in step.
    expect(ROUTE).not.toMatch(/webhookLog|WebhookLog/);
  });
});

describe('what it answers', () => {
  it('400 on a body that is not an object', async () => {
    expect((await POST(post('nope'))).status).toBe(400);
  });

  it('200 and ignores everything while unconfigured', async () => {
    delete process.env.MONEYFUSION_API_URL;
    const res = await POST(post(COMPLETED));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'unconfigured' });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('503 when the status check failed, so MoneyFusion retries', async () => {
    prismaMock.order.findFirst.mockResolvedValue(ORDER as never);
    reconcile.mockRejectedValue(new Error('MoneyFusion unreachable'));

    const res = await POST(post(COMPLETED));

    expect(res.status).toBe(503);
  });

  it('runs on the node runtime, like every other route', () => {
    expect(ROUTE).toContain("export const runtime = 'nodejs'");
  });

  it('says in the file why it has no CSRF check', () => {
    // The project's rule is that every mutating route calls verifyCsrf. This
    // one cannot — the caller is a machine with no session — so the reason
    // has to be written down, or it reads as a forgotten check.
    // No import of it and no call to it — the word itself appears, in the
    // paragraph that explains the omission, which is the point.
    expect(ROUTE).not.toMatch(/import .*verifyCsrf|verifyCsrf\(/);
    expect(ROUTE).toMatch(/no `verifyCsrf` here|NOT TRUSTED/);
  });
});
