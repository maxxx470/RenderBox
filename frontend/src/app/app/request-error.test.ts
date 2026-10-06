import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
import { RequestError, readErrorCode, isServiceNotConfigured } from './request-error';

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
