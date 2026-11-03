import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  embedTokenFromUrl,
  isMonerizIdentityError,
  monerizDefaultCountry,
  resolveMonerizCountry,
  getTierAmount,
  isMonerizConfigured,
  isMonerizEmbedSetupError,
  monerizCheckout,
  monerizCountry,
  monerizKeyMode,
  monerizVerifySession,
  MonerizApiError,
  MonerizNotConfiguredError,
  MONERIZ_COUNTRIES,
} from './moneriz';

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  process.env.MONERIZ_SECRET_KEY = 'izp_live_sk_abc';
  delete process.env.MONERIZ_API_BASE_URL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MONERIZ_SECRET_KEY;
  delete process.env.MONERIZ_API_BASE_URL;
});

describe('configuration', () => {
  it('is configured on a secret key alone — no product ids to create', () => {
    expect(isMonerizConfigured()).toBe(true);
    delete process.env.MONERIZ_SECRET_KEY;
    expect(isMonerizConfigured()).toBe(false);
  });

  it('reads the mode off the key prefix, and refuses to guess', () => {
    expect(monerizKeyMode('izp_live_sk_x')).toBe('live');
    expect(monerizKeyMode('izp_test_sk_x')).toBe('test');
    // An unrecognised shape answers null rather than assuming `live`: a
    // wrong guess here would authorise real plans.
    expect(monerizKeyMode('sk_whatever')).toBeNull();
    expect(monerizKeyMode('')).toBeNull();
  });

  it('with no argument, reads the configured key — which is how reconcile asks', () => {
    expect(monerizKeyMode()).toBe('live');
    process.env.MONERIZ_SECRET_KEY = 'izp_test_sk_x';
    expect(monerizKeyMode()).toBe('test');
    delete process.env.MONERIZ_SECRET_KEY;
    expect(monerizKeyMode()).toBeNull();
  });

  it('throws rather than calling the API with no key', async () => {
    delete process.env.MONERIZ_SECRET_KEY;
    await expect(
      monerizCheckout({
        tier: 'standard',
        reference: 'order-1',
        email: 'a@b.c',
        title: 'x',
        successUrl: 'https://x/y',
        cancelUrl: 'https://x/y',
      }),
    ).rejects.toThrow(MonerizNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getTierAmount', () => {
  it('is the plan price, which is the sum Moneriz will charge', () => {
    // Unlike Maketou, whose dashboard product decided the price, this figure
    // is sent in the request — so the site cannot advertise one sum and
    // charge another.
    expect(getTierAmount('decouverte')).toBe(6000);
    expect(getTierAmount('standard')).toBe(15000);
    expect(getTierAmount('pro')).toBe(36000);
  });
});

describe('monerizCountry', () => {
  it('accepts the six covered countries, in any case', () => {
    for (const c of MONERIZ_COUNTRIES) expect(monerizCountry(c)).toBe(c);
    expect(monerizCountry('tg')).toBe('TG');
    expect(monerizCountry(' ci ')).toBe('CI');
  });

  it('omits anything else rather than defaulting to a country', () => {
    // Myanmar is a real RenderPro sign-up and is NOT covered: answering a
    // country for them would be inventing one.
    expect(monerizCountry('MM')).toBeUndefined();
    expect(monerizCountry('FR')).toBeUndefined();
    expect(monerizCountry(null)).toBeUndefined();
    expect(monerizCountry('')).toBeUndefined();
    // A name, not a code: User.country is free text and must not be used here.
    expect(monerizCountry('Togo')).toBeUndefined();
  });
});

describe('monerizCheckout', () => {
  const input = {
    tier: 'standard' as const,
    reference: 'order-1',
    email: 'me@example.com',
    name: 'Me',
    title: 'RenderPro Standard',
    successUrl: 'https://www.renderpro.app/paiement/retour?orderId=order-1',
    cancelUrl: 'https://www.renderpro.app/paiement/retour?orderId=order-1',
  };

  it('sends the amount, the currency and our reference, bearer-authenticated', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        { id: 'cs_1', checkoutUrl: 'https://m/payer/cs_1', embedUrl: 'https://m/integrer/cs_1' },
        201,
      ),
    );

    const res = await monerizCheckout({
      ...input,
      integrationMode: 'iframe',
      embedOrigin: 'https://www.renderpro.app',
    });
    expect(res).toMatchObject({ sessionId: 'cs_1', embedUrl: 'https://m/integrer/cs_1' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.moneriz.com/v1/checkout-sessions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer izp_live_sk_abc');
    // The idempotency key is our order id, so a retry reuses the session.
    const idempotencyKey = headers['Idempotency-Key'] ?? '';
    expect(idempotencyKey).toContain('order-1');
    // Moneriz requires 16 to 128 characters; a short id must be padded.
    expect(idempotencyKey.length).toBeGreaterThanOrEqual(16);
    expect(idempotencyKey.length).toBeLessThanOrEqual(128);

    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent.amount).toBe(15000);
    expect(sent.currency).toBe('XOF');
    expect(sent.reference).toBe('order-1');
    expect(sent.integrationMode).toBe('iframe');
    expect(sent.embedOrigin).toBe('https://www.renderpro.app');
    expect(sent.metadata).toMatchObject({ orderId: 'order-1' });
  });

  it('sends no customer block, which a checkout session refuses', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ id: 'cs_1', embedUrl: 'https://m/integrer/cs_1' }, 201),
    );
    await monerizCheckout(input);
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string) as Record<string, unknown>;
    expect(sent).not.toHaveProperty('customer');
  });

  it('omits the country when it is not one Moneriz covers', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ id: 'cs_1', embedUrl: 'https://m/integrer/cs_1' }, 201),
    );
    await monerizCheckout(input);
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string) as Record<string, unknown>;
    expect(sent).not.toHaveProperty('country');
  });

  it('takes the embed token from the URL, since the reply has no token field', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ id: 'cs_1', embedUrl: 'https://moneriz.com/integrer/tok_9' }, 201),
    );
    const res = await monerizCheckout(input);
    expect(res.embedToken).toBe('tok_9');
  });

  it('refuses an iframe session that came back without an embedUrl', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ id: 'cs_1', checkoutUrl: 'https://m/payer/cs_1', integrationMode: 'iframe' }, 201),
    );
    await expect(monerizCheckout({ ...input, integrationMode: 'iframe' })).rejects.toThrow(
      MonerizApiError,
    );
  });

  it('refuses a reply that echoes a different amount, currency or reference', async () => {
    // Moneriz's own example checks this. It catches a mis-wired integration
    // on the first call rather than through a customer charged the wrong sum.
    for (const bad of [
      { amount: 9999 },
      { currency: 'XAF' },
      { reference: 'someone-elses-order' },
      { metadata: { orderId: 'someone-elses-order' } },
    ]) {
      fetchMock.mockResolvedValueOnce(
        reply({ id: 'cs_1', embedUrl: 'https://moneriz.com/integrer/t', ...bad }, 201),
      );
      await expect(monerizCheckout(input)).rejects.toThrow(MonerizApiError);
    }
  });

  it('refuses a session id that is not a cs_ id', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ id: 'pay_1', embedUrl: 'https://moneriz.com/integrer/t' }, 201),
    );
    await expect(monerizCheckout(input)).rejects.toThrow(MonerizApiError);
  });

  it('tolerates a wrapped session object', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ data: { id: 'cs_2', checkoutUrl: 'https://m/payer/cs_2' } }, 201),
    );
    const res = await monerizCheckout(input);
    expect(res.sessionId).toBe('cs_2');
  });

  it('refuses a session with no usable URL rather than storing a dead order', async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: 'cs_3' }, 201));
    await expect(monerizCheckout(input)).rejects.toThrow(MonerizApiError);
  });

  it("carries Moneriz's error code through, so the embed refusals can be told apart", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ error: { code: 'EMBED_ORIGIN_NOT_ALLOWED', param: 'embedOrigin' } }, 400),
    );
    const err = await monerizCheckout(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MonerizApiError);
    expect((err as MonerizApiError).code).toBe('EMBED_ORIGIN_NOT_ALLOWED');
    expect(isMonerizEmbedSetupError(err)).toBe(true);
  });

  it('a server error is NOT an embed setup problem', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { code: 'INTERNAL' } }, 500));
    const err = await monerizCheckout(input).catch((e: unknown) => e);
    expect(isMonerizEmbedSetupError(err)).toBe(false);
    expect(isMonerizEmbedSetupError(new Error('nope'))).toBe(false);
  });

  it('honours a base URL override, without a trailing slash', async () => {
    process.env.MONERIZ_API_BASE_URL = 'https://sandbox.moneriz.com/v1/';
    fetchMock.mockResolvedValueOnce(reply({ id: 'cs_1', embedUrl: 'https://m/i/1' }, 201));
    await monerizCheckout(input);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://sandbox.moneriz.com/v1/checkout-sessions');
  });
});

