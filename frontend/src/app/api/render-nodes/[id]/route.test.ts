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
import { collectBranch } from '@/lib/server/render-tree';
import { DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockDeleteBlobs = vi.mocked(deleteBlobs);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/render-nodes/n2', {
    method: 'DELETE',
    headers: { 'x-csrf-token': 'csrf-tok', cookie: 'app-csrf=csrf-tok' },
  });
}

const params = { params: Promise.resolve({ id: 'n2' }) };

// n1 → n2 → n3, plus an unrelated root n4.
function projectNodes() {
  return [
    { id: 'n1', parentId: null, kind: 'UPLOADED', createdAt: new Date(1), preset: null, engine: null, blobUrl: 'https://blob/1' }, // prettier-ignore
    { id: 'n2', parentId: 'n1', kind: 'GENERATED', createdAt: new Date(2), preset: 'jour_ext', engine: 'nanobanana', blobUrl: 'https://blob/2' }, // prettier-ignore
    { id: 'n3', parentId: 'n2', kind: 'GENERATED', createdAt: new Date(3), preset: 'nuit_ext', engine: 'nanobanana', blobUrl: 'https://blob/3' }, // prettier-ignore
    { id: 'n4', parentId: null, kind: 'UPLOADED', createdAt: new Date(4), preset: null, engine: null, blobUrl: 'https://blob/4' }, // prettier-ignore
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockDeleteBlobs.mockResolvedValue(undefined);
  prismaMock.renderNode.findUnique.mockResolvedValue({
    projectId: 'p1',
    project: { userId: 'user-1' },
  } as never);
  prismaMock.renderNode.findMany.mockResolvedValue(projectNodes() as never);
  prismaMock.renderNode.deleteMany.mockResolvedValue({ count: 2 } as never);
});

describe('collectBranch', () => {
  it('returns the node and every descendant, deepest branches included', () => {
    const ids = collectBranch(projectNodes(), 'n2').map((n) => n.id);
    expect(ids).toEqual(['n2', 'n3']);
  });

  it('returns just the node when it is a leaf', () => {
    expect(collectBranch(projectNodes(), 'n3').map((n) => n.id)).toEqual(['n3']);
  });

  it('returns nothing for an id absent from the project', () => {
    expect(collectBranch(projectNodes(), 'nope')).toEqual([]);
  });
});

describe('DELETE /api/render-nodes/[id]', () => {
  it('deletes the whole branch rather than orphaning the children', async () => {
    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deletedCount: number };
    expect(body.deletedCount).toBe(2);
    expect(prismaMock.renderNode.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n2', 'n3'] } },
    });
  });

  it("removes the branch's blobs before its rows", async () => {
    const order: string[] = [];
    mockDeleteBlobs.mockImplementationOnce(async () => {
      order.push('blobs');
    });
    prismaMock.renderNode.deleteMany.mockImplementationOnce((async () => {
      order.push('rows');
      return { count: 2 } as never;
    }) as never);

    await DELETE(makeReq(), params);
    expect(mockDeleteBlobs).toHaveBeenCalledWith(['https://blob/2', 'https://blob/3']);
    expect(order).toEqual(['blobs', 'rows']);
  });

  it('returns the surviving tree, without blobUrl on any node', async () => {
    const res = await DELETE(makeReq(), params);
    const body = (await res.json()) as { tree: Array<Record<string, unknown>> };
    expect(body.tree.map((n) => n.id)).toEqual(['n1', 'n4']);
    expect(JSON.stringify(body.tree)).not.toContain('blobUrl');
  });

  it('keeps the rows when blob deletion fails, so the URLs are not stranded', async () => {
    mockDeleteBlobs.mockRejectedValueOnce(new Error('network down'));
    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(502);
    expect(prismaMock.renderNode.deleteMany).not.toHaveBeenCalled();
  });

  it("404s on another user's node without touching storage", async () => {
    prismaMock.renderNode.findUnique.mockResolvedValueOnce({
      projectId: 'p1',
      project: { userId: 'someone-else' },
    } as never);

    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(404);
    expect(mockDeleteBlobs).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates 401 from requireAuth without touching storage', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await DELETE(makeReq(), params);
    expect(res.status).toBe(401);
    expect(mockDeleteBlobs).not.toHaveBeenCalled();
  });
});
