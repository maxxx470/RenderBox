// Phase 5 — basic content moderation on a user-uploaded reference image
// before it's forwarded to an external AI provider (add-element edits only).
// Uses OpenAI's omni-moderation model (supports image input) since we
// already depend on the OpenAI SDK for the gpt_image engine — reusing it
// here avoids adding a second moderation-only provider.
//
// Fails CLOSED: if OPENAI_API_KEY is absent, callers must reject the
// request rather than skip moderation silently — this guards an untrusted
// upload being forwarded to an external API unchecked.
import 'server-only';
import OpenAI from 'openai';

const MODEL = 'omni-moderation-latest';

export class ModerationNotConfiguredError extends Error {
  constructor() {
    super('Content moderation not configured (OPENAI_API_KEY missing or empty)');
    this.name = 'ModerationNotConfiguredError';
  }
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

export async function moderateImage(buffer: Buffer, mimeType: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  if (!apiKey) throw new ModerationNotConfiguredError();

  const client = new OpenAI({ apiKey });
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

  const response = await client.moderations.create({
    model: MODEL,
    input: [{ type: 'image_url', image_url: { url: dataUrl } }],
  });

  const result = response.results[0];
  if (!result) return { flagged: false, categories: [] };

  const categories = Object.entries(result.categories)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  return { flagged: result.flagged, categories };
}
