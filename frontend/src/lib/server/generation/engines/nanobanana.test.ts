// Visio's adapter (nanobanana.ts) against a fully mocked `@google/genai`:
// what is actually handed to the SDK (model, parts in order, imageConfig),
// the fallback to the Flash model, and how responses and errors come back.
// No network: the SDK is replaced, and `fetch` throws if anything tries it.
//
// The Pro model name is read when the module loads (PRO_MODEL), so every test
// imports a fresh copy of the module after setting the environment.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGenerateContent, mockGoogleGenAI, mockWarn } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  return {
    mockGenerateContent,
    mockGoogleGenAI: vi.fn().mockImplementation(() => ({
      models: { generateContent: mockGenerateContent },
    })),
    mockWarn: vi.fn(),
  };
});

vi.mock('@google/genai', () => ({ GoogleGenAI: mockGoogleGenAI }));
// The fallback logs a warning; captured here so nothing is printed.
vi.mock('@/lib/server/observability/log', () => ({
  log: { warn: mockWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const FALLBACK_MODEL = 'gemini-2.5-flash-image';

const SOURCE = Buffer.from('source-bytes');
const REF_A = Buffer.from('reference-a');
const REF_B = Buffer.from('reference-b');

const IMAGE_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [
          { text: 'here is the render' },
          {
            inlineData: { mimeType: 'image/png', data: Buffer.from('png-out').toString('base64') },
          },
        ],
      },
    },
  ],
};

// Errors as @google/genai 1.52 builds them (throwErrorIfNotOK): an HTTP error
// becomes an ApiError whose `status` is the HTTP status and whose `message` is
// the API's JSON error body. The SDK itself is mocked above; its real ApiError
// class is used here, and "errors from the real SDK" below checks the shape
// against the real client with a stubbed fetch.
const realSdk = await vi.importActual<typeof import('@google/genai')>('@google/genai');

/** An HTTP error from the Gemini API, as the SDK throws it. */
function googleError(httpStatus: number, status: string, message: string, details?: unknown[]) {
  const error = { code: httpStatus, message, status, ...(details ? { details } : {}) };
  return new realSdk.ApiError({ message: JSON.stringify({ error }), status: httpStatus });
}

/** The answer when the API does not know the Pro model. */
const modelNotFound = () =>
  googleError(
    404,
    'NOT_FOUND',
    `models/${DEFAULT_MODEL} is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of supported models and their supported methods.`,
  );

/** A fresh copy of the adapter, so PRO_MODEL is read from the current env. */
async function loadAdapter() {
  vi.resetModules();
  return import('./nanobanana');
}

const fetchGuard = vi.fn(() => {
  throw new Error('network access is blocked in this test');
});

beforeEach(() => {
  mockGenerateContent.mockReset();
  mockGoogleGenAI.mockClear();
  mockWarn.mockReset();
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('GEMINI_IMAGE_MODEL', undefined);
  vi.stubGlobal('fetch', fetchGuard);
});

