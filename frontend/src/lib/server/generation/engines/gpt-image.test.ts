// Pixel IA's adapter (gpt-image.ts) against a fully mocked `openai` SDK: what
// is actually handed to `images.edit` (model, image or image array in order,
// size per ratio, nothing else), and how responses and errors come back.
// No network: the SDK is replaced, and `fetch` throws if anything tries it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RatioKey } from '../ratios';

const { mockEdit, mockOpenAI, mockToFile } = vi.hoisted(() => {
  const mockEdit = vi.fn();
  return {
    mockEdit,
    mockOpenAI: vi.fn().mockImplementation(() => ({ images: { edit: mockEdit } })),
    // Stands in for the SDK's file wrapper: keeps what it was given so the
    // test can read the bytes, the name and the type back.
    mockToFile: vi.fn(async (data: Buffer, name: string, options?: { type?: string }) => ({
      __file: true,
      data,
      name,
      type: options?.type,
    })),
  };
});

vi.mock('openai', () => ({ default: mockOpenAI, toFile: mockToFile }));

import { generateWithGptImage } from './gpt-image';
import { EngineNotConfiguredError } from './types';

interface FakeFile {
  __file: true;
  data: Buffer;
  name: string;
  type?: string;
}

const SOURCE = Buffer.from('source-bytes');
const REF_A = Buffer.from('reference-a');
const REF_B = Buffer.from('reference-b');
const PNG_OUT = Buffer.from('png-out');

const VALID_RESPONSE = { data: [{ b64_json: PNG_OUT.toString('base64') }] };

const fetchGuard = vi.fn(() => {
  throw new Error('network access is blocked in this test');
});

beforeEach(() => {
  mockEdit.mockReset();
  mockOpenAI.mockClear();
  mockToFile.mockClear();
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(() => {
  expect(fetchGuard).not.toHaveBeenCalled();
  fetchGuard.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function lastRequest() {
  return mockEdit.mock.calls[mockEdit.mock.calls.length - 1]?.[0] as Record<string, unknown>;
}

describe('generateWithGptImage — configuration', () => {
  it('throws EngineNotConfiguredError and never builds a client when OPENAI_API_KEY is absent', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(
      generateWithGptImage({ sourceImageBuffer: SOURCE, sourceMimeType: 'image/png', prompt: 'p' }),
    ).rejects.toBeInstanceOf(EngineNotConfiguredError);
    expect(mockOpenAI).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('builds the client with the key from the environment', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(mockOpenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });
});

describe('generateWithGptImage — request sent to images.edit', () => {
  it('uses gpt-image-1 and sends only model, image and prompt when no ratio is given', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'Render this building.',
    });
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const request = lastRequest();
    expect(Object.keys(request).sort()).toEqual(['image', 'model', 'prompt']);
    expect(request.model).toBe('gpt-image-1');
    expect(request.prompt).toBe('Render this building.');
  });

  it('sends the source as a single file (not an array) when there is no reference', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    const image = lastRequest().image as FakeFile;
    expect(Array.isArray(image)).toBe(false);
    expect(image.__file).toBe(true);
    expect(image.data.equals(SOURCE)).toBe(true);
    expect(image.name).toBe('source.png');
    expect(image.type).toBe('image/png');
  });

  it.each([
    ['image/png', 'source.png'],
    ['image/webp', 'source.webp'],
    ['image/jpeg', 'source.jpg'],
  ])('names a %s source %s', async (mimeType, name) => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: mimeType,
      prompt: 'p',
    });
    expect((lastRequest().image as FakeFile).name).toBe(name);
  });

  it('sends an array — the source first, then each reference in order — when references are given', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/jpeg',
      prompt: 'p',
      referenceImages: [
        { buffer: REF_A, mimeType: 'image/png' },
        { buffer: REF_B, mimeType: 'image/webp' },
      ],
    });
    const images = lastRequest().image as FakeFile[];
    expect(Array.isArray(images)).toBe(true);
    expect(images).toHaveLength(3);
    expect(images.map((f) => f.name)).toEqual([
      'source.jpg',
      'reference-0.png',
      'reference-1.webp',
    ]);
    expect(images[0]?.data.equals(SOURCE)).toBe(true);
    expect(images[1]?.data.equals(REF_A)).toBe(true);
    expect(images[2]?.data.equals(REF_B)).toBe(true);
    expect(images.map((f) => f.type)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('treats an empty reference list like no reference', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      referenceImages: [],
    });
    expect(Array.isArray(lastRequest().image)).toBe(false);
  });

  // The three sizes the edit endpoint takes; each ratio asks for the nearest
  // shape (ratios.ts) and is cropped to the exact ratio afterwards elsewhere.
  const SIZE_BY_RATIO: [Exclude<RatioKey, 'auto'>, string][] = [
    ['1:1', '1024x1024'],
    ['4:3', '1536x1024'],
    ['3:4', '1024x1536'],
    ['3:2', '1536x1024'],
    ['2:3', '1024x1536'],
    ['16:9', '1536x1024'],
    ['9:16', '1024x1536'],
    ['5:4', '1536x1024'],
    ['4:5', '1024x1536'],
    ['21:9', '1536x1024'],
  ];

  it.each(SIZE_BY_RATIO)('for ratio %s asks for size %s', async (aspectRatio, size) => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio,
    });
    expect(lastRequest().size).toBe(size);
  });

  it("sends no size for the 'auto' ratio", async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio: 'auto',
    });
    expect(lastRequest()).not.toHaveProperty('size');
  });

  it('does not pass the requested resolution to the SDK (no quality, size or other extra field)', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio: '1:1',
      resolution: '4k',
    });
    expect(Object.keys(lastRequest()).sort()).toEqual(['image', 'model', 'prompt', 'size']);
    expect(lastRequest().size).toBe('1024x1024');
  });
});

