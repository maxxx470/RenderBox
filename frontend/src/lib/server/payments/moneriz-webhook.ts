/**
 * Moneriz webhook signature (moneriz.com/documentation, read 2026-11-02).
 *
 * `X-Moneriz-Signature: t=<unix MILLISECONDS>,v1=<hex>` where v1 is
 * HMAC-SHA256 of `<t>.<raw body>` keyed with the endpoint secret Moneriz
 * shows when the webhook is registered (`MONERIZ_WEBHOOK_SECRET`). That
 * secret is GIVEN BY MONERIZ — it is not a value we choose.
 *
 * Two traps, both of which silently break verification rather than failing
 * loudly, so they are worth naming:
 *
 *  1. **The message is the RAW BYTES, not the re-serialized body.** Parse
 *     the JSON first and `JSON.stringify` it back and the signature will
 *     not match, because key order and whitespace differ. The route reads
 *     `await req.text()` and hands that exact string here. (Maketou's
 *     webhook is the opposite — Ed25519 over a canonical re-serialization —
 *     so the two must not be copied from one another.)
 *  2. **`t` is in milliseconds.** Maketou's is in seconds. Treating one as
 *     the other puts every timestamp ~55 000 years out and rejects
 *     everything.
 *
 * What a valid signature does and does not buy us: it proves Moneriz sent
 * the body, so a stranger cannot make us call the API at will, and it lets
 * us trust the event id for deduplication. It is still only a TRIGGER — the
 * order is settled by re-asking Moneriz's API (moneriz-reconcile.ts), so
 * even a correctly signed body cannot by itself move a credit.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Moneriz's own helper rejects anything more than five minutes out. */
export const MONERIZ_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

export function isMonerizWebhookConfigured(): boolean {
  return Boolean(process.env.MONERIZ_WEBHOOK_SECRET?.trim());
}

/**
 * Parses `t=…,v1=…`. A duplicated key is a refusal, not a last-one-wins:
 * accepting `t=<old>,t=<fresh>` would let an attacker replay an old body by
 * appending a fresh timestamp.
 */
export function parseMonerizSignatureHeader(header: string): { t: string; v1: string } | null {
  let t: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name === 't') {
      if (t !== undefined) return null;
      t = value;
    } else if (name === 'v1') {
      if (v1 !== undefined) return null;
      v1 = value;
    }
  }
  return t && v1 ? { t, v1 } : null;
}

/**
 * True when `header` signs exactly these raw bytes with our endpoint secret
 * and is no more than five minutes old.
 *
 * `rawBody` must be the string the request carried, byte for byte. Without
 * a configured secret this answers false: a webhook we cannot verify is a
 * webhook we do not act on.
 */
export function verifyMonerizSignature(
  rawBody: string,
  header: string | null,
  nowMs: number = Date.now(),
  secret: string | undefined = process.env.MONERIZ_WEBHOOK_SECRET,
): boolean {
  const key = secret?.trim();
  if (!key || !header) return false;

  const parsed = parseMonerizSignatureHeader(header);
  if (!parsed || !/^\d+$/.test(parsed.t)) return false;
  // Milliseconds. Both directions are checked: a timestamp from the future
  // is as suspect as a stale one.
  const timestamp = Number(parsed.t);
  if (!Number.isSafeInteger(timestamp)) return false;
  if (Math.abs(nowMs - timestamp) > MONERIZ_WEBHOOK_MAX_AGE_MS) return false;
  // Exactly what Moneriz's own verifier accepts: 64 lowercase hex digits,
  // the length of a SHA-256 digest. Anything else is malformed, not merely
  // wrong, and is refused before a comparison is attempted.
  if (!/^[0-9a-f]{64}$/.test(parsed.v1)) return false;

  const expected = createHmac('sha256', key).update(`${parsed.t}.${rawBody}`, 'utf8').digest();
  let given: Buffer;
  try {
    given = Buffer.from(parsed.v1, 'hex');
  } catch {
    return false;
  }
  // timingSafeEqual throws on a length mismatch, which would leak the
  // expected length through the exception; compare lengths first.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** The envelope Moneriz wraps every event in. */
export interface MonerizEvent {
  id: string;
  type: string;
  createdAt: string | null;
  data: Record<string, unknown>;
}

/**
 * Reads the envelope out of an already-verified body. Returns null rather
 * than throwing — an event we cannot read is one we answer 200 to and
 * ignore, so Moneriz stops retrying something no retry will fix.
 */
export function parseMonerizEvent(body: unknown): MonerizEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id ? obj.id : null;
  const type = typeof obj.type === 'string' && obj.type ? obj.type : null;
  if (!id || !type) return null;
  return {
    id,
    type,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : null,
    data:
      obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
        ? (obj.data as Record<string, unknown>)
        : {},
  };
}

/**
 * The session id an event points at, looked for where Moneriz puts it:
 * `data.metadata.checkoutSessionId` per the guide, with the flatter spots
 * accepted too. Null when the event names no session — a withdrawal event,
 * for instance, which this route has no business acting on.
 */
/** A plain object, or null — `data`, `data.payment` and their metadata. */
function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * The payment object the envelope wraps. Moneriz's shape is
 * `data: { payment }` for payment events (and `data.withdrawal` for
 * withdrawals, which this route has no business acting on).
 */
export function readEventPayment(event: MonerizEvent): Record<string, unknown> | null {
  return obj(event.data.payment);
}

/**
 * The session id an event points at. Moneriz puts it in the PAYMENT's
 * metadata (`data.payment.metadata.checkoutSessionId`), which is where this
 * looks first; the flatter spots are accepted after it, since a shape we do
 * not expect should degrade into « order not found », never into acting on
 * the wrong order.
 */
export function readEventSessionId(event: MonerizEvent): string | null {
  const data = event.data;
  const payment = readEventPayment(event);

  const fromPaymentMetadata = str(obj(payment?.metadata)?.checkoutSessionId);
  if (fromPaymentMetadata) return fromPaymentMetadata;

  const fromPayment = str(payment?.checkoutSessionId);
  if (fromPayment) return fromPayment;

  const direct = str(data.checkoutSessionId);
  if (direct) return direct;

  const fromDataMetadata = str(obj(data.metadata)?.checkoutSessionId);
  if (fromDataMetadata) return fromDataMetadata;

  return str(obj(data.checkoutSession)?.id);
}

/**
 * Our own Order id, which we set as both `reference` and `metadata.orderId`
 * at checkout. A session id that no longer resolves (Moneriz rotated it, a
 * manual payment link) can still be matched through this.
 */
export function readEventOrderId(event: MonerizEvent): string | null {
  const data = event.data;
  const payment = readEventPayment(event);

  return (
    str(obj(payment?.metadata)?.orderId) ??
    str(payment?.reference) ??
    str(obj(data.metadata)?.orderId) ??
    str(data.reference)
  );
}

/**
 * `data.late === true` — Moneriz's own flag for a payment confirming AFTER
 * it had expired, which its guide says to accept. Nothing branches on this
 * today, because `reconcileMonerizOrder` already lets a late success settle
 * an EXPIRED order; it is read so the webhook can SAY so in its log, where
 * a surprising late settlement would otherwise look like a bug.
 */
export function isLateConfirmation(event: MonerizEvent): boolean {
  return event.data.late === true;
}
