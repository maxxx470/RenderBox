/**
 * Chariow provider — RenderPro's payment integration since 2026-11-28
 * (owner: « on va remplacer Moneriz par Chariow »). Moneriz stays wired as
 * the fallback until a real Chariow payment has gone through: the checkout
 * route uses Chariow as soon as CHARIOW_API_KEY and CHARIOW_WEBHOOK_SECRET
 * are set, Moneriz otherwise.
 *
 * The contract (chariow.dev, read 2026-11-28):
 *   1. POST /v1/checkout { product_id, email, first_name, last_name,
 *      phone: { number, country_code }, redirect_url, custom_metadata }
 *      with `Authorization: Bearer sk_…`
 *      → { data: { step: 'payment'|'completed'|'already_purchased',
 *                  purchase: { id: 'sal_…', status }, payment: { checkout_url } } }
 *   2. The customer pays on Chariow's hosted page and comes back to
 *      redirect_url (/paiement/retour?orderId=…)
 *   3. We verify ourselves: GET /v1/sales/{id} → { data: sale }
 *   4. Chariow POSTs a signed « Pulse » (successful.sale…) — see
 *      app/api/webhooks/chariow/route.ts
 *
 * Chariow has NO custom amount: it charges what its product says. That is
 * why each plan is its own product in the RenderPro store
 * (store_hrq7crg12ngw, renamed from « Sante Plus » on 2026-11-28) and why
 * the sale's amount is checked against the order on the way back — a
 * product edited in the dashboard to a lower price must not open a plan.
 *
 * Each product is a « Licence » product: Service and Coaching products are
 * refused by the checkout API. The licence key Chariow generates at each
 * sale is unused by us — the credits are the product.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Order, PrismaClient } from '@prisma/client';
import { getOrderMetadataTier, getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';
import { activateTier } from '@/lib/server/generation/tier-quota';
import { log } from '@/lib/server/observability/log';
import { alertAdminsIfStockShort } from './moneriz-reconcile';

const BASE_URL = 'https://api.chariow.com/v1';
const TIMEOUT_MS = 15_000;

/**
 * The Chariow product sold for each plan, in the RenderPro store. Their
 * prices in the dashboard are 6 000 / 15 000 / 36 000 FCFA, the same as
 * `priceXof` in pricing-tiers.ts — change one, change the other.
 */
export const CHARIOW_PRODUCTS: Readonly<Record<PricingTierId, string>> = {
  decouverte: 'prd_gkxiis11',
  standard: 'prd_qlo7a0kw',
  pro: 'prd_hhzu7a9q',
};

export class ChariowNotConfiguredError extends Error {
  constructor() {
    super('Chariow is not configured (CHARIOW_API_KEY missing)');
    this.name = 'ChariowNotConfiguredError';
  }
}

export class ChariowApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ChariowApiError';
  }
}

function apiKey(): string | null {
  return process.env.CHARIOW_API_KEY?.trim() || null;
}

function webhookSecret(): string | null {
  return process.env.CHARIOW_WEBHOOK_SECRET?.trim() || null;
}

/** Both halves are needed: without the Pulse secret a paid customer who
 *  closes the tab before the return page would never be credited. */
export function isChariowConfigured(): boolean {
  return apiKey() !== null && webhookSecret() !== null;
}

export function isChariowWebhookConfigured(): boolean {
  return webhookSecret() !== null;
}

/**
 * Which provider a NEW checkout goes to. `PAYMENT_PROVIDER=moneriz` forces
 * the old one back without removing the Chariow keys.
 */
export function activeCheckoutProvider(): 'chariow' | 'moneriz' {
  if (process.env.PAYMENT_PROVIDER?.trim().toLowerCase() === 'moneriz') return 'moneriz';
  return isChariowConfigured() ? 'chariow' : 'moneriz';
}

// ───────────────────────────────────────────────────────────────────────
// Customer details — Chariow requires a first name, a last name and a phone
// ───────────────────────────────────────────────────────────────────────

export interface ChariowCustomer {
  firstName: string;
  lastName: string;
  /** Digits only, without the country's dial code. */
  phone: string;
  /** ISO 3166-1 alpha-2, e.g. "TG". */
  country: string;
}

/** Splits an account name into Chariow's two fields (each ≤ 50 chars). */
export function splitName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const [first = '', ...rest] = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return { firstName: first.slice(0, 50), lastName: rest.join(' ').slice(0, 50) };
}

/** Keeps only the digits of what the customer typed. */
export function digitsOnly(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D+/g, '');
}

