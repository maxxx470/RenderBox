// POST /api/payments/checkout — body { tier: "decouverte"|"standard"|"pro" }.
// Creates a PENDING Order for that tier's fixed XOF amount and opens a
// Moneriz checkout session for it (the provider since 2026-11-02, replacing
// Maketou).
//
// The session is asked for in `iframe` mode (owner: « je préfère cette
// version-là, il fait tout sur le site »), so the answer carries an
// `embedUrl` the dialog mounts in an iframe and the customer never leaves
// RenderPro. `checkoutUrl` is returned alongside it as the fallback for a
// browser that cannot frame it, and if Moneriz refuses the embed because
// the origin is not yet allow-listed in its dashboard, the session is
// reopened in plain `redirect` mode rather than losing the sale.
//
// No Idempotency-Key header is required of our client — this is a "buy now"
// click from /app/tarifs or the plans dialog, not a retryable API. Moneriz's
// own Idempotency-Key is set from the Order id inside the adapter, so a
// retried checkout for the same order reuses its session.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  getTierAmount,
  isMonerizConfigured,
  isMonerizEmbedSetupError,
  isMonerizIdentityError,
  MonerizApiError,
  monerizCheckout,
  resolveMonerizCountry,
  type MonerizCheckoutResult,
} from '@/lib/server/payments/moneriz';
import { getPricingTier } from '@/lib/pricing-tiers';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();

const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h — matches the order-expiration cron's PENDING sweep

const Body = z.object({ tier: z.enum(['decouverte', 'standard', 'pro']) });

/** What the customer sees as the payment's label on Moneriz's page. */
function sessionTitle(tier: string): string {
  const name = tier.charAt(0).toUpperCase() + tier.slice(1);
  return `RenderPro ${name}`;
}

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

    if (!isMonerizConfigured()) {
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

    const amount = getTierAmount(tier);
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amount,
        currency: 'XOF',
        status: 'PENDING',
        customerEmail: user.email,
        customerName: user.name,
        customerPhone: user.phone,
        provider: 'moneriz',
        metadata: { tier },
        expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
      },
      select: { id: true },
    });

    const appUrl = (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/+$/, '');
    // The embed origin must be the EXACT origin of the page holding the
    // iframe — scheme and host, no path, and www is not the same origin as
    // the apex. It also has to be listed in Moneriz's « Sites autorisés ».
    const embedOrigin = (() => {
      try {
        return new URL(appUrl).origin;
      } catch {
        return undefined;
      }
    })();

    // The account's own country is free text (onboarding), so the only
    // trustworthy code is the request's — and the field is ALWAYS sent,
    // because Moneriz defaults it to SN when omitted, which would offer
    // Senegalese operators to our Togolese customers.
    const country = resolveMonerizCountry(req.headers.get('x-vercel-ip-country'));

    const base = {
      tier,
      reference: order.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      title: sessionTitle(tier),
      successUrl: `${appUrl}/paiement/retour?orderId=${order.id}`,
      cancelUrl: `${appUrl}/paiement/retour?orderId=${order.id}`,
      country,
      metadata: { tier },
    } as const;

    let checkout: MonerizCheckoutResult;
    try {
      checkout = await monerizCheckout({
        ...base,
        integrationMode: 'iframe',
        ...(embedOrigin ? { embedOrigin } : {}),
      });
    } catch (e) {
      if (isMonerizIdentityError(e)) {
        // The merchant space's identity is not approved yet. No key,
        // operator or redirect works around it, and Moneriz asks us to stop
        // retrying — so the order is failed and the owner is told loudly.
        log.warn('moneriz checkout: KYB_REQUIRED — merchant identity not approved', {
          orderId: order.id,
          requestId: ctx.requestId,
        });
        await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        return NextResponse.json(
          {
            code: 'PAYMENT_PROVIDER_UNVERIFIED',
            message: 'Payments are not available yet',
          },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (isMonerizEmbedSetupError(e)) {
        // The embed is not configured on Moneriz's side yet. That is an
        // owner-side setting, not something the customer can act on, so the
        // sale continues through the hosted page.
        log.warn('moneriz checkout: embed refused, falling back to redirect', {
          orderId: order.id,
          embedOrigin,
          err: String(e),
          requestId: ctx.requestId,
        });
        try {
          checkout = await monerizCheckout({ ...base, integrationMode: 'redirect' });
        } catch (e2) {
          log.warn('moneriz checkout: redirect refused too', {
            orderId: order.id,
            err: String(e2),
            code: e2 instanceof MonerizApiError ? e2.code : null,
            requestId: ctx.requestId,
          });
          return failOrder(order.id, ctx.requestId);
        }
      } else {
        // Without this line a refusal leaves no trace: the customer sees
        // « could not start checkout » and the logs say nothing of why.
        log.warn('moneriz checkout: session refused', {
          orderId: order.id,
          err: String(e),
          code: e instanceof MonerizApiError ? e.code : null,
          requestId: ctx.requestId,
        });
        return failOrder(order.id, ctx.requestId);
      }
    }

    // The Order's expiry follows the SESSION's, so the two cannot drift: a
    // Moneriz session lasts 30 minutes by default, and an Order left payable
    // for 24 h against a dead session is a customer meeting a dead frame.
    // Our 24 h ceiling still applies if Moneriz ever sends something longer.
    const sessionExpiry = checkout.expiresAt ? new Date(checkout.expiresAt) : null;
    const expiresAt =
      sessionExpiry && !Number.isNaN(sessionExpiry.getTime()) && sessionExpiry > new Date()
        ? new Date(Math.min(sessionExpiry.getTime(), Date.now() + ORDER_EXPIRY_MS))
        : null;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        providerChargeId: checkout.sessionId,
        // Keep the hosted page as the order's recorded URL when there is
        // one; it is the address a human can still open later.
        paymentUrl: checkout.checkoutUrl ?? checkout.embedUrl,
        ...(expiresAt ? { expiresAt } : {}),
      },
    });

    const pricing = getPricingTier(tier);
    return NextResponse.json(
      {
        orderId: order.id,
        sessionId: checkout.sessionId,
        // The dialog prefers embedUrl; paymentUrl is its fallback.
        embedUrl: checkout.embedUrl,
        embedToken: checkout.embedToken,
        paymentUrl: checkout.checkoutUrl,
        integrationMode: checkout.integrationMode,
        amount,
        currency: 'XOF',
        credits: pricing?.creditsPerMonth ?? null,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

/**
 * Moneriz never opened a session when this is reached, so there is no
 * partial-charge risk in marking the Order FAILED at once instead of
 * waiting for the 24 h sweep.
 */
async function failOrder(orderId: string, requestId: string): Promise<NextResponse> {
  await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
  return NextResponse.json(
    { code: 'PAYMENT_PROVIDER_ERROR', message: 'Could not start checkout' },
    { status: 502, headers: { 'x-request-id': requestId } },
  );
}
