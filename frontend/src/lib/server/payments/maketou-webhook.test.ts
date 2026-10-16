import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { canonicalJson, verifyMaketouSignature } from './maketou-webhook';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const CART = {
  status: 'completed',
  id: 'fd2d91d7-20d2-4b86-b067-d474fb0d1e60',
  meta: { tier: 'standard', orderId: 'o1' },
  customerInfo: { lastName: 'Doe', firstName: 'John', phone: undefined },
};
const NOW = 1_760_004_300_000;

function header(body: unknown, t = NOW / 1000): string {
  const sig = sign(null, Buffer.from(`${t}.${canonicalJson(body)}`), privateKey);
  return `t=${t},v1=${sig.toString('base64')}`;
}

beforeEach(() => vi.stubEnv('MAKETOU_WEBHOOK_PUBLIC_KEY', PEM));
afterEach(() => vi.unstubAllEnvs());

describe('canonicalJson', () => {
  it('sorts keys at every level, drops undefined, keeps array order, no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: 'x' }, z: undefined })).toBe(
      '{"a":{"c":"x","d":[3,1]},"b":1}',
    );
  });
});

describe('verifyMaketouSignature', () => {
  it('accepts a fresh signature of the same body, whatever its key order', () => {
    const reordered = JSON.parse(JSON.stringify(CART)) as unknown;
    expect(verifyMaketouSignature(reordered, header(CART), NOW)).toBe(true);
  });

  it('refuses a body changed after signing', () => {
    expect(verifyMaketouSignature({ ...CART, status: 'completed ' }, header(CART), NOW)).toBe(
      false,
    );
  });

  it('refuses a notification older than five minutes', () => {
    expect(verifyMaketouSignature(CART, header(CART, NOW / 1000 - 301), NOW)).toBe(false);
  });

  it('refuses a missing or malformed header', () => {
    expect(verifyMaketouSignature(CART, null, NOW)).toBe(false);
    expect(verifyMaketouSignature(CART, 'v1=abc', NOW)).toBe(false);
    expect(verifyMaketouSignature(CART, `t=${NOW / 1000},v1=bm9wZQ==`, NOW)).toBe(false);
  });

  it("refuses a signature made with another key than Maketou's", () => {
    vi.unstubAllEnvs(); // back to Maketou's real public key
    expect(verifyMaketouSignature(CART, header(CART), NOW)).toBe(false);
  });
});
