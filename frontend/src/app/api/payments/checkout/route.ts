// POST /api/payments/checkout — Phase 6 (single V1 offer), extended for the
// 3-tier /tarifs pricing page. Body: { tier: "decouverte"|"standard"|"pro" }.
// Creates a PENDING Order for that tier's fixed XOF amount and starts a
// Maketou hosted-checkout session against that tier's product. No
// Idempotency-Key header (unlike the generic /api/orders Bictorys route this
// replaces for RenderBox) — Maketou checkout is a "buy now" action from
// /tarifs or /parametres, not a retryable API a client library calls with
// replay semantics.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { maketouCheckout, isMaketouConfigured, getTierAmount } from '@/lib/server/payments/maketou';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h — matches order-expiration cron's PENDING sweep

const Body = z.object({ tier: z.enum(['decouverte', 'standard', 'pro']) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { tier } = parsed.data;

    if (!isMaketouConfigured(tier)) {
      return NextResponse.json(
        { code: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const amount = getTierAmount(tier);
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amount,
        currency: 'XOF',
        status: 'PENDING',
        customerEmail: user.email,
        customerName: user.name,
        provider: 'maketou',
        metadata: { tier },
        expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
      },
      select: { id: true },
    });

    const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
    try {
      const checkout = await maketouCheckout({
        tier,
        email: user.email,
        firstName: user.name ?? undefined,
        redirectUrl: `${appUrl}/paiement/retour?orderId=${order.id}`,
        meta: { orderId: order.id, tier },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { providerChargeId: checkout.cartId, paymentUrl: checkout.redirectUrl },
      });

      return NextResponse.json(
        { orderId: order.id, paymentUrl: checkout.redirectUrl },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch {
      // No partial-charge risk: Maketou never saw a successful checkout if
      // this branch is reached, so marking the Order FAILED immediately
      // (rather than waiting on the 24h order-expiration sweep) is safe.
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      return NextResponse.json(
        { code: 'PAYMENT_PROVIDER_ERROR', message: 'Could not start checkout' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
