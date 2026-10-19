import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

const mockRequireAuth = vi.fn();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: () => mockRequireAuth() }));
const mockStatus = vi.fn();
vi.mock('@/lib/server/generation/tier-quota', () => ({
  getCreditStatus: (...args: unknown[]) => mockStatus(...args),
}));

import { GET } from './route';

const call = () => GET(new NextRequest('http://localhost/api/credits'));

describe('GET /api/credits', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset().mockResolvedValue({ user: { sub: 'u1' } });
    mockStatus.mockReset();
  });

  it('answers the balance, read fresh and never cached', async () => {
    mockStatus.mockResolvedValue({ remaining: 942, tier: 'standard', max: 3000 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ remaining: 942, tier: 'standard', max: 3000 });
    expect(mockStatus).toHaveBeenCalledWith(prismaMock, 'u1');
  });

  it('refuses without a session', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    expect((await call()).status).toBe(401);
    expect(mockStatus).not.toHaveBeenCalled();
  });
});
