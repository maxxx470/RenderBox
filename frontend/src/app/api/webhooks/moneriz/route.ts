// POST /api/webhooks/moneriz — Moneriz tells us a payment settled. The URL
// is registered in Moneriz's dashboard (Clés & webhook), which is also
// where the signing secret comes from.
//
// Why this exists: a customer who paid and closed the tab before the return
// page ran would otherwise stay PENDING, and the reconcile cron runs once a
// day on Vercel Hobby. Moneriz's documentation is explicit that the signed
// webhook — not the browser's postMessage — is the source of truth for
// granting access.
//
// The notification is still only a TRIGGER: the order is settled by
// reconcileMonerizOrder, which re-asks Moneriz's API for the session, which
// is the one « credit at most once » path shared with the return route. So
// even a correctly signed body cannot by itself move a credit. The
// signature is checked so that strangers cannot make us call Moneriz at
// will, and so the event id can be trusted for deduplication.
//
// Answers 200 for anything it chose to ignore (unknown session, already
// settled, an event type we do not act on) so Moneriz stops retrying; 401
// for a bad signature; 503 when the API check itself failed, so Moneriz
// retries.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { isMonerizConfigured } from '@/lib/server/payments/moneriz';
import {
  isLateConfirmation,
  isMonerizWebhookConfigured,
  parseMonerizEvent,
  readEventOrderId,
  readEventSessionId,
  verifyMonerizSignature,
} from '@/lib/server/payments/moneriz-webhook';
import { reconcileMonerizOrder } from '@/lib/server/payments/moneriz-reconcile';

const log = createLogger();

/**
 * Events that say a payment may have moved. Anything else (the withdrawal
 * events, or a type Moneriz adds later) is acknowledged and ignored — its
 * documentation asks us to ignore unknown types rather than fail them.
 * Legacy `izipaye.*` aliases are deliberately NOT accepted.
 */
const PAYMENT_EVENTS = new Set([
  'payment.succeeded',
  'payment.failed',
  'payment.expired',
  'payment.reversed',
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    // The raw body FIRST, and the signature over exactly these bytes. Calling
    // req.json() here instead would re-serialize the body and break
    // verification silently — see moneriz-webhook.ts.
    const rawBody = await req.text().catch(() => null);
    if (rawBody === null) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400, headers });
    }

    if (!isMonerizWebhookConfigured()) {
      // No secret means no way to tell Moneriz from a stranger. Refuse
      // rather than act on an unverifiable body.
      log.warn('moneriz webhook: no MONERIZ_WEBHOOK_SECRET configured', {
        requestId: ctx.requestId,
      });
      return NextResponse.json({ error: 'WEBHOOK_NOT_CONFIGURED' }, { status: 503, headers });
    }

    if (!verifyMonerizSignature(rawBody, req.headers.get('x-moneriz-signature'))) {
      log.warn('moneriz webhook: bad or stale signature', { requestId: ctx.requestId });
      return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401, headers });
    }

    const parsed: unknown = (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })();
    const event = parseMonerizEvent(parsed);
    if (!event) {
      return NextResponse.json({ ok: true, ignored: 'unreadable_event' }, { headers });
    }
    if (!PAYMENT_EVENTS.has(event.type)) {
      return NextResponse.json({ ok: true, ignored: 'unhandled_type' }, { headers });
    }
    if (!isMonerizConfigured()) {
      // Signed, but we have no API key to verify the session with, and the
      // body alone is never enough to settle an order.
      return NextResponse.json({ ok: true, ignored: 'unconfigured' }, { headers });
    }

    // Find the order by the session id, else by our own reference — both of
    // which we set at checkout. Scoped to this provider so a Maketou cart id
    // can never be matched here.
    const sessionId = readEventSessionId(event);
    const orderId = readEventOrderId(event);
    if (!sessionId && !orderId) {
      return NextResponse.json({ ok: true, ignored: 'no_reference' }, { headers });
    }

    const order = await prisma.order.findFirst({
      where: {
        provider: 'moneriz',
        ...(sessionId ? { providerChargeId: sessionId } : { id: orderId as string }),
      },
      select: {
        id: true,
        status: true,
        providerChargeId: true,
        userId: true,
        metadata: true,
        amount: true,
        currency: true,
      },
    });
    if (!order) {
      log.warn('moneriz webhook: unknown session', {
        sessionId,
        orderId,
        eventId: event.id,
        requestId: ctx.requestId,
      });
      return NextResponse.json({ ok: true, ignored: 'unknown_session' }, { headers });
    }

    try {
      const result = await reconcileMonerizOrder(prisma, order);
      log.info('moneriz webhook: order reconciled', {
        orderId: order.id,
        eventId: event.id,
        eventType: event.type,
        previousStatus: order.status,
        changed: result.changed,
        status: result.status,
        // `data.late` marks a payment confirming after it had expired.
        // Moneriz's guide says to accept it, and reconcile does; saying so
        // here keeps a surprising late settlement from looking like a bug.
        ...(isLateConfirmation(event) ? { late: true } : {}),
        ...(result.blocked ? { blocked: result.blocked } : {}),
        requestId: ctx.requestId,
      });
      if (result.status === 'REFUNDED') {
        // A refund or a chargeback. The credits already granted are NOT
        // taken back automatically — see moneriz-reconcile.ts. Loud, so it
        // is not discovered through the accounts a month later.
        log.warn('moneriz webhook: payment reversed, credits left in place', {
          orderId: order.id,
          userId: order.userId,
          requestId: ctx.requestId,
        });
      }
      return NextResponse.json({ ok: true, status: result.status }, { headers });
    } catch (e) {
      log.warn('moneriz webhook: session verification failed', {
        orderId: order.id,
        err: String(e),
        requestId: ctx.requestId,
      });
      return NextResponse.json({ error: 'VERIFY_FAILED' }, { status: 503, headers });
    }
  });
}