afterEach(() => {
  expect(fetchGuard).not.toHaveBeenCalled();
  fetchGuard.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('generateWithNanobanana — configuration', () => {
  it('throws EngineNotConfiguredError and never builds a client when GEMINI_API_KEY is absent', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const { generateWithNanobanana } = await loadAdapter();
    const { EngineNotConfiguredError } = await import('./types');
    await expect(
      generateWithNanobanana({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }),
    ).rejects.toBeInstanceOf(EngineNotConfiguredError);
    expect(mockGoogleGenAI).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('builds the client with the key from the environment', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('uses the Pro image model by default when GEMINI_IMAGE_MODEL is not set', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent.mock.calls[0]?.[0]).toMatchObject({ model: DEFAULT_MODEL });
  });

  it('uses the model named by GEMINI_IMAGE_MODEL when it is set', async () => {
    vi.stubEnv('GEMINI_IMAGE_MODEL', 'configured-image-model');
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(mockGenerateContent.mock.calls[0]?.[0]).toMatchObject({
      model: 'configured-image-model',
    });
  });
});

describe('generateWithNanobanana — request sent to the SDK', () => {
  it('sends one user turn: the prompt text first, then the source image, then each reference in order', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/jpeg',
      prompt: 'Render this building.',
      referenceImages: [
        { buffer: REF_A, mimeType: 'image/png' },
        { buffer: REF_B, mimeType: 'image/webp' },
      ],
    });
    const request = mockGenerateContent.mock.calls[0]?.[0] as {
      contents: { role: string; parts: unknown[] }[];
    };
    expect(request.contents).toHaveLength(1);
    expect(request.contents[0]?.role).toBe('user');
    expect(request.contents[0]?.parts).toEqual([
      { text: 'Render this building.' },
      { inlineData: { mimeType: 'image/jpeg', data: SOURCE.toString('base64') } },
      { inlineData: { mimeType: 'image/png', data: REF_A.toString('base64') } },
      { inlineData: { mimeType: 'image/webp', data: REF_B.toString('base64') } },
    ]);
  });

  it('sends only the text and the source when there is no reference', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    const request = mockGenerateContent.mock.calls[0]?.[0] as { contents: { parts: unknown[] }[] };
    expect(request.contents[0]?.parts).toEqual([
      { text: 'p' },
      { inlineData: { mimeType: 'image/png', data: SOURCE.toString('base64') } },
    ]);
  });

  it('passes the ratio and the size to imageConfig', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio: '16:9',
      resolution: '2k',
    });
    expect(mockGenerateContent.mock.calls[0]?.[0]).toMatchObject({
      config: { imageConfig: { aspectRatio: '16:9', imageSize: '2K' } },
    });
  });

  it.each([
    ['1k', '1K'],
    ['2k', '2K'],
    ['4k', '4K'],
  ] as const)('maps resolution %s to imageSize %s', async (resolution, imageSize) => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      resolution,
    });
    expect(mockGenerateContent.mock.calls[0]?.[0]).toMatchObject({
      config: { imageConfig: { imageSize } },
    });
  });

  it('sends no config at all when neither a ratio nor a size is given', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(mockGenerateContent.mock.calls[0]?.[0]).not.toHaveProperty('config');
  });

  it("treats the 'auto' ratio as no ratio: only the size goes to imageConfig", async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio: 'auto',
      resolution: '1k',
    });
    const request = mockGenerateContent.mock.calls[0]?.[0] as {
      config: { imageConfig: Record<string, unknown> };
    };
    expect(request.config.imageConfig).toEqual({ imageSize: '1K' });
  });

  it('sends only the ratio when no size is given', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio: '3:4',
    });
    const request = mockGenerateContent.mock.calls[0]?.[0] as {
      config: { imageConfig: Record<string, unknown> };
    };
    expect(request.config.imageConfig).toEqual({ aspectRatio: '3:4' });
  });
});

