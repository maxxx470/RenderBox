// One call to Claude for the analysis pipeline (2026-10-22): through Kie with
// the renders' own KIE_API_KEY (owner, 2026-10-19: « c'est Kie qui gère ça »),
// else directly with ANTHROPIC_API_KEY. Each attempt is cut at its deadline;
// a failed or late attempt is tried once more, then the caller stops — no
// render runs on a missing analysis (specification, step 3). Logs carry
// reasons, statuses and token counts, never the image, the text or a key.
import 'server-only';
import sharp from 'sharp';
import { log } from '@/lib/server/observability/log';

/** The analysis models (specification: Sonnet for the analysis; Haiku « à
 *  tester » for the sections and the follow-up images — Sonnet until then). */
export const ANALYSIS_MODEL = () =>
  process.env.KIE_ANALYSIS_MODEL || process.env.ANTHROPIC_ANALYSIS_MODEL || 'claude-sonnet-5-5';
export const WRITER_MODEL = () =>
  process.env.KIE_WRITER_MODEL || process.env.ANTHROPIC_WRITER_MODEL || 'claude-sonnet-5-5';

/** The image is sent no larger than this (specification: « pas de 4K »). */
const SEND_EDGE = 1280;

export interface ClaudeUsage {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ClaudeCall =
  | { ok: true; text: string; usage: ClaudeUsage }
  | { ok: false; reason: 'not_configured' | 'timeout' | 'failed'; status?: number };

export function analysisConfigured(): boolean {
  return Boolean(process.env.KIE_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** The picture as a JPEG no larger than SEND_EDGE, base64. */
export async function imageForClaude(buffer: Buffer): Promise<string> {
  const out = await sharp(buffer)
    .rotate()
    .resize(SEND_EDGE, SEND_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return out.toString('base64');
}

type Content =
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
  | { type: 'text'; text: string };

async function once(
  input: { model: string; maxTokens: number; image?: string; text: string },
  timeoutMs: number,
): Promise<ClaudeCall> {
  const kieKey = process.env.KIE_API_KEY ?? '';
  const claudeKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!kieKey && !claudeKey) return { ok: false, reason: 'not_configured' };

  const content: Content[] = [];
  if (input.image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: input.image },
    });
  }
  content.push({ type: 'text', text: input.text });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      kieKey ? 'https://api.kie.ai/claude/v1/messages' : 'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        signal: controller.signal,
        headers: kieKey
          ? { 'content-type': 'application/json', authorization: `Bearer ${kieKey}` }
          : {
              'content-type': 'application/json',
              'x-api-key': claudeKey,
              'anthropic-version': '2023-06-01',
            },
        body: JSON.stringify({
          model: input.model,
          max_tokens: input.maxTokens,
          stream: false,
          messages: [{ role: 'user', content }],
        }),
      },
    );
    if (!res.ok) return { ok: false, reason: 'failed', status: res.status };
    const body = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      code?: number;
      error?: unknown;
    };
    // Kie's own errors can come back as 200 with a `code` (402 no credits…).
    if (!body.content) {
      return {
        ok: false,
        reason: 'failed',
        ...(typeof body.code === 'number' ? { status: body.code } : {}),
      };
    }
    const text = body.content.find((b) => b.type === 'text')?.text ?? '';
    return {
      ok: true,
      text,
      usage: {
        model: input.model,
        inputTokens: body.usage?.input_tokens ?? null,
        outputTokens: body.usage?.output_tokens ?? null,
      },
    };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks Claude, with one more try when the first attempt fails or is late
 * (specification: « un seul nouvel essai automatique »). `accept` decides
 * whether an answer is usable; an unusable one is tried again too.
 */
export async function askClaude<T>(
  input: { model: string; maxTokens: number; image?: string; text: string; label: string },
  timeoutMs: number,
  accept: (text: string) => T | null,
): Promise<{ ok: true; value: T; usage: ClaudeUsage } | { ok: false; reason: string }> {
  let last = 'failed';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const call = await once(input, timeoutMs);
    if (!call.ok) {
      log.warn('analysis: claude call failed', {
        label: input.label,
        attempt,
        reason: call.reason,
        status: call.status,
      });
      if (call.reason === 'not_configured') return { ok: false, reason: 'not_configured' };
      last = call.reason;
      continue;
    }
    const value = accept(call.text);
    log.info('analysis: claude call', {
      label: input.label,
      attempt,
      model: call.usage.model,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      usable: value !== null,
    });
    if (value !== null) return { ok: true, value, usage: call.usage };
    last = 'invalid';
  }
  return { ok: false, reason: last };
}

/** The JSON object in Claude's text — fences or a sentence around it — or null. */
export function parseJsonObject(text: string): unknown {
  let raw = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  if (!raw.startsWith('{')) {
    const open = raw.indexOf('{');
    const close = raw.lastIndexOf('}');
    if (open === -1 || close <= open) return null;
    raw = raw.slice(open, close + 1);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
