// POST /api/webhooks/maketou — Maketou tells us a cart turned `completed` or
// `payment_failed` (the checkout passes this URL as the cart's webhookUrl).
//
// Without it a customer who paid and closed the tab before /paiement/retour
// ran stayed PENDING: the maketou-reconcile cron is not scheduled (Vercel
// Hobby runs crons once a day). The notification is only a trigger: the
// order is settled by reconcileMaketouOrder, which asks Maketou's API for
// the cart's status again — the same single "credit at most once" path as
// the return page — so even a forged body could not activate a plan. The
// Ed25519 signature is still checked so strangers cannot make us call
// Maketou at will.
//
// Answers 200 for anything it chose to ignore (unknown cart, already
// settled) so Maketou stops retrying; 401 for a bad signature; 503 when the
// API check itself failed, so Maketou retries (twice, ~30 s then ~60 s).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { isMaketouApiConfigured } from '@/lib/server/payments/maketou';
import { verifyMaketouSignature } from '@/lib/server/payments/maketou-webhook';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';

const log = createLogger();

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400, headers });
    }
    if (!verifyMaketouSignature(body, req.headers.get('x-cart-signature'))) {
      log.warn('maketou webhook: bad or stale signature', { requestId: ctx.requestId });
      return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401, headers });
    }
    if (!isMaketouApiConfigured()) {
      return NextResponse.json({ ok: true, ignored: 'unconfigured' }, { headers });
    }

    const cartId = (body as Record<string, unknown>).id;
    if (typeof cartId !== 'string' || !cartId) {
      return NextResponse.json({ ok: true, ignored: 'no_cart_id' }, { headers });
    }
    const order = await prisma.order.findFirst({
      where: { provider: 'maketou', providerChargeId: cartId },
      select: { id: true, status: true, providerChargeId: true, userId: true, metadata: true },
    });
    if (!order) {
      log.warn('maketou webhook: unknown cart', { cartId, requestId: ctx.requestId });
      return NextResponse.json({ ok: true, ignored: 'unknown_cart' }, { headers });
    }

    try {
      const result = await reconcileMaketouOrder(prisma, order);
      log.info('maketou webhook: order reconciled', {
        orderId: order.id,
        changed: result.changed,
        status: result.status,
        requestId: ctx.requestId,
      });
      return NextResponse.json({ ok: true, status: result.status }, { headers });
    } catch (e) {
      log.warn('maketou webhook: cart verification failed', {
        orderId: order.id,
        err: String(e),
        requestId: ctx.requestId,
      });
      return NextResponse.json({ error: 'VERIFY_FAILED' }, { status: 503, headers });
    }
  });
}
