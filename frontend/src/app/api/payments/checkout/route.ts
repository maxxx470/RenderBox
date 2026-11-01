// POST /api/payments/checkout — Phase 6 (single V1 offer), extended for the
// 3-tier /tarifs pricing page. Body: { tier, phone? }.
//
// Creates a PENDING Order for that tier's fixed XOF amount and starts a
// hosted-checkout session. No Idempotency-Key header (unlike the generic
// /api/orders Bictorys route this replaces for RenderBox) — checkout is a
// "buy now" action from /tarifs or /parametres, not a retryable API a client
// library calls with replay semantics.
//
// MONEYFUSION IS THE ONLY PROVIDER since 2026-11-01 (owner: « Maketou ne
// fonctionne pas bien … on va remplacer totalement Maketou par MoneyFusion »).
// There is no fallback on purpose: Maketou never took a single payment — the
// four orders it ever produced were all FAILED or EXPIRED, read off the
// production base that day — so there was nothing to preserve and a silent
// fallback to a broken provider is worse than a clear 503.
//
// MoneyFusion REQUIRES a phone number and the account's is optional (the
// onboarding asks but does not insist). So: the body may carry one, the
// account's is used otherwise, and with neither the route answers 400
// PHONE_REQUIRED — the plans dialog then asks for it and sends it here. A
// number given this way is saved on the account, so it is asked once.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  moneyfusionCheckout,
  isMoneyfusionConfigured,
  normalisePhone,
  getTierAmount,
} from '@/lib/server/payments/moneyfusion';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h — matches order-expiration cron's PENDING sweep

const Body = z.object({
  tier: z.enum(['decouverte', 'standard', 'pro']),
  /** Only needed when the account has no phone number of its own. */
  phone: z.string().trim().min(1).max(32).optional(),
});

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

    if (!isMoneyfusionConfigured()) {
      return NextResponse.json(
        { code: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { id: true, email: true, name: true, phone: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // MoneyFusion will not take a payment without a number, so settle that
    // before an Order row exists — a PENDING order nobody can pay is litter.
    const givenPhone = normalisePhone(parsed.data.phone);
    const phone = givenPhone ?? normalisePhone(user.phone);
    if (!phone) {
      return NextResponse.json(
        {
          code: 'PHONE_REQUIRED',
          message: 'A phone number is required to start a MoneyFusion payment',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // Asked once: a number typed into the plans dialog becomes the account's.
    if (givenPhone && givenPhone !== user.phone) {
      await prisma.user.update({ where: { id: user.id }, data: { phone: givenPhone } });
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
        customerPhone: phone,
        provider: 'moneyfusion',
        metadata: { tier },
        expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
      },
      select: { id: true },
    });

    const appUrl = process.env.APP_URL ?? req.nextUrl.origin;
    try {
      const checkout = await moneyfusionCheckout({
        tier,
        phone,
        name: user.name?.trim() || user.email.split('@')[0] || 'Client',
        orderId: order.id,
        returnUrl: `${appUrl}/paiement/retour?orderId=${order.id}`,
        webhookUrl: `${appUrl}/api/webhooks/moneyfusion`,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { providerChargeId: checkout.token, paymentUrl: checkout.paymentUrl },
      });

      return NextResponse.json(
        { orderId: order.id, paymentUrl: checkout.paymentUrl },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch {
      // No partial-charge risk: the provider never returned a successful
      // checkout if this branch is reached, so marking the Order FAILED
      // immediately (rather than waiting on the 24h expiration sweep) is safe.
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      return NextResponse.json(
        { code: 'PAYMENT_PROVIDER_ERROR', message: 'Could not start checkout' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
