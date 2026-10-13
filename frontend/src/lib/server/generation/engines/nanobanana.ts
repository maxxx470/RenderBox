// "Nanobanana" = the community nickname for Google's Gemini image models,
// accessed here via the `@google/genai` SDK. Shown in the UI as "Visio".
//
// Since 2026-10-08 the Pro image model: it takes `imageSize` (1K / 2K / 4K)
// alongside the aspect ratio, so every size and ratio the command bar offers
// is rendered for real. Should the API not find that model (it is a preview),
// the call falls back to the Flash model it replaced, and output-shape.ts
// brings that image to the size asked for. Any other error is thrown as is.
import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type { GenerateRenderInput, GenerateRenderOutput } from './types';
import { EngineNotConfiguredError } from './types';
import { RATIOS } from '../ratios';
import { RESOLUTIONS } from '../resolutions';
import { log } from '@/lib/server/observability/log';

const PRO_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const FALLBACK_MODEL = 'gemini-2.5-flash-image';

/**
 * The API says the Pro model does not exist — the one error the Flash fallback
 * is for. Read from the SDK's ApiError (@google/genai 1.52): `status` is the
 * HTTP status and `message` the API's JSON error body,
 * `{"error":{"code":404,"message":"…","status":"NOT_FOUND"}}`. On
 * `models/{model}:generateContent` the model is the only resource that can be
 * missing, so a 404 whose body says NOT_FOUND names it. Nothing is read from
 * the wording: a key, permission, quota or billing error (400, 401, 403, 429),
 * a server error (5xx), a network error or an unreadable body is the request's
 * own error — the Flash model would only hide it — and is thrown as is.
 */
function isModelNotFound(err: unknown): boolean {
  if (!(err instanceof Error) || err.name !== 'ApiError') return false;
  if ((err as { status?: unknown }).status !== 404) return false;
  try {
    const body = JSON.parse(err.message) as { error?: { code?: unknown; status?: unknown } } | null;
    return body?.error?.code === 404 && body.error.status === 'NOT_FOUND';
  } catch {
    return false;
  }
}

export async function generateWithNanobanana(
  input: GenerateRenderInput,
): Promise<GenerateRenderOutput> {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) throw new EngineNotConfiguredError('nanobanana');

  const client = new GoogleGenAI({ apiKey });
  const referenceParts = (input.referenceImages ?? []).map((ref) => ({
    inlineData: { mimeType: ref.mimeType, data: ref.buffer.toString('base64') },
  }));
  const contents = [
    {
      role: 'user',
      parts: [
        { text: input.prompt },
        {
          inlineData: {
            mimeType: input.sourceMimeType,
            data: input.sourceImageBuffer.toString('base64'),
          },
        },
        ...referenceParts,
      ],
    },
  ];

  // 'auto' sends no ratio: the output keeps the framing the model chooses.
  const aspectRatio = input.aspectRatio ? RATIOS[input.aspectRatio].gemini : null;
  const imageSize = input.resolution ? RESOLUTIONS[input.resolution].gemini : null;

  async function run(model: string, withSize: boolean) {
    const imageConfig = {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(withSize && imageSize ? { imageSize } : {}),
    };
    // The same signal for the Pro call and the Flash fallback: one deadline
    // covers both. An abort is an AbortError, never an ApiError, so it can
    // never pass isModelNotFound.
    const config = {
      ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
      ...(input.signal ? { abortSignal: input.signal } : {}),
    };
    return client.models.generateContent({
      model,
      ...(Object.keys(config).length > 0 ? { config } : {}),
      contents,
    });
  }

  let response;
  try {
    response = await run(PRO_MODEL, true);
  } catch (err) {
    if (!isModelNotFound(err)) throw err;
    log.warn('nanobanana: Pro model unavailable, falling back', {
      model: PRO_MODEL,
      err: String(err),
    });
    response = await run(FALLBACK_MODEL, false);
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error('nanobanana: no image returned by Gemini');
  }

  return {
    imageBuffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    mimeType: imagePart.inlineData.mimeType ?? 'image/png',
  };
}