describe('generateWithGptImage — response handling', () => {
  it('decodes b64_json and always reports image/png', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    const out = await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/jpeg',
      prompt: 'p',
    });
    expect(out.mimeType).toBe('image/png');
    expect(out.imageBuffer.equals(PNG_OUT)).toBe(true);
  });

  it.each([
    ['an empty data array', { data: [] }],
    ['no data field', {}],
    ['an item without b64_json', { data: [{ url: 'https://example.invalid/x.png' }] }],
    ['an empty b64_json', { data: [{ b64_json: '' }] }],
  ])('throws "no image returned" on %s', async (_label, response) => {
    mockEdit.mockResolvedValue(response);
    await expect(
      generateWithGptImage({ sourceImageBuffer: SOURCE, sourceMimeType: 'image/png', prompt: 'p' }),
    ).rejects.toThrow('gpt_image: no image returned by OpenAI');
  });

  it('lets an SDK error through unchanged, after a single call', async () => {
    const err = Object.assign(new Error('Rate limit reached'), { status: 429 });
    mockEdit.mockRejectedValue(err);
    await expect(
      generateWithGptImage({ sourceImageBuffer: SOURCE, sourceMimeType: 'image/png', prompt: 'p' }),
    ).rejects.toBe(err);
    expect(mockEdit).toHaveBeenCalledTimes(1);
  });
});

