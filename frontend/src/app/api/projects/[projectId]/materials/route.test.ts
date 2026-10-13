// GET /api/projects/[projectId]/materials — the project's old materials sheet,
// with each row's attach mark (étape 3C.5.3): attached or not, and the image
// and date only when that image is one of this project's. Prisma is the
// shared mock: no database.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

import { verifyToken } from '@/lib/server/auth';
import { GET } from './route';

const OWNER_ID = 'user-owner';
const PROJECT_ID = 'project-1';
const NODE_ID = 'node-a';
const FOREIGN_NODE = 'node-x';
const T0 = new Date('2026-10-01T10:00:00Z');
const AT = new Date('2026-10-12T09:00:00Z');

function makeReq(): NextRequest {
  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/materials`, {
    method: 'GET',
    headers: { authorization: 'Bearer valid-access-token' },
  });
}
const ctx = { params: Promise.resolve({ projectId: PROJECT_ID }) };

function signIn(userId = OWNER_ID) {
  vi.mocked(verifyToken).mockResolvedValue({
    sub: userId,
    email: `${userId}@test.local`,
    tokenVersion: 0,
  });
  prismaMock.user.findUnique.mockResolvedValue({
    id: userId,
    email: `${userId}@test.local`,
    tokenVersion: 0,
  } as never);
}

const material = (id: string, face: string, attachedNodeId: string | null) => ({
  id,
  face,
  valeur: `valeur ${id}`,
  source: 'auto',
  confidence: 80,
  updatedAt: T0,
  attachedNodeId,
  attachedAt: attachedNodeId ? AT : null,
});

/** The project's images: this project's, plus one of another project. */
function world(rows: ReturnType<typeof material>[]) {
  prismaMock.project.findUnique.mockResolvedValue({ userId: OWNER_ID } as never);
  prismaMock.material.findMany.mockResolvedValue(rows as never);
  const nodes = [
    { id: NODE_ID, projectId: PROJECT_ID },
    { id: FOREIGN_NODE, projectId: 'project-2' },
  ];
  prismaMock.renderNode.findMany.mockImplementation((async (args: {
    where: { id: { in: string[] }; projectId: string };
  }) =>
    nodes
      .filter((n) => args.where.id.in.includes(n.id) && n.projectId === args.where.projectId)
      .map((n) => ({ id: n.id }))) as never);
}

async function read() {
  const res = await GET(makeReq(), ctx);
  return { status: res.status, body: JSON.parse(await res.text()) };
}

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
  signIn();
});

describe('GET the old sheet — attach marks', () => {
  it('a row attached nowhere: attached false, no image, no date — existing fields unchanged', async () => {
    world([material('m1', 'toiture', null)]);
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body).toEqual({
      materials: [
        {
          id: 'm1',
          face: 'toiture',
          valeur: 'valeur m1',
          source: 'auto',
          confidence: 80,
          updatedAt: T0.toISOString(),
          attached: false,
          attachedNodeId: null,
          attachedAt: null,
        },
      ],
    });
    // Nothing attached: no image is looked up.
    expect(prismaMock.renderNode.findMany).not.toHaveBeenCalled();
  });

  it('a row attached to an image of this project: the image and the date', async () => {
    world([material('m1', 'toiture', NODE_ID)]);
    const { body } = await read();
    expect(body.materials[0]).toMatchObject({
      attached: true,
      attachedNodeId: NODE_ID,
      attachedAt: AT.toISOString(),
    });
  });

  it('a mark pointing at an image that does not exist: attached, naming nothing, no error', async () => {
    world([material('m1', 'toiture', 'node-gone')]);
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body.materials[0]).toMatchObject({
      attached: true,
      attachedNodeId: null,
      attachedAt: null,
    });
  });

  it('a mark pointing at another project’s image: nothing of it is shown', async () => {
    world([material('m1', 'toiture', FOREIGN_NODE), material('m2', 'sol', NODE_ID)]);
    const { body } = await read();
    expect(body.materials).toEqual([
      expect.objectContaining({ id: 'm1', attached: true, attachedNodeId: null, attachedAt: null }),
      expect.objectContaining({ id: 'm2', attached: true, attachedNodeId: NODE_ID }),
    ]);
    expect(JSON.stringify(body)).not.toContain(FOREIGN_NODE);
  });

  it('looks up only the marked images, and only within this project, in one query', async () => {
    world([
      material('m1', 'toiture', NODE_ID),
      material('m2', 'sol', NODE_ID),
      material('m3', 'menuiseries', FOREIGN_NODE),
      material('m4', 'facade_principale', null),
    ]);
    await read();
    expect(prismaMock.renderNode.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.renderNode.findMany.mock.calls[0]?.[0]).toEqual({
      where: { id: { in: [NODE_ID, FOREIGN_NODE] }, projectId: PROJECT_ID },
      select: { id: true },
    });
  });

  it('reads this project’s rows only, in the same order as before, the new fields added', async () => {
    world([]);
    await read();
    expect(prismaMock.material.findMany.mock.calls[0]?.[0]).toEqual({
      where: { projectId: PROJECT_ID },
      orderBy: { face: 'asc' },
      select: {
        id: true,
        face: true,
        valeur: true,
        source: true,
        confidence: true,
        updatedAt: true,
        attachedNodeId: true,
        attachedAt: true,
      },
    });
  });

  it('writes nothing', async () => {
    world([material('m1', 'toiture', NODE_ID)]);
    await read();
    expect(prismaMock.material.update).not.toHaveBeenCalled();
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('GET the old sheet — access (unchanged)', () => {
  it('401 without a session, nothing read', async () => {
    vi.mocked(verifyToken).mockResolvedValue(null as never);
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(401);
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
  });

  it('404 for a project of another user, nothing read', async () => {
    prismaMock.project.findUnique.mockResolvedValue({ userId: 'someone-else' } as never);
    const res = await GET(makeReq(), ctx);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('PROJECT_NOT_FOUND');
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
    expect(prismaMock.renderNode.findMany).not.toHaveBeenCalled();
  });
});
