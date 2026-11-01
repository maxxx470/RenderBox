/**
 * MoneyFusion (FusionPay) — RenderPro's payment provider since 2026-11-01
 * (owner: « Maketou ne fonctionne pas bien donc je propose qu'on utilise
 * MoneyFusion »). Orange Money, MTN, Moov, Wave and bank cards, in FCFA.
 * maketou.ts stays in the code, unused, for the orders already paid through it.
 *
 * The contract (docs.moneyfusion.net/fr/webapi, read 2026-11-01):
 *
 *   1. POST to OUR OWN per-merchant URL — `MONEYFUSION_API_URL`, handed out by
 *      the dashboard. There is no API key and no Authorization header: THE URL
 *      *IS* THE CREDENTIAL, so it is a secret and never leaves the server.
 *      Body: { totalPrice, article, numeroSend, nomclient, personal_Info,
 *      return_url, webhook_url } → { statut: true, token, url, message }
 *   2. The customer pays on `url` (payin.moneyfusion.net) and comes back.
 *   3. We verify ourselves: GET https://pay.moneyfusion.net/paiementNotif/{token}
 *      → { statut: true, data: { statut: 'pending'|'paid'|'failure'|'no paid',
 *      Montant, frais, moyen, numeroTransaction, personal_Info, … } }
 *   4. MoneyFusion also POSTs our `webhook_url` on every state change.
 *
 * ⚠ THE WEBHOOK IS NOT SIGNED. MoneyFusion's documentation describes no
 * signature, no secret and no shared key — anyone who learns the URL can POST
 * `payin.session.completed`. So the webhook is treated as a PING AND NOTHING
 * MORE: it never carries truth. Whatever it says, we re-ask step 3 and credit
 * from THAT answer alone (moneyfusion-reconcile.ts, the one « credit at most
 * once » path). A forged body can therefore do nothing but make us call
 * MoneyFusion. This is the same shape the Maketou webhook already had, where
 * the Ed25519 signature was a second lock on a door that was already shut.
 *
 * The documentation also warns that several notifications may arrive for one
 * transaction, and to key on `tokenPay` — which is `Order.providerChargeId`
 * here, and @unique in the schema.
 *
 * Amounts are integer FCFA (no decimals), like everything else in this
 * project. Unlike Maketou — whose cart carried no amount, the price living on
 * the dashboard product and kept equal BY HAND — we send `totalPrice`
 * ourselves, from pricing-tiers.ts. One fewer thing to keep in sync, and the
 * figure the customer sees can no longer drift from the figure we charge.
 */
import 'server-only';
import { getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';

/** Where a payment's state is read. Fixed by MoneyFusion, not per merchant. */
const STATUS_BASE_URL = 'https://pay.moneyfusion.net/paiementNotif';

export class MoneyfusionNotConfiguredError extends Error {
  constructor() {
    super('MoneyFusion is not configured (MONEYFUSION_API_URL missing)');
    this.name = 'MoneyfusionNotConfiguredError';
  }
}

export class MoneyfusionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'MoneyfusionApiError';
  }
}

/** MoneyFusion's four payment states, verbatim — « no paid » has a space. */
export type MoneyfusionStatus = 'pending' | 'paid' | 'failure' | 'no paid';

export interface MoneyfusionCheckoutInput {
  tier: PricingTierId;
  /** Required by MoneyFusion: the customer's phone number. */
  phone: string;
  /** Required by MoneyFusion: the customer's name. */
  name: string;
  /** Comes back to us in `personal_Info`, and is how we find the Order. */
  orderId: string;
  returnUrl: string;
  webhookUrl?: string | undefined;
}

export interface MoneyfusionCheckoutResult {
  /** MoneyFusion's payment token — stored as Order.providerChargeId. */
  token: string;
  /** The hosted page to send the customer to. */
  paymentUrl: string;
}

export interface MoneyfusionPaymentResult {
  token: string;
  status: MoneyfusionStatus;
  /** What the customer actually paid, integer FCFA. */
  amount: number | null;
  /** MoneyFusion's own fee on this transaction, integer FCFA. */
  fee: number | null;
  /** « orange », « wave », « card », … — stored as Order.paymentMethod. */
  method: string | null;
  /** MoneyFusion's transaction reference, for a support conversation. */
  transactionId: string | null;
  /** What we sent in `personal_Info` — our orderId among it. */
  orderId: string | null;
}

