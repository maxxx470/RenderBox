// Reads a render against its source and says which colour of the source became
// which material in the render — the lines of the image's materials sheet
// (2026-10-19, owner: « le site doit être capable de savoir quel matériau a
// été appliqué à cette couleur »).
//
// One request with two images (the source first, the render second) to a
// vision model, answered as a strict JSON array and checked with zod; the
// answer is never trusted raw. Claude when ANTHROPIC_API_KEY is set, else
// OpenAI's vision when OPENAI_API_KEY is (the owner asked whether the GPT
// image API could do it: it can). Neither key: not_configured, and the sheet
// says its analysis is unavailable. Never throws; logs carry reasons and
// counts, never the images, the model's text or a key.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { z } from 'zod';
import { log } from '@/lib/server/observability/log';
import { MAX_SHEET_FIELD, MAX_SHEET_LINES, type SheetLine } from '@/lib/render-sheet';

export type SheetAnalysis =
  | { kind: 'lines'; lines: SheetLine[] }
  | { kind: 'not_configured' }
  | { kind: 'invalid_response' }
  | { kind: 'error'; code: 'timeout' | 'rate_limited' | 'auth' | 'unavailable' | 'unknown' };

/** The whole call, retries included, is cut at this. */
export const SHEET_DEADLINE_MS = 60_000;
/** Both pictures are sent no larger than this: enough to read a colour. */
const SEND_EDGE = 1280;

const LinesSchema = z
  .array(
    z.object({
      color: z.string().trim().min(1).max(MAX_SHEET_FIELD),
      material: z.string().trim().min(1).max(MAX_SHEET_FIELD),
    }),
  )
  .max(MAX_SHEET_LINES);

const promptFor = (locale: 'fr' | 'en') =>
  `You compare two images of the same building. The FIRST image is the SOURCE (a sketch, a 3D view or a photo); the SECOND is its RENDER. For each main colour or zone of the SOURCE, say which material the RENDER shows on that same area.
Answer ONLY with a strict JSON array, no text around it, in this exact format:
[{"color": "...", "material": "..."}]
Rules: at most 10 lines; "color" names the colour of the SOURCE and where it is (for example "dark red-brown of the boundary walls"); "material" names the material the RENDER shows there with its finish (for example "red brick, recessed joints"); write both in ${
    locale === 'fr' ? 'French' : 'English'
  }; list only what is clearly visible, never invent a part; skip the sky.`;

/** The array in the model's text, fences and all, or null when unusable. */
export function parseSheetLines(text: string): SheetLine[] | null {
  const raw = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = LinesSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

async function shrink(buffer: Buffer): Promise<string> {
  const out = await sharp(buffer)
    .rotate()
    .resize(SEND_EDGE, SEND_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return out.toString('base64');
}

function classify(
  err: unknown,
  aborted: boolean,
): Extract<SheetAnalysis, { kind: 'error' }>['code'] {
  if (aborted) return 'timeout';
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status: unknown }).status
      : undefined;
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (typeof status === 'number' && status >= 500) return 'unavailable';
  if (err instanceof Error && /connection|network|fetch/i.test(err.name + err.message)) {
    return 'unavailable';
  }
  return 'unknown';
}

async function askClaude(
  apiKey: string,
  prompt: string,
  images: [string, string],
  signal: AbortSignal,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create(
    {
      model: process.env.ANTHROPIC_SHEET_MODEL || 'claude-sonnet-5-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((data) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
            })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    },
    { signal, timeout: SHEET_DEADLINE_MS },
  );
  const block = response.content.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

async function askOpenAI(
  apiKey: string,
  prompt: string,
  images: [string, string],
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...images.map((data) => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${data}` },
            })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw Object.assign(new Error('openai vision'), { status: res.status });
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? '';
}

export async function analyzeRenderSheet(input: {
  source: Buffer;
  render: Buffer;
  locale: 'fr' | 'en';
}): Promise<SheetAnalysis> {
  const claudeKey = process.env.ANTHROPIC_API_KEY ?? '';
  const openaiKey = process.env.OPENAI_API_KEY ?? '';
  if (!claudeKey && !openaiKey) return { kind: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_DEADLINE_MS);
  try {
    const images: [string, string] = [await shrink(input.source), await shrink(input.render)];
    const prompt = promptFor(input.locale);
    const text = claudeKey
      ? await askClaude(claudeKey, prompt, images, controller.signal)
      : await askOpenAI(openaiKey, prompt, images, controller.signal);
    const lines = parseSheetLines(text);
    if (!lines) {
      log.warn('analyzeRenderSheet: unusable answer', { length: text.length });
      return { kind: 'invalid_response' };
    }
    return { kind: 'lines', lines };
  } catch (err) {
    const code = classify(err, controller.signal.aborted);
    log.warn('analyzeRenderSheet: provider error', { code });
    return { kind: 'error', code };
  } finally {
    clearTimeout(timer);
  }
}
