import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  maketouCheckout,
  maketouVerifyCart,
  isMaketouConfigured,
  getOfferAmount,
  MaketouNotConfiguredError,
  MaketouApiError,
} from './maketou';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('MAKETOU_API_KEY', 'test-key');
  vi.stubEnv('MAKETOU_PRODUCT_ID', 'prod-1');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('isMaketouConfigured / getOfferAmount', () => {
  it('false when either env var is missing', () => {
    vi.stubEnv('MAKETOU_PRODUCT_ID', '');
    expect(isMaketouConfigured()).toBe(false);
  });

  it('true when both env vars are set', () => {
    expect(isMaketouConfigured()).toBe(true);
  });

  it('defaults the offer amount to 2000 XOF', () => {
    vi.stubEnv('MAKETOU_OFFER_AMOUNT_XOF', '');
    expect(getOfferAmount()).toBe(2000);
  });

  it('reads MAKETOU_OFFER_AMOUNT_XOF when set', () => {
    vi.stubEnv('MAKETOU_OFFER_AMOUNT_XOF', '5000');
    expect(getOfferAmount()).toBe(5000);
  });
});

describe('maketouCheckout', () => {
  it('throws MaketouNotConfiguredError when env is missing', async () => {
    vi.stubEnv('MAKETOU_API_KEY', '');
    await expect(maketouCheckout({ email: 'a@b.com', redirectUrl: 'https://x/y' })).rejects.toThrow(
      MaketouNotConfiguredError,
    );
  });

  it('posts to /api/v1/stores/cart/checkout and parses cartId + redirectUrl', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { cartId: 'cart-1', redirectUrl: 'https://pay.example/cart-1' }),
    );
    const result = await maketouCheckout({ email: 'a@b.com', redirectUrl: 'https://x/y' });
    expect(result).toEqual({ cartId: 'cart-1', redirectUrl: 'https://pay.example/cart-1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.maketou.net/api/v1/stores/cart/checkout');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      'Bearer test-key',
    );
  });

  it('accepts the id/redirectURL field-name variants', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { id: 'cart-2', redirectURL: 'https://pay.example/cart-2' }),
    );
    const result = await maketouCheckout({ email: 'a@b.com', redirectUrl: 'https://x/y' });
    expect(result).toEqual({ cartId: 'cart-2', redirectUrl: 'https://pay.example/cart-2' });
  });

  it('throws MaketouApiError on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'bad key' }));
    await expect(maketouCheckout({ email: 'a@b.com', redirectUrl: 'https://x/y' })).rejects.toThrow(
      MaketouApiError,
    );
  });

  it('throws MaketouApiError when the response is missing cartId/redirectUrl', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await expect(maketouCheckout({ email: 'a@b.com', redirectUrl: 'https://x/y' })).rejects.toThrow(
      MaketouApiError,
    );
  });
});

describe('maketouVerifyCart', () => {
  it('GETs /api/v1/stores/cart/{cartId} and maps a recognized status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'completed' }));
    const result = await maketouVerifyCart('cart-1');
    expect(result).toEqual({ cartId: 'cart-1', status: 'completed' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.maketou.net/api/v1/stores/cart/cart-1');
  });

  it('reads status from a nested { cart: { status } } shape', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { cart: { status: 'abandoned' } }));
    const result = await maketouVerifyCart('cart-1');
    expect(result.status).toBe('abandoned');
  });

  it('throws MaketouApiError on an unrecognized status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'weird' }));
    await expect(maketouVerifyCart('cart-1')).rejects.toThrow(MaketouApiError);
  });

  it('throws MaketouApiError on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
    await expect(maketouVerifyCart('cart-1')).rejects.toThrow(MaketouApiError);
  });
});