/** Whether these details are enough for Chariow to accept the checkout. */
export function isCompleteCustomer(c: Partial<ChariowCustomer>): c is ChariowCustomer {
  return (
    !!c.firstName?.trim() &&
    !!c.lastName?.trim() &&
    digitsOnly(c.phone).length >= 6 &&
    /^[A-Z]{2}$/.test(c.country ?? '')
  );
}

// ───────────────────────────────────────────────────────────────────────
// Checkout
// ───────────────────────────────────────────────────────────────────────

export interface ChariowCheckoutInput {
  tier: PricingTierId;
  email: string;
  customer: ChariowCustomer;
  orderId: string;
  redirectUrl: string;
}

export type ChariowCheckoutResult =
  | { step: 'payment'; saleId: string | null; checkoutUrl: string }
  | { step: 'completed'; saleId: string | null }
  | { step: 'already_purchased' };

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export async function chariowCheckout(input: ChariowCheckoutInput): Promise<ChariowCheckoutResult> {
  const key = apiKey();
  if (!key) throw new ChariowNotConfiguredError();

  const res = await fetch(`${BASE_URL}/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      product_id: CHARIOW_PRODUCTS[input.tier],
      email: input.email,
      first_name: input.customer.firstName.trim().slice(0, 50),
      last_name: input.customer.lastName.trim().slice(0, 50),
      phone: { number: digitsOnly(input.customer.phone), country_code: input.customer.country },
      redirect_url: input.redirectUrl,
      custom_metadata: { order_id: input.orderId, tier: input.tier },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = obj(await res.json().catch(() => null));
  if (!res.ok) {
    throw new ChariowApiError(
      `Chariow checkout failed (${res.status}): ${str(body?.message) ?? 'no message'}`,
      res.status,
    );
  }
  const data = obj(body?.data);
  const step = str(data?.step);
  const saleId = str(obj(data?.purchase)?.id);
  if (step === 'payment') {
    const checkoutUrl = str(obj(data?.payment)?.checkout_url);
    if (!checkoutUrl) throw new ChariowApiError('Chariow checkout: no checkout_url', 502);
    return { step, saleId, checkoutUrl };
  }
  if (step === 'completed') return { step, saleId };
  if (step === 'already_purchased') return { step };
  throw new ChariowApiError(`Chariow checkout: unexpected step ${String(step)}`, 502);
}

/** A 4xx means Chariow refused on its own terms and created nothing. */
export function isChariowCertainRefusal(e: unknown): boolean {
  return e instanceof ChariowApiError && e.status >= 400 && e.status < 500;
}

// ───────────────────────────────────────────────────────────────────────
// Reading a sale back
// ───────────────────────────────────────────────────────────────────────

export interface ChariowSale {
  id: string;
  /** initiated | awaiting_payment | completed | failed | abandoned | settled */
  status: string | null;
  /** In major units — for XOF that is whole FCFA. */
  amount: number | null;
  currency: string | null;
  productId: string | null;
  /** Chariow's fee on this sale, when it says so. */
  fee: number | null;
}

function money(v: unknown): { value: number | null; currency: string | null } {
  const o = obj(v);
  if (o) {
    const value = typeof o.value === 'number' ? o.value : Number(o.value);
    return {
      value: Number.isFinite(value) ? value : null,
      currency: str(o.currency),
    };
  }
  if (typeof v === 'number') return { value: v, currency: null };
  return { value: null, currency: null };
}

export function parseChariowSale(raw: unknown): ChariowSale | null {
  const s = obj(raw);
  const id = str(s?.id);
  if (!s || !id) return null;
  const amount = money(s.amount);
  const fee = money(obj(s.payment)?.fee);
  return {
    id,
    status: str(s.status),
    amount: amount.value,
    currency: amount.currency,
    productId: str(obj(s.product)?.id),
    fee: fee.value,
  };
}

export async function chariowGetSale(saleId: string): Promise<ChariowSale> {
  const key = apiKey();
  if (!key) throw new ChariowNotConfiguredError();
  const res = await fetch(`${BASE_URL}/sales/${encodeURIComponent(saleId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = obj(await res.json().catch(() => null));
  if (!res.ok) throw new ChariowApiError(`Chariow sale ${saleId}: ${res.status}`, res.status);
  const sale = parseChariowSale(body?.data);
  if (!sale) throw new ChariowApiError(`Chariow sale ${saleId}: unreadable`, 502);
  return sale;
}

// ───────────────────────────────────────────────────────────────────────
// Pulse (webhook) signature
// ───────────────────────────────────────────────────────────────────────

/**
 * `x-chariow-signature: sha256=<hex>` — HMAC-SHA256 of the RAW body with the
 * Pulse's `whsec_` secret. No timestamp by design on Chariow's side, so a
 * replay is possible; it is harmless here because a Pulse only triggers a
 * re-read of the sale through the API, never a credit on its own.
 */
export function verifyChariowSignature(rawBody: string, header: string | null): boolean {
  const secret = webhookSecret();
  if (!secret || !header) return false;
  const given = header
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

// ───────────────────────────────────────────────────────────────────────
// Reconcile — the single « credit at most once » path for Chariow orders
// ───────────────────────────────────────────────────────────────────────

type OrderSlice = Pick<
  Order,
  'id' | 'status' | 'providerChargeId' | 'userId' | 'metadata' | 'amount' | 'currency'
>;

export interface ChariowReconcileResult {
  changed: boolean;
  status: string;
  blocked?: 'amount_mismatch' | 'currency_mismatch' | 'product_mismatch';
}

/** A success may settle an order that expired or failed earlier — Chariow
 *  reopens failed and abandoned sales when the customer retries. */
const SETTLEABLE_AS_PAID: readonly string[] = ['PENDING', 'EXPIRED', 'FAILED'];

/**
 * What a verified sale means for our Order, with no database access.
 * Returns null to stay put — always safe, the Pulse comes again.
 */
export function decideChariowStatus(
  sale: ChariowSale,
  order: Pick<OrderSlice, 'amount' | 'currency' | 'metadata'>,
): { status: Order['status'] | null; blocked?: ChariowReconcileResult['blocked'] } {
  switch (sale.status) {
    case 'completed':
    case 'settled':
      break;
    case 'failed':
      return { status: 'FAILED' };
    case 'abandoned':
      return { status: 'EXPIRED' };
    default:
      return { status: null };
  }
  const tier = getOrderMetadataTier(order.metadata);
  if (tier && sale.productId && sale.productId !== CHARIOW_PRODUCTS[tier]) {
    return { status: null, blocked: 'product_mismatch' };
  }
  if (sale.currency && sale.currency.toUpperCase() !== order.currency.toUpperCase()) {
    return { status: null, blocked: 'currency_mismatch' };
  }
  if (sale.amount !== null && sale.amount < order.amount) {
    return { status: null, blocked: 'amount_mismatch' };
  }
  return { status: 'PAID' };
}

export function isWorthReconciling(status: string): boolean {
  return SETTLEABLE_AS_PAID.includes(status);
}

export async function reconcileChariowOrder(
  prisma: PrismaClient,
  order: OrderSlice,
): Promise<ChariowReconcileResult> {
  if (!isWorthReconciling(order.status) || !order.providerChargeId) {
    return { changed: false, status: order.status };
  }
  const sale = await chariowGetSale(order.providerChargeId);
  const decision = decideChariowStatus(sale, order);
  if (!decision.status || decision.status === order.status) {
    return {
      changed: false,
      status: order.status,
      ...(decision.blocked ? { blocked: decision.blocked } : {}),
    };
  }

  const paid = decision.status === 'PAID';
  const settled = sale.amount !== null ? Math.round(sale.amount) : order.amount;
  const fee = sale.fee !== null ? Math.round(sale.fee) : null;

  // Compare-and-swap: of two racing callers only one matches the row.
  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: paid ? { in: [...SETTLEABLE_AS_PAID] } : 'PENDING' },
    data: {
      status: decision.status,
      ...(paid
        ? {
            paidAt: new Date(),
            ...(fee !== null ? { commissionAmount: fee, netAmount: settled - fee } : {}),
          }
        : {}),
    },
  });

  const won = updated.count > 0;
  if (won && paid && order.userId) {
    const tier = getOrderMetadataTier(order.metadata);
    if (tier) {
      await activateTier(prisma, order.userId, tier);
      log.info('chariow: plan activated', {
        orderId: order.id,
        tier,
        credits: getPricingTier(tier)?.creditsPerMonth ?? null,
      });
      // Best effort, after the credit: an alert can never fail a sale.
      await alertAdminsIfStockShort(prisma, order.id, tier).catch((err: unknown) => {
        log.error('stock alert failed after a sale, payment unaffected', {
          orderId: order.id,
          err: String(err),
        });
      });
    }
  }
  return { changed: won, status: won ? decision.status : order.status };
}
