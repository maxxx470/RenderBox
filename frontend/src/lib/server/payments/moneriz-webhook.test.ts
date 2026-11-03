import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  MONERIZ_WEBHOOK_MAX_AGE_MS,
  parseMonerizEvent,
  parseMonerizSignatureHeader,
  readEventOrderId,
  readEventSessionId,
  verifyMonerizSignature,
} from './moneriz-webhook';

const SECRET = 'whsec_test_abcdef0123456789';
const NOW = 1_793_620_000_000; // fixed clock, milliseconds

/** Exactly what Moneriz does: HMAC-SHA256 over `<t>.<raw body>`, hex. */
function sign(rawBody: string, t: number = NOW, secret = SECRET): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

const BODY = JSON.stringify({
  id: 'evt_1',
  type: 'payment.succeeded',
  createdAt: '2026-11-02T13:00:00.000Z',
  data: { payment: { id: 'pay_1' }, reference: 'order-1', metadata: { checkoutSessionId: 'cs_1' } },
});

describe('verifyMonerizSignature', () => {
  it('accepts a signature over exactly these bytes', () => {
    expect(verifyMonerizSignature(BODY, sign(BODY), NOW, SECRET)).toBe(true);
  });

  it('refuses a body changed by a single character', () => {
    const header = sign(BODY);
    const tampered = BODY.replace('"reference":"order-1"', '"reference":"order-2"');
    expect(tampered).not.toBe(BODY);
    expect(verifyMonerizSignature(tampered, header, NOW, SECRET)).toBe(false);
  });

  it('refuses a re-serialized body — the message is the RAW bytes', () => {
    // The trap this module exists to prevent: parsing and re-stringifying
    // produces equivalent JSON with a different byte sequence.
    const header = sign(BODY);
    const reserialized = JSON.stringify(JSON.parse(BODY));
    const spaced = JSON.stringify(JSON.parse(BODY), null, 1);
    expect(verifyMonerizSignature(reserialized, header, NOW, SECRET)).toBe(reserialized === BODY);
    expect(verifyMonerizSignature(spaced, header, NOW, SECRET)).toBe(false);
  });

  it('refuses another secret', () => {
    expect(verifyMonerizSignature(BODY, sign(BODY, NOW, 'whsec_other'), NOW, SECRET)).toBe(false);
  });

  it('refuses a stale timestamp, and one from the future', () => {
    const old = NOW - MONERIZ_WEBHOOK_MAX_AGE_MS - 1000;
    expect(verifyMonerizSignature(BODY, sign(BODY, old), NOW, SECRET)).toBe(false);
    const future = NOW + MONERIZ_WEBHOOK_MAX_AGE_MS + 1000;
    expect(verifyMonerizSignature(BODY, sign(BODY, future), NOW, SECRET)).toBe(false);
    // Just inside the window is fine.
    const fresh = NOW - MONERIZ_WEBHOOK_MAX_AGE_MS + 1000;
    expect(verifyMonerizSignature(BODY, sign(BODY, fresh), NOW, SECRET)).toBe(true);
  });

  it('treats t as MILLISECONDS, not seconds', () => {
    // Seconds would be ~55 000 years out and must be refused — the exact
    // mistake that copying the Maketou verifier would cause.
    const asSeconds = Math.floor(NOW / 1000);
    expect(verifyMonerizSignature(BODY, sign(BODY, asSeconds), NOW, SECRET)).toBe(false);
  });

  it('refuses a missing header, an empty secret and a malformed header', () => {
    expect(verifyMonerizSignature(BODY, null, NOW, SECRET)).toBe(false);
    expect(verifyMonerizSignature(BODY, sign(BODY), NOW, '')).toBe(false);
    expect(verifyMonerizSignature(BODY, sign(BODY), NOW, undefined)).toBe(false);
    expect(verifyMonerizSignature(BODY, 'garbage', NOW, SECRET)).toBe(false);
    expect(verifyMonerizSignature(BODY, 't=abc,v1=ff', NOW, SECRET)).toBe(false);
    expect(verifyMonerizSignature(BODY, `t=${NOW},v1=nothex`, NOW, SECRET)).toBe(false);
  });

  it('refuses a replay that appends a fresh timestamp to an old signature', () => {
    // A duplicated key must not be last-one-wins: that would let an old,
    // validly-signed body through by stapling a current `t` to it.
    const old = NOW - MONERIZ_WEBHOOK_MAX_AGE_MS - 1000;
    const header = `${sign(BODY, old)},t=${NOW}`;
    expect(parseMonerizSignatureHeader(header)).toBeNull();
    expect(verifyMonerizSignature(BODY, header, NOW, SECRET)).toBe(false);
  });

  it('refuses a signature of the right length but wrong bytes', () => {
    const real = sign(BODY).split('v1=')[1] as string;
    const forged = real.replace(/./, (c) => (c === 'a' ? 'b' : 'a'));
    expect(verifyMonerizSignature(BODY, `t=${NOW},v1=${forged}`, NOW, SECRET)).toBe(false);
  });
});

describe('parseMonerizEvent', () => {
  it('reads the envelope', () => {
    const event = parseMonerizEvent(JSON.parse(BODY));
    expect(event).toMatchObject({ id: 'evt_1', type: 'payment.succeeded' });
  });

  it('answers null for anything without an id and a type', () => {
    expect(parseMonerizEvent(null)).toBeNull();
    expect(parseMonerizEvent([])).toBeNull();
    expect(parseMonerizEvent({ type: 'payment.succeeded' })).toBeNull();
    expect(parseMonerizEvent({ id: 'evt_1' })).toBeNull();
  });

  it('never leaves `data` undefined, so readers need no guard', () => {
    const event = parseMonerizEvent({ id: 'e', type: 't' });
    expect(event?.data).toEqual({});
  });
});

describe('finding our order in an event', () => {
  it('reads the session id from metadata, and from the flatter spots', () => {
    const base = { id: 'e', type: 'payment.succeeded' };
    expect(readEventSessionId(parseMonerizEvent(JSON.parse(BODY))!)).toBe('cs_1');
    expect(
      readEventSessionId(parseMonerizEvent({ ...base, data: { checkoutSessionId: 'cs_2' } })!),
    ).toBe('cs_2');
    expect(
      readEventSessionId(
        parseMonerizEvent({ ...base, data: { checkoutSession: { id: 'cs_3' } } })!,
      ),
    ).toBe('cs_3');
    // A withdrawal event names no session: nothing to act on.
    expect(readEventSessionId(parseMonerizEvent({ ...base, data: { amount: 10 } })!)).toBeNull();
  });

  it('reads our own order id from metadata.orderId or the reference', () => {
    const base = { id: 'e', type: 'payment.succeeded' };
    expect(readEventOrderId(parseMonerizEvent(JSON.parse(BODY))!)).toBe('order-1');
    expect(
      readEventOrderId(parseMonerizEvent({ ...base, data: { metadata: { orderId: 'o9' } } })!),
    ).toBe('o9');
    expect(readEventOrderId(parseMonerizEvent({ ...base, data: {} })!)).toBeNull();
  });
});
