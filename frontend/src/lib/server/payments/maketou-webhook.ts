/**
 * Maketou cart webhook signature (docs-api.maketou.com « Webhooks de panier »,
 * checked 2026-10-15). Maketou POSTs the cart — the same body as
 * GET /api/v1/stores/cart/{id} — when it turns `completed` or
 * `payment_failed`, with `X-Cart-Signature: t=<unix seconds>,v1=<base64>`:
 * an Ed25519 signature of `<t>.<canonical JSON of the parsed body>` (keys
 * sorted, no whitespace). No shared secret: one public key for every store,
 * served by GET /api/v1/stores/cart/webhook-signing-key and copied below
 * (MAKETOU_WEBHOOK_PUBLIC_KEY overrides it if Maketou ever rotates it).
 *
 * Unlike the generic webhook handler (HMAC over the raw bytes), the message
 * is the RE-SERIALIZED body, so parsing first is correct here.
 */
import 'server-only';
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

const MAKETOU_PUBLIC_KEY_PEM =
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA7VnoH/el2DswfrgU3AyS8O7poFxk2WCz1Ah+lKVjZCk=\n-----END PUBLIC KEY-----';

/** Maketou's own sample rejects notifications older than five minutes. */
export const MAKETOU_WEBHOOK_MAX_AGE_S = 300;

let cachedKey: { pem: string; key: KeyObject } | null = null;

function publicKey(): KeyObject {
  const pem = (process.env.MAKETOU_WEBHOOK_PUBLIC_KEY?.trim() || MAKETOU_PUBLIC_KEY_PEM).replace(
    /\\n/g,
    '\n',
  );
  if (cachedKey?.pem !== pem) cachedKey = { pem, key: createPublicKey(pem) };
  return cachedKey.key;
}

/** Keys sorted, `undefined` dropped, arrays in order, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

function parseHeader(header: string): { t: string; v1: string } | null {
  let t: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (name === 't') t = val;
    else if (name === 'v1') v1 = val;
  }
  return t && v1 ? { t, v1 } : null;
}

/** True when the header signs this body and is no older than five minutes. */
export function verifyMaketouSignature(
  body: unknown,
  header: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!header) return false;
  const parsed = parseHeader(header);
  if (!parsed || !/^\d+$/.test(parsed.t)) return false;
  const age = nowMs / 1000 - Number(parsed.t);
  if (Math.abs(age) > MAKETOU_WEBHOOK_MAX_AGE_S) return false;
  try {
    const message = Buffer.from(`${parsed.t}.${canonicalJson(body)}`, 'utf8');
    return verify(null, message, publicKey(), Buffer.from(parsed.v1, 'base64'));
  } catch {
    return false;
  }
}
