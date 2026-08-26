// Claude Vision material detection — runs against a freshly generated
// render and returns a strictly-validated list of { face, valeur,
// confidence }. Never trusts the model's raw output: parsed as JSON and
// checked against a zod schema; a malformed response is logged and treated
// as "nothing detected" rather than thrown, so a bad detection never breaks
// the generation flow that triggered it (see detect-and-merge.ts).
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { log } from '@/lib/server/observability/log';

const DetectedMaterialSchema = z.object({
  face: z.string().min(1),
  valeur: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
});

const DetectionResponseSchema = z.array(DetectedMaterialSchema);

export type DetectedMaterial = z.infer<typeof DetectedMaterialSchema>;

export class VisionNotConfiguredError extends Error {
  constructor() {
    super('Claude Vision not configured (ANTHROPIC_API_KEY missing or empty)');
    this.name = 'VisionNotConfiguredError';
  }
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const PROMPT = `Analyse cette photo de bâtiment (architecture). Identifie les matériaux visibles par face/élément (ex: "facade_principale", "facade_arriere", "toiture", "menuiseries", "sol"). Réponds UNIQUEMENT avec un tableau JSON strict, sans texte autour, au format exact :
[{"face": "facade_principale", "valeur": "Enduit blanc taloché", "confidence": 94}, ...]
"confidence" est un entier de 0 à 100 représentant ta certitude sur cette détection. N'invente pas de face que tu ne peux pas voir clairement.`;

/**
 * Returns [] (never throws for a bad model response) when Claude's output
 * can't be parsed as the expected JSON shape — logged, not fatal. Throws
 * VisionNotConfiguredError only when the API key itself is missing, so
 * callers can distinguish "not configured" (skip silently) from "model
 * returned garbage" (also skip, but worth a log line for triage).
 */
export async function detectMaterials(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<DetectedMaterial[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) throw new VisionNotConfiguredError();

  const client = new Anthropic({ apiKey });

  const mediaType =
    mimeType === 'image/png'
      ? 'image/png'
      : mimeType === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') },
          },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    log.warn('detectMaterials: no text block in Claude response');
    return [];
  }

  // Strip a possible markdown code fence — models sometimes wrap JSON in
  // ```json ... ``` despite being asked not to.
  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/```$/, '');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    log.warn('detectMaterials: response was not valid JSON', { preview: raw.slice(0, 200) });
    return [];
  }

  const parsed = DetectionResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    log.warn('detectMaterials: response JSON did not match expected shape', {
      issues: parsed.error.issues,
    });
    return [];
  }

  return parsed.data;
}
