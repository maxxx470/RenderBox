// Phase 4 — second generation engine: OpenAI's `gpt-image-1` via the
// Images "edit" endpoint (image + prompt in, edited image out — the closest
// OpenAI equivalent to Gemini's image-to-image call used by nanobanana.ts).
import 'server-only';
import OpenAI, { toFile } from 'openai';
import type { GenerateRenderInput, GenerateRenderOutput } from './types';
import { EngineNotConfiguredError } from './types';
import { RATIOS } from '../ratios';

const MODEL = 'gpt-image-1';

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export async function generateWithGptImage(
  input: GenerateRenderInput,
): Promise<GenerateRenderOutput> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) throw new EngineNotConfiguredError('gpt_image');

  const client = new OpenAI({ apiKey });
  const file = await toFile(
    input.sourceImageBuffer,
    `source.${extensionFor(input.sourceMimeType)}`,
    {
      type: input.sourceMimeType,
    },
  );

  const referenceFiles = await Promise.all(
    (input.referenceImages ?? []).map((ref, i) =>
      toFile(ref.buffer, `reference-${i}.${extensionFor(ref.mimeType)}`, { type: ref.mimeType }),
    ),
  );

  // gpt-image-1 takes a pixel size, not a ratio. Omitted for 'auto' (and for
  // any ratio this engine cannot produce — the route refuses those before we
  // get here, so reaching this with null means 'auto').
  const size = input.aspectRatio ? RATIOS[input.aspectRatio].openai : null;

  const response = await client.images.edit({
    model: MODEL,
    image: referenceFiles.length > 0 ? [file, ...referenceFiles] : file,
    prompt: input.prompt,
    ...(size ? { size } : {}),
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('gpt_image: no image returned by OpenAI');
  }

  // GPT image models always return PNG for edits (no url/format option).
  return { imageBuffer: Buffer.from(b64, 'base64'), mimeType: 'image/png' };
}
