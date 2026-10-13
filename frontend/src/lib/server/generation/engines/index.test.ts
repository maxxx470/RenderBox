import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockNanobanana, mockGptImage } = vi.hoisted(() => ({
  mockNanobanana: vi.fn(),
  mockGptImage: vi.fn(),
}));

vi.mock('./nanobanana', () => ({ generateWithNanobanana: mockNanobanana }));
vi.mock('./gpt-image', () => ({ generateWithGptImage: mockGptImage }));

import {
  generateRender,
  isEngineConfigured,
  EngineTimeoutError,
  ENGINE_DEADLINE_MS,
} from './index';

const INPUT = { sourceImageBuffer: Buffer.from('x'), sourceMimeType: 'image/png', prompt: 'p' };

beforeEach(() => {
  mockNanobanana.mockReset();
  mockGptImage.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('generateRender', () => {
  it('dispatches to generateWithNanobanana for "nanobanana" and returns its output shape', async () => {
    mockNanobanana.mockResolvedValue({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' });
    const result = await generateRender('nanobanana', INPUT);
    // The input as given, plus the deadline's signal (étape 3B.4).
    expect(mockNanobanana).toHaveBeenCalledWith({ ...INPUT, signal: expect.any(AbortSignal) });
    expect(mockGptImage).not.toHaveBeenCalled();
    expect(result).toEqual({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' });
  });

  it('dispatches to generateWithGptImage for "gpt_image" and returns its output shape', async () => {
    mockGptImage.mockResolvedValue({ imageBuffer: Buffer.from('b'), mimeType: 'image/png' });
    const result = await generateRender('gpt_image', INPUT);
    expect(mockGptImage).toHaveBeenCalledWith({ ...INPUT, signal: expect.any(AbortSignal) });
    expect(mockNanobanana).not.toHaveBeenCalled();
    expect(result).toEqual({ imageBuffer: Buffer.from('b'), mimeType: 'image/png' });
  });
});

// Étape 3B.4: one 180 s deadline over the whole engine call.
describe('generateRender — engine deadline', () => {
  /** An engine call that never settles on its own; returns its signal once called. */
  function hangingEngine(mock: typeof mockNanobanana) {
    const seen: { signal?: AbortSignal } = {};
    mock.mockImplementation((input: { signal: AbortSignal }) => {
      seen.signal = input.signal;
      return new Promise(() => {});
    });
    return seen;
  }

  it('is 180 s', () => {
    expect(ENGINE_DEADLINE_MS).toBe(180_000);
  });

  it.each([['nanobanana' as const], ['gpt_image' as const]])(
    '%s: past 180 s, aborts the signal and throws EngineTimeoutError, even if the engine never settles',
    async (engine) => {
      vi.useFakeTimers();
      const seen = hangingEngine(engine === 'nanobanana' ? mockNanobanana : mockGptImage);
      const outcome = generateRender(engine, INPUT).catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(ENGINE_DEADLINE_MS - 1);
      expect(seen.signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      const err = await outcome;
      expect(err).toBeInstanceOf(EngineTimeoutError);
      expect(err).toMatchObject({ name: 'EngineTimeoutError', engine, deadlineMs: 180_000 });
      expect(seen.signal?.aborted).toBe(true);
      expect(seen.signal?.reason).toBe(err);
    },
  );

  it('an engine that rejects after the deadline (its own abort error) changes nothing: still EngineTimeoutError, nothing unhandled', async () => {
    vi.useFakeTimers();
    mockGptImage.mockImplementation(
      (input: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          input.signal.addEventListener('abort', () =>
            setTimeout(() => reject(new Error('Request was aborted.')), 5_000),
          );
        }),
    );
    const outcome = generateRender('gpt_image', INPUT).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(ENGINE_DEADLINE_MS);
    expect(await outcome).toBeInstanceOf(EngineTimeoutError);
    // The late rejection lands on a handled promise.
    await vi.advanceTimersByTimeAsync(5_000);
  });

  it.each([
    ['an engine error', new Error('Generation failed upstream')],
    ['an abort that is not ours', new DOMException('This operation was aborted', 'AbortError')],
  ])('lets %s before the deadline through unchanged', async (_label, err) => {
    mockNanobanana.mockRejectedValue(err);
    await expect(generateRender('nanobanana', INPUT)).rejects.toBe(err);
  });

  it('does not abort the signal of a call that succeeds in time', async () => {
    vi.useFakeTimers();
    const seen: { signal?: AbortSignal } = {};
    mockNanobanana.mockImplementation((input: { signal: AbortSignal }) => {
      seen.signal = input.signal;
      return Promise.resolve({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' });
    });
    await generateRender('nanobanana', INPUT);
    await vi.advanceTimersByTimeAsync(ENGINE_DEADLINE_MS * 2);
    expect(seen.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('isEngineConfigured', () => {
  it('is true for "nanobanana" only when GEMINI_API_KEY is set', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(isEngineConfigured('nanobanana')).toBe(false);
    vi.stubEnv('GEMINI_API_KEY', 'key');
    expect(isEngineConfigured('nanobanana')).toBe(true);
  });

  it('is true for "gpt_image" only when OPENAI_API_KEY is set', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(isEngineConfigured('gpt_image')).toBe(false);
    vi.stubEnv('OPENAI_API_KEY', 'key');
    expect(isEngineConfigured('gpt_image')).toBe(true);
  });

  it('checks each engine independently — one missing key never affects the other', () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(isEngineConfigured('nanobanana')).toBe(true);
    expect(isEngineConfigured('gpt_image')).toBe(false);
  });
});