// Complements (adapter audit): behaviours of the current code that were not
// pinned yet. Nothing here changes the adapter.
describe('generateWithGptImage — complements', () => {
  const run = (prompt = 'p') =>
    generateWithGptImage({ sourceImageBuffer: SOURCE, sourceMimeType: 'image/png', prompt });

  it('hands the prompt over byte for byte: accents, quotes and line breaks untouched', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    const prompt = 'Matériaux :\n- façade: "Enduit" blanc\n\n  Garder l’éclairage.  ';
    await run(prompt);
    expect(lastRequest().prompt).toBe(prompt);
  });

  it('wraps each image with its own bytes and MIME type', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/webp',
      prompt: 'p',
      referenceImages: [{ buffer: REF_A, mimeType: 'image/jpeg' }],
    });
    const [source, ref] = lastRequest().image as FakeFile[];
    expect(source).toMatchObject({ name: 'source.webp', type: 'image/webp' });
    expect(source?.data.equals(SOURCE)).toBe(true);
    expect(ref).toMatchObject({ name: 'reference-0.jpg', type: 'image/jpeg' });
    expect(ref?.data.equals(REF_A)).toBe(true);
  });

  it('uses only the first returned image when several come back', async () => {
    mockEdit.mockResolvedValue({
      data: [
        { b64_json: Buffer.from('first').toString('base64') },
        { b64_json: Buffer.from('second').toString('base64') },
      ],
    });
    const out = await run();
    expect(out.imageBuffer.equals(Buffer.from('first'))).toBe(true);
  });

  it.each([
    [
      'a 400 (request refused)',
      Object.assign(new Error('Your request was rejected'), { status: 400 }),
    ],
    ['a 401 (bad key)', Object.assign(new Error('Incorrect API key provided'), { status: 401 })],
    ['a 500', Object.assign(new Error('The server had an error'), { status: 500 })],
    [
      'a network error',
      Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' }),
    ],
  ])('lets %s through unchanged, after a single call', async (_label, err) => {
    mockEdit.mockRejectedValue(err);
    await expect(run()).rejects.toBe(err);
    expect(mockEdit).toHaveBeenCalledTimes(1);
  });

  it('treats an empty OPENAI_API_KEY as absent', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(run()).rejects.toBeInstanceOf(EngineNotConfiguredError);
    expect(mockEdit).not.toHaveBeenCalled();
  });
});

// Étape 3B.4: bounded SDK options, and the engine deadline holds even while
// the real SDK sleeps between retries without listening to the signal.
describe('generateWithGptImage — deadline (étape 3B.4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the SDK for a 180 s timeout, one retry at most, and hands it the signal', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    const signal = new AbortController().signal;
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      signal,
    });
    expect(mockEdit.mock.calls[0]?.[1]).toEqual({ timeout: 180_000, maxRetries: 1, signal });
  });

  it('keeps the timeout and the single retry when no signal is given', async () => {
    mockEdit.mockResolvedValue(VALID_RESPONSE);
    await generateWithGptImage({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(mockEdit.mock.calls[0]?.[1]).toEqual({ timeout: 180_000, maxRetries: 1 });
  });

  describe('with the real SDK and a fake fetch (no network)', () => {
    const errorResponse = (status: number, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify({ error: { message: 'upstream', type: 'server_error' } }), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      });

    /**
     * Makes the mocked SDK constructor build the real client on a fake fetch.
     * The SDK also calls fetch('data:') to probe FormData support before the
     * upload — not a request to OpenAI, so it is answered here and not counted.
     */
    async function useRealSdk(apiFetch: (url: string, init: RequestInit) => Promise<Response>) {
      const real = await vi.importActual<typeof import('openai')>('openai');
      const fakeFetch = (url: string | URL | Request, init?: RequestInit) =>
        String(url).startsWith('data:')
          ? Promise.resolve(new Response(''))
          : apiFetch(String(url), init ?? {});
      mockOpenAI.mockImplementationOnce(
        (opts: Record<string, unknown>) => new real.default({ ...opts, fetch: fakeFetch }),
      );
      mockToFile.mockImplementationOnce(real.toFile as never);
    }

    it('makes two requests at most: one retry after a 500, then the error', async () => {
      vi.useFakeTimers();
      const fakeFetch = vi.fn(async () => errorResponse(500));
      await useRealSdk(fakeFetch);
      const outcome = generateWithGptImage({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await outcome).toMatchObject({ status: 500 });
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });

    it('through generateRender: stops at 180 s during the SDK’s retry pause, and sends nothing more', async () => {
      vi.useFakeTimers();
      // The first answer, a 429, comes after 150 s and asks for a 60 s pause:
      // the deadline falls inside that pause, which ignores the signal.
      const fakeFetch = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const t = setTimeout(
              () => resolve(errorResponse(429, { 'retry-after': '60' })),
              150_000,
            );
            init.signal?.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new DOMException('This operation was aborted', 'AbortError'));
            });
          }),
      );
      await useRealSdk(fakeFetch);
      const { generateRender, EngineTimeoutError } = await import('./index');
      const outcome = generateRender('gpt_image', {
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }).catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(179_999);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toBeInstanceOf(EngineTimeoutError);
      // The SDK wakes from its pause, sees the abort, and does not retry.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });
  });
});
