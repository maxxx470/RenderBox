// GET /api/projects/[projectId]/nodes/[nodeId]/materials (étape 3C.4): the
// list of one image's faces — access (session, project owner, node of this
// project), isolation, removed faces kept, the detection under a correction,
// database failures, and no write. Prisma is the shared mock: no database.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});
vi.mock('@/lib/server/observability/log', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { verifyToken } from '@/lib/server/auth';
import { GET } from './route';

const OWNER_ID = 'user-owner';
const OTHER_USER = 'user-other';
const PROJECT_ID = 'project-1';
const NODE_ID = 'node-a';
const OTHER_NODE = 'node-b';
const T0 = new Date('2026-10-12T10:00:00Z');
const T1 = new Date('2026-10-12T11:00:00Z');

function makeReq(): NextRequest {
  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/nodes/${NODE_ID}/materials`, {
    method: 'GET',
    headers: { authorization: 'Bearer valid-access-token' },
  });
}
const ctx = (nodeId = NODE_ID) => ({
  params: Promise.resolve({ projectId: PROJECT_ID, nodeId }),
});

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

function world(opts: { projectOwner?: string; nodeProject?: string | null } = {}) {
  prismaMock.project.findUnique.mockResolvedValue({
    userId: opts.projectOwner ?? OWNER_ID,
  } as never);
  const nodeProject = opts.nodeProject === undefined ? PROJECT_ID : opts.nodeProject;
  prismaMock.renderNode.findUnique.mockResolvedValue(
    (nodeProject === null ? null : { projectId: nodeProject }) as never,
  );
}

const detection = (face: string, valeur: string, position: number, nodeId = NODE_ID) => ({
  nodeId,
  face,
  valeur,
  confidence: 80 - position,
  position,
});
const correction = (
  face: string,
  valeur: string | null,
  opts: {
    nodeId?: string;
    label?: string | null;
    at?: Date;
    origin?: 'user' | 'legacy_attach';
  } = {},
) => ({
  id: `c-${opts.nodeId ?? NODE_ID}-${face}`,
  nodeId: opts.nodeId ?? NODE_ID,
  face,
  faceLabel: opts.label ?? null,
  valeur,
  origin: opts.origin ?? 'user',
  createdAt: opts.at ?? T0,
  updatedAt: opts.at ?? T0,
});

/** The Phase 7 tables, answered as the database would: only the asked node's rows. */
function rows(
  detections: ReturnType<typeof detection>[] = [],
  corrections: ReturnType<typeof correction>[] = [],
) {
  prismaMock.materialDetection.findMany.mockImplementation((async (args: {
    where: { nodeId: string };
  }) => detections.filter((d) => d.nodeId === args.where.nodeId)) as never);
  prismaMock.materialCorrection.findMany.mockImplementation((async (args: {
    where: { nodeId: string };
  }) => corrections.filter((c) => c.nodeId === args.where.nodeId)) as never);
}

async function list(res: Response) {
  return ((await res.json()) as { materials: Record<string, unknown>[] }).materials;
}

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

describe('GET node materials list — what one image knows', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('lists several faces: detections in the detector’s order, then correction-only faces, oldest first', async () => {
    rows(
      [detection('toiture', 'Tuile', 1), detection('facade_principale', 'Enduit blanc', 0)],
      [
        correction('menuiseries', 'Aluminium noir', { label: 'Menuiseries', at: T1 }),
        correction('sol', 'Béton ciré', { at: T0 }),
      ],
    );
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(200);
    expect(await list(res)).toEqual([
      {
        face: 'facade_principale',
        faceLabel: null,
        valeur: 'Enduit blanc',
        origin: 'detection',
        confidence: 80,
        correction: 'none',
        correctionOrigin: null,
        detected: { valeur: 'Enduit blanc', confidence: 80 },
      },
      {
        face: 'toiture',
        faceLabel: null,
        valeur: 'Tuile',
        origin: 'detection',
        confidence: 79,
        correction: 'none',
        correctionOrigin: null,
        detected: { valeur: 'Tuile', confidence: 79 },
      },
      {
        face: 'sol',
        faceLabel: null,
        valeur: 'Béton ciré',
        origin: 'correction',
        confidence: null,
        correction: 'value',
        correctionOrigin: 'user',
        detected: null,
      },
      {
        face: 'menuiseries',
        faceLabel: 'Menuiseries',
        valeur: 'Aluminium noir',
        origin: 'correction',
        confidence: null,
        correction: 'value',
        correctionOrigin: 'user',
        detected: null,
      },
    ]);
  });

  it('an image with nothing known is an empty list, not an error', async () => {
    rows();
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(200);
    expect(await list(res)).toEqual([]);
  });

  it('keeps a removed face, in its place, with the detection under it', async () => {
    rows(
      [detection('facade_principale', 'Enduit blanc', 0), detection('toiture', 'Tuile', 1)],
      [correction('facade_principale', null)],
    );
    expect(await list(await GET(makeReq(), ctx()))).toEqual([
      {
        face: 'facade_principale',
        faceLabel: null,
        valeur: null,
        origin: null,
        confidence: null,
        correction: 'removed',
        correctionOrigin: 'user',
        detected: { valeur: 'Enduit blanc', confidence: 80 },
      },
      expect.objectContaining({ face: 'toiture', correction: 'none', origin: 'detection' }),
    ]);
  });

  it('a correction replacing a detection keeps both apart: the value is the user’s, the detection is still told', async () => {
    rows(
      [detection('toiture', 'Tuile', 0)],
      [correction('toiture', 'Ardoise', { label: 'Toiture' })],
    );
    expect(await list(await GET(makeReq(), ctx()))).toEqual([
      {
        face: 'toiture',
        faceLabel: 'Toiture',
        valeur: 'Ardoise',
        origin: 'correction',
        confidence: null,
        correction: 'value',
        correctionOrigin: 'user',
        detected: { valeur: 'Tuile', confidence: 80 },
      },
    ]);
  });

  it('a removal without any detection is listed too (so it can be cancelled)', async () => {
    rows([], [correction('sol', null)]);
    expect(await list(await GET(makeReq(), ctx()))).toEqual([
      expect.objectContaining({ face: 'sol', correction: 'removed', valeur: null, detected: null }),
    ]);
  });

  it('never lists another image’s rows, and reads with this node’s id only', async () => {
    rows(
      [detection('toiture', 'Tuile', 0, OTHER_NODE)],
      [correction('sol', 'Parquet', { nodeId: OTHER_NODE })],
    );
    expect(await list(await GET(makeReq(), ctx()))).toEqual([]);
    expect(prismaMock.materialDetection.findMany.mock.calls[0]?.[0]?.where).toEqual({
      nodeId: NODE_ID,
    });
    expect(prismaMock.materialCorrection.findMany.mock.calls[0]?.[0]?.where).toEqual({
      nodeId: NODE_ID,
    });
  });

  it('writes nothing, starts no detection, never reads the old project sheet', async () => {
    rows([detection('toiture', 'Tuile', 0)], [correction('sol', 'Parquet')]);
    await GET(makeReq(), ctx());
    expect(prismaMock.materialCorrection.upsert).not.toHaveBeenCalled();
    expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.materialDetection.createMany).not.toHaveBeenCalled();
    expect(prismaMock.materialDetectionRun.create).not.toHaveBeenCalled();
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
    expect(prismaMock.material.update).not.toHaveBeenCalled();
  });
});

describe('GET node materials list — where each correction comes from (3C.5.5)', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('says the stored origin of every correction: attached from the old sheet, typed, masked, none', async () => {
    rows(
      [detection('toiture', 'Tuile', 0), detection('facade_principale', 'Enduit', 1)],
      [
        correction('toiture', 'Ardoise', { origin: 'legacy_attach', at: T0 }),
        correction('sol', 'Ardoise', { at: T1 }),
        correction('menuiseries', null, { at: T1 }),
      ],
    );
    const items = await list(await GET(makeReq(), ctx()));
    expect(
      Object.fromEntries(items.map((i) => [i.face, [i.correction, i.correctionOrigin]])),
    ).toEqual({
      toiture: ['value', 'legacy_attach'],
      facade_principale: ['none', null],
      sol: ['value', 'user'],
      menuiseries: ['removed', 'user'],
    });
  });

  it('an attached correction the user changed since (stored "user") is the user’s: never the old sheet’s', async () => {
    rows([], [correction('toiture', 'Zinc', { origin: 'user' })]);
    const [item] = await list(await GET(makeReq(), ctx()));
    expect(item).toMatchObject({ face: 'toiture', correctionOrigin: 'user' });
  });

  it('reads the stored origin from the database', async () => {
    rows();
    await GET(makeReq(), ctx());
    const args = prismaMock.materialCorrection.findMany.mock.calls[0]?.[0];
    expect(args?.select).toMatchObject({ origin: true });
  });
});

describe('GET node materials list — access', () => {
  it('401 without a valid session, nothing read', async () => {
    vi.mocked(verifyToken).mockResolvedValue(null as never);
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(401);
    expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
  });

  it('404 PROJECT_NOT_FOUND when the project is someone else’s (IDOR), no node read', async () => {
    signIn(OTHER_USER);
    world({ projectOwner: OWNER_ID });
    rows();
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('PROJECT_NOT_FOUND');
    expect(prismaMock.renderNode.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
  });

  it('404 PROJECT_NOT_FOUND when the project does not exist', async () => {
    signIn();
    prismaMock.project.findUnique.mockResolvedValue(null as never);
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('PROJECT_NOT_FOUND');
  });

  it('404 NODE_NOT_FOUND when the node does not exist', async () => {
    signIn();
    world({ nodeProject: null });
    rows();
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NODE_NOT_FOUND');
    expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
  });

  it('404 NODE_NOT_FOUND when the node belongs to another project, nothing of it read', async () => {
    signIn();
    world({ nodeProject: 'project-2' });
    rows([detection('toiture', 'Tuile', 0)]);
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('NODE_NOT_FOUND');
    expect(prismaMock.materialDetection.findMany).not.toHaveBeenCalled();
    expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
  });

  it('needs no CSRF token (a read)', async () => {
    signIn();
    world();
    rows();
    expect((await GET(makeReq(), ctx())).status).toBe(200);
  });
});

describe('GET node materials list — database failures', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it.each([
    ['detections', 'materialDetection'] as const,
    ['corrections', 'materialCorrection'] as const,
  ])(
    'a failed read of the %s is a 503 MATERIALS_UNAVAILABLE, never a partial list',
    async (_label, table) => {
      rows([detection('toiture', 'Tuile', 0)], [correction('sol', 'Parquet')]);
      prismaMock[table].findMany.mockRejectedValue(
        Object.assign(new Error('Can’t reach database server at db.internal:5432'), {
          code: 'P1001',
        }),
      );
      const res = await GET(makeReq(), ctx());
      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({
        error: 'MATERIALS_UNAVAILABLE',
        message: 'Materials are unavailable, try again',
      });
      expect(body).not.toHaveProperty('materials');
      expect(JSON.stringify(body)).not.toContain('db.internal');
    },
  );

  it('a failed node lookup is a 503 too', async () => {
    prismaMock.renderNode.findUnique.mockRejectedValue(new Error('timeout'));
    const res = await GET(makeReq(), ctx());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('MATERIALS_UNAVAILABLE');
  });
});
