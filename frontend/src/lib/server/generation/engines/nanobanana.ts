// "Nanobanana" = the community nickname for Google's Gemini image models,
// accessed here via the `@google/genai` SDK. Shown in the UI as "Visio".
//
// Since 2026-10-08 the Pro image model: it takes `imageSize` (1K / 2K / 4K)
// alongside the aspect ratio, so every size and ratio the command bar offers
// is rendered for real. Should that model be unavailable to the key (it is a
// preview), the call falls back to the Flash model it replaced, and
// output-shape.ts brings that image to the size asked for.
import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type { GenerateRenderInput, GenerateRenderOutput } from './types';
import { EngineNotConfiguredError } from './types';
import { RATIOS } from '../ratios';
import { RESOLUTIONS } from '../resolutions';
import { log } from '@/lib/server/observability/log';

const PRO_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const FALLBACK_MODEL = 'gemini-2.5-flash-image';

/** An error that says the model itself cannot be used, not the request. */
function isModelUnavailable(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status === 404 || status === 403) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /not found|not supported|permission|does not have access|is not available/i.test(message);
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
    return client.models.generateContent({
      model,
      ...(Object.keys(imageConfig).length > 0 ? { config: { imageConfig } } : {}),
      contents,
    });
  }

  let response;
  try {
    response = await run(PRO_MODEL, true);
  } catch (err) {
    if (!isModelUnavailable(err)) throw err;
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
