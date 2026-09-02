import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/upload/vercel-blob-client', () => ({
  deleteBlobs: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { deleteBlobs } from '@/lib/server/upload/vercel-blob-client';
import { PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockDeleteBlobs = vi.mocked(deleteBlobs);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };
const params = { params: Promise.resolve({ projectId: 'p1' }) };

function makeReq(method: 'PATCH' | 'DELETE', body?: unknown): NextRequest {
  return new NextRequest('http://test/api/projects/p1', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockDeleteBlobs.mockResolvedValue(undefined);
});

describe('PATCH /api/projects/[projectId] — rename', () => {
  it('renames a project the caller owns', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ userId: 'user-1' } as never);
    prismaMock.project.update.mockResolvedValueOnce({
      id: 'p1',
      name: 'Villa B',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-02T00:00:00Z'),
    } as never);

    const res = await PATCH(makeReq('PATCH', { name: 'Villa B' }), params);
    expect(res.status).toBe(200);
    expect(prismaMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { name: 'Villa B' } }),
    );
  });

  it("404s — not 403 — on another user's project, so the id is not confirmed", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ userId: 'someone-else' } as never);

    const res = await PATCH(makeReq('PATCH', { name: 'Villa B' }), params);
    expect(res.status).toBe(404);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it('400s on an empty name without touching the row', async () => {
    const res = await PATCH(makeReq('PATCH', { name: '   ' }), params);
    expect(res.status).toBe(400);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/projects/[projectId]', () => {
  it("deletes the project's blobs before its rows", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ userId: 'user-1' } as never);
    prismaMock.renderNode.findMany.mockResolvedValueOnce([
      { blobUrl: 'https://blob/a.jpg' },
      { blobUrl: 'https://blob/b.jpg' },
    ] as never);

    const order: string[] = [];
    mockDeleteBlobs.mockImplementationOnce(async () => {
      order.push('blobs');
    });
    prismaMock.project.delete.mockImplementationOnce((async () => {
      order.push('rows');
      return {} as never;
    }) as never);

    const res = await DELETE(makeReq('DELETE'), params);
    expect(res.status).toBe(200);
    expect(mockDeleteBlobs).toHaveBeenCalledWith(['https://blob/a.jpg', 'https://blob/b.jpg']);
    expect(order).toEqual(['blobs', 'rows']);
  });

  it('keeps the rows when blob deletion fails, so the URLs are not stranded', async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ userId: 'user-1' } as never);
    prismaMock.renderNode.findMany.mockResolvedValueOnce([
      { blobUrl: 'https://blob/a.jpg' },
    ] as never);
    mockDeleteBlobs.mockRejectedValueOnce(new Error('network down'));

    const res = await DELETE(makeReq('DELETE'), params);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'STORAGE_CLEANUP_FAILED' });
    expect(prismaMock.project.delete).not.toHaveBeenCalled();
  });

  it("404s on another user's project without deleting anything", async () => {
    prismaMock.project.findUnique.mockResolvedValueOnce({ userId: 'someone-else' } as never);

    const res = await DELETE(makeReq('DELETE'), params);
    expect(res.status).toBe(404);
    expect(mockDeleteBlobs).not.toHaveBeenCalled();
    expect(prismaMock.project.delete).not.toHaveBeenCalled();
  });

  it('propagates 401 from requireAuth without touching storage', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );

    const res = await DELETE(makeReq('DELETE'), params);
    expect(res.status).toBe(401);
    expect(mockDeleteBlobs).not.toHaveBeenCalled();
  });
});
