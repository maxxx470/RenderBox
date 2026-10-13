import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  creditErrorKey,
  RequestError,
  readErrorCode,
  isGenerationTimeout,
  isMaterialsUnavailable,
  isServiceNotConfigured,
} from './request-error';

const json = (body: unknown, status = 503) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('readErrorCode', () => {
  it('prefers `error`, falls back to `code`, else empty', async () => {
    expect(await readErrorCode(json({ error: 'QUOTA_EXCEEDED', code: 'X' }))).toBe(
      'QUOTA_EXCEEDED',
    );
    expect(await readErrorCode(json({ code: 'STORAGE_NOT_CONFIGURED' }))).toBe(
      'STORAGE_NOT_CONFIGURED',
    );
    expect(await readErrorCode(new Response('not json', { status: 500 }))).toBe('');
  });
});

describe('isServiceNotConfigured', () => {
  it('recognises the not-configured codes from raw fetch and from ApiError.body.code', () => {
    expect(isServiceNotConfigured(new RequestError('STORAGE_NOT_CONFIGURED'))).toBe(true);
    expect(
      isServiceNotConfigured(new ApiError(503, 'x', { code: 'AI_ENGINE_NOT_CONFIGURED' })),
    ).toBe(true);
  });

  it('is false for transient or quota failures', () => {
    expect(isServiceNotConfigured(new RequestError('UPLOAD_FAILED'))).toBe(false);
    expect(isServiceNotConfigured(new ApiError(402, 'x', { error: 'QUOTA_EXCEEDED' }))).toBe(false);
    expect(isServiceNotConfigured(new Error('boom'))).toBe(false);
  });
});

// Étape 3B.5: the routes' 504 GENERATION_TIMEOUT gets its own message.
describe('isGenerationTimeout', () => {
  it('recognises GENERATION_TIMEOUT from raw fetch (edit, enhance)', async () => {
    const code = await readErrorCode(
      json({ code: 'GENERATION_TIMEOUT', message: 'Generation timed out' }, 504),
    );
    expect(isGenerationTimeout(new RequestError(code))).toBe(true);
  });

  it('recognises GENERATION_TIMEOUT from ApiError.body.code (generate, through api())', () => {
    const err = new ApiError(504, 'Error 504', {
      code: 'GENERATION_TIMEOUT',
      message: 'Generation timed out',
    });
    expect(err.code).toBe('');
    expect(isGenerationTimeout(err)).toBe(true);
  });

  it('is false for a 502, whichever way it arrives', () => {
    expect(isGenerationTimeout(new RequestError('GENERATION_FAILED'))).toBe(false);
    expect(isGenerationTimeout(new ApiError(502, 'Error 502', { code: 'GENERATION_FAILED' }))).toBe(
      false,
    );
  });

  it('is false for a 504 without an identifiable JSON code (e.g. the platform’s own page)', async () => {
    const code = await readErrorCode(new Response('<html>Gateway Timeout</html>', { status: 504 }));
    expect(isGenerationTimeout(new RequestError(code))).toBe(false);
    expect(
      isGenerationTimeout(new ApiError(504, 'The server is temporarily unavailable', {})),
    ).toBe(false);
  });

  it('is false for other errors, other codes and near misses', () => {
    expect(isGenerationTimeout(new Error('GENERATION_TIMEOUT'))).toBe(false);
    expect(isGenerationTimeout(new RequestError('QUOTA_EXCEEDED'))).toBe(false);
    expect(isGenerationTimeout(new RequestError('generation_timeout'))).toBe(false);
    expect(isGenerationTimeout(new ApiError(504, 'x', { error: 'GENERATION_TIMEOUT' }))).toBe(
      false,
    );
    expect(isGenerationTimeout(undefined)).toBe(false);
  });
});

describe('isMaterialsUnavailable (étape 3C.4)', () => {
  it('recognises MATERIALS_UNAVAILABLE from raw fetch (edit) and from api() (generate)', async () => {
    const code = await readErrorCode(
      json({ error: 'MATERIALS_UNAVAILABLE', message: 'Materials are unavailable, try again' }),
    );
    expect(isMaterialsUnavailable(new RequestError(code))).toBe(true);
    expect(
      isMaterialsUnavailable(
        new ApiError(503, 'MATERIALS_UNAVAILABLE', {
          error: 'MATERIALS_UNAVAILABLE',
          message: 'Materials are unavailable, try again',
        }),
      ),
    ).toBe(true);
  });

  it('is told apart from a timeout and from a service not configured', () => {
    const materials = new ApiError(503, 'x', { error: 'MATERIALS_UNAVAILABLE' });
    expect(isGenerationTimeout(materials)).toBe(false);
    expect(isServiceNotConfigured(materials)).toBe(false);
    expect(isMaterialsUnavailable(new ApiError(504, 'x', { code: 'GENERATION_TIMEOUT' }))).toBe(
      false,
    );
    expect(isMaterialsUnavailable(new RequestError('AI_ENGINE_NOT_CONFIGURED'))).toBe(false);
    expect(isMaterialsUnavailable(new Error('MATERIALS_UNAVAILABLE'))).toBe(false);
  });
});

describe('creditErrorKey', () => {
  it('names the credit refusals, from either error type, and nothing else', () => {
    expect(creditErrorKey(new RequestError('INSUFFICIENT_CREDITS'))).toBe(
      'app.insufficientCreditsError',
    );
    expect(creditErrorKey(new ApiError(402, 'x', { error: 'INSUFFICIENT_CREDITS' }))).toBe(
      'app.insufficientCreditsError',
    );
    expect(creditErrorKey(new RequestError('NO_ACTIVE_TIER'))).toBe('app.noActiveTierError');
    expect(creditErrorKey(new RequestError('TIER_EXPIRED'))).toBe('app.noActiveTierError');
    expect(creditErrorKey(new RequestError('GENERATION_FAILED'))).toBeNull();
    expect(creditErrorKey(new Error('x'))).toBeNull();
  });
});
