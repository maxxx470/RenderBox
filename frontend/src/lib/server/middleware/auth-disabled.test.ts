// Proves the AUTH_DISABLED short-circuit actually wires up in requireAuth/
// optionalAuth — auth-disabled.test.ts (sibling module) covers the predicate
// itself. Here we assert requireAuth/optionalAuth return the fake context
// WITHOUT touching cookies or Prisma when disabled, AND — the critical
// safety property — that requireAdmin is completely unaffected: it must
// still demand a real session even while AUTH_DISABLED=true, since /admin
// must never be reachable through this temporary kill-switch.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

import { verifyToken } from '@/lib/server/auth';
import { requireAuth, optionalAuth, requireAdmin } from './index';
import { AUTH_DISABLED_USER_ID, AUTH_DISABLED_USER_EMAIL } from '../auth-disabled';

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requireAuth / optionalAuth — AUTH_DISABLED wiring', () => {
  it('requireAuth returns the fake session and never reads a cookie or queries Prisma when disabled', async () => {
    vi.stubEnv('AUTH_DISABLED', 'true');

    const result = await requireAuth();
    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result).toEqual({
      user: { sub: AUTH_DISABLED_USER_ID, email: AUTH_DISABLED_USER_EMAIL },
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('optionalAuth returns the fake session when disabled', async () => {
    vi.stubEnv('AUTH_DISABLED', 'true');

    const result = await optionalAuth();
    expect(result).toEqual({
      user: { sub: AUTH_DISABLED_USER_ID, email: AUTH_DISABLED_USER_EMAIL },
    });
  });

  it('requireAuth returns the fake session in production too (not gated on NODE_ENV)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_DISABLED', 'true');

    const result = await requireAuth();
    expect(result).toEqual({
      user: { sub: AUTH_DISABLED_USER_ID, email: AUTH_DISABLED_USER_EMAIL },
    });
  });

  it('requireAuth falls through to normal 401 behavior when AUTH_DISABLED is not set', async () => {
    vi.stubEnv('AUTH_DISABLED', '');

    const result = await requireAuth();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });
});

describe('requireAdmin — never affected by AUTH_DISABLED', () => {
  it('still returns 401 with no cookie even when AUTH_DISABLED=true (does not grant the demo user admin)', async () => {
    vi.stubEnv('AUTH_DISABLED', 'true');

    const result = await requireAdmin();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
