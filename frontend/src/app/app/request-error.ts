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

/** True when the failure is a missing server-side provider, not a flake. */
export function isServiceNotConfigured(err: unknown): boolean {
  if (err instanceof RequestError) return NOT_CONFIGURED.has(err.code);
  if (err instanceof ApiError) {
    return NOT_CONFIGURED.has(err.code) || NOT_CONFIGURED.has(String(err.body.code ?? ''));
  }
  return false;
}