describe('generateWithNanobanana — fallback to the Flash model', () => {
  it('1. retries once on the Flash model, without imageSize, when the API does not find the Pro model (404 NOT_FOUND)', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(modelNotFound())
      .mockResolvedValueOnce(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    const out = await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio: '4:3',
      resolution: '4k',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[0]?.[0]).toMatchObject({
      model: DEFAULT_MODEL,
      config: { imageConfig: { aspectRatio: '4:3', imageSize: '4K' } },
    });
    const retry = mockGenerateContent.mock.calls[1]?.[0] as {
      model: string;
      config: { imageConfig: Record<string, unknown> };
      contents: unknown;
    };
    expect(retry.model).toBe(FALLBACK_MODEL);
    // The ratio is kept, the size is dropped (the Flash model does not take it).
    expect(retry.config.imageConfig).toEqual({ aspectRatio: '4:3' });
    // Same prompt and images on the retry.
    expect(retry.contents).toEqual(
      (mockGenerateContent.mock.calls[0]?.[0] as { contents: unknown }).contents,
    );
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(out.imageBuffer.equals(Buffer.from('png-out'))).toBe(true);
  });

  it('sends no config on the Flash retry when only a size had been asked for', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(modelNotFound())
      .mockResolvedValueOnce(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      resolution: '2k',
    });
    expect(mockGenerateContent.mock.calls[1]?.[0]).toMatchObject({ model: FALLBACK_MODEL });
    expect(mockGenerateContent.mock.calls[1]?.[0]).not.toHaveProperty('config');
  });

  it('does not fall back on any other error: it rethrows it after one call', async () => {
    const err = Object.assign(new Error('Internal error encountered.'), { status: 500 });
    mockGenerateContent.mockRejectedValueOnce(err);
    const { generateWithNanobanana } = await loadAdapter();
    await expect(
      generateWithNanobanana({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }),
    ).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('12. rethrows the Flash error as is when the retry fails too; the Pro error is logged once', async () => {
    const proErr = modelNotFound();
    const retryErr = googleError(
      429,
      'RESOURCE_EXHAUSTED',
      'You exceeded your current quota, please check your plan and billing details.',
    );
    mockGenerateContent.mockRejectedValueOnce(proErr).mockRejectedValueOnce(retryErr);
    const { generateWithNanobanana } = await loadAdapter();
    await expect(
      generateWithNanobanana({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }),
    ).rejects.toBe(retryErr);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith('nanobanana: Pro model unavailable, falling back', {
      model: DEFAULT_MODEL,
      err: String(proErr),
    });
  });

  it('11. falls back at most once: a Flash model that is not found either is thrown, not retried', async () => {
    const flashErr = googleError(
      404,
      'NOT_FOUND',
      `models/${FALLBACK_MODEL} is not found for API version v1beta, or is not supported for generateContent.`,
    );
    mockGenerateContent.mockRejectedValueOnce(modelNotFound()).mockRejectedValueOnce(flashErr);
    const { generateWithNanobanana } = await loadAdapter();
    await expect(
      generateWithNanobanana({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }),
    ).rejects.toBe(flashErr);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls.map((c) => (c[0] as { model: string }).model)).toEqual([
      DEFAULT_MODEL,
      FALLBACK_MODEL,
    ]);
  });

  it('12. a Flash answer without an image fails like any answer without an image', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(modelNotFound())
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] });
    const { generateWithNanobanana } = await loadAdapter();
    await expect(
      generateWithNanobanana({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }),
    ).rejects.toThrow('nanobanana: no image returned by Gemini');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});

