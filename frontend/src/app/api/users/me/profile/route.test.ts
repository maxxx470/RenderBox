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

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/users/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const profile = (over: Record<string, unknown> = {}) => ({
  name: 'Awa Diop',
  phone: null,
  profession: 'architect',
  company: null,
  teamSize: null,
  projectTypes: [],
  mainUse: null,
  defaultEngine: null,
  country: 'Sénégal',
  city: null,
  referralSource: null,
  onboardedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'a@x.com' } });
  prismaMock.$transaction.mockImplementation(async (fn: unknown) =>
    (fn as (tx: typeof prismaMock) => unknown)(prismaMock),
  );
});

describe('PATCH /api/users/me/profile (the onboarding)', () => {
  it('saves only the fields sent, on the signed-in account; an empty text clears it', async () => {
    prismaMock.user.update.mockResolvedValueOnce(profile() as never);
    const res = await PATCH(makeReq({ name: '  Awa Diop ', phone: '', profession: 'architect' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { name: 'Awa Diop', phone: null, profession: 'architect' },
      }),
    );
  });

  it('refuses a choice that is not one of lib/onboarding.ts, and unknown fields', async () => {
    expect((await PATCH(makeReq({ profession: 'astronaut' }))).status).toBe(400);
    expect((await PATCH(makeReq({ projectTypes: ['castles'] }))).status).toBe(400);
    expect((await PATCH(makeReq({ role: 'SUPERADMIN' }))).status).toBe(400);
    expect((await PATCH(makeReq({ creditsBalance: 99999 }))).status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('complete: marks the onboarding done once name, profession and country are there', async () => {
    prismaMock.user.update
      .mockResolvedValueOnce(profile() as never)
      .mockResolvedValueOnce(profile({ onboardedAt: new Date('2026-10-13') }) as never);
    const res = await PATCH(makeReq({ country: 'Sénégal', complete: true }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { onboardedAt: expect.any(Date) } }),
    );
  });

  it('complete without a country: 400 ONBOARDING_INCOMPLETE, the fields sent are still saved', async () => {
    prismaMock.user.update.mockResolvedValueOnce(profile({ country: null }) as never);
    const res = await PATCH(makeReq({ city: 'Dakar', complete: true }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('ONBOARDING_INCOMPLETE');
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it('needs the CSRF header and a session', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await PATCH(makeReq({ name: 'x' }))).status).toBe(403);
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'no' }, { status: 401 }));
    expect((await PATCH(makeReq({ name: 'x' }))).status).toBe(401);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
