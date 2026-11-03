/**
 * Moneriz provider — RenderPro's payment integration since 2026-11-02
 * (owner: « on oublie Maketou et MoneyFusion, on va construire Moneriz »).
 *
 * The contract (moneriz.com/documentation + /documentation/reference, read
 * 2026-11-02):
 *   1. POST /v1/checkout-sessions { amount, currency, title, country,
 *      reference, successUrl, cancelUrl, integrationMode, metadata } with
 *      `Authorization: Bearer <secret key>` and an `Idempotency-Key`
 *      → 201 { id: "cs_…", status, checkoutUrl, embedUrl, integrationMode }
 *   2. The customer pays on Moneriz's page (redirect) or in an iframe on
 *      ours, then comes back to successUrl / cancelUrl
 *   3. We verify ourselves: GET /v1/checkout-sessions/{id} → the session,
 *      carrying `status`, `paymentStatus` and `paymentId`
 *   4. Moneriz also POSTs a SIGNED event to the webhook URL registered in
 *      its dashboard — see moneriz-webhook.ts
 *
 * Three things Moneriz does that neither Maketou nor MoneyFusion did, and
 * which is why the owner moved:
 *   - **We state the amount.** A Maketou cart carries none: Maketou charged
 *     whatever its dashboard product said, and on 2026-11-02 its page asked
 *     a customer for 6 342 CFA while the site advertised 6 000. Here the
 *     sum we send is the sum charged, so the landing cannot be wrong.
 *   - **The commission is ours, not the customer's.** 5 % deducted from the
 *     payout (6 000 in, 5 700 to the wallet) against Maketou's 8 % added on
 *     top of the customer's total.
 *   - **The webhook is signed** (HMAC-SHA256, shared secret). MoneyFusion's
 *     had no signature at all.
 *
 * Mobile money covers SN, CI, BF, ML, TG, BJ in XOF only. Bank cards run
 * through Stripe and are NOT active on a new account: the owner must ask
 * for them in the dashboard and be approved. Nothing here assumes a card
 * is available — Moneriz's own page decides what it offers.
 */
import 'server-only';
import { getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';

export class MonerizNotConfiguredError extends Error {
  constructor() {
    super('Moneriz is not configured (MONERIZ_SECRET_KEY missing)');
    this.name = 'MonerizNotConfiguredError';
  }
}

export class MonerizApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Moneriz's own `error.code`, when it sent one. The embed ones below
     *  are setup mistakes in the dashboard, not transient failures. */
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'MonerizApiError';
  }
}

/**
 * The four refusals that mean « the iframe is not set up », as opposed to a
 * provider hiccup: the origin is missing from Intégration > Sites autorisés,
 * is spelled differently (www and non-www are different origins), carries a
 * path, or is not HTTPS. Retrying cannot fix any of them, so the checkout
 * route falls back to the redirect page instead of failing the sale.
 */
export const MONERIZ_EMBED_SETUP_CODES: readonly string[] = [
  'EMBED_NOT_CONFIGURED',
  'EMBED_ORIGIN_NOT_ALLOWED',
  'EMBED_ORIGIN_INVALID',
  'INSECURE_URL',
];

export function isMonerizEmbedSetupError(e: unknown): boolean {
  return (
    e instanceof MonerizApiError && e.code !== null && MONERIZ_EMBED_SETUP_CODES.includes(e.code)
  );
}

/**
 * `KYB_REQUIRED` (403): the merchant space's identity is not approved, so
 * Moneriz refuses every NEW live key, link, session and charge. It is not a
 * transient failure and not something the customer can act on — no other
 * key, operator or redirect works around it, and Moneriz's guide says
 * explicitly to stop automatic retries and show the merchant the
 * verification step instead.
 */
export function isMonerizIdentityError(e: unknown): boolean {
  return e instanceof MonerizApiError && e.code === 'KYB_REQUIRED';
}

/**
 * A PAYMENT's lifecycle. `reversed` is a refund or a chargeback.
 *
 * Not to be confused with the SESSION's own status below: they are two
 * different vocabularies on the same object, and reading one as the other
 * is how a settled payment gets missed. Only this one ever settles an
 * Order.
 */
export type MonerizStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'reversed';

/**
 * A CHECKOUT SESSION's own status, per `GET /v1/checkout-sessions/{id}`.
 * `complete` is NOT a payment status and never settles an Order by itself —
 * the payment's own status does. This is read only to recognise a session
 * that can no longer be paid.
 */
export type MonerizSessionStatus =
  | 'open'
  | 'processing'
  | 'complete'
  | 'expired'
  | 'disabled'
  | 'reversed';

