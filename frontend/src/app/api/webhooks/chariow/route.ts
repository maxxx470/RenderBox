// POST /api/webhooks/chariow — Chariow's « Pulse » says a sale moved. The
// Pulse is created in Chariow's dashboard (Automatisations → Pulses) with
// this URL; its signing secret (whsec_…) is CHARIOW_WEBHOOK_SECRET.
//
// The Pulse is only a TRIGGER: the order is settled by reconcileChariowOrder,
// which re-reads the sale through Chariow's API — the one « credit at most
// once » path shared with the return page. A correctly signed body cannot by
// itself move a credit.
//
// 200 for anything ignored (so Chariow stops retrying — it disables a Pulse
// after 5 failed deliveries), 401 for a bad signature, 503 when the API
// check failed so the delivery is retried.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  isChariowWebhookConfigured,
  reconcileChariowOrder,
  verifyChariowSignature,
} from '@/lib/server/payments/chariow';

const log = createLogger();

const SALE_EVENTS = new Set(['successful.sale', 'failed.sale', 'abandoned.sale']);

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    // Raw body first: the signature covers exactly these bytes.
    const rawBody = await req.text().catch(() => null);
    if (rawBody === null) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400, headers });
    }
    if (!isChariowWebhookConfigured()) {
      log.warn('chariow webhook: no CHARIOW_WEBHOOK_SECRET configured', {
        requestId: ctx.requestId,
      });
      return NextResponse.json({ error: 'WEBHOOK_NOT_CONFIGURED' }, { status: 503, headers });
    }
    if (!verifyChariowSignature(rawBody, req.headers.get('x-chariow-signature'))) {
      log.warn('chariow webhook: bad signature', { requestId: ctx.requestId });
      return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401, headers });
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = obj(JSON.parse(rawBody));
    } catch {
      payload = null;
    }
    const event =
      (typeof payload?.event === 'string' ? payload.event : null) ??
      req.headers.get('x-pulse-event');
    const deliveryId = req.headers.get('x-pulse-delivery-id');
    if (!payload || !event || !SALE_EVENTS.has(event)) {
      return NextResponse.json({ ok: true, ignored: 'unhandled_event' }, { headers });
    }

    const sale = obj(payload.sale);
    const saleId = typeof sale?.id === 'string' ? sale.id : null;
    // The dashboard's « send a test » delivers a sale whose id starts with
    // test_: answer 200 so the Pulse shows green, touch nothing.
    if (saleId?.startsWith('test_')) {
      log.info('chariow webhook: test delivery received', { deliveryId, requestId: ctx.requestId });
      return NextResponse.json({ ok: true, ignored: 'test_delivery' }, { headers });
    }
    const meta = obj(sale?.custom_metadata);
    const orderId = typeof meta?.order_id === 'string' ? meta.order_id : null;
    if (!saleId && !orderId) {
      return NextResponse.json({ ok: true, ignored: 'no_reference' }, { headers });
    }

    const order = await prisma.order.findFirst({
      where: {
        provider: 'chariow',
        OR: [
          ...(saleId ? [{ providerChargeId: saleId }] : []),
          ...(orderId ? [{ id: orderId }] : []),
        ],
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
      log.warn('chariow webhook: unknown sale', {
        saleId,
        orderId,
        deliveryId,
        requestId: ctx.requestId,
      });
      return NextResponse.json({ ok: true, ignored: 'unknown_sale' }, { headers });
    }

    // The checkout answer normally carries the sale id; if it did not, the
    // Pulse is where we learn it.
    if (!order.providerChargeId && saleId) {
      await prisma.order.update({ where: { id: order.id }, data: { providerChargeId: saleId } });
      order.providerChargeId = saleId;
    }

    try {
      const result = await reconcileChariowOrder(prisma, order);
      log.info('chariow webhook: order reconciled', {
        orderId: order.id,
        event,
        deliveryId,
        previousStatus: order.status,
        changed: result.changed,
        status: result.status,
        ...(result.blocked ? { blocked: result.blocked } : {}),
        requestId: ctx.requestId,
      });
      return NextResponse.json({ ok: true, status: result.status }, { headers });
    } catch (e) {
      log.warn('chariow webhook: sale verification failed', {
        orderId: order.id,
        err: String(e),
        requestId: ctx.requestId,
      });
      return NextResponse.json({ error: 'VERIFY_FAILED' }, { status: 503, headers });
    }
  });
}
