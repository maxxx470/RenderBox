// POST /api/webhooks/moneyfusion — MoneyFusion tells us a payment moved
// (the checkout passes this URL as the cart's `webhook_url`).
//
// ⚠ THIS BODY IS NOT TRUSTED, AND CANNOT BE. MoneyFusion's documentation
// describes no signature, no secret and no shared key for the payin webhook,
// so anyone who learns this URL can POST `payin.session.completed` with any
// token they like. The body is therefore read for ONE thing only — which
// payment to go and ask about — and the answer comes from MoneyFusion's own
// status endpoint (reconcileMoneyfusionOrder → moneyfusionVerifyPayment).
// A forged request can do nothing but make us call MoneyFusion about a
// payment that already exists; it can never activate a plan.
//
// This is why there is no `verifyCsrf` here either: like the unsubscribe
// route, the caller is a machine with no session and no page of ours. The
// difference is that unsubscribe has a signed token standing in for the
// session, and this has nothing — hence the re-ask.
//
// MoneyFusion warns it may notify several times for one transaction. Nothing
// is kept to deduplicate: the reconcile's compare-and-swap on PENDING makes a
// repeat a no-op by construction.
//
// Answers 200 for anything it chose to ignore (unknown token, already
// settled) so MoneyFusion stops retrying; 503 when the status check itself
// failed, so it retries.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { isMoneyfusionConfigured, readOrderId } from '@/lib/server/payments/moneyfusion';
import { reconcileMoneyfusionOrder } from '@/lib/server/payments/moneyfusion-reconcile';

const log = createLogger();

const ORDER_SELECT = {
  id: true,
  status: true,
  providerChargeId: true,
  userId: true,
  metadata: true,
  amount: true,
} as const;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400, headers });
    }
    if (!isMoneyfusionConfigured()) {
      return NextResponse.json({ ok: true, ignored: 'unconfigured' }, { headers });
    }

    const payload = body as Record<string, unknown>;
    const token = typeof payload.tokenPay === 'string' ? payload.tokenPay : null;
    const orderId = readOrderId(payload.personal_Info);

    // Find the order by the token first (it is @unique), and fall back to the
    // orderId we put in personal_Info — a notification missing the token is
    // still actionable.
    const order = token
      ? await prisma.order.findFirst({
          where: { provider: 'moneyfusion', providerChargeId: token },
          select: ORDER_SELECT,
        })
      : orderId
        ? await prisma.order.findFirst({
            where: { provider: 'moneyfusion', id: orderId },
            select: ORDER_SELECT,
          })
        : null;

    if (!order) {
      log.warn('moneyfusion webhook: unknown payment', {
        token,
        orderId,
        event: typeof payload.event === 'string' ? payload.event : null,
        requestId: ctx.requestId,
      });
      return NextResponse.json({ ok: true, ignored: 'unknown_payment' }, { headers });
    }

    try {
      const result = await reconcileMoneyfusionOrder(prisma, order);
      log.info('moneyfusion webhook: order reconciled', {
        orderId: order.id,
        changed: result.changed,
        status: result.status,
        requestId: ctx.requestId,
      });
      return NextResponse.json({ ok: true, status: result.status }, { headers });
    } catch (e) {
      log.warn('moneyfusion webhook: payment verification failed', {
        orderId: order.id,
        err: String(e),
        requestId: ctx.requestId,
      });
      return NextResponse.json({ error: 'VERIFY_FAILED' }, { status: 503, headers });
    }
  });
}
