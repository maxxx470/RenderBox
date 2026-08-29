// Proves the bypass short-circuit actually wires up in requireAuth/
// optionalAuth — dev-bypass.test.ts (sibling module) covers the predicate
// itself. Here we assert requireAuth returns the fake context WITHOUT
// touching cookies or Prisma when the bypass is active, and falls through
// to real auth when it isn't.
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
import { requireAuth, optionalAuth } from './index';
import { DEV_FAKE_USER_ID, DEV_FAKE_USER_EMAIL } from '../dev-bypass';

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requireAuth / optionalAuth — dev bypass wiring', () => {
  it('requireAuth returns the fake session and never reads a cookie or queries Prisma when the bypass is active', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');

    const result = await requireAuth();
    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result).toEqual({ user: { sub: DEV_FAKE_USER_ID, email: DEV_FAKE_USER_EMAIL } });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('optionalAuth returns the fake session when the bypass is active', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');

    const result = await optionalAuth();
    expect(result).toEqual({ user: { sub: DEV_FAKE_USER_ID, email: DEV_FAKE_USER_EMAIL } });
  });

  it('requireAuth falls through to normal 401 behavior when the bypass is not active (no cookie, no header)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true'); // must be inert without NODE_ENV=development or AUTH_BYPASS_ALLOW_PROD=true

    const result = await requireAuth();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('requireAuth returns the fake session outside development when AUTH_BYPASS_ALLOW_PROD=true (explicit override)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');
    vi.stubEnv('AUTH_BYPASS_ALLOW_PROD', 'true');

    const result = await requireAuth();
    expect(result).toEqual({ user: { sub: DEV_FAKE_USER_ID, email: DEV_FAKE_USER_EMAIL } });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