export function isMoneyfusionConfigured(): boolean {
  return Boolean(process.env.MONEYFUSION_API_URL?.trim());
}

function getApiUrl(): string {
  const url = process.env.MONEYFUSION_API_URL?.trim();
  if (!url) throw new MoneyfusionNotConfiguredError();
  return url;
}

/** Fixed price for a tier, in XOF (no decimals) — see lib/pricing-tiers.ts. */
export function getTierAmount(tier: PricingTierId): number {
  const pricingTier = getPricingTier(tier);
  if (!pricingTier) throw new Error(`Unknown pricing tier: ${tier}`);
  return pricingTier.priceXof;
}

/**
 * MoneyFusion wants a phone number and the account's is optional (the
 * onboarding asks for it but does not require it). Keep the digits, keep a
 * leading +, and refuse anything that cannot be a number rather than send
 * junk the hosted page would choke on.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D+/g, '');
  // Short enough to be a typo, long enough to be nonsense: 8 to 15 digits is
  // what E.164 allows for a subscriber number with or without a country code.
  if (digits.length < 8 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** MoneyFusion sends numbers as numbers in places and strings in others. */
function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function mapStatus(raw: unknown): MoneyfusionStatus | null {
  const allowed: MoneyfusionStatus[] = ['pending', 'paid', 'failure', 'no paid'];
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return (allowed as string[]).includes(value) ? (value as MoneyfusionStatus) : null;
}

/**
 * `personal_Info` is an ARRAY of objects on the way out and comes back the
 * same way — but a provider that reshapes it into a bare object would
 * otherwise lose us the order. Read both.
 */
export function readOrderId(personalInfo: unknown): string | null {
  const entries = Array.isArray(personalInfo) ? personalInfo : [personalInfo];
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      const id = (entry as Record<string, unknown>).orderId;
      const asStr = asString(id);
      if (asStr) return asStr;
    }
  }
  return null;
}

export async function moneyfusionCheckout(
  input: MoneyfusionCheckoutInput,
): Promise<MoneyfusionCheckoutResult> {
  const apiUrl = getApiUrl();
  const tier = getPricingTier(input.tier);
  if (!tier) throw new Error(`Unknown pricing tier: ${input.tier}`);
  const amount = getTierAmount(input.tier);

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      totalPrice: amount,
      // One line, named for what it is — this is what the customer reads on
      // the hosted page. `article` is MoneyFusion's spelling, singular.
      article: [{ [`RenderPro ${tier.id}`]: amount }],
      numeroSend: input.phone,
      nomclient: input.name,
      // Comes back to us untouched, in the status read AND in the webhook.
      personal_Info: [{ orderId: input.orderId, tier: input.tier }],
      return_url: input.returnUrl,
      ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    }),
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MoneyfusionApiError(`MoneyFusion checkout failed (${res.status})`, res.status);
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  // `statut` is a BOOLEAN here (did the request succeed), and a STRING on the
  // status read (did the customer pay). Not a typo — MoneyFusion's own shape.
  if (obj.statut === false) {
    throw new MoneyfusionApiError(
      `MoneyFusion refused the checkout: ${asString(obj.message) ?? 'no reason given'}`,
      502,
    );
  }

  const token = asString(obj.token);
  const paymentUrl = asString(obj.url);
  if (!token || !paymentUrl) {
    throw new MoneyfusionApiError('MoneyFusion checkout returned an unexpected shape', 502);
  }

  return { token, paymentUrl };
}

/**
 * The ONE source of truth about a payment. Everything that credits an account
 * goes through here — never through a webhook body.
 */
export async function moneyfusionVerifyPayment(token: string): Promise<MoneyfusionPaymentResult> {
  const res = await fetch(`${STATUS_BASE_URL}/${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MoneyfusionApiError(
      `MoneyFusion payment verification failed (${res.status})`,
      res.status,
    );
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  const payload = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<
    string,
    unknown
  >;

  const status = mapStatus(payload.statut);
  if (!status) {
    // An unknown state must never be read as « paid ». Fail loudly instead:
    // the caller leaves the order PENDING and the cron tries again.
    throw new MoneyfusionApiError('MoneyFusion returned an unrecognised payment status', 502);
  }

  return {
    token: asString(payload.tokenPay) ?? token,
    status,
    amount: asInteger(payload.Montant),
    fee: asInteger(payload.frais),
    method: asString(payload.moyen),
    transactionId: asString(payload.numeroTransaction),
    orderId: readOrderId(payload.personal_Info),
  };
}
