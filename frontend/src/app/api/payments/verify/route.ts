// GET /api/payments/verify?orderId=<id> — called by /paiement/retour when the
// customer comes back from a hosted checkout, and by the payment dialog once
// the framed checkout reports a result. Either way it re-asks the provider
// itself and delegates the crediting to that provider's reconcile helper,
// the same one the webhook and the cron use, so « credit at most once » has
// a single implementation per provider.
//
// It dispatches on `Order.provider` rather than assuming one: Moneriz is the
// provider since 2026-11-02, but orders opened against Maketou before that
// must still be able to settle if a late payment lands.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { MaketouNotConfiguredError, MaketouApiError } from '@/lib/server/payments/maketou';
import { reconcileMonerizOrder } from '@/lib/server/payments/moneriz-reconcile';
import { MonerizNotConfiguredError, MonerizApiError } from '@/lib/server/payments/moneriz';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

/** Providers this route knows how to re-verify. */
const SUPPORTED = new Set(['moneriz', 'maketou']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    // Normally the return URL we handed the provider carries ?orderId=. But a
    // provider may redirect to the fallback URL set in ITS dashboard instead,
    // which has none of ours on it — so a session / cart id is accepted too.
    // Either way the order is still checked against the signed-in account
    // below, so neither parameter grants access to anything.
    const orderId = req.nextUrl.searchParams.get('orderId');
    // Moneriz's successUrl adds `checkout_session_id`, `payment_id`,
    // `status` and `reference` of its own. None of them is proof of
    // payment — the order is re-verified server-side either way — but the
    // session id lets us find the order when our own ?orderId= is absent.
    const token =
      req.nextUrl.searchParams.get('token') ??
      req.nextUrl.searchParams.get('checkout_session_id') ??
      req.nextUrl.searchParams.get('sessionId') ??
      req.nextUrl.searchParams.get('cartId');
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
        currency: true,
      },
    });
    if (!order || order.userId !== auth.user.sub || !SUPPORTED.has(order.provider)) {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND', message: 'Order not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const result =
        order.provider === 'moneriz'
          ? await reconcileMonerizOrder(prisma, order)
          : await reconcileMaketouOrder(prisma, order);
      return NextResponse.json(
        { status: result.status },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (e) {
      if (e instanceof MonerizNotConfiguredError || e instanceof MaketouNotConfiguredError) {
        return NextResponse.json(
          { code: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (e instanceof MonerizApiError || e instanceof MaketouApiError) {
        // Transient provider-side hiccup — the webhook and the reconcile
        // cron will retry. Report the order's last-known local status rather
        // than 502ing the customer's return page.
        return NextResponse.json(
          { status: order.status },
          { headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }
  });
}
