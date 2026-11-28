// POST /api/payments/checkout — body { tier: "decouverte"|"standard"|"pro" }.
// Creates a PENDING Order for that tier's fixed XOF amount and opens a
// Moneriz checkout session for it (its only provider since 2026-11-02).
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
  isMonerizCertainRefusal,
  isMonerizEmbedSetupError,
  isMonerizIdentityError,
  monerizCheckout,
  resolveMonerizCountry,
  type MonerizCheckoutResult,
} from '@/lib/server/payments/moneriz';
import { getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';
import { createLogger } from '@/lib/server/logger';
import {
  activeCheckoutProvider,
  chariowCheckout,
  digitsOnly,
  isChariowCertainRefusal,
  isCompleteCustomer,
  splitName,
  type ChariowCustomer,
} from '@/lib/server/payments/chariow';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();

const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h — matches the order-expiration cron's PENDING sweep

// `mode` (2026-11-21): a phone asks for Moneriz's own page instead of the
// frame. On a real mobile-money test the operator's confirmation prompt
// (USSD / SIM) came up while the customer's phone was holding our landing —
// films, carousels and the payment frame all running behind it — and the
// prompt would not take a tap, so the PIN could never be typed and the order
// stayed PENDING. On Moneriz's hosted page nothing of ours runs at all.
const Body = z.object({
  tier: z.enum(['decouverte', 'standard', 'pro']),
  mode: z.enum(['iframe', 'redirect']).optional(),
  // Chariow (2026-11-28) requires a first name, a last name and a phone.
  // The dialog sends them once the server has answered
  // CUSTOMER_DETAILS_REQUIRED with what the account already knows.
  customer: z
    .object({
      firstName: z.string().trim().min(1).max(50),
      lastName: z.string().trim().min(1).max(50),
      phone: z.string().trim().min(6).max(30),
      country: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{2}$/),
    })
    .optional(),
});

/**
 * What the customer sees as the payment's label on Moneriz's page.
 *
 * Spelled out rather than derived from the tier id: capitalising
 * `'decouverte'` printed « RenderPro Decouverte » on the payment page, with
 * no accent, in front of the customer. The plan names are proper nouns and
 * identical in French and English, so one map covers both.
 */
const TIER_NAMES: Readonly<Record<PricingTierId, string>> = {
  decouverte: 'Découverte',
  standard: 'Standard',
  pro: 'Pro',
};

