import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const { mockLog } = vi.hoisted(() => ({
  mockLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/observability/log', () => ({ log: mockLog }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import {
  classifyVisionError,
  detectMaterials,
  detectMaterialsDetailed,
  VisionNotConfiguredError,
  VisionTimeoutError,
} from './vision-materials';

beforeEach(() => {
  mockCreate.mockReset();
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
});

describe('detectMaterials', () => {
  it('throws VisionNotConfiguredError when ANTHROPIC_API_KEY is absent', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(detectMaterials(Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
      VisionNotConfiguredError,
    );
  });

  it('returns the parsed array on a well-formed JSON response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '[{"face":"toiture","valeur":"Tuile terre cuite","confidence":89}]',
        },
      ],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([{ face: 'toiture', valeur: 'Tuile terre cuite', confidence: 89 }]);
  });

  it('strips a markdown code fence before parsing', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n[{"face":"toiture","valeur":"Tuile","confidence":80}]\n```',
        },
      ],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([{ face: 'toiture', valeur: 'Tuile', confidence: 80 }]);
  });

  it('returns [] (never throws) when the response is not valid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sure, here is my analysis: not json at all' }],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });

  it('returns [] when the JSON is valid but does not match the expected shape', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"face":"toiture"}' }],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });

  it('returns [] when confidence is out of the 0-100 range', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '[{"face":"toiture","valeur":"Tuile","confidence":150}]' }],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });

  it('returns [] when there is no text block in the response', async () => {
    mockCreate.mockResolvedValue({ content: [] });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });
});

// Étape 3A.1 — the per-image entry point never confuses "nothing found" with
// an answer it could not read, and reduces every failure to a fixed code.
describe('detectMaterialsDetailed', () => {
  const text = (t: string) =>
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: t }] });
  const detailed = () =>
    detectMaterialsDetailed(Buffer.from('x'), 'image/png', { deadlineMs: 5_000 });
  const SECRET = 'sk-ant-api03-SECRET-VALUE';
  const logged = () => JSON.stringify(Object.values(mockLog).map((f) => f.mock.calls));

  beforeEach(() => {
    for (const f of Object.values(mockLog)) f.mockReset();
  });

  it('a valid answer with materials', async () => {
    text(
      '[{"face":"toiture","valeur":"Zinc","confidence":88},{"face":"sol","valeur":"Béton","confidence":60}]',
    );
    expect(await detailed()).toEqual({
      kind: 'materials',
      materials: [
        { face: 'toiture', valeur: 'Zinc', confidence: 88 },
        { face: 'sol', valeur: 'Béton', confidence: 60 },
      ],
    });
  });

  it('a valid empty answer is "nothing found", fenced or not', async () => {
    text('[]');
    expect(await detailed()).toEqual({ kind: 'materials', materials: [] });
    text('```json\n[]\n```');
    expect(await detailed()).toEqual({ kind: 'materials', materials: [] });
  });

  it.each([
    ['prose instead of JSON', 'Voici mon analyse : du zinc.', 'not_json'],
    ['truncated JSON', '[{"face":"toiture","valeur":"Zi', 'not_json'],
    [
      'an object instead of a list',
      '{"face":"toiture","valeur":"Zinc","confidence":80}',
      'unexpected_shape',
    ],
    [
      'a confidence out of range',
      '[{"face":"toiture","valeur":"Zinc","confidence":150}]',
      'unexpected_shape',
    ],
    ['a missing field', '[{"face":"toiture","confidence":80}]', 'unexpected_shape'],
    ['a list of strings', '["toiture"]', 'unexpected_shape'],
    ['null', 'null', 'unexpected_shape'],
  ])('%s is an invalid answer, never an empty list', async (_label, body, reason) => {
    text(body);
    expect(await detailed()).toEqual({ kind: 'invalid_response', reason });
  });

  it('an answer without a text block is invalid', async () => {
    mockCreate.mockResolvedValue({ content: [] });
    expect(await detailed()).toEqual({ kind: 'invalid_response', reason: 'no_text_block' });
  });

  it('a missing key is "not configured", without calling the provider', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(await detailed()).toEqual({ kind: 'not_configured' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    [Object.assign(new Error(`401 invalid x-api-key ${SECRET}`), { status: 401 }), 'auth'],
    [Object.assign(new Error('forbidden'), { status: 403 }), 'auth'],
    [Object.assign(new Error(`429 ${SECRET}`), { status: 429 }), 'rate_limited'],
    [Object.assign(new Error('Overloaded'), { status: 529 }), 'unavailable'],
    [Object.assign(new Error('Internal'), { status: 500 }), 'unavailable'],
    [Object.assign(new Error('image too large'), { status: 413 }), 'rejected'],
    [Object.assign(new Error('bad request'), { status: 400 }), 'rejected'],
    [Object.assign(new Error('socket hang up'), { name: 'APIConnectionError' }), 'unavailable'],
    [Object.assign(new Error('timed out'), { name: 'APIConnectionTimeoutError' }), 'timeout'],
    [new Error(`weird ${SECRET}`), 'unknown'],
    ['a thrown string', 'unknown'],
  ])('a provider error %s is the code %s, its message kept nowhere', async (error, code) => {
    expect(classifyVisionError(error)).toBe(code);
    mockCreate.mockRejectedValue(error);
    const result = await detailed();
    expect(result).toEqual({ kind: 'error', code });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(logged()).not.toContain('SECRET');
  });

  it('stops at the deadline, SDK retries included: aborts the request and says "timeout"', async () => {
    let options: { signal?: AbortSignal; timeout?: number } | undefined;
    mockCreate.mockImplementation(
      (_body: unknown, opts: { signal: AbortSignal; timeout: number }) =>
        new Promise((_resolve, reject) => {
          options = opts;
          opts.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' })),
          );
        }),
    );
    const started = Date.now();
    const result = await detectMaterialsDetailed(Buffer.from('x'), 'image/jpeg', {
      deadlineMs: 30,
    });
    expect(result).toEqual({ kind: 'error', code: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(options?.timeout).toBe(30);
    expect(options?.signal?.aborted).toBe(true);
  });

  it('never logs the model text', async () => {
    text(`not json ${SECRET} and private notes`);
    await detailed();
    text(`[{"face":"${SECRET}"}]`);
    await detailed();
    expect(mockLog.warn).toHaveBeenCalled();
    expect(logged()).not.toContain('SECRET');
    expect(logged()).not.toContain('private notes');
  });
});

describe('detectMaterials — historical contract kept for the project-level flow', () => {
  it('still throws a provider error as is', async () => {
    const err = Object.assign(new Error('Overloaded'), { status: 529 });
    mockCreate.mockRejectedValue(err);
    await expect(detectMaterials(Buffer.from('x'), 'image/jpeg')).rejects.toBe(err);
  });

  it('still answers [] for a valid empty list and for an unreadable answer alike', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '[]' }] });
    expect(await detectMaterials(Buffer.from('x'), 'image/jpeg')).toEqual([]);
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'nope' }] });
    expect(await detectMaterials(Buffer.from('x'), 'image/jpeg')).toEqual([]);
  });

  it('calls the provider without a deadline of its own (unchanged)', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '[]' }] });
    await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(mockCreate.mock.calls[0]?.[1]).toBeUndefined();
  });
});

// Étape 3B.4: the project-level flow (detect-and-merge.ts) runs with a
// deadline; without one, nothing changes.
describe('detectMaterials — optional deadline (étape 3B.4)', () => {
  const ANSWER = {
    content: [{ type: 'text', text: '[{"face":"toiture","valeur":"Zinc","confidence":80}]' }],
  };

  it('without a deadline, calls the SDK with no request options, as before', async () => {
    mockCreate.mockResolvedValue(ANSWER);
    await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(mockCreate.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('with a deadline, hands the SDK a signal and the same timeout, and returns the answer', async () => {
    mockCreate.mockResolvedValue(ANSWER);
    const out = await detectMaterials(Buffer.from('x'), 'image/jpeg', { deadlineMs: 30_000 });
    expect(out).toEqual([{ face: 'toiture', valeur: 'Zinc', confidence: 80 }]);
    expect(mockCreate.mock.calls[0]?.[1]).toEqual({
      signal: expect.any(AbortSignal),
      timeout: 30_000,
    });
  });

  it('past the deadline: aborts the request and throws VisionTimeoutError, even if the SDK never settles', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      mockCreate.mockImplementation((_body: unknown, opts: { signal: AbortSignal }) => {
        signal = opts.signal;
        return new Promise(() => {});
      });
      const outcome = detectMaterials(Buffer.from('x'), 'image/jpeg', {
        deadlineMs: 30_000,
      }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const err = await outcome;
      expect(err).toBeInstanceOf(VisionTimeoutError);
      expect(err).toMatchObject({ name: 'VisionTimeoutError', deadlineMs: 30_000 });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the rest of the contract under a deadline: missing key, provider error, unreadable answer', async () => {
    const providerErr = Object.assign(new Error('overloaded'), { status: 529 });
    mockCreate.mockRejectedValueOnce(providerErr);
    await expect(
      detectMaterials(Buffer.from('x'), 'image/jpeg', { deadlineMs: 30_000 }),
    ).rejects.toBe(providerErr);

    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json' }] });
    await expect(
      detectMaterials(Buffer.from('x'), 'image/jpeg', { deadlineMs: 30_000 }),
    ).resolves.toEqual([]);

    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(
      detectMaterials(Buffer.from('x'), 'image/jpeg', { deadlineMs: 30_000 }),
    ).rejects.toBeInstanceOf(VisionNotConfiguredError);
  });
});
