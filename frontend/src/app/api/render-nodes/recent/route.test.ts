import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = vi.fn();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: () => mockRequireAuth() }));
const mockLoad = vi.fn();
vi.mock('@/app/app/recent-renders', () => ({
  loadRecentRenders: (...args: unknown[]) => mockLoad(...args),
}));

import { GET } from './route';

const req = () => new NextRequest('http://localhost/api/render-nodes/recent');

describe('GET /api/render-nodes/recent', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
    mockLoad.mockReset();
  });

  it("answers the signed-in account's recent images, never cached", async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'user_1' } });
    const images = [
      {
        id: 'n1',
        projectId: 'p1',
        projectName: '',
        preset: null,
        engine: 'gpt_image',
        editType: null,
      },
    ];
    mockLoad.mockResolvedValue(images);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ images });
    expect(mockLoad).toHaveBeenCalledWith('user_1');
  });

  it('refuses without a session', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});
