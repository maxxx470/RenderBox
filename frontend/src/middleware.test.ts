import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(path: string, cookieHeader?: string): NextRequest {
  return cookieHeader
    ? new NextRequest(`http://localhost${path}`, { headers: { cookie: cookieHeader } })
    : new NextRequest(`http://localhost${path}`);
}

describe('middleware — AUTH_DISABLED CSRF cookie mint', () => {
  it('does not set a csrf cookie when AUTH_DISABLED is unset', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    const res = middleware(req('/app'));
    expect(res.cookies.get('app-csrf')).toBeUndefined();
  });

  it('sets a csrf cookie on the response when AUTH_DISABLED=true and none is present yet', () => {
    vi.stubEnv('AUTH_DISABLED', 'true');
    const res = middleware(req('/app'));
    const cookie = res.cookies.get('app-csrf');
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBeFalsy();
  });

  it('does not re-mint when the browser already carries a csrf cookie', () => {
    vi.stubEnv('AUTH_DISABLED', 'true');
    const res = middleware(req('/app', 'app-csrf=existing-token'));
    expect(res.cookies.get('app-csrf')).toBeUndefined();
  });

  it('is a no-op (no redirect, no forced cookie) on the landing page — AUTH_PROTECTED_PREFIXES is empty by default', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    const res = middleware(req('/'));
    expect(res.status).toBe(200);
  });
});
