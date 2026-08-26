/**
 * Maketou provider — RenderBox's payment integration (replaces the
 * generic Bictorys starter scaffolding for this fork; bictorys.ts stays as
 * an unused reference, per CLAUDE.md "add new providers" guidance).
 *
 * Unlike Bictorys, Maketou has NO reliable webhook. The contract is:
 *   1. POST /api/v1/stores/cart/checkout → { redirectUrl, cartId }
 *   2. Customer pays on Maketou's hosted page, gets redirected back to us
 *   3. We verify ourselves: GET /api/v1/stores/cart/{cartId}
 *   4. Safety net: a 5-minute cron re-verifies any still-PENDING cart, in
 *      case the customer closed the tab before step 3 ran (see
 *      maketou-reconcile.ts + cron/maketou-reconcile/route.ts).
 *
 * Maketou's exact JSON response shape isn't pinned down in the integration
 * spec beyond "→ redirectUrl" / cart "statuses (waiting_payment / completed
 * / abandoned / payment_failed)" — the parsers below accept a couple of
 * plausible field-name variants defensively. Tighten once real traffic
 * against a live MAKETOU_API_KEY confirms the exact shape (same posture as
 * this starter's other pending-real-keys integrations).
 */
import 'server-only';

export class MaketouNotConfiguredError extends Error {
  constructor() {
    super('Maketou is not configured (MAKETOU_API_KEY / MAKETOU_PRODUCT_ID missing)');
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
  email: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  redirectUrl: string;
  meta?: Record<string, unknown> | undefined;
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
  productId: string;
}

export function isMaketouConfigured(): boolean {
  return Boolean(process.env.MAKETOU_API_KEY?.trim() && process.env.MAKETOU_PRODUCT_ID?.trim());
}

function getConfig(): MaketouConfig {
  const apiKey = process.env.MAKETOU_API_KEY?.trim();
  const productId = process.env.MAKETOU_PRODUCT_ID?.trim();
  if (!apiKey || !productId) throw new MaketouNotConfiguredError();
  return {
    apiKey,
    productId,
    baseUrl: (process.env.MAKETOU_API_BASE_URL?.trim() || 'https://api.maketou.net').replace(
      /\/+$/,
      '',
    ),
  };
}

/** RenderBox's single V1 offer — amount is XOF (no decimals). */
export function getOfferAmount(): number {
  return Number.parseInt(process.env.MAKETOU_OFFER_AMOUNT_XOF || '2000', 10);
}

function unwrapString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function maketouCheckout(input: MaketouCheckoutInput): Promise<MaketouCheckoutResult> {
  const cfg = getConfig();

  const res = await fetch(`${cfg.baseUrl}/api/v1/stores/cart/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productDocumentId: cfg.productId,
      email: input.email,
      prenom: input.firstName ?? '',
      nom: input.lastName ?? '',
      redirectURL: input.redirectUrl,
      meta: input.meta ?? {},
    }),
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MaketouApiError(`Maketou checkout failed (${res.status})`, res.status);
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  const cartId = unwrapString(obj.cartId) ?? unwrapString(obj.id) ?? unwrapString(obj.documentId);
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
