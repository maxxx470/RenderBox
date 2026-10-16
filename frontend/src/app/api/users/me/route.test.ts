import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn() }));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { PATCH } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('PATCH /api/users/me', () => {
  it('updates defaultEngine for the authed user', async () => {
    prismaMock.user.update.mockResolvedValueOnce({
      defaultEngine: 'gpt_image',
      engineVersions: null,
    } as never);
    const res = await PATCH(makeReq({ defaultEngine: 'gpt_image' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      defaultEngine: 'gpt_image',
      engineVersions: { nanobanana: 'visio-pro', gpt_image: 'pixel-2' },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { defaultEngine: 'gpt_image' },
      select: { defaultEngine: true, engineVersions: true },
    });
  });

  it("sets one engine's version and keeps the other engine's", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      engineVersions: { gpt_image: 'pixel-2-5' },
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({
      defaultEngine: null,
      engineVersions: { nanobanana: 'visio-2-1', gpt_image: 'pixel-2-5' },
    } as never);
    const res = await PATCH(makeReq({ engineVersion: 'visio-2-1' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { engineVersions: { nanobanana: 'visio-2-1', gpt_image: 'pixel-2-5' } },
      select: { defaultEngine: true, engineVersions: true },
    });
  });

  it('400 on an unknown version, or on an empty body', async () => {
    expect((await PATCH(makeReq({ engineVersion: 'visio-9' }))).status).toBe(400);
    expect((await PATCH(makeReq({}))).status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED on an unknown engine name', async () => {
    const res = await PATCH(makeReq({ defaultEngine: 'not-a-real-engine' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('propagates CSRF failure without an auth check', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await PATCH(makeReq({ defaultEngine: 'nanobanana' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('propagates 401 from requireAuth without a DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await PATCH(makeReq({ defaultEngine: 'nanobanana' }));
    expect(res.status).toBe(401);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
