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
  const body = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
  if (typeof body.error === 'string') return body.error;
  if (typeof body.code === 'string') return body.code;
  return '';
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
