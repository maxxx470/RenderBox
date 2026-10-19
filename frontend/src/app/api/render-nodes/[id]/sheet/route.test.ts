import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

const mockRequireAuth = vi.fn();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: () => mockRequireAuth() }));
const mockEnsureCode = vi.fn();
vi.mock('@/lib/server/materials/render-sheet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/materials/render-sheet')>()),
  ensureNodeCode: (...args: unknown[]) => mockEnsureCode(...args),
}));

import { GET } from './route';

const call = () =>
  GET(new NextRequest('http://localhost/api/render-nodes/n1/sheet'), {
    params: Promise.resolve({ id: 'n1' }),
  });

const SHEET = {
  v: 1,
  status: 'ready',
  lines: [{ color: 'mur', material: 'brique' }],
  ambiance: { key: 'jour_ext', sky: 'hazy' },
  sourceCode: 'RP-3D9F1A',
};

describe('GET /api/render-nodes/[id]/sheet', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset().mockResolvedValue({ user: { sub: 'u1' } });
    mockEnsureCode.mockReset().mockResolvedValue('RP-7K4M2Q');
  });

  it('answers the image’s code and its sheet, never cached', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      kind: 'GENERATED',
      preset: 'jour_ext',
      sheet: SHEET,
      project: { userId: 'u1' },
    } as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      code: 'RP-7K4M2Q',
      kind: 'GENERATED',
      preset: 'jour_ext',
      sheet: SHEET,
    });
    expect(mockEnsureCode).toHaveBeenCalledWith('n1');
  });

  it('an uploaded image has a code and no sheet', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      kind: 'UPLOADED',
      preset: null,
      sheet: null,
      project: { userId: 'u1' },
    } as never);
    expect(await (await call()).json()).toMatchObject({ code: 'RP-7K4M2Q', sheet: null });
  });

  it('404s on another account’s image and on an unknown one — no code is given', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      kind: 'GENERATED',
      preset: null,
      sheet: SHEET,
      project: { userId: 'someone-else' },
    } as never);
    expect((await call()).status).toBe(404);
    prismaMock.renderNode.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mockEnsureCode).not.toHaveBeenCalled();
  });

  it('refuses without a session', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    expect((await call()).status).toBe(401);
    expect(prismaMock.renderNode.findUnique).not.toHaveBeenCalled();
  });
});
