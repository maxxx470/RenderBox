import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import { generateWithKie, getKieBalance, isKieAccountError, KieError, readCredits } from './kie';

// Taken before the fake timers replace it (see run).
const realImmediate = globalThis.setImmediate;

// No network: every Kie endpoint is answered by this fake.
type Call = { url: string; init: RequestInit | undefined };
let calls: Call[];
let records: object[];
let createBody: object;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('KIE_API_KEY', 'test-key');
  calls = [];
  createBody = { code: 200, msg: 'success', data: { taskId: 'task_1' } };
  records = [
    { code: 200, data: { state: 'generating' } },
    {
      code: 200,
      data: {
        state: 'success',
        resultJson: JSON.stringify({ resultUrls: ['https://files.kie.test/out.png'] }),
        costTime: 21,
        creditsConsumed: 18,
      },
    },
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('file-stream-upload')) {
        const n = calls.filter((c) => c.url.includes('file-stream-upload')).length;
        return json({ code: 200, data: { downloadUrl: `https://tmp.kie.test/in-${n}.png` } });
      }
      if (url.endsWith('/createTask')) return json(createBody);
      if (url.includes('/recordInfo')) return json(records.shift());
      if (url === 'https://files.kie.test/out.png') {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const INPUT = {
  sourceImageBuffer: Buffer.from('src'),
  sourceMimeType: 'image/png',
  prompt: 'Render this villa',
  referenceImages: [{ buffer: Buffer.from('ref'), mimeType: 'image/jpeg' }],
  aspectRatio: '16:9' as const,
  resolution: '2k' as const,
};

async function run(version: Parameters<typeof generateWithKie>[0], input = INPUT) {
  // Settled before the timers run, so a rejection is never left unhandled.
  let settled = false;
  const p = generateWithKie(version, input).then(
    (value) => ((settled = true), { ok: true as const, value }),
    (error: unknown) => ((settled = true), { ok: false as const, error }),
  );
  // Reading the source's shape (sharp) runs on real threads: keep running the
  // fake timers until the call is done.
  for (let i = 0; i < 200 && !settled; i++) {
    await vi.runAllTimersAsync();
    if (!settled) await new Promise((res) => realImmediate(res));
  }
  const r = await p;
  if (!r.ok) throw r.error;
  return r.value;
}

function created() {
  const call = calls.find((c) => c.url.endsWith('/createTask'))!;
  return JSON.parse(String(call.init?.body)) as { model: string; input: Record<string, unknown> };
}

describe('generateWithKie', () => {
  it('uploads source then references, creates the task, polls until success, downloads the image', async () => {
    const out = await run('visio-2-1');
    expect(out).toEqual({
      imageBuffer: Buffer.from([1, 2, 3]),
      mimeType: 'image/png',
      providerCredits: 18,
    });

    const body = created();
    expect(body.model).toBe('nano-banana-2-1');
    expect(body.input).toEqual({
      prompt: 'Render this villa',
      image_input: ['https://tmp.kie.test/in-1.png', 'https://tmp.kie.test/in-2.png'],
      aspect_ratio: '16:9',
      resolution: '2K',
      output_format: 'png',
    });
    // Every Kie request carries the key; polled twice.
    const kie = calls.filter((c) => !c.url.startsWith('https://files.'));
    for (const c of kie) {
      expect((c.init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    }
    expect(calls.filter((c) => c.url.includes('recordInfo'))).toHaveLength(2);
  });

  it("speaks each model's own fields", async () => {
    await run('pixel-1-5');
    expect(created()).toEqual({
      model: 'gpt-image/1.5-image-to-image',
      input: {
        prompt: 'Render this villa',
        input_urls: ['https://tmp.kie.test/in-1.png', 'https://tmp.kie.test/in-2.png'],
        aspect_ratio: '3:2',
        quality: 'high',
      },
    });
  });

  // A landscape render (1.6) and a portrait reference: Visio left on 'auto'
  // framed the result on the reference (paid test, 2026-10-17).
  const landscape = () =>
    sharp({ create: { width: 160, height: 100, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer();

  it('frames on the source, not on a reference, when the ratio is auto', async () => {
    await run('visio-pro', {
      ...INPUT,
      sourceImageBuffer: await landscape(),
      aspectRatio: 'auto' as never,
    });
    expect(created().input.aspect_ratio).toBe('3:2');
  });

  it("keeps 'auto' for a source sent alone", async () => {
    await run('visio-pro', {
      ...INPUT,
      referenceImages: [],
      sourceImageBuffer: await landscape(),
      aspectRatio: 'auto' as never,
    });
    expect(created().input.aspect_ratio).toBe('auto');
  });

  it('sends no resolution to a model without one', async () => {
    await run('visio-2-lite');
    const { input } = created();
    expect(input.resolution).toBeUndefined();
    expect(input.image_urls).toHaveLength(2);
  });

  it('a failed task is a KieError, not an account error', async () => {
    records = [{ code: 200, data: { state: 'fail', failCode: '501', failMsg: 'content policy' } }];
    const err = await run('pixel-2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KieError);
    expect(err).toMatchObject({ stage: 'task', code: 501 });
    expect(isKieAccountError(err)).toBe(false);
  });

  it('no credits on the Kie account (402, said in the body of an HTTP 200) is an account error', async () => {
    createBody = { code: 402, msg: 'Insufficient credits' };
    const err = await run('visio-pro').catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'KieError', code: 402, stage: 'create' });
    expect(isKieAccountError(err)).toBe(true);
  });

  it('stops polling as soon as the signal aborts', async () => {
    records = Array.from({ length: 100 }, () => ({ code: 200, data: { state: 'generating' } }));
    const ctrl = new AbortController();
    const p = generateWithKie('visio-pro', { ...INPUT, signal: ctrl.signal }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const polled = calls.filter((c) => c.url.includes('recordInfo')).length;
    ctrl.abort(new Error('deadline'));
    expect(await p).toMatchObject({ message: 'deadline' });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.filter((c) => c.url.includes('recordInfo')).length).toBe(polled);
  });
});

describe('Kie cost and balance (the API usage in /admin)', () => {
  it('returns what Kie charged for the image', async () => {
    const out = await run('visio-pro');
    expect(out.providerCredits).toBe(18);
  });

  it('reads the balance with the key, and reads a zero balance as zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return json({ code: 200, msg: 'success', data: 0 });
      }),
    );
    expect(await getKieBalance()).toBe(0);
    expect(calls[0]?.url).toBe('https://api.kie.ai/api/v1/chat/credit');
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key',
    );
  });

  it('throws when Kie refuses (its body code, HTTP 200), and is null without a key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ code: 401, msg: 'unauthorized', data: null })),
    );
    await expect(getKieBalance()).rejects.toBeInstanceOf(KieError);
    vi.stubEnv('KIE_API_KEY', '');
    expect(await getKieBalance()).toBeNull();
  });
});

describe('readCredits — the balance in whatever shape Kie sends it', () => {
  it('reads a number, a numeric string or an object holding one', () => {
    expect(readCredits(100.5)).toBe(100.5);
    expect(readCredits('2400')).toBe(2400);
    expect(readCredits({ credits: 12 })).toBe(12);
    expect(readCredits({ balance: '7.5' })).toBe(7.5);
    expect(readCredits(null)).toBeNull();
    expect(readCredits('abc')).toBeNull();
  });
});