describe('monerizVerifySession', () => {
  it('reads the status, the confirmation and the amount', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({
        id: 'cs_1',
        mode: 'live',
        paymentStatus: 'paid',
        confirmation: 'confirmed',
        amount: 15000,
        currency: 'XOF',
        reference: 'order-1',
        paymentId: 'pay_1',
      }),
    );

    const res = await monerizVerifySession('cs_1');
    expect(res).toEqual({
      sessionId: 'cs_1',
      mode: 'live',
      paymentStatus: 'paid',
      sessionStatus: null,
      confirmation: 'confirmed',
      amount: 15000,
      currency: 'XOF',
      reference: 'order-1',
      paymentId: 'pay_1',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.moneriz.com/v1/checkout-sessions/cs_1');
    expect(init.method).toBe('GET');
  });

  it('keeps the payment status and the session status apart', async () => {
    // Two different vocabularies on one object. `complete` is a SESSION
    // status and must never be read as a payment status — doing so would
    // credit an account on a session that finished without money.
    fetchMock.mockResolvedValueOnce(
      reply({ id: 'cs_1', status: 'complete', paymentStatus: 'paid' }),
    );
    const res = await monerizVerifySession('cs_1');
    expect(res.paymentStatus).toBe('paid');
    expect(res.sessionStatus).toBe('complete');
  });

  it('a session status is never promoted into a payment status', async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: 'cs_1', status: 'complete' }));
    const res = await monerizVerifySession('cs_1');
    expect(res.paymentStatus).toBeNull();
    expect(res.sessionStatus).toBe('complete');
  });

  it('answers null for a confirmation or mode it does not recognise, never a guess', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ id: 'cs_1', paymentStatus: 'paid', confirmation: 'weird', mode: 'staging' }),
    );
    const res = await monerizVerifySession('cs_1');
    expect(res.confirmation).toBeNull();
    expect(res.mode).toBeNull();
  });

  it('throws when NEITHER status is recognisable, rather than inventing one', async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: 'cs_1', status: 'whatever' }));
    await expect(monerizVerifySession('cs_1')).rejects.toThrow(MonerizApiError);
  });

  it('throws on a non-OK reply', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { code: 'NOT_FOUND' } }, 404));
    const err = await monerizVerifySession('cs_1').catch((e: unknown) => e);
    expect((err as MonerizApiError).status).toBe(404);
  });

  it('encodes the session id into the path', async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: 'x', paymentStatus: 'pending' }));
    await monerizVerifySession('cs/../admin');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.moneriz.com/v1/checkout-sessions/cs%2F..%2Fadmin',
    );
  });
});