/**
 * How settled the money is. Moneriz's documentation is explicit: grant
 * nothing before `status=paid` AND `confirmation=confirmed`. `review` means
 * a human is looking at it, `authorized` that the funds are held but not
 * captured — neither is money we have.
 */
export type MonerizConfirmation = 'pending' | 'authorized' | 'confirmed' | 'review';

/** Test keys and live keys both exist; a test session must never pay for a
 *  real plan. See `monerizKeyMode` and the guard in moneriz-reconcile.ts. */
export type MonerizMode = 'test' | 'live';

/** The six countries Moneriz covers for mobile money (its API reference). */
export const MONERIZ_COUNTRIES = ['SN', 'CI', 'BF', 'ML', 'TG', 'BJ'] as const;
export type MonerizCountry = (typeof MONERIZ_COUNTRIES)[number];

export interface MonerizCheckoutInput {
  tier: PricingTierId;
  /** Our Order id. Unique per order — Moneriz's `reference`. */
  reference: string;
  email: string;
  name?: string | null | undefined;
  phone?: string | null | undefined;
  /** One of MONERIZ_COUNTRIES, or omitted to let Moneriz decide. */
  country?: MonerizCountry | undefined;
  /** Human title shown on the checkout page. */
  title: string;
  successUrl: string;
  cancelUrl: string;
  /** `redirect` sends the customer to Moneriz; `iframe` keeps them on our
   *  page. Omitted, the dashboard's own setting applies. */
  integrationMode?: 'redirect' | 'iframe' | undefined;
  /** Exact origin of the page hosting the iframe, in `iframe` mode. */
  embedOrigin?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface MonerizCheckoutResult {
  sessionId: string;
  /** Null is legitimate in `iframe` mode. */
  checkoutUrl: string | null;
  /** The `/integrer/…` address to mount as the iframe `src`. The
   *  `/payer/…` one refuses to be framed, so these are not
   *  interchangeable. Null is legitimate in `redirect` mode. */
  embedUrl: string | null;
  /**
   * Stamped on every postMessage the iframe sends. The browser must compare
   * it before believing a message — without it, any other frame on the page
   * could post a fake `moneriz.payment`. It is not a credential: it proves
   * the message came from the frame we opened, nothing more, and the server
   * still re-asks Moneriz before a single credit moves.
   */
  embedToken: string | null;
  integrationMode: string | null;
  /**
   * When the session stops accepting new attempts — 30 minutes by default
   * on Moneriz's side. The Order's own `expiresAt` is set from this, so the
   * two cannot drift: an Order left payable for 24 h against a session that
   * died after 30 minutes is a customer meeting a dead frame.
   */
  expiresAt: string | null;
}

export interface MonerizSessionResult {
  sessionId: string;
  mode: MonerizMode | null;
  /** The PAYMENT's status — the only one that settles an Order. Null when
   *  the session has no payment attached yet. */
  paymentStatus: MonerizStatus | null;
  /** The SESSION's own status. Never settles an Order as PAID. */
  sessionStatus: MonerizSessionStatus | null;
  confirmation: MonerizConfirmation | null;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  paymentId: string | null;
}

interface MonerizConfig {
  secretKey: string;
  baseUrl: string;
}

/**
 * Which mode a secret key belongs to, read from its prefix
 * (`izp_test_sk_…` / `izp_live_sk_…`). Unknown shapes answer null rather
 * than guessing `live`, so an unrecognised key cannot silently authorise
 * real plans.
 */
export function monerizKeyMode(
  key: string | undefined = process.env.MONERIZ_SECRET_KEY,
): MonerizMode | null {
  const k = key?.trim();
  if (!k) return null;
  if (k.startsWith('izp_live_')) return 'live';
  if (k.startsWith('izp_test_')) return 'test';
  return null;
}

export function isMonerizConfigured(): boolean {
  return Boolean(process.env.MONERIZ_SECRET_KEY?.trim());
}

function getConfig(): MonerizConfig {
  const secretKey = process.env.MONERIZ_SECRET_KEY?.trim();
  if (!secretKey) throw new MonerizNotConfiguredError();
  return {
    secretKey,
    baseUrl: (process.env.MONERIZ_API_BASE_URL?.trim() || 'https://api.moneriz.com/v1').replace(
      /\/+$/,
      '',
    ),
  };
}

/** Fixed price for a tier, in XOF (no decimals) — see lib/pricing-tiers.ts.
 *  Unlike Maketou, this sum is what Moneriz charges: we send it. */
export function getTierAmount(tier: PricingTierId): number {
  const pricingTier = getPricingTier(tier);
  if (!pricingTier) throw new Error(`Unknown pricing tier: ${tier}`);
  return pricingTier.priceXof;
}

/**
 * A country code Moneriz accepts, or undefined. The account's own country
 * is FREE TEXT (onboarding), so this takes an ISO code — the visitor's
 * `x-vercel-ip-country` — and nothing else. An unsupported or unknown
 * country is omitted from the request, not defaulted: Moneriz then offers
 * what it can, rather than our guessing a country for someone.
 */
export function monerizCountry(raw: string | null | undefined): MonerizCountry | undefined {
  const code = raw?.trim().toUpperCase();
  return (MONERIZ_COUNTRIES as readonly string[]).includes(code ?? '')
    ? (code as MonerizCountry)
    : undefined;
}

/**
 * The catalogue country to bill against when the visitor's own is unknown
 * or not covered.
 *
 * **This must be sent.** Moneriz defaults `country` to **SN** when the
 * field is omitted, so leaving it out would offer Senegalese operators to a
 * Togolese customer. RenderPro's merchant space is Togo (owner, 2026-11-02:
 * « Pays du catalogue : TG »), hence TG here; `MONERIZ_DEFAULT_COUNTRY`
 * overrides it, and an unrecognised value falls back to TG rather than
 * letting Moneriz pick SN behind our back.
 */
export function monerizDefaultCountry(): MonerizCountry {
  return monerizCountry(process.env.MONERIZ_DEFAULT_COUNTRY) ?? 'TG';
}

/**
 * The country a session should be opened against: the visitor's own when
 * Moneriz covers it, else our catalogue's. Never undefined — see above.
 */
export function resolveMonerizCountry(visitorCountry: string | null | undefined): MonerizCountry {
  return monerizCountry(visitorCountry) ?? monerizDefaultCountry();
}

function unwrapString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function unwrapNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readErrorParam(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const err = (data as Record<string, unknown>).error;
  if (!err || typeof err !== 'object') return null;
  const param = (err as Record<string, unknown>).param;
  return typeof param === 'string' && param ? param : null;
}

/** Moneriz reports `{ error: { code, param } }` on a 4xx. */
function readErrorCode(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const err = (data as Record<string, unknown>).error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const code = (err as Record<string, unknown>).code;
    if (typeof code === 'string' && code) return code;
  }
  const code = (data as Record<string, unknown>).code;
  return typeof code === 'string' && code ? code : null;
}

