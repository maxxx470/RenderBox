/**
 * Maketou provider — RenderBox's payment integration (replaces the
 * generic Bictorys starter scaffolding for this fork; bictorys.ts stays as
 * an unused reference, per CLAUDE.md "add new providers" guidance).
 *
 * The contract (docs-api.maketou.com, checked 2026-10-15):
 *   1. POST /api/v1/stores/cart/checkout { productDocumentId, email,
 *      firstName, lastName (both required), redirectURL, meta (string
 *      values) } → 201 { cart: { id, status, … }, redirectUrl }
 *   2. Customer pays on Maketou's hosted page, gets redirected back to us
 *      (Maketou appends the cartId to the redirectURL)
 *   3. We verify ourselves: GET /api/v1/stores/cart/{cartId} → the cart at
 *      the top level { id, status, meta, … }
 *   4. Safety net: a cron re-verifies any still-PENDING cart, in case the
 *      customer closed the tab before step 3 ran (see maketou-reconcile.ts +
 *      cron/maketou-reconcile/route.ts).
 * Each cart also carries a `webhookUrl`: Maketou POSTs the cart, Ed25519-
 * signed, when it turns completed / payment_failed — see
 * maketou-webhook.ts and api/webhooks/maketou.
 * The API takes 8% of each cart created through it.
 *
 * Until 2026-10-15 the checkout sent `prenom` / `nom` and looked for the
 * cart id at the top level of the reply: Maketou requires firstName /
 * lastName and nests the id under `cart`, so every checkout failed. The
 * parsers still accept the older guessed variants.
 */
import 'server-only';
import { getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';

export class MaketouNotConfiguredError extends Error {
  constructor() {
    super('Maketou is not configured (MAKETOU_API_KEY / tier product id missing)');
    this.name = 'MaketouNotConfiguredError';
  }
}

export class MaketouApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MaketouApiError';
  }
}

export type MaketouCartStatus = 'waiting_payment' | 'completed' | 'abandoned' | 'payment_failed';

export interface MaketouCheckoutInput {
  tier: PricingTierId;
  email: string;
  /** The account's full name, split into Maketou's firstName / lastName. */
  name?: string | null | undefined;
  redirectUrl: string;
  /** Notified (signed POST) when the cart turns completed / payment_failed. */
  webhookUrl?: string | undefined;
  /** Maketou keeps only string values. */
  meta?: Record<string, string> | undefined;
}

export interface MaketouCheckoutResult {
  cartId: string;
  redirectUrl: string;
}

export interface MaketouCartResult {
  cartId: string;
  status: MaketouCartStatus;
}

interface MaketouConfig {
  apiKey: string;
  baseUrl: string;
}

// One Maketou product per pricing tier. MAKETOU_PRODUCT_ID (the original
// single-offer env var) now backs the "standard" tier so existing deploys
// with that var already set keep working without a rename.
const TIER_PRODUCT_ENV: Record<PricingTierId, string> = {
  decouverte: 'MAKETOU_PRODUCT_ID_DECOUVERTE',
  standard: 'MAKETOU_PRODUCT_ID',
  pro: 'MAKETOU_PRODUCT_ID_PRO',
};

export function getTierProductId(tier: PricingTierId): string | undefined {
  return process.env[TIER_PRODUCT_ENV[tier]]?.trim() || undefined;
}

/** Fixed price for a tier, in XOF (no decimals) — see lib/pricing-tiers.ts. */
export function getTierAmount(tier: PricingTierId): number {
  const pricingTier = getPricingTier(tier);
  if (!pricingTier) throw new Error(`Unknown pricing tier: ${tier}`);
  return pricingTier.priceXof;
}

export function isMaketouConfigured(tier: PricingTierId): boolean {
  return Boolean(process.env.MAKETOU_API_KEY?.trim() && getTierProductId(tier));
}

/**
 * API-key-only check, tier-agnostic — used by the reconcile cron, which
 * verifies already-created carts (no product id needed) across every tier.
 */
export function isMaketouApiConfigured(): boolean {
  return Boolean(process.env.MAKETOU_API_KEY?.trim());
}

function getConfig(): MaketouConfig {
  const apiKey = process.env.MAKETOU_API_KEY?.trim();
  if (!apiKey) throw new MaketouNotConfiguredError();
  return {
    apiKey,
    baseUrl: (process.env.MAKETOU_API_BASE_URL?.trim() || 'https://api.maketou.net').replace(
      /\/+$/,
      '',
    ),
  };
}

function unwrapString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Maketou requires a first and a last name; the account has one name field
 * (onboarding), sometimes a single word, or none at all. First word / the
 * rest; a single word fills both; no name falls back to the address's local
 * part.
 */
export function splitCustomerName(
  name: string | null | undefined,
  email: string,
): { firstName: string; lastName: string } {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const fallback = email.split('@')[0] || email;
  const firstName = words[0] ?? fallback;
  const lastName = words.slice(1).join(' ') || firstName;
  return { firstName, lastName };
}

export async function maketouCheckout(input: MaketouCheckoutInput): Promise<MaketouCheckoutResult> {
  const cfg = getConfig();
  const productId = getTierProductId(input.tier);
  if (!productId) throw new MaketouNotConfiguredError();
  const { firstName, lastName } = splitCustomerName(input.name, input.email);

  const res = await fetch(`${cfg.baseUrl}/api/v1/stores/cart/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productDocumentId: productId,
      email: input.email,
      firstName,
      lastName,
      redirectURL: input.redirectUrl,
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
      meta: input.meta ?? {},
    }),
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MaketouApiError(`Maketou checkout failed (${res.status})`, res.status);
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  const cart = (obj.cart && typeof obj.cart === 'object' ? obj.cart : {}) as Record<
    string,
    unknown
  >;
  const cartId =
    unwrapString(cart.id) ??
    unwrapString(obj.cartId) ??
    unwrapString(obj.id) ??
    unwrapString(obj.documentId);
  const redirectUrl =
    unwrapString(obj.redirectUrl) ?? unwrapString(obj.redirectURL) ?? unwrapString(obj.url);

  if (!cartId || !redirectUrl) {
    throw new MaketouApiError('Maketou checkout returned an unexpected response shape', 502);
  }

  return { cartId, redirectUrl };
}

function mapCartStatus(raw: unknown): MaketouCartStatus | undefined {
  const allowed: MaketouCartStatus[] = [
    'waiting_payment',
    'completed',
    'abandoned',
    'payment_failed',
  ];
  return typeof raw === 'string' && (allowed as string[]).includes(raw)
    ? (raw as MaketouCartStatus)
    : undefined;
}

export async function maketouVerifyCart(cartId: string): Promise<MaketouCartResult> {
  const cfg = getConfig();

  const res = await fetch(`${cfg.baseUrl}/api/v1/stores/cart/${encodeURIComponent(cartId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MaketouApiError(`Maketou cart verification failed (${res.status})`, res.status);
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  const cart = (obj.cart ?? obj) as Record<string, unknown>;
  const status = mapCartStatus(cart.status);
  if (!status) {
    throw new MaketouApiError('Maketou cart returned an unrecognized status', 502);
  }

  return { cartId, status };
}
