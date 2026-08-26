// GET /api/payments/verify?orderId=<id> — Phase 6. Called by the
// /paiement/retour return page right after the customer bounces back from
// Maketou's hosted checkout. Delegates the actual compare-and-swap crediting
// to reconcileMaketouOrder(), the same helper the 5-minute reconciliation
// cron uses — see maketou-reconcile.ts for why that makes double-crediting
// impossible even if both race on the same cart.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { reconcileMaketouOrder } from '@/lib/server/payments/maketou-reconcile';
import { MaketouNotConfiguredError, MaketouApiError } from '@/lib/server/payments/maketou';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const orderId = req.nextUrl.searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json(
        { error: 'ORDER_ID_REQUIRED', message: 'orderId query param is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, providerChargeId: true, provider: true },
    });
    if (!order || order.userId !== auth.user.sub || order.provider !== 'maketou') {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND', message: 'Order not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const result = await reconcileMaketouOrder(prisma, order);
      return NextResponse.json(
        { status: result.status },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (e) {
      if (e instanceof MaketouNotConfiguredError) {
        return NextResponse.json(
          { code: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (e instanceof MaketouApiError) {
        // Transient provider-side hiccup — the 5-minute cron will retry.
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