function oneOf<T extends string>(allowed: readonly T[], raw: unknown): T | undefined {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

const STATUSES: readonly MonerizStatus[] = ['pending', 'paid', 'failed', 'expired', 'reversed'];
const SESSION_STATUSES: readonly MonerizSessionStatus[] = [
  'open',
  'processing',
  'complete',
  'expired',
  'disabled',
  'reversed',
];
const CONFIRMATIONS: readonly MonerizConfirmation[] = [
  'pending',
  'authorized',
  'confirmed',
  'review',
];
const MODES: readonly MonerizMode[] = ['test', 'live'];

/**
 * Opens a checkout session. `Idempotency-Key` is the Order id, so a retry
 * of the same order returns the same session instead of opening a second
 * one — Moneriz requires 16 to 128 characters and a cuid is 25.
 */
export async function monerizCheckout(input: MonerizCheckoutInput): Promise<MonerizCheckoutResult> {
  const cfg = getConfig();
  const amount = getTierAmount(input.tier);

  const res = await fetch(`${cfg.baseUrl}/checkout-sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.secretKey}`,
      'Content-Type': 'application/json',
      // Moneriz asks for 16-128 chars. A cuid is 25; pad a shorter id.
      'Idempotency-Key': input.reference.padEnd(16, '0').slice(0, 128),
    },
    body: JSON.stringify({
      amount,
      currency: 'XOF',
      title: input.title,
      reference: input.reference,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      ...(input.country ? { country: input.country } : {}),
      ...(input.integrationMode ? { integrationMode: input.integrationMode } : {}),
      ...(input.embedOrigin ? { embedOrigin: input.embedOrigin } : {}),
      customer: {
        email: input.email,
        ...(input.name ? { name: input.name } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
      },
      metadata: { orderId: input.reference, ...(input.metadata ?? {}) },
    }),
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    // `param` names the refused field on a VALIDATION_ERROR; without it a
    // 400 says only that something in the body was wrong.
    const param = readErrorParam(data);
    throw new MonerizApiError(
      `Moneriz checkout failed (${res.status})${param ? ` param=${param}` : ''}`,
      res.status,
      readErrorCode(data),
    );
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  // The reference documents a bare session object; tolerate a wrapper.
  const session = (
    obj.checkoutSession && typeof obj.checkoutSession === 'object'
      ? obj.checkoutSession
      : obj.data && typeof obj.data === 'object'
        ? obj.data
        : obj
  ) as Record<string, unknown>;

  const sessionId = unwrapString(session.id);
  const checkoutUrl = unwrapString(session.checkoutUrl) ?? unwrapString(session.url) ?? null;
  const embedUrl = unwrapString(session.embedUrl) ?? null;
  const integrationMode = unwrapString(session.integrationMode) ?? null;

  // A session with neither URL is unusable: we would have an Order pointing
  // at nothing and a customer with nowhere to pay.
  if (!sessionId || !sessionId.startsWith('cs_') || (!checkoutUrl && !embedUrl)) {
    throw new MonerizApiError('Moneriz checkout returned an unexpected response shape', 502);
  }
  // An iframe session ALWAYS carries an embedUrl per Moneriz's contract; one
  // without it would leave the dialog with nothing to mount.
  if (integrationMode === 'iframe' && !embedUrl) {
    throw new MonerizApiError('Moneriz returned an iframe session with no embedUrl', 502);
  }

  // Moneriz's own example checks the reply against the request before
  // storing it. Worth doing: it catches a mis-wired integration on the
  // first call rather than through a customer charged the wrong sum.
  const echoed = {
    amount: unwrapNumber(session.amount),
    currency: unwrapString(session.currency),
    reference: unwrapString(session.reference),
  };
  const metadata = (
    session.metadata && typeof session.metadata === 'object' ? session.metadata : {}
  ) as Record<string, unknown>;
  if (
    (echoed.amount !== undefined && echoed.amount !== amount) ||
    (echoed.currency !== undefined && echoed.currency !== 'XOF') ||
    (echoed.reference !== undefined && echoed.reference !== input.reference) ||
    (typeof metadata.orderId === 'string' && metadata.orderId !== input.reference)
  ) {
    throw new MonerizApiError('Moneriz echoed a session that does not match the request', 502);
  }

  return {
    sessionId,
    checkoutUrl,
    embedUrl,
    // There is no token FIELD in the reply: the token is the last path
    // segment of `/integrer/{token}`, and it is what every postMessage from
    // the frame carries. Reading it from the URL is the only way to have it.
    embedToken: embedTokenFromUrl(embedUrl),
    integrationMode,
    expiresAt: unwrapString(session.expiresAt) ?? null,
  };
}

/**
 * The `{token}` of `https://moneriz.com/integrer/{token}`. The browser
 * compares it against every `moneriz.payment` message, so without it that
 * check would silently pass anything.
 */
export function embedTokenFromUrl(embedUrl: string | null): string | null {
  if (!embedUrl) return null;
  try {
    const segments = new URL(embedUrl).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last && last !== 'integrer' ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

/**
 * Re-asks Moneriz what a session is worth. This is the authority — never
 * the browser's return URL, never a webhook body.
 */
export async function monerizVerifySession(sessionId: string): Promise<MonerizSessionResult> {
  const cfg = getConfig();

  const res = await fetch(`${cfg.baseUrl}/checkout-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cfg.secretKey}` },
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MonerizApiError(
      `Moneriz session verification failed (${res.status})`,
      res.status,
      readErrorCode(data),
    );
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  const session = (
    obj.checkoutSession && typeof obj.checkoutSession === 'object'
      ? obj.checkoutSession
      : obj.data && typeof obj.data === 'object'
        ? obj.data
        : obj
  ) as Record<string, unknown>;

  // The two vocabularies are kept apart on purpose. `paymentStatus` is the
  // payment's (pending / paid / failed / expired / reversed) and is the only
  // one that can settle an Order; `status` is the session's own
  // (open / processing / complete / expired / disabled / reversed), and
  // reading `complete` as if it meant « paid » would credit an account on a
  // session that finished without money.
  const paymentStatus = oneOf(STATUSES, session.paymentStatus) ?? null;
  const sessionStatus = oneOf(SESSION_STATUSES, session.status) ?? null;
  // Neither readable at all means we did not understand the reply; refusing
  // is safe, since reconciliation simply runs again.
  if (paymentStatus === null && sessionStatus === null) {
    throw new MonerizApiError('Moneriz session returned an unrecognized status', 502);
  }

  return {
    sessionId,
    mode: oneOf(MODES, session.mode) ?? null,
    paymentStatus,
    sessionStatus,
    confirmation: oneOf(CONFIRMATIONS, session.confirmation) ?? null,
    amount: unwrapNumber(session.amount) ?? null,
    currency: unwrapString(session.currency) ?? null,
    reference: unwrapString(session.reference) ?? null,
    paymentId: unwrapString(session.paymentId) ?? null,
  };
}
