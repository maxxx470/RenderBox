import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(path: string, cookieHeader?: string): NextRequest {
  return cookieHeader
    ? new NextRequest(`http://localhost${path}`, { headers: { cookie: cookieHeader } })
    : new NextRequest(`http://localhost${path}`);
}

describe('proxy — AUTH_DISABLED CSRF cookie mint', () => {
  it('does not set a csrf cookie when AUTH_DISABLED is unset', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    const res = proxy(req('/app'));
    expect(res.cookies.get('app-csrf')).toBeUndefined();
  });

  it('sets a csrf cookie on the response when AUTH_DISABLED=true and none is present yet', () => {
    vi.stubEnv('AUTH_DISABLED', 'true');
    const res = proxy(req('/app'));
    const cookie = res.cookies.get('app-csrf');
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBeFalsy();
  });

  it('does not re-mint when the browser already carries a csrf cookie', () => {
    vi.stubEnv('AUTH_DISABLED', 'true');
    const res = proxy(req('/app', 'app-csrf=existing-token'));
    expect(res.cookies.get('app-csrf')).toBeUndefined();
  });

  it('is a no-op (no redirect, no forced cookie) on the landing page, a public page', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    const res = proxy(req('/'));
    expect(res.status).toBe(200);
  });
});

// 2026-10-13: real sign-in is back. RenderPro's pages are protected by
// default; the session hint is the CSRF cookie (the refresh cookie is
// path-scoped to /api/auth and never reaches a page request).
describe('proxy — protected pages', () => {
  it('a visitor with no session is sent to /connexion, the page kept in ?next=', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    const res = proxy(req('/app/tarifs'));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/connexion');
    expect(to.searchParams.get('next')).toBe('/app/tarifs');
  });

  it('an expired access cookie with a session still open goes through the silent refresh', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    const res = proxy(req('/bienvenue', 'app-csrf=t'));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/api/auth/refresh-and-return');
    expect(to.searchParams.get('next')).toBe('/bienvenue');
  });

  it('a valid access cookie passes, and so does every public page', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    expect(proxy(req('/app', 'app-token=x')).status).toBe(200);
    for (const path of ['/', '/connexion', '/info', '/legal', '/exemple']) {
      expect(proxy(req(path)).status, path).toBe(200);
    }
  });

  it('protects /admin and /parametres too', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    expect(proxy(req('/admin/utilisateurs')).status).toBe(303);
    expect(proxy(req('/parametres')).status).toBe(303);
  });

  it('protects nothing while AUTH_DISABLED=true (the free-access mode)', () => {
    vi.stubEnv('AUTH_DISABLED', 'true');
    expect(proxy(req('/app')).status).toBe(200);
  });
});
