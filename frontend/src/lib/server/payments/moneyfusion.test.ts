// MoneyFusion (FusionPay) — the payment provider since 2026-11-01.
//
// What these tests are really defending, in order of how much it would cost
// to get wrong:
//
//  1. The webhook is NOT SIGNED (MoneyFusion publishes no signature and no
//     secret). So nothing may credit an account from a webhook body. Every
//     path to PAID must go through MoneyFusion's own status endpoint.
//  2. « Credit at most once »: the compare-and-swap on PENDING, so the return
//     page, the webhook and the cron cannot all activate the same plan.
//  3. The field names are MoneyFusion's, not ours — `totalPrice`, `nomclient`
//     (lowercase c), `numeroSend`, `personal_Info` (capital I), `statut`
//     (boolean on create, STRING on read). One typo and nothing works, and it
//     fails at the provider, where no test would otherwise see it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  moneyfusionCheckout,
  moneyfusionVerifyPayment,
  isMoneyfusionConfigured,
  normalisePhone,
  readOrderId,
  getTierAmount,
  MoneyfusionNotConfiguredError,
  MoneyfusionApiError,
} from './moneyfusion';

const API_URL = 'https://www.pay.moneyfusion.net/RenderPro/abc123/pay/';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.MONEYFUSION_API_URL = API_URL;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.MONEYFUSION_API_URL;
  vi.unstubAllGlobals();
});

