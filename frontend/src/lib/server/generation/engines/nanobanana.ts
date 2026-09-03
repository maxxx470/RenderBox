// "Nanobanana" = the community nickname for Gemini 2.5 Flash Image, Google's
// image-generation model — accessed here via the `@google/genai` SDK.
import 'server-only';
import { GoogleGenAI } from '@google/genai';
import type { GenerateRenderInput, GenerateRenderOutput } from './types';
import { EngineNotConfiguredError } from './types';
import { RATIOS } from '../ratios';

const MODEL = 'gemini-2.5-flash-image';

export async function generateWithNanobanana(
  input: GenerateRenderInput,
): Promise<GenerateRenderOutput> {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) throw new EngineNotConfiguredError('nanobanana');

  const client = new GoogleGenAI({ apiKey });
  const referenceParts = (input.referenceImages ?? []).map((ref) => ({
    inlineData: { mimeType: ref.mimeType, data: ref.buffer.toString('base64') },
  }));

  // Only sent when a ratio was actually chosen: passing an empty imageConfig
  // is not the same as passing none, and 'auto' must leave the call byte-for-
  // byte as it was before this option existed.
  const aspectRatio = input.aspectRatio ? RATIOS[input.aspectRatio].gemini : null;

  const response = await client.models.generateContent({
    model: MODEL,
    ...(aspectRatio ? { config: { imageConfig: { aspectRatio } } } : {}),
    contents: [
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
    ],
  });

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