describe('embedTokenFromUrl', () => {
  it('reads the token from the /integrer/{token} path', () => {
    // There is NO token field in Moneriz's reply: the token is the last path
    // segment, and it is what every postMessage from the frame carries.
    expect(embedTokenFromUrl('https://moneriz.com/integrer/abc123')).toBe('abc123');
    expect(embedTokenFromUrl('https://moneriz.com/integrer/abc123?x=1')).toBe('abc123');
    expect(embedTokenFromUrl('https://moneriz.com/integrer/abc123/')).toBe('abc123');
  });

  it('answers null rather than a wrong token', () => {
    expect(embedTokenFromUrl(null)).toBeNull();
    expect(embedTokenFromUrl('not a url')).toBeNull();
    expect(embedTokenFromUrl('https://moneriz.com/integrer')).toBeNull();
    expect(embedTokenFromUrl('https://moneriz.com/integrer/')).toBeNull();
  });
});

describe('the catalogue country', () => {
  it('defaults to TG, because Moneriz defaults to SN when the field is omitted', () => {
    // The bug this prevents: omitting `country` would offer Senegalese
    // operators to a Togolese customer.
    delete process.env.MONERIZ_DEFAULT_COUNTRY;
    expect(monerizDefaultCountry()).toBe('TG');
    expect(resolveMonerizCountry(null)).toBe('TG');
    expect(resolveMonerizCountry('MM')).toBe('TG');
  });

  it("uses the visitor's own country when Moneriz covers it", () => {
    expect(resolveMonerizCountry('CI')).toBe('CI');
    expect(resolveMonerizCountry('bj')).toBe('BJ');
  });

  it('is overridable, and an unrecognised override falls back to TG', () => {
    process.env.MONERIZ_DEFAULT_COUNTRY = 'CI';
    expect(monerizDefaultCountry()).toBe('CI');
    process.env.MONERIZ_DEFAULT_COUNTRY = 'FR';
    expect(monerizDefaultCountry()).toBe('TG');
    delete process.env.MONERIZ_DEFAULT_COUNTRY;
  });
});

describe('the identity refusal', () => {
  it('KYB_REQUIRED is told apart from a transient failure', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { code: 'KYB_REQUIRED' } }, 403));
    const err = await monerizVerifySession('cs_1').catch((e: unknown) => e);
    expect(isMonerizIdentityError(err)).toBe(true);
    expect(isMonerizIdentityError(new MonerizApiError('x', 500, 'INTERNAL'))).toBe(false);
  });
});