function sessionTitle(tier: PricingTierId): string {
  return `RenderPro ${TIER_NAMES[tier]}`;
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
    const mode = parsed.data.mode ?? 'iframe';

    const provider = activeCheckoutProvider();
    if (provider === 'moneriz' && !isMonerizConfigured()) {
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

    if (provider === 'chariow') {
      return chariowCheckoutResponse(req, ctx.requestId, user, tier, parsed.data.customer);
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
      title: sessionTitle(tier),
      successUrl: `${appUrl}/paiement/retour?orderId=${order.id}`,
      cancelUrl: `${appUrl}/paiement/retour?orderId=${order.id}`,
      country,
      metadata: { tier },
    } as const;

    let checkout: MonerizCheckoutResult;
    try {
      checkout =
        mode === 'redirect'
          ? await monerizCheckout({ ...base, integrationMode: 'redirect' })
          : await monerizCheckout({
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
          return endOrder(order.id, ctx.requestId, isMonerizCertainRefusal(e2));
        }
      } else {
        return endOrder(order.id, ctx.requestId, isMonerizCertainRefusal(e));
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
 * What to do with the Order when no session could be opened — and the whole
 * point is that the two cases are NOT the same.
 *
 * `certain` means Moneriz refused on its own terms (a 4xx with an error
 * code): nothing was created, so the Order is failed at once rather than
 * sitting PENDING until the 24 h sweep.
 *
 * Otherwise the outcome is UNKNOWN — a timeout, a network error, a 5xx, or a
 * reply we could not read. Moneriz's guide is explicit that a session may
 * exist in that case and may still be paid. Failing the Order here would
 * declare dead an order a customer is in the middle of paying, so it stays
 * PENDING and expires on its own. (Even then nothing is lost: a late success
 * settles a FAILED order too — `SETTLEABLE_AS_PAID` in moneriz-reconcile.ts
 * — but the Order should not lie about itself in the meantime.)
 */
async function endOrder(
  orderId: string,
  requestId: string,
  certain: boolean,
): Promise<NextResponse> {
  if (certain) {
    await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
    return NextResponse.json(
      { code: 'PAYMENT_PROVIDER_ERROR', message: 'Could not start checkout' },
      { status: 502, headers: { 'x-request-id': requestId } },
    );
  }
  log.warn('moneriz checkout: outcome unknown, order left payable', { orderId, requestId });
  return NextResponse.json(
    { code: 'PAYMENT_RESULT_UNKNOWN', message: 'Could not confirm the checkout — please retry' },
    { status: 503, headers: { 'x-request-id': requestId } },
  );
}

/**
 * The Chariow path (2026-11-28). Chariow's checkout is a hosted page: the
 * answer carries `paymentUrl` and no `embedUrl`, which the dialog already
 * reads as « go there ». The customer comes back to /paiement/retour.
 */
async function chariowCheckoutResponse(
  req: NextRequest,
  requestId: string,
  user: { id: string; email: string; name: string | null; phone: string | null },
  tier: PricingTierId,
  given: ChariowCustomer | undefined,
): Promise<NextResponse> {
  const headers = { 'x-request-id': requestId };
  const country = (given?.country ?? req.headers.get('x-vercel-ip-country') ?? 'TG').toUpperCase();
  const known = splitName(user.name);
  const customer: Partial<ChariowCustomer> = given
    ? { ...given, country, phone: digitsOnly(given.phone) }
    : { ...known, phone: digitsOnly(user.phone), country };

  // Asked every time unless the dialog sent them: a phone saved months ago
  // may not be the one that will pay, and the operator prompt goes to it.
  if (!given || !isCompleteCustomer(customer)) {
    return NextResponse.json(
      {
        code: 'CUSTOMER_DETAILS_REQUIRED',
        defaults: {
          firstName: customer.firstName ?? known.firstName,
          lastName: customer.lastName ?? known.lastName,
          phone: customer.phone ?? '',
          country,
        },
      },
      { status: 422, headers },
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
      customerName: `${customer.firstName} ${customer.lastName}`.trim(),
      customerPhone: customer.phone,
      provider: 'chariow',
      metadata: { tier },
      expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
    },
    select: { id: true },
  });
  // Remember the phone for next time, never overwriting one already set.
  if (!user.phone) {
    await prisma.user
      .update({ where: { id: user.id }, data: { phone: customer.phone } })
      .catch(() => undefined);
  }

  const appUrl = (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/+$/, '');
  try {
    const result = await chariowCheckout({
      tier,
      email: user.email,
      customer,
      orderId: order.id,
      redirectUrl: `${appUrl}/paiement/retour?orderId=${order.id}`,
    });
    if (result.step === 'already_purchased') {
      log.warn('chariow checkout: already_purchased', { orderId: order.id, tier, requestId });
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      return NextResponse.json(
        { code: 'ALREADY_PURCHASED', message: 'Chariow refused a repeat purchase' },
        { status: 409, headers },
      );
    }
    await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(result.saleId ? { providerChargeId: result.saleId } : {}),
        ...(result.step === 'payment' ? { paymentUrl: result.checkoutUrl } : {}),
      },
    });
    const pricing = getPricingTier(tier);
    return NextResponse.json(
      {
        orderId: order.id,
        sessionId: result.saleId,
        embedUrl: null,
        embedToken: null,
        // `completed` never happens for a paid product; the return page
        // verifies the order either way.
        paymentUrl:
          result.step === 'payment'
            ? result.checkoutUrl
            : `${appUrl}/paiement/retour?orderId=${order.id}`,
        integrationMode: 'redirect',
        amount,
        currency: 'XOF',
        credits: pricing?.creditsPerMonth ?? null,
      },
      { status: 201, headers },
    );
  } catch (e) {
    log.warn('chariow checkout failed', { orderId: order.id, err: String(e), requestId });
    if (isChariowCertainRefusal(e)) {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      return NextResponse.json(
        { code: 'PAYMENT_PROVIDER_ERROR', message: 'Could not start checkout' },
        { status: 502, headers },
      );
    }
    return NextResponse.json(
      { code: 'PAYMENT_RESULT_UNKNOWN', message: 'Could not confirm the checkout — please retry' },
      { status: 503, headers },
    );
  }
}
