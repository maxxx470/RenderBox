import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/projects', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('GET /api/projects — grid data', () => {
  it("includes each project's latest render node as thumbnailNodeId", async () => {
    prismaMock.project.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'Villa A',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
        renderNodes: [{ id: 'node-latest', createdAt: new Date('2026-08-05T00:00:00Z') }],
      },
    ] as never);

    const res = await GET(new NextRequest('http://test/api/projects'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      projects: Array<{ id: string; thumbnailNodeId: string | null; lastActivityAt: string }>;
    };
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]).toMatchObject({
      id: 'p1',
      thumbnailNodeId: 'node-latest',
      lastActivityAt: '2026-08-05T00:00:00.000Z',
    });
  });

  it('falls back to null thumbnailNodeId and createdAt for a project with no renders', async () => {
    prismaMock.project.findMany.mockResolvedValueOnce([
      {
        id: 'p2',
        name: 'Empty project',
        createdAt: new Date('2026-08-02T00:00:00Z'),
        updatedAt: new Date('2026-08-02T00:00:00Z'),
        renderNodes: [],
      },
    ] as never);

    const res = await GET(new NextRequest('http://test/api/projects'));
    const body = (await res.json()) as {
      projects: Array<{ thumbnailNodeId: string | null; lastActivityAt: string }>;
    };
    expect(body.projects[0]).toMatchObject({
      thumbnailNodeId: null,
      lastActivityAt: '2026-08-02T00:00:00.000Z',
    });
  });

  it('scopes the query to the authenticated user and orders newest-first', async () => {
    prismaMock.project.findMany.mockResolvedValueOnce([]);
    await GET(new NextRequest('http://test/api/projects'));
    expect(prismaMock.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('propagates 401 from requireAuth without a DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(new NextRequest('http://test/api/projects'));
    expect(res.status).toBe(401);
    expect(prismaMock.project.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects — create', () => {
  it('creates a project for the authenticated user', async () => {
    prismaMock.project.create.mockResolvedValueOnce({
      id: 'new-project',
      name: 'Projet test',
      createdAt: new Date('2026-08-10T00:00:00Z'),
      updatedAt: new Date('2026-08-10T00:00:00Z'),
    } as never);

    const res = await POST(makePost({ name: 'Projet test' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe('new-project');
    expect(prismaMock.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'user-1', name: 'Projet test' } }),
    );
  });

  it('400s on an empty name', async () => {
    const res = await POST(makePost({ name: '' }));
    expect(res.status).toBe(400);
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });
});
