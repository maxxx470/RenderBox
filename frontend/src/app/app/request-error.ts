import type { PlansDetail } from './PlansDialog';
// Error codes for the raw-fetch (FormData) calls — upload and edit — which
// bypass the api() wrapper and so never get an ApiError.
//
// Most routes put their stable code under `error` (what ApiError.code reads),
// but the "not configured" 503s put it under `code`. Reading both means the UI
// can tell "this server has no storage / AI key" — which no retry will fix —
// apart from a transient failure worth retrying.
import { ApiError } from '@/lib/api';

const NOT_CONFIGURED = new Set([
  'STORAGE_NOT_CONFIGURED',
  'AI_ENGINE_NOT_CONFIGURED',
  'MODERATION_NOT_CONFIGURED',
]);

export class RequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function readErrorCode(res: Response): Promise<string> {
  // Vercel's own refusal of a body over 4.5 MB, before the route runs.
  if (res.status === 413) return 'FILE_TOO_LARGE';
  const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
  if (typeof body.error === 'string') return body.error;
  if (typeof body.code === 'string') return body.code;
  return res.ok ? '' : `HTTP_${res.status}`;
}

/**
 * A short code for a failure, shown after the generic message (2026-10-17:
 * the « création rapide a échoué » left no trace to read). Never a secret:
 * a server code, an HTTP status or the error's type.
 */
export function errorCodeOf(err: unknown): string {
  if (err instanceof RequestError) return err.code;
  if (err instanceof ApiError) {
    const body = typeof err.body.code === 'string' ? err.body.code : '';
    return err.code || body || (err.status ? `HTTP_${err.status}` : 'NETWORK');
  }
  return err instanceof Error ? err.name : '';
}

/**
 * True when a generation ran out of time (the 504 GENERATION_TIMEOUT of the
 * generate / edit / enhance routes). Only that exact code counts: a 502, or
 * a 504 without it (e.g. the platform's own page), stays a general failure.
 */
export function isGenerationTimeout(err: unknown): boolean {
  if (err instanceof RequestError) return err.code === 'GENERATION_TIMEOUT';
  if (err instanceof ApiError) return err.body.code === 'GENERATION_TIMEOUT';
  return false;
}

/**
 * True when a generation or an edit stopped because the source image's
 * materials could not be read (503 MATERIALS_UNAVAILABLE, étapes 3C.3 and
 * 3C.3-R2): the engine was not called and nothing was counted. Distinct from
 * a timeout and from a service that is not configured.
 */
export function isMaterialsUnavailable(err: unknown): boolean {
  if (err instanceof RequestError) return err.code === 'MATERIALS_UNAVAILABLE';
  if (err instanceof ApiError) return err.code === 'MATERIALS_UNAVAILABLE';
  return false;
}

/** True when the failure is a missing server-side provider, not a flake. */
export function isServiceNotConfigured(err: unknown): boolean {
  if (err instanceof RequestError) return NOT_CONFIGURED.has(err.code);
  if (err instanceof ApiError) {
    return NOT_CONFIGURED.has(err.code) || NOT_CONFIGURED.has(String(err.body.code ?? ''));
  }
  return false;
}

/**
 * Which message a not-configured failure gets: a reference image that could
 * not be moderated (no OPENAI_API_KEY) is not a missing storage or engine.
 */
export function notConfiguredKey(
  err: unknown,
): 'app.moderationNotConfigured' | 'app.serviceNotConfigured' {
  const code =
    err instanceof RequestError
      ? err.code
      : err instanceof ApiError
        ? err.code || String(err.body.code ?? '')
        : '';
  return code === 'MODERATION_NOT_CONFIGURED'
    ? 'app.moderationNotConfigured'
    : 'app.serviceNotConfigured';
}

/**
 * The message for a generation the credits refused (generate / edit /
 * enhance: 403 NO_ACTIVE_TIER or TIER_EXPIRED, 402 INSUFFICIENT_CREDITS), or
 * null for any other failure. The caller shows it with a button to the
 * Abonnement page (`app.creditsCta` → /app/tarifs).
 */
export function creditErrorKey(
  err: unknown,
): 'app.noActiveTierError' | 'app.insufficientCreditsError' | null {
  const code = err instanceof RequestError || err instanceof ApiError ? err.code : '';
  if (code === 'NO_ACTIVE_TIER' || code === 'TIER_EXPIRED') return 'app.noActiveTierError';
  if (code === 'INSUFFICIENT_CREDITS') return 'app.insufficientCreditsError';
  return null;
}

/** The cost and the balance a credit refusal carries (402 INSUFFICIENT_CREDITS
 *  answers both), for the plans dialog's « Coût : X crédits » line. */
export function creditDetailOf(err: unknown): PlansDetail | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const { cost, balance } = err.body as { cost?: unknown; balance?: unknown };
  if (typeof cost !== 'number') return undefined;
  return { cost, balance: typeof balance === 'number' ? balance : null };
}

/** The same refusal, as the reason the plans dialog opens with (owner,
 *  2026-10-15: a refused render opens « Choisissez une formule »). */
export function plansReasonFor(err: unknown): 'noTier' | 'noCredits' | null {
  const key = creditErrorKey(err);
  return key === 'app.noActiveTierError'
    ? 'noTier'
    : key === 'app.insufficientCreditsError'
      ? 'noCredits'
      : null;
}
