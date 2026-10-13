// Claude Vision material detection — returns a strictly-validated list of
// { face, valeur, confidence }. Never trusts the model's raw output: parsed
// as JSON and checked against a zod schema.
//
// Two entry points over the same request:
//   - detectMaterialsDetailed (per-image detection, Phase 7): never throws,
//     and tells apart a valid answer (possibly an empty list: the model says
//     it found nothing), an answer that is unreadable or off-contract, a
//     missing key, and a provider error or timeout (fixed codes only). It
//     runs under a hard deadline that covers the SDK's own retries.
//   - detectMaterials (the project-level flow, detect-and-merge.ts): its
//     historical contract is kept — an unreadable answer is [], a missing key
//     throws VisionNotConfiguredError, a provider error is thrown as is; an
//     optional deadline throws VisionTimeoutError once it is up.
//
// Logs never carry the model's text, the image or the key: only reasons,
// lengths and counts.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { log } from '@/lib/server/observability/log';
import { withDeadline } from '@/lib/server/deadline';

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

/** detectMaterials gave up waiting after its deadline (the provider may still finish). */
export class VisionTimeoutError extends Error {
  constructor(public readonly deadlineMs: number) {
    super(`Claude Vision did not answer within ${deadlineMs / 1000} s`);
    this.name = 'VisionTimeoutError';
  }
}

/** Why an answer was not usable. */
export type VisionInvalidReason = 'no_text_block' | 'not_json' | 'unexpected_shape';

/** A provider failure, reduced to a fixed code (never its message). */
export type VisionErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'auth'
  | 'unavailable'
  | 'rejected'
  | 'unknown';

export type VisionDetectionResult =
  /** A valid answer. An empty list means the model found no material. */
  | { kind: 'materials'; materials: DetectedMaterial[] }
  /** The model answered, but not in the expected format. Not "nothing found". */
  | { kind: 'invalid_response'; reason: VisionInvalidReason }
  | { kind: 'not_configured' }
  | { kind: 'error'; code: VisionErrorCode };

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const PROMPT = `Analyse cette photo de bâtiment (architecture). Identifie les matériaux visibles par face/élément (ex: "facade_principale", "facade_arriere", "toiture", "menuiseries", "sol"). Réponds UNIQUEMENT avec un tableau JSON strict, sans texte autour, au format exact :
[{"face": "facade_principale", "valeur": "Enduit blanc taloché", "confidence": 94}, ...]
"confidence" est un entier de 0 à 100 représentant ta certitude sur cette détection. N'invente pas de face que tu ne peux pas voir clairement.`;

type ParsedAnswer = Exclude<VisionDetectionResult, { kind: 'not_configured' } | { kind: 'error' }>;

/**
 * One request to the model, and the reading of its answer. Throws
 * VisionNotConfiguredError when the key is missing and lets provider errors
 * through; the two public functions decide what to do with them.
 */
async function requestDetection(
  imageBuffer: Buffer,
  mimeType: string,
  requestOptions?: { signal: AbortSignal; timeout: number },
): Promise<ParsedAnswer> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) throw new VisionNotConfiguredError();

  const client = new Anthropic({ apiKey });

  const mediaType =
    mimeType === 'image/png'
      ? 'image/png'
      : mimeType === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';

  const response = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBuffer.toString('base64'),
              },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    },
    requestOptions,
  );

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    log.warn('detectMaterials: no text block in Claude response');
    return { kind: 'invalid_response', reason: 'no_text_block' };
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
    log.warn('detectMaterials: response was not valid JSON', { length: raw.length });
    return { kind: 'invalid_response', reason: 'not_json' };
  }

  const parsed = DetectionResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    log.warn('detectMaterials: response JSON did not match expected shape', {
      issueCount: parsed.error.issues.length,
    });
    return { kind: 'invalid_response', reason: 'unexpected_shape' };
  }

  return { kind: 'materials', materials: parsed.data };
}

/** A fixed code for a provider failure; `deadlineHit` = our own deadline fired. */
export function classifyVisionError(err: unknown, deadlineHit = false): VisionErrorCode {
  const name = err instanceof Error ? err.name : '';
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status: unknown }).status
      : undefined;
  if (deadlineHit || /timeout/i.test(name)) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (typeof status === 'number' && status >= 500) return 'unavailable';
  if (/connection/i.test(name)) return 'unavailable';
  if (typeof status === 'number' && status >= 400) return 'rejected';
  return 'unknown';
}

/**
 * Per-image detection. Never throws. `deadlineMs` bounds the whole call,
 * the SDK's automatic retries included: past it the request is aborted and
 * the result is { kind: 'error', code: 'timeout' }.
 */
export async function detectMaterialsDetailed(
  imageBuffer: Buffer,
  mimeType: string,
  options: { deadlineMs: number },
): Promise<VisionDetectionResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { kind: 'not_configured' };
  const deadlineMs = Math.max(1, Math.floor(options.deadlineMs));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  try {
    return await requestDetection(imageBuffer, mimeType, {
      signal: controller.signal,
      timeout: deadlineMs,
    });
  } catch (err) {
    if (err instanceof VisionNotConfiguredError) return { kind: 'not_configured' };
    const code = classifyVisionError(err, controller.signal.aborted);
    log.warn('detectMaterialsDetailed: provider error', { code });
    return { kind: 'error', code };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Project-level flow (historical contract). Returns [] (never throws for a
 * bad model response) when Claude's output can't be parsed as the expected
 * JSON shape — logged, not fatal. Throws VisionNotConfiguredError only when
 * the API key itself is missing, so callers can distinguish "not configured"
 * (skip silently) from "model returned garbage" (also skip, but worth a log
 * line for triage). Provider errors are thrown as before.
 *
 * With `deadlineMs`, the call — the SDK's retries included — is bounded:
 * past it the request is aborted, the wait stops and VisionTimeoutError is
 * thrown. Without it, the call is unbounded, as it always was.
 */
export async function detectMaterials(
  imageBuffer: Buffer,
  mimeType: string,
  options?: { deadlineMs: number },
): Promise<DetectedMaterial[]> {
  const answer = options
    ? await withDeadline(
        Math.max(1, Math.floor(options.deadlineMs)),
        (signal) =>
          requestDetection(imageBuffer, mimeType, { signal, timeout: options.deadlineMs }),
        () => new VisionTimeoutError(options.deadlineMs),
      )
    : await requestDetection(imageBuffer, mimeType);
  return answer.kind === 'materials' ? answer.materials : [];
}