describe('configuration', () => {
  it('is configured by the API URL alone — there is no API key', () => {
    expect(isMoneyfusionConfigured()).toBe(true);
    delete process.env.MONEYFUSION_API_URL;
    expect(isMoneyfusionConfigured()).toBe(false);
  });

  it('refuses to guess an endpoint when the URL is missing', async () => {
    delete process.env.MONEYFUSION_API_URL;
    await expect(
      moneyfusionCheckout({
        tier: 'standard',
        phone: '0700000000',
        name: 'Ada',
        orderId: 'o1',
        returnUrl: 'https://www.renderpro.app/paiement/retour',
      }),
    ).rejects.toBeInstanceOf(MoneyfusionNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('creating a payment', () => {
  it('POSTs MoneyFusion’s own field names, and the tier’s price', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statut: true, token: 'tok_1', url: 'https://payin.test/pay', message: 'ok' }),
    );

    const res = await moneyfusionCheckout({
      tier: 'standard',
      phone: '0700000000',
      name: 'Ada Lovelace',
      orderId: 'order_42',
      returnUrl: 'https://www.renderpro.app/paiement/retour?orderId=order_42',
      webhookUrl: 'https://www.renderpro.app/api/webhooks/moneyfusion',
    });

    expect(res).toEqual({ token: 'tok_1', paymentUrl: 'https://payin.test/pay' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(API_URL);
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    // The amount we charge comes from pricing-tiers, never from a client.
    expect(body.totalPrice).toBe(getTierAmount('standard'));
    expect(body.numeroSend).toBe('0700000000');
    // Lowercase « c ». MoneyFusion's spelling, not ours.
    expect(body.nomclient).toBe('Ada Lovelace');
    expect(body.return_url).toContain('/paiement/retour');
    expect(body.webhook_url).toContain('/api/webhooks/moneyfusion');
    // Capital « I », and an ARRAY: how the order comes back to us.
    expect(body.personal_Info).toEqual([{ orderId: 'order_42', tier: 'standard' }]);
    expect(Array.isArray(body.article)).toBe(true);
  });

  it('never sends an Authorization header — the URL is the credential', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statut: true, token: 't', url: 'https://u.test' }));
    await moneyfusionCheckout({
      tier: 'pro',
      phone: '0700000000',
      name: 'Ada',
      orderId: 'o',
      returnUrl: 'https://www.renderpro.app/r',
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  it('treats `statut: false` as a refusal, not a success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statut: false, message: 'IP non autorisée' }));
    await expect(
      moneyfusionCheckout({
        tier: 'standard',
        phone: '0700000000',
        name: 'Ada',
        orderId: 'o',
        returnUrl: 'https://www.renderpro.app/r',
      }),
    ).rejects.toBeInstanceOf(MoneyfusionApiError);
  });

  it('refuses a reply with no token or no payment URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statut: true, token: 'tok' }));
    await expect(
      moneyfusionCheckout({
        tier: 'standard',
        phone: '0700000000',
        name: 'Ada',
        orderId: 'o',
        returnUrl: 'https://www.renderpro.app/r',
      }),
    ).rejects.toBeInstanceOf(MoneyfusionApiError);
  });
});

describe('reading a payment’s state', () => {
  const paid = {
    statut: true,
    data: {
      tokenPay: 'tok_1',
      numeroSend: '0700000000',
      nomclient: 'Ada',
      personal_Info: [{ orderId: 'order_42' }],
      numeroTransaction: 'TX-9',
      Montant: 15000,
      frais: 375,
      statut: 'paid',
      moyen: 'orange',
    },
    message: 'details paiement',
  };

  it('reads the state from MoneyFusion’s own endpoint, not from us', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paid));
    const res = await moneyfusionVerifyPayment('tok_1');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://pay.moneyfusion.net/paiementNotif/tok_1');
    expect(res).toMatchObject({
      status: 'paid',
      amount: 15000,
      fee: 375,
      method: 'orange',
      transactionId: 'TX-9',
      orderId: 'order_42',
    });
  });

  it('never caches a payment state', async () => {
    fetchMock.mockResolvedValue(jsonResponse(paid));
    await moneyfusionVerifyPayment('tok_1');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe('no-store');
  });

  it.each([
    ['pending', 'pending'],
    ['paid', 'paid'],
    ['failure', 'failure'],
    // Two words, with a space. Verbatim from the documentation.
    ['no paid', 'no paid'],
  ])('maps the documented state %s', async (raw, expected) => {
    fetchMock.mockResolvedValue(jsonResponse({ statut: true, data: { statut: raw } }));
    const res = await moneyfusionVerifyPayment('tok_1');
    expect(res.status).toBe(expected);
  });

  // An unknown word must never be read as « paid ». Throwing leaves the order
  // PENDING and the cron retries — silently defaulting would give credits away.
  it('throws on a state it does not recognise', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statut: true, data: { statut: 'settled' } }));
    await expect(moneyfusionVerifyPayment('tok_1')).rejects.toBeInstanceOf(MoneyfusionApiError);
  });

  it('throws on an HTTP error rather than reporting a state', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statut: false }, 500));
    await expect(moneyfusionVerifyPayment('tok_1')).rejects.toBeInstanceOf(MoneyfusionApiError);
  });

  it('reads an amount sent as a string', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statut: true, data: { statut: 'paid', Montant: '15000', frais: '375' } }),
    );
    const res = await moneyfusionVerifyPayment('tok_1');
    expect(res.amount).toBe(15000);
    expect(res.fee).toBe(375);
  });

  it('survives a reply with no amounts at all', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ statut: true, data: { statut: 'pending' } }));
    const res = await moneyfusionVerifyPayment('tok_1');
    expect(res.amount).toBeNull();
    expect(res.fee).toBeNull();
    expect(res.orderId).toBeNull();
  });
});

describe('personal_Info, which carries our order id back', () => {
  it('reads it out of the array MoneyFusion returns', () => {
    expect(readOrderId([{ orderId: 'o1', tier: 'pro' }])).toBe('o1');
  });

  it('reads it even if flattened into a bare object', () => {
    expect(readOrderId({ orderId: 'o1' })).toBe('o1');
  });

  it.each([[null], [undefined], [[]], [[{}]], [['o1']], [{ order: 'o1' }]])(
    'gives nothing rather than a wrong id for %s',
    (value) => {
      expect(readOrderId(value)).toBeNull();
    },
  );
});

describe('the phone number MoneyFusion requires', () => {
  it.each([
    ['0700000000', '0700000000'],
    ['07 00 00 00 00', '0700000000'],
    ['+225 07 00 00 00 00', '+2250700000000'],
    ['(225) 07-00-00-00-00', '2250700000000'],
  ])('keeps the digits of %s', (raw, expected) => {
    expect(normalisePhone(raw)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['   '], ['1234567'], ['abcdefgh'], ['1234567890123456']])(
    'refuses %s rather than send junk to the hosted page',
    (raw) => {
      expect(normalisePhone(raw)).toBeNull();
    },
  );
});