// Étape 3B.3: only a structured "model not found" falls back. Every other
// error — whatever its wording — is thrown as is after the single Pro call.
describe('generateWithNanobanana — no fallback on any other error (étape 3B.3)', () => {
  const API_KEY_INVALID = [
    {
      '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      reason: 'API_KEY_INVALID',
      domain: 'googleapis.com',
      metadata: { service: 'generativelanguage.googleapis.com' },
    },
  ];
  const SERVICE_DISABLED = [
    {
      '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      reason: 'SERVICE_DISABLED',
      domain: 'googleapis.com',
      metadata: { service: 'generativelanguage.googleapis.com' },
    },
  ];
  const fetchFailed = (code: string) =>
    Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error(`${code} generativelanguage.googleapis.com`), { code }),
    });
  const notFoundBody = JSON.parse(modelNotFound().message) as unknown;

  it.each<[string, unknown]>([
    [
      '2. a 403 PERMISSION_DENIED saying "permission"',
      googleError(403, 'PERMISSION_DENIED', 'The caller does not have permission'),
    ],
    [
      '2. a 403 PERMISSION_DENIED: the API is disabled for the project',
      googleError(
        403,
        'PERMISSION_DENIED',
        'Generative Language API has not been used in this project before or it is disabled. Enable it, then retry.',
        SERVICE_DISABLED,
      ),
    ],
    [
      '3. a 400 FAILED_PRECONDITION saying "not supported" (user location)',
      googleError(400, 'FAILED_PRECONDITION', 'User location is not supported for the API use.'),
    ],
    [
      '3. a 400 INVALID_ARGUMENT saying "not supported" about a parameter',
      googleError(400, 'INVALID_ARGUMENT', 'imageSize 4K is not supported for this request.'),
    ],
    [
      '4. a 400 FAILED_PRECONDITION saying "is not available" (billing)',
      googleError(
        400,
        'FAILED_PRECONDITION',
        'Gemini API free tier is not available in your country. Please enable billing on your project.',
      ),
    ],
    [
      '4. a 403 saying "is not available" for the key (access refused)',
      googleError(
        403,
        'PERMISSION_DENIED',
        `Model ${DEFAULT_MODEL} is not available for this API key.`,
      ),
    ],
    [
      '4. a 400 API_KEY_INVALID (invalid key)',
      googleError(
        400,
        'INVALID_ARGUMENT',
        'API key not valid. Please pass a valid API key.',
        API_KEY_INVALID,
      ),
    ],
    [
      '5. an ambiguous 400 INVALID_ARGUMENT',
      googleError(400, 'INVALID_ARGUMENT', 'Request contains an invalid argument.'),
    ],
    [
      '6. a 401 UNAUTHENTICATED',
      googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.'),
    ],
    [
      '6. a 403 PERMISSION_DENIED (suspended consumer)',
      googleError(403, 'PERMISSION_DENIED', 'Permission denied: Consumer has been suspended.'),
    ],
    [
      '7. a 429 RESOURCE_EXHAUSTED (quota)',
      googleError(
        429,
        'RESOURCE_EXHAUSTED',
        'You exceeded your current quota, please check your plan and billing details.',
      ),
    ],
    ['8. a 500 INTERNAL', googleError(500, 'INTERNAL', 'An internal error has occurred.')],
    [
      '8. a 503 UNAVAILABLE',
      googleError(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.'),
    ],
    [
      '8. a 504 DEADLINE_EXCEEDED',
      googleError(504, 'DEADLINE_EXCEEDED', 'Deadline expired before operation could complete.'),
    ],
    ['9. a network error (DNS)', fetchFailed('ENOTFOUND')],
    ['9. a network error (connection reset)', fetchFailed('ECONNRESET')],
    ['9. an aborted request', new DOMException('This operation was aborted', 'AbortError')],
    ['10. an unrecognised error', new Error('something unexpected')],
    ['10. a thrown value that is not an Error', 'boom'],
    [
      'a 404 whose body is not NOT_FOUND (an HTML page, as the SDK wraps it)',
      new realSdk.ApiError({
        message: JSON.stringify({
          error: { message: '<html>Not Found</html>', code: 404, status: 'Not Found' },
        }),
        status: 404,
      }),
    ],
    [
      'a 404 whose message is not JSON',
      new realSdk.ApiError({ message: 'Not Found', status: 404 }),
    ],
    [
      'a NOT_FOUND body on a plain Error, not an ApiError',
      Object.assign(new Error(JSON.stringify(notFoundBody)), { status: 404 }),
    ],
    [
      'a NOT_FOUND body under another HTTP status',
      new realSdk.ApiError({ message: JSON.stringify(notFoundBody), status: 400 }),
    ],
    ['a 403 status alone (fell back before 3B.3)', Object.assign(new Error('x'), { status: 403 })],
    ['a 404 status alone (fell back before 3B.3)', Object.assign(new Error('x'), { status: 404 })],
    [
      'a "not found" message without a status (fell back before 3B.3)',
      new Error('models/x is not found for API version v1beta'),
    ],
    [
      'a "does not have access" message (fell back before 3B.3)',
      new Error('The caller does not have access'),
    ],
  ])('13. throws %s as is, after the single Pro call', async (_label, err) => {
    mockGenerateContent.mockRejectedValueOnce(err).mockResolvedValueOnce(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    await expect(
      generateWithNanobanana({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
        resolution: '4k',
      }),
    ).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent.mock.calls[0]?.[0]).toMatchObject({ model: DEFAULT_MODEL });
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

// The rule reads what the real SDK throws: the real client, with fetch stubbed
// to answer like the API (no network), builds the error that is then handed to
// the adapter.
describe('generateWithNanobanana — errors from the real SDK (étape 3B.3)', () => {
  /** Calls the real client once with a fake fetch; returns what it throws and how many requests it made. */
  async function throughRealSdk(answer: () => Promise<Response>) {
    const sdkFetch = vi.fn(answer);
    vi.stubGlobal('fetch', sdkFetch);
    try {
      await new realSdk.GoogleGenAI({ apiKey: 'test-key' }).models.generateContent({
        model: DEFAULT_MODEL,
        contents: 'p',
      });
    } catch (err) {
      return { err, requests: sdkFetch.mock.calls.length };
    } finally {
      vi.stubGlobal('fetch', fetchGuard);
    }
    throw new Error('the SDK did not throw');
  }

  const json = (status: number, body: unknown) => () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );

  async function runAdapterOn(err: unknown) {
    mockGenerateContent.mockRejectedValueOnce(err).mockResolvedValueOnce(IMAGE_RESPONSE);
    const { generateWithNanobanana } = await loadAdapter();
    return generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
  }

  it('a JSON 404 NOT_FOUND becomes ApiError { status: 404, message: the JSON body }, and falls back', async () => {
    const body = JSON.parse(modelNotFound().message) as unknown;
    const { err, requests } = await throughRealSdk(json(404, body));
    expect(requests).toBe(1);
    expect(err).toBeInstanceOf(realSdk.ApiError);
    expect(err).toMatchObject({ name: 'ApiError', status: 404 });
    expect(JSON.parse((err as Error).message)).toEqual(body);

    const out = await runAdapterOn(err);
    expect(out.imageBuffer.equals(Buffer.from('png-out'))).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('a JSON 403 PERMISSION_DENIED is made once by the SDK and thrown as is by the adapter', async () => {
    const { err, requests } = await throughRealSdk(
      json(403, {
        error: {
          code: 403,
          message: 'The caller does not have permission',
          status: 'PERMISSION_DENIED',
        },
      }),
    );
    expect(requests).toBe(1);
    expect(err).toMatchObject({ name: 'ApiError', status: 403 });
    await expect(runAdapterOn(err)).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('a non-JSON 404 is wrapped with the HTTP status text, not NOT_FOUND: no fallback', async () => {
    const { err } = await throughRealSdk(() =>
      Promise.resolve(
        new Response('<html>Not Found</html>', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    expect(err).toMatchObject({ name: 'ApiError', status: 404 });
    expect(JSON.parse((err as Error).message)).toEqual({
      error: { message: '<html>Not Found</html>', code: 404, status: 'Not Found' },
    });
    await expect(runAdapterOn(err)).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('a network error comes through the SDK unchanged, after one request: no fallback', async () => {
    const network = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    });
    const { err, requests } = await throughRealSdk(() => Promise.reject(network));
    expect(requests).toBe(1);
    expect(err).toBe(network);
    await expect(runAdapterOn(err)).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

describe('generateWithNanobanana — response handling', () => {
  it('returns the first image part, decoded, with its MIME type', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { text: 'first a sentence' },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: Buffer.from('jpg-1').toString('base64'),
                },
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: Buffer.from('png-2').toString('base64'),
                },
              },
            ],
          },
        },
      ],
    });
    const { generateWithNanobanana } = await loadAdapter();
    const out = await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.imageBuffer.equals(Buffer.from('jpg-1'))).toBe(true);
  });

  it('defaults the MIME type to image/png when the image part has none', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        { content: { parts: [{ inlineData: { data: Buffer.from('raw').toString('base64') } }] } },
      ],
    });
    const { generateWithNanobanana } = await loadAdapter();
    const out = await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    });
    expect(out.mimeType).toBe('image/png');
  });

  it.each([
    [
      'a text-only answer',
      { candidates: [{ content: { parts: [{ text: 'I cannot do that.' }] } }] },
    ],
    ['no candidates', { candidates: [] }],
    ['an empty response', {}],
    [
      'an image part without data',
      { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png' } }] } }] },
    ],
  ])('throws "no image returned" on %s', async (_label, response) => {
    mockGenerateContent.mockResolvedValue(response);
    const { generateWithNanobanana } = await loadAdapter();
    await expect(
      generateWithNanobanana({
        sourceImageBuffer: SOURCE,
        sourceMimeType: 'image/png',
        prompt: 'p',
      }),
    ).rejects.toThrow('nanobanana: no image returned by Gemini');
  });
});

