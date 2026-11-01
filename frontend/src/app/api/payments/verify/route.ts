// GET /api/payments/verify?orderId=<id> — Phase 6. Called by the
// /paiement/retour return page right after the customer bounces back from the
// hosted checkout. Delegates the actual compare-and-swap crediting to the
// provider's reconcile helper — the same one the webhook and the cron use, so
// double-crediting is impossible even when they race on the same payment
// (see moneyfusion-reconcile.ts / maketou-reconcile.ts).
//
// Routes on the ORDER's own provider, not on which one is configured today
// (2026-11-01): a Maketou order made before the switch must still settle
// after it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { MaketouNotConfiguredError, MaketouApiError } from '@/lib/server/payments/maketou';
import { reconcileMoneyfusionOrder } from '@/lib/server/payments/moneyfusion-reconcile';
import {
  MoneyfusionNotConfiguredError,
  MoneyfusionApiError,
} from '@/lib/server/payments/moneyfusion';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SETTLED_BY_US = ['maketou', 'moneyfusion'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    // Normally the return URL we handed the provider carries ?orderId=. But a
    // provider may redirect to the fallback URL set in ITS dashboard instead,
    // which has no orderId of ours on it — so a payment token is accepted too
    // (2026-11-01). Either way the order is still checked against the signed-in
    // account below, so neither parameter grants access to anything.
    const orderId = req.nextUrl.searchParams.get('orderId');
    const token = req.nextUrl.searchParams.get('token');
    if (!orderId && !token) {
      return NextResponse.json(
        { error: 'ORDER_ID_REQUIRED', message: 'orderId or token query param is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const order = await prisma.order.findFirst({
      where: orderId ? { id: orderId } : { providerChargeId: token },
      select: {
        id: true,
        userId: true,
        status: true,
        providerChargeId: true,
        provider: true,
        metadata: true,
        amount: true,
      },
    });
    if (!order || order.userId !== auth.user.sub || !SETTLED_BY_US.includes(order.provider)) {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND', message: 'Order not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const result =
        order.provider === 'moneyfusion'
          ? await reconcileMoneyfusionOrder(prisma, order)
          : await reconcileMaketouOrder(prisma, order);
      return NextResponse.json(
        { status: result.status },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (e) {
      if (e instanceof MaketouNotConfiguredError || e instanceof MoneyfusionNotConfiguredError) {
        return NextResponse.json(
          { code: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (e instanceof MaketouApiError || e instanceof MoneyfusionApiError) {
        // Transient provider-side hiccup — the reconcile cron will retry.
        // Report the order's last-known local status rather than 502ing the
        // customer's return page.
        return NextResponse.json(
          { status: order.status },
          { headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }
  });
}