// Complements (adapter audit): behaviours of the current code that were not
// pinned yet. Some of them are questionable and are recorded as they are —
// see the comments; nothing here changes the adapter.
describe('generateWithNanobanana — complements', () => {
  const run = async (prompt = 'p') => {
    const { generateWithNanobanana } = await loadAdapter();
    return generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt,
    });
  };

  it('hands the prompt over byte for byte: accents, quotes and line breaks untouched', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const prompt = 'Matériaux :\n- façade: "Enduit" blanc\n\n  Garder l’éclairage.  ';
    await run(prompt);
    const request = mockGenerateContent.mock.calls[0]?.[0] as {
      contents: { parts: { text?: string }[] }[];
    };
    expect(request.contents[0]?.parts[0]).toEqual({ text: prompt });
  });

  it('builds the client with the key only: no timeout and no retry setting of its own', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    await run();
    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
    const request = mockGenerateContent.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).not.toHaveProperty('config.httpOptions');
  });

  // Before étape 3B.3 these message-only errors fell back to Flash; they are
  // thrown as is now (the "no fallback" block above covers them in detail).
  it.each([
    ['a "permission" message', new Error('PERMISSION_DENIED: permission denied on resource')],
    [
      'a 400 whose message says "not supported"',
      Object.assign(new Error('imageSize 4K is not supported for this request'), { status: 400 }),
    ],
    ['an "is not available" message', new Error('The model is not available in your region')],
  ])('no longer falls back to Flash on %s', async (_label, err) => {
    mockGenerateContent.mockRejectedValueOnce(err).mockResolvedValueOnce(IMAGE_RESPONSE);
    await expect(run()).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'a 400 status',
      Object.assign(new Error('Request contains an invalid argument.'), { status: 400 }),
    ],
    ['a 429 status', Object.assign(new Error('Resource has been exhausted'), { status: 429 })],
    ['a 503 status', Object.assign(new Error('The model is overloaded.'), { status: 503 })],
  ])('rethrows %s unchanged, without a fallback', async (_label, err) => {
    mockGenerateContent.mockRejectedValueOnce(err);
    await expect(run()).rejects.toBe(err);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('reads only the first candidate: an image in a later candidate is not used', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        { content: { parts: [{ text: 'no image here' }] } },
        IMAGE_RESPONSE.candidates[0],
      ],
    });
    await expect(run()).rejects.toThrow('nanobanana: no image returned by Gemini');
  });

  it('keeps the image MIME type the model reports (e.g. JPEG)', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: { mimeType: 'image/jpeg', data: Buffer.from('jpg').toString('base64') },
              },
            ],
          },
        },
      ],
    });
    const out = await run();
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.imageBuffer.equals(Buffer.from('jpg'))).toBe(true);
  });

  it('treats an empty GEMINI_API_KEY as absent', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(run()).rejects.toMatchObject({ name: 'EngineNotConfiguredError' });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

// Étape 3B.4: the engine deadline's signal reaches the SDK, for the Pro call
// and the Flash fallback alike, and an abort is never taken for a missing
// model.
describe('generateWithNanobanana — deadline signal (étape 3B.4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** What the SDK does with an abortSignal: the fetch rejects with an AbortError. */
  function hangUntilAborted() {
    mockGenerateContent.mockImplementation(
      (req: { config?: { abortSignal?: AbortSignal } }) =>
        new Promise((_, reject) => {
          req.config?.abortSignal?.addEventListener('abort', () =>
            reject(new DOMException('This operation was aborted', 'AbortError')),
          );
        }),
    );
  }

  it('hands the signal to the SDK as config.abortSignal, beside imageConfig', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const signal = new AbortController().signal;
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      aspectRatio: '16:9',
      resolution: '2k',
      signal,
    });
    const request = mockGenerateContent.mock.calls[0]?.[0] as {
      config: { abortSignal: AbortSignal; imageConfig: unknown };
    };
    expect(request.config.abortSignal).toBe(signal);
    expect(request.config.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '2K' });
  });

  it('sends a config holding only the signal when no ratio and no size are asked for', async () => {
    mockGenerateContent.mockResolvedValue(IMAGE_RESPONSE);
    const signal = new AbortController().signal;
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      signal,
    });
    expect((mockGenerateContent.mock.calls[0]?.[0] as { config: unknown }).config).toEqual({
      abortSignal: signal,
    });
  });

  it('hands the same signal to the Flash fallback', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(modelNotFound())
      .mockResolvedValueOnce(IMAGE_RESPONSE);
    const signal = new AbortController().signal;
    const { generateWithNanobanana } = await loadAdapter();
    await generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      signal,
    });
    const calls = mockGenerateContent.mock.calls.map(
      (c) => c[0] as { model: string; config: { abortSignal: AbortSignal } },
    );
    expect(calls.map((c) => c.model)).toEqual([DEFAULT_MODEL, FALLBACK_MODEL]);
    expect(calls[0]?.config.abortSignal).toBe(signal);
    expect(calls[1]?.config.abortSignal).toBe(signal);
  });

  it('an aborted Pro call is thrown as is: no fallback, a single call', async () => {
    const controller = new AbortController();
    hangUntilAborted();
    const { generateWithNanobanana } = await loadAdapter();
    const outcome = generateWithNanobanana({
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
      signal: controller.signal,
    }).catch((e: unknown) => e);
    controller.abort();
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('through generateRender: a Pro call still running at 180 s ends in EngineTimeoutError, without a fallback', async () => {
    vi.useFakeTimers();
    hangUntilAborted();
    vi.resetModules();
    const { generateRender, EngineTimeoutError } = await import('./index');
    const outcome = generateRender('nanobanana', {
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(await outcome).toBeInstanceOf(EngineTimeoutError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('through generateRender: one 180 s deadline covers the Pro call and the Flash fallback together', async () => {
    vi.useFakeTimers();
    hangUntilAborted();
    mockGenerateContent.mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(modelNotFound()), 60_000)),
    );
    vi.resetModules();
    const { generateRender, EngineTimeoutError } = await import('./index');
    const outcome = generateRender('nanobanana', {
      sourceImageBuffer: SOURCE,
      sourceMimeType: 'image/png',
      prompt: 'p',
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    // 60 s spent on the Pro call: the fallback gets the 120 s left, not 180 s more.
    await vi.advanceTimersByTimeAsync(119_999);
    expect(
      (mockGenerateContent.mock.calls[1]?.[0] as { config: { abortSignal: AbortSignal } }).config
        .abortSignal.aborted,
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(EngineTimeoutError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});
