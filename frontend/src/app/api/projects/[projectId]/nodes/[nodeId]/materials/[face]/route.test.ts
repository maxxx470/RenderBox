// GET / PUT / DELETE /api/projects/[projectId]/nodes/[nodeId]/materials/[face]
// (étape 3C.2): access (session, CSRF, project owner, node of this project),
// validation, the three actions — set, remove (null), cancel (DELETE) — and
// database failures; since étape 3C.5.3, a correction attached from the old
// sheet becoming the user's on PUT, released on DELETE.
//
// Prisma is the shared mock. The writes run in a transaction over a small
// in-memory store (MaterialCorrection, the old sheet's attach marks) with an
// undo log: a transaction that throws has its writes reverted, as a rollback
// would; (nodeId, face) and legacyMaterialId are unique, as in the schema.
// The Prisma spies only record calls and let a test inject a failure or a
// concurrent write; the store does the rest. Races are interleavings the
// tests force — not a proof of what PostgreSQL does under real concurrency.
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
import { canonicalFace } from '@/lib/server/materials/canonical-face';
import { GET, PUT, DELETE } from './route';

const OWNER_ID = 'user-owner';
const OTHER_USER = 'user-other';
const PROJECT_ID = 'project-1';
const NODE_ID = 'node-a';
const OTHER_NODE = 'node-b';
const T0 = new Date('2026-10-12T10:00:00Z');

type Method = 'GET' | 'PUT' | 'DELETE';

function makeReq(method: Method, body?: unknown, opts: { csrf?: boolean } = {}): NextRequest {
  const csrf = opts.csrf ?? true;
  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/nodes/${NODE_ID}/materials/x`, {
    method,
    headers: {
      authorization: 'Bearer valid-access-token',
      ...(csrf ? { 'x-csrf-token': 'csrf-tok', cookie: 'app-csrf=csrf-tok' } : {}),
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

function ctx(face = 'toiture', nodeId = NODE_ID) {
  return { params: Promise.resolve({ projectId: PROJECT_ID, nodeId, face }) };
}

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

/** The node and project, as the route sees them. */
function world(opts: { projectOwner?: string; nodeProject?: string | null } = {}) {
  prismaMock.project.findUnique.mockResolvedValue({
    userId: opts.projectOwner ?? OWNER_ID,
  } as never);
  const nodeProject = opts.nodeProject === undefined ? PROJECT_ID : opts.nodeProject;
  prismaMock.renderNode.findUnique.mockResolvedValue(
    (nodeProject === null ? null : { projectId: nodeProject }) as never,
  );
}

interface Row {
  id: string;
  nodeId: string;
  face: string;
  faceLabel: string | null;
  valeur: string | null;
  origin: 'user' | 'legacy_attach';
  legacyMaterialId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A row of the old sheet, as far as its attach mark goes. */
interface LegacyRow {
  id: string;
  projectId: string;
  attachedNodeId: string | null;
  attachedAt: Date | null;
}

const prismaError = (code: string, message = `prisma ${code}`) =>
  Object.assign(new Error(message), { code });

/**
 * In-memory MaterialCorrection + MaterialDetection + the old sheet's marks,
 * keyed like the database; writes go through $transaction (see the header).
 */
function store(
  init: {
    corrections?: Row[];
    detections?: { nodeId: string; face: string; valeur: string }[];
    legacy?: LegacyRow[];
  } = {},
) {
  const db = {
    corrections: [...(init.corrections ?? [])],
    detections: (init.detections ?? []).map((d, i) => ({ ...d, confidence: 70, position: i })),
    legacy: (init.legacy ?? []).map((l) => ({ ...l })),
  };
  let ids = 0;
  prismaMock.materialDetection.findMany.mockImplementation((async (args: {
    where: { nodeId: string };
  }) => db.detections.filter((d) => d.nodeId === args.where.nodeId)) as never);
  prismaMock.materialCorrection.findMany.mockImplementation((async (args: {
    where: { nodeId: string };
  }) => db.corrections.filter((c) => c.nodeId === args.where.nodeId)) as never);

  const spy = prismaMock.materialCorrection;
  const tx = (undo: (() => void)[]) => ({
    materialCorrection: {
      findUnique: async (args: { where: { nodeId_face: { nodeId: string; face: string } } }) => {
        await spy.findUnique(args as never);
        const { nodeId, face } = args.where.nodeId_face;
        const c = db.corrections.find((x) => x.nodeId === nodeId && x.face === face);
        return c ? { id: c.id, legacyMaterialId: c.legacyMaterialId } : null;
      },
      create: async (args: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt'> }) => {
        await spy.create(args as never);
        const d = args.data;
        if (db.corrections.some((c) => c.nodeId === d.nodeId && c.face === d.face)) {
          throw prismaError('P2002');
        }
        const rec: Row = {
          ...d,
          legacyMaterialId: d.legacyMaterialId ?? null,
          id: `new-${++ids}`,
          createdAt: T0,
          updatedAt: T0,
        };
        db.corrections.push(rec);
        undo.push(() => db.corrections.splice(db.corrections.indexOf(rec), 1));
        return { id: rec.id };
      },
      updateMany: async (args: {
        where: { id: string; legacyMaterialId: string | null };
        data: Partial<Row>;
      }) => {
        await spy.updateMany(args as never);
        const hit = db.corrections.filter(
          (c) => c.id === args.where.id && c.legacyMaterialId === args.where.legacyMaterialId,
        );
        for (const c of hit) {
          const prev = { ...c };
          Object.assign(c, args.data);
          undo.push(() => Object.assign(c, prev));
        }
        return { count: hit.length };
      },
      deleteMany: async (args: { where: { id: string; legacyMaterialId: string | null } }) => {
        await spy.deleteMany(args as never);
        const hit = db.corrections.filter(
          (c) => c.id === args.where.id && c.legacyMaterialId === args.where.legacyMaterialId,
        );
        for (const c of hit) {
          const at = db.corrections.indexOf(c);
          db.corrections.splice(at, 1);
          undo.push(() => db.corrections.splice(at, 0, c));
        }
        return { count: hit.length };
      },
    },
    material: {
      updateMany: async (args: {
        where: { id: string; projectId: string; attachedNodeId: string };
        data: { attachedNodeId: null; attachedAt: null };
      }) => {
        await prismaMock.material.updateMany(args as never);
        const hit = db.legacy.filter(
          (l) =>
            l.id === args.where.id &&
            l.projectId === args.where.projectId &&
            l.attachedNodeId === args.where.attachedNodeId,
        );
        for (const l of hit) {
          const prev = { ...l };
          Object.assign(l, args.data);
          undo.push(() => Object.assign(l, prev));
        }
        return { count: hit.length };
      },
    },
  });
  prismaMock.$transaction.mockImplementation((async (cb: (t: unknown) => Promise<unknown>) => {
    const undo: (() => void)[] = [];
    try {
      return await cb(tx(undo));
    } catch (e) {
      for (const revert of undo.reverse()) revert();
      throw e;
    }
  }) as never);
  return db;
}

const row = (face: string, valeur: string | null, nodeId = NODE_ID): Row => ({
  id: `c-${nodeId}-${face}`,
  nodeId,
  face,
  faceLabel: null,
  valeur,
  origin: 'user',
  legacyMaterialId: null,
  createdAt: T0,
  updatedAt: T0,
});

/** A correction attached from the old sheet's row `materialId`. */
const attached = (face: string, valeur: string | null, materialId: string, nodeId = NODE_ID) => ({
  ...row(face, valeur, nodeId),
  origin: 'legacy_attach' as const,
  legacyMaterialId: materialId,
});

const ATTACHED_AT = new Date('2026-10-12T09:00:00Z');
const legacyRow = (
  id: string,
  attachedNodeId: string | null,
  projectId = PROJECT_ID,
): LegacyRow => ({
  id,
  projectId,
  attachedNodeId,
  attachedAt: attachedNodeId ? ATTACHED_AT : null,
});

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

// ── Access ──────────────────────────────────────────────────────────────

describe('node materials route — access', () => {
  const calls: [
    Method,
    (req: NextRequest, c: ReturnType<typeof ctx>) => Promise<Response>,
    unknown,
  ][] = [
    ['GET', GET, undefined],
    ['PUT', PUT, { valeur: 'Zinc' }],
    ['DELETE', DELETE, undefined],
  ];

  it.each(calls)(
    '%s: 401 without a valid session, nothing read or written',
    async (method, handler, body) => {
      vi.mocked(verifyToken).mockResolvedValue(null as never);
      const res = await handler(makeReq(method, body), ctx());
      expect(res.status).toBe(401);
      expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each(calls)(
    '%s: 404 when the project belongs to another user (IDOR)',
    async (method, handler, body) => {
      signIn(OTHER_USER);
      world({ projectOwner: OWNER_ID });
      store();
      const res = await handler(makeReq(method, body), ctx());
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('PROJECT_NOT_FOUND');
      expect(prismaMock.renderNode.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each(calls)(
    '%s: 404 when the node belongs to another project',
    async (method, handler, body) => {
      signIn();
      world({ nodeProject: 'project-2' });
      store();
      const res = await handler(makeReq(method, body), ctx());
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toBe('NODE_NOT_FOUND');
      expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each(calls)('%s: 404 when the node does not exist', async (method, handler, body) => {
    signIn();
    world({ nodeProject: null });
    store();
    const res = await handler(makeReq(method, body), ctx());
    expect(res.status).toBe(404);
  });

  it.each([
    ['PUT', PUT, { valeur: 'Zinc' }],
    ['DELETE', DELETE, undefined],
  ] as const)('%s: 403 without the CSRF token, nothing written', async (method, handler, body) => {
    signIn();
    world();
    store();
    const res = await handler(makeReq(method, body, { csrf: false }), ctx());
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
  });

  it('GET needs no CSRF token (a read)', async () => {
    signIn();
    world();
    store();
    const res = await GET(makeReq('GET', undefined, { csrf: false }), ctx());
    expect(res.status).toBe(200);
  });

  it.each([
    ['empty', '   '],
    ['without anything ASCII', '東'],
    ['too long once canonical', 'a'.repeat(65)],
    ['too long as a label', `${'a '.repeat(30)}${'-'.repeat(200)}`],
  ])('400 on a face name %s, before any node or material is read', async (_label, face) => {
    signIn();
    world();
    store();
    const res = await GET(makeReq('GET'), ctx(face));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.materialCorrection.findMany).not.toHaveBeenCalled();
  });
});

// ── GET ─────────────────────────────────────────────────────────────────

describe('GET — the face as it resolves on this image', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('returns the detection when there is no correction', async () => {
    store({ detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Zinc' }] });
    const res = await GET(makeReq('GET'), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      material: {
        face: 'toiture',
        faceLabel: null,
        valeur: 'Zinc',
        origin: 'detection',
        confidence: 70,
        correction: 'none',
        correctionOrigin: null,
      },
    });
  });

  it('canonicalises the face of the path ("Façade Principale" = facade_principale)', async () => {
    store({
      corrections: [{ ...row('facade_principale', 'Pierre'), faceLabel: 'Façade principale' }],
    });
    // As Next.js hands it over: the path segment already decoded.
    const res = await GET(makeReq('GET'), ctx('Façade Principale'));
    expect(await res.json()).toMatchObject({
      material: {
        face: 'facade_principale',
        faceLabel: 'Façade principale',
        valeur: 'Pierre',
        origin: 'correction',
      },
    });
  });

  it('never leaks another image of the same project', async () => {
    store({
      detections: [{ nodeId: OTHER_NODE, face: 'toiture', valeur: 'Tuile' }],
      corrections: [row('toiture', 'Ardoise', OTHER_NODE)],
    });
    const res = await GET(makeReq('GET'), ctx('toiture'));
    expect(await res.json()).toMatchObject({
      material: { valeur: null, origin: null, correction: 'none' },
    });
    for (const call of prismaMock.materialCorrection.findMany.mock.calls) {
      expect(call[0]?.where).toEqual({ nodeId: NODE_ID });
    }
  });

  it('starts no detection and writes nothing', async () => {
    store();
    await GET(makeReq('GET'), ctx('toiture'));
    expect(prismaMock.materialDetectionRun.create).not.toHaveBeenCalled();
    expect(prismaMock.materialDetection.createMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('a database error is a 503 MATERIALS_UNAVAILABLE, never an empty answer', async () => {
    store();
    prismaMock.materialCorrection.findMany.mockRejectedValue(
      Object.assign(new Error('Can’t reach database server at db.internal:5432'), {
        code: 'P1001',
      }),
    );
    const res = await GET(makeReq('GET'), ctx('toiture'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: 'MATERIALS_UNAVAILABLE',
      message: 'Materials are unavailable, try again',
    });
    expect(JSON.stringify(body)).not.toContain('db.internal');
  });

  it('a database error on the node lookup is a 503 too', async () => {
    store();
    prismaMock.renderNode.findUnique.mockRejectedValue(new Error('timeout'));
    const res = await GET(makeReq('GET'), ctx('toiture'));
    expect(res.status).toBe(503);
  });
});

// ── The face of the path ────────────────────────────────────────────────
//
// Next.js decodes the dynamic segment before calling the handler, so the
// handler gets "Mur%20A" for a label that literally holds "%20". These tests
// hand the params in already decoded, as Next.js does; Next's own decoding —
// and its 400 on a malformed escape, answered before any handler runs — is
// not reproducible by calling the handler directly.

describe('the face of the path, as Next.js hands it over (decoded once)', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it.each([
    ['Façade principale', 'facade_principale'],
    ['Mur%20A', 'mur_20a'],
    ['x%25y', 'x_25y'],
    ['Toit 50%', 'toit_50'],
    ['Été', 'ete'],
  ])('"%s" is stored under %s, its label kept as is', async (label, expected) => {
    expect(canonicalFace(label)).toBe(expected);
    const db = store();
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx(label));
    expect(res.status).toBe(200);
    expect(prismaMock.materialCorrection.findUnique.mock.calls[0]?.[0]?.where).toEqual({
      nodeId_face: { nodeId: NODE_ID, face: expected },
    });
    expect(db.corrections).toEqual([
      expect.objectContaining({ face: expected, faceLabel: label, valeur: 'Zinc' }),
    ]);
    expect(await res.json()).toMatchObject({ material: { face: expected, faceLabel: label } });
  });

  it('"Mur%20A" and "Mur A" are two faces, never merged by a second decoding', async () => {
    const db = store();
    await PUT(makeReq('PUT', { valeur: 'Brique' }), ctx('Mur%20A'));
    await PUT(makeReq('PUT', { valeur: 'Pierre' }), ctx('Mur A'));
    expect(db.corrections.map((c) => [c.face, c.valeur])).toEqual([
      ['mur_20a', 'Brique'],
      ['mur_a', 'Pierre'],
    ]);
  });

  it('does not decode the segment again: a still-encoded one is taken literally', async () => {
    store();
    const encoded = encodeURIComponent('Façade principale'); // Fa%C3%A7ade%20principale
    const res = await GET(makeReq('GET'), ctx(encoded));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { material: { face: string } };
    expect(body.material.face).toBe(canonicalFace(encoded));
    expect(body.material.face).not.toBe('facade_principale');
  });
});

// ── PUT ─────────────────────────────────────────────────────────────────

describe('PUT — set or remove a face on this image', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('creates the correction under the canonical face, keeping the label', async () => {
    const db = store();
    const res = await PUT(makeReq('PUT', { valeur: 'Bardage bois' }), ctx('Façade  principale'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([
      expect.objectContaining({
        nodeId: NODE_ID,
        face: 'facade_principale',
        faceLabel: 'Façade principale',
        valeur: 'Bardage bois',
      }),
    ]);
    expect(prismaMock.materialCorrection.findUnique.mock.calls[0]?.[0]?.where).toEqual({
      nodeId_face: { nodeId: NODE_ID, face: 'facade_principale' },
    });
    // A typed correction is the user's: origin "user" (the schema's default,
    // written out), no link to the old sheet.
    expect(prismaMock.materialCorrection.create.mock.calls[0]?.[0]).toEqual({
      data: {
        nodeId: NODE_ID,
        face: 'facade_principale',
        faceLabel: 'Façade principale',
        valeur: 'Bardage bois',
        origin: 'user',
      },
      select: { id: true },
    });
    expect(await res.json()).toMatchObject({
      material: {
        face: 'facade_principale',
        valeur: 'Bardage bois',
        origin: 'correction',
        correction: 'value',
      },
    });
  });

  it('updates an existing correction in place: still one row', async () => {
    const db = store({ corrections: [row('toiture', 'Zinc')] });
    const res = await PUT(makeReq('PUT', { valeur: 'Ardoise' }), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(db.corrections).toHaveLength(1);
    expect(db.corrections[0]).toMatchObject({ valeur: 'Ardoise' });
  });

  it('a correction beats the detection of the same face', async () => {
    store({ detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Zinc' }] });
    const res = await PUT(makeReq('PUT', { valeur: 'Tuile' }), ctx('toiture'));
    expect(await res.json()).toMatchObject({ material: { valeur: 'Tuile', origin: 'correction' } });
  });

  it('null removes the face — the correction row stays, the detection stays untouched', async () => {
    const db = store({ detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Zinc' }] });
    const res = await PUT(makeReq('PUT', { valeur: null }), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([expect.objectContaining({ face: 'toiture', valeur: null })]);
    expect(db.detections).toHaveLength(1);
    expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      material: { valeur: null, origin: null, correction: 'removed' },
    });
  });

  it('normalises line breaks and spaces before storing', async () => {
    const db = store();
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    await PUT(
      makeReq('PUT', { valeur: `  Bardage${CR}${LF}bois${CR}clair${LF}${LF}   huilé ` }),
      ctx('toiture'),
    );
    expect(db.corrections[0]?.valeur).toBe('Bardage bois clair huilé');
  });

  it('accepts 500 characters after normalisation, refuses 501', async () => {
    store();
    const ok = await PUT(makeReq('PUT', { valeur: `${'a'.repeat(500)}   ` }), ctx('toiture'));
    expect(ok.status).toBe(200);
    const tooLong = await PUT(makeReq('PUT', { valeur: 'a'.repeat(501) }), ctx('sol'));
    expect(tooLong.status).toBe(400);
  });

  it.each([
    ['an empty string', { valeur: '' }],
    ['spaces only', { valeur: '   ' }],
    ['line breaks only', { valeur: '\n\r\n ' }],
    ['a number', { valeur: 12 }],
    ['a missing valeur', {}],
    ['an unknown field', { valeur: 'Zinc', face: 'sol' }],
    ['an array', ['Zinc']],
    ['malformed JSON', '{"valeur":'],
  ])('400 on %s, nothing written', async (_label, body) => {
    store();
    const res = await PUT(makeReq('PUT', body), ctx('toiture'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('writes only on the checked node, never on another one', async () => {
    store();
    await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(prismaMock.materialCorrection.findUnique).toHaveBeenCalled();
    for (const call of prismaMock.materialCorrection.findUnique.mock.calls) {
      expect(call[0]?.where).toEqual({ nodeId_face: { nodeId: NODE_ID, face: 'toiture' } });
    }
    for (const call of prismaMock.materialCorrection.create.mock.calls) {
      expect(call[0]?.data).toMatchObject({ nodeId: NODE_ID, face: 'toiture' });
    }
  });

  it('two concurrent first writes on one face end in one row (the insert race is retried as an update)', async () => {
    const db = store();
    // Both requests read "no row"; both then insert — the second hits the
    // unique key (P2002), as the database would answer, rolls back, re-reads
    // and updates the row the first one made.
    prismaMock.materialCorrection.create.mockImplementation((async () => {
      await new Promise((r) => setTimeout(r, 5));
    }) as never);

    const [a, b] = await Promise.all([
      PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture')),
      PUT(makeReq('PUT', { valeur: 'Ardoise' }), ctx('toiture')),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(db.corrections).toHaveLength(1);
    expect(prismaMock.materialCorrection.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.materialCorrection.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
  });

  it('a unique conflict that persists after the retry is a 409, without Prisma’s message', async () => {
    const db = store();
    prismaMock.materialCorrection.create.mockRejectedValue(
      prismaError('P2002', 'Unique constraint failed on the fields: (`nodeId`,`face`)'),
    );
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'CONFLICT',
      message: 'The correction changed meanwhile, try again',
    });
    expect(prismaMock.materialCorrection.create).toHaveBeenCalledTimes(2);
    expect(db.corrections).toEqual([]);
  });

  // A DELETE of the same face commits between this request's read and its
  // update. Simulated with the store — not a proof on a real PostgreSQL.
  const recordGone = () =>
    prismaError(
      'P2025',
      'An operation failed because it depends on one or more records that were required but not found. Record to update not found.',
    );

  it('a PUT racing a DELETE is retried once and sets the value', async () => {
    const db = store({ corrections: [row('toiture', 'Zinc')] });
    prismaMock.materialCorrection.updateMany.mockImplementationOnce((async () => {
      db.corrections.splice(0); // the DELETE commits between the read and the update
    }) as never);

    const res = await PUT(makeReq('PUT', { valeur: 'Ardoise' }), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.materialCorrection.create).toHaveBeenCalledTimes(1);
    expect(db.corrections).toEqual([
      expect.objectContaining({ nodeId: NODE_ID, face: 'toiture', valeur: 'Ardoise' }),
    ]);
    expect(await res.json()).toMatchObject({
      material: { valeur: 'Ardoise', origin: 'correction', correction: 'value' },
    });
  });

  it('a P2025 that persists is a 409 after two attempts, without Prisma’s message', async () => {
    store();
    prismaMock.materialCorrection.create.mockRejectedValue(recordGone());
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: 'CONFLICT',
      message: 'The correction changed meanwhile, try again',
    });
    expect(JSON.stringify(body)).not.toContain('Record to update not found');
    expect(prismaMock.materialCorrection.create).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['P2025 then P2002', 'P2025', 'P2002'],
    ['P2002 then P2025', 'P2002', 'P2025'],
    ['P2034 then P2002', 'P2034', 'P2002'],
  ])('%s: still two attempts only, then a 409 — never a loop', async (_l, first, second) => {
    store();
    prismaMock.materialCorrection.create
      .mockRejectedValueOnce(prismaError(first))
      .mockRejectedValueOnce(prismaError(second))
      .mockResolvedValue({ id: 'x' } as never);
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(409);
    expect(prismaMock.materialCorrection.create).toHaveBeenCalledTimes(2);
  });

  it('a database error on the retry after a race is a 503', async () => {
    store();
    prismaMock.materialCorrection.create
      .mockRejectedValueOnce(recordGone())
      .mockRejectedValueOnce(prismaError('P1001', 'db.internal:5432'));
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe('MATERIALS_UNAVAILABLE');
  });

  it('a database error on write is a 503, never a success, and is not retried', async () => {
    const db = store();
    prismaMock.materialCorrection.create.mockRejectedValue(
      prismaError('P1001', 'Can’t reach database server at db.internal:5432'),
    );
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: 'MATERIALS_UNAVAILABLE',
      message: 'Materials are unavailable, try again',
    });
    expect(JSON.stringify(body)).not.toContain('db.internal');
    expect(prismaMock.materialCorrection.create).toHaveBeenCalledTimes(1);
    expect(db.corrections).toEqual([]);
  });

  it('a database error on the read is a 503, nothing written', async () => {
    const db = store({ corrections: [row('toiture', 'Zinc')] });
    prismaMock.materialCorrection.findUnique.mockRejectedValue(prismaError('P1001'));
    const res = await PUT(makeReq('PUT', { valeur: 'Ardoise' }), ctx('toiture'));
    expect(res.status).toBe(503);
    expect(db.corrections).toEqual([row('toiture', 'Zinc')]);
  });

  it('a typed correction never touches the project’s old Material sheet', async () => {
    store();
    await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.material.update).not.toHaveBeenCalled();
    expect(prismaMock.material.upsert).not.toHaveBeenCalled();
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
  });
});

// ── DELETE ──────────────────────────────────────────────────────────────

describe('DELETE — cancel the correction of a face on this image', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('removes the correction only: the detection applies again', async () => {
    const db = store({
      detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Zinc' }],
      corrections: [row('toiture', 'Ardoise')],
    });
    const res = await DELETE(makeReq('DELETE'), ctx('Toiture'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([]);
    expect(db.detections).toHaveLength(1);
    expect(await res.json()).toEqual({
      deleted: true,
      material: {
        face: 'toiture',
        faceLabel: null,
        valeur: 'Zinc',
        origin: 'detection',
        confidence: 70,
        correction: 'none',
        correctionOrigin: null,
      },
    });
    // Deleted by id and link: only the very correction that was read.
    expect(prismaMock.materialCorrection.deleteMany.mock.calls[0]?.[0]).toEqual({
      where: { id: `c-${NODE_ID}-toiture`, legacyMaterialId: null },
    });
  });

  it('cancels a removal (null) the same way', async () => {
    const db = store({
      detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Zinc' }],
      corrections: [row('toiture', null)],
    });
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(db.corrections).toEqual([]);
    expect(await res.json()).toMatchObject({ deleted: true, material: { valeur: 'Zinc' } });
  });

  it('no correction to cancel: 200 with deleted false, not an error', async () => {
    store();
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: false, material: { correction: 'none' } });
    expect(prismaMock.materialCorrection.deleteMany).not.toHaveBeenCalled();
  });

  it('never deletes another node’s correction, a detection or the old sheet', async () => {
    const db = store({
      corrections: [row('toiture', 'Ardoise', OTHER_NODE), row('toiture', 'Zinc')],
    });
    await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(db.corrections).toEqual([expect.objectContaining({ nodeId: OTHER_NODE })]);
    expect(prismaMock.materialDetection.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.material.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.material.delete).not.toHaveBeenCalled();
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
  });

  it('a database error is a 503, the correction kept', async () => {
    const db = store({ corrections: [row('toiture', 'Zinc')] });
    prismaMock.materialCorrection.deleteMany.mockRejectedValue(new Error('x'));
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(503);
    expect(db.corrections).toEqual([row('toiture', 'Zinc')]);
  });
});

// ── Étape 3C.5.3: corrections attached from the old sheet ───────────────

describe('PUT on a correction attached from the old sheet (3C.5.3)', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('a new value makes it the user’s: origin "user", link cleared, the old row released', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise naturelle', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([
      expect.objectContaining({
        face: 'toiture',
        valeur: 'Zinc',
        origin: 'user',
        legacyMaterialId: null,
      }),
    ]);
    expect(db.legacy).toEqual([legacyRow('m1', null)]);
    // Released only while still marked for this image, in this project.
    expect(prismaMock.material.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 'm1', projectId: PROJECT_ID, attachedNodeId: NODE_ID },
      data: { attachedNodeId: null, attachedAt: null },
    });
    expect(await res.json()).toMatchObject({
      material: {
        valeur: 'Zinc',
        origin: 'correction',
        correction: 'value',
        correctionOrigin: 'user',
      },
    });
    // No generation, no prompt snapshot is ever written here.
    expect(prismaMock.generation.update).not.toHaveBeenCalled();
    expect(prismaMock.generation.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.generation.create).not.toHaveBeenCalled();
  });

  it('masking it (null) makes it the user’s removal the same way; the detection stays', async () => {
    const db = store({
      detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Tuile' }],
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    const res = await PUT(makeReq('PUT', { valeur: null }), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([
      expect.objectContaining({ valeur: null, origin: 'user', legacyMaterialId: null }),
    ]);
    expect(db.legacy).toEqual([legacyRow('m1', null)]);
    expect(db.detections).toHaveLength(1);
    expect(await res.json()).toMatchObject({
      material: { correction: 'removed', correctionOrigin: 'user' },
    });
  });

  it('other old rows, other faces and other images are left as they are', async () => {
    const db = store({
      corrections: [
        attached('toiture', 'Ardoise', 'm1'),
        attached('sol', 'Béton', 'm2'),
        attached('toiture', 'Tuile', 'm3', OTHER_NODE),
      ],
      legacy: [legacyRow('m1', NODE_ID), legacyRow('m2', NODE_ID), legacyRow('m3', OTHER_NODE)],
    });
    await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(db.legacy).toEqual([
      legacyRow('m1', null),
      legacyRow('m2', NODE_ID),
      legacyRow('m3', OTHER_NODE),
    ]);
    expect(db.corrections.slice(1)).toEqual([
      attached('sol', 'Béton', 'm2'),
      attached('toiture', 'Tuile', 'm3', OTHER_NODE),
    ]);
  });

  it('an old row marked for another image is never released from here', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', OTHER_NODE)],
    });
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(db.legacy).toEqual([legacyRow('m1', OTHER_NODE)]);
    expect(db.corrections[0]).toMatchObject({ origin: 'user', legacyMaterialId: null });
  });

  it('the link changed meanwhile (made the user’s elsewhere): re-read once, nothing left behind', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    // Another request commits between this one's read and its update: it made
    // the correction the user's and released the old row.
    prismaMock.materialCorrection.updateMany.mockImplementationOnce((async () => {
      Object.assign(db.corrections[0]!, { origin: 'user', legacyMaterialId: null, valeur: 'Bois' });
      Object.assign(db.legacy[0]!, { attachedNodeId: null, attachedAt: null });
    }) as never);
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(db.corrections).toEqual([
      expect.objectContaining({ valeur: 'Zinc', origin: 'user', legacyMaterialId: null }),
    ]);
    expect(db.legacy).toEqual([legacyRow('m1', null)]);
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
  });

  it('a write conflict that persists (P2034) is a 409: correction and mark as they were', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    prismaMock.material.updateMany.mockRejectedValue(prismaError('P2034'));
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(db.corrections).toEqual([attached('toiture', 'Ardoise', 'm1')]);
    expect(db.legacy).toEqual([legacyRow('m1', NODE_ID)]);
  });

  it('a failure after the correction was rewritten rolls both back: 503, nothing half-done', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    prismaMock.material.updateMany.mockRejectedValue(prismaError('P1001'));
    const res = await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(res.status).toBe(503);
    expect(db.corrections).toEqual([attached('toiture', 'Ardoise', 'm1')]);
    expect(db.legacy).toEqual([legacyRow('m1', NODE_ID)]);
  });

  it('a typed correction never releases an old row it has nothing to do with', async () => {
    const db = store({
      corrections: [row('toiture', 'Ardoise')],
      // A mark on this image with no correction from it (stale): not this
      // correction's business.
      legacy: [legacyRow('m9', NODE_ID)],
    });
    await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    expect(db.legacy).toEqual([legacyRow('m9', NODE_ID)]);
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
  });
});

describe('DELETE of a correction attached from the old sheet (3C.5.3)', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('removes it and releases the old row; the detection applies again', async () => {
    const db = store({
      detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Tuile' }],
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID), legacyRow('m2', NODE_ID)],
    });
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([]);
    expect(db.legacy).toEqual([legacyRow('m1', null), legacyRow('m2', NODE_ID)]);
    expect(db.detections).toHaveLength(1);
    expect(await res.json()).toMatchObject({
      deleted: true,
      material: { valeur: 'Tuile', origin: 'detection', correctionOrigin: null },
    });
  });

  it('a typed correction deleted: the old sheet is not touched, even a stale mark here', async () => {
    const db = store({
      corrections: [row('toiture', 'Ardoise')],
      legacy: [legacyRow('m9', NODE_ID)],
    });
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(db.legacy).toEqual([legacyRow('m9', NODE_ID)]);
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
  });

  it('already gone: deleted false, the old sheet not touched', async () => {
    const db = store({ legacy: [legacyRow('m1', NODE_ID)] });
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(await res.json()).toMatchObject({ deleted: false });
    expect(db.legacy).toEqual([legacyRow('m1', NODE_ID)]);
  });

  it('a database error during the release rolls the delete back: 503, both as they were', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    prismaMock.material.updateMany.mockRejectedValue(prismaError('P1001'));
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(503);
    expect(db.corrections).toEqual([attached('toiture', 'Ardoise', 'm1')]);
    expect(db.legacy).toEqual([legacyRow('m1', NODE_ID)]);
  });

  it('made the user’s meanwhile: 409, never deleted on the user’s behalf, never retried', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    prismaMock.materialCorrection.deleteMany.mockImplementationOnce((async () => {
      Object.assign(db.corrections[0]!, { origin: 'user', legacyMaterialId: null, valeur: 'Zinc' });
      Object.assign(db.legacy[0]!, { attachedNodeId: null, attachedAt: null });
    }) as never);
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');
    expect(db.corrections).toEqual([
      expect.objectContaining({ valeur: 'Zinc', origin: 'user', legacyMaterialId: null }),
    ]);
    expect(prismaMock.materialCorrection.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
  });

  it('replaced meanwhile by a new attach: 409, the new correction and its mark kept', async () => {
    const db = store({
      corrections: [row('toiture', 'Ardoise')],
      legacy: [legacyRow('m2', null)],
    });
    prismaMock.materialCorrection.deleteMany.mockImplementationOnce((async () => {
      // Another request deleted the typed correction, then attached m2 on the face.
      db.corrections.splice(0, 1, { ...attached('toiture', 'Brique', 'm2'), id: 'c-new' });
      Object.assign(db.legacy[0]!, { attachedNodeId: NODE_ID, attachedAt: ATTACHED_AT });
    }) as never);
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(409);
    expect(db.corrections).toEqual([
      expect.objectContaining({ id: 'c-new', legacyMaterialId: 'm2', valeur: 'Brique' }),
    ]);
    expect(db.legacy).toEqual([legacyRow('m2', NODE_ID)]);
  });

  it('deleted meanwhile by another request: deleted false, not an error', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    prismaMock.materialCorrection.deleteMany.mockImplementationOnce((async () => {
      db.corrections.splice(0); // the other DELETE commits, releasing m1 itself
      Object.assign(db.legacy[0]!, { attachedNodeId: null, attachedAt: null });
    }) as never);
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: false });
    expect(db.legacy).toEqual([legacyRow('m1', null)]);
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
  });

  it('a write conflict (P2034) is a 409, everything rolled back', async () => {
    const db = store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    prismaMock.material.updateMany.mockRejectedValue(prismaError('P2034'));
    const res = await DELETE(makeReq('DELETE'), ctx('toiture'));
    expect(res.status).toBe(409);
    expect(db.corrections).toEqual([attached('toiture', 'Ardoise', 'm1')]);
    expect(db.legacy).toEqual([legacyRow('m1', NODE_ID)]);
  });
});

// ── Where a correction comes from, as stored (3C.5.5) ───────────────────

describe('the correction’s origin, as stored (3C.5.5)', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('GET of a correction attached from the old sheet and untouched: legacy_attach', async () => {
    store({
      detections: [{ nodeId: NODE_ID, face: 'toiture', valeur: 'Tuile' }],
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    const res = await GET(makeReq('GET'), ctx('toiture'));
    expect(await res.json()).toMatchObject({
      material: { valeur: 'Ardoise', correction: 'value', correctionOrigin: 'legacy_attach' },
    });
  });

  it('once changed by the user, GET says the user’s: the PUT rewrote the stored origin', async () => {
    store({
      corrections: [attached('toiture', 'Ardoise', 'm1')],
      legacy: [legacyRow('m1', NODE_ID)],
    });
    await PUT(makeReq('PUT', { valeur: 'Zinc' }), ctx('toiture'));
    const res = await GET(makeReq('GET'), ctx('toiture'));
    expect(await res.json()).toMatchObject({
      material: { valeur: 'Zinc', correctionOrigin: 'user' },
    });
  });

  it('a typed correction and a masked face: the user’s; no correction: null', async () => {
    store({
      detections: [
        { nodeId: NODE_ID, face: 'toiture', valeur: 'Tuile' },
        { nodeId: NODE_ID, face: 'sol', valeur: 'Béton' },
      ],
      corrections: [row('facade', 'Brique'), row('sol', null)],
    });
    const origin = async (face: string) =>
      (
        (await (await GET(makeReq('GET'), ctx(face))).json()) as {
          material: Record<string, unknown>;
        }
      ).material;
    expect(await origin('facade')).toMatchObject({ correction: 'value', correctionOrigin: 'user' });
    expect(await origin('sol')).toMatchObject({ correction: 'removed', correctionOrigin: 'user' });
    expect(await origin('toiture')).toMatchObject({
      origin: 'detection',
      correction: 'none',
      correctionOrigin: null,
    });
  });
});

// ── A face whose key is "attach" (3C.5.5) ───────────────────────────────
// The attach route was a static "attach" segment beside [face] until étape
// 3C.5.5 and took this face's path. Here: the handlers serve it like any other face; that
// Next.js routes the path to them is checked by nodes/[nodeId]/routing.test.ts.

describe('a face named "attach" is a face like any other (3C.5.5)', () => {
  beforeEach(() => {
    signIn();
    world();
  });

  it('GET reads it', async () => {
    store({ detections: [{ nodeId: NODE_ID, face: 'attach', valeur: 'Fixation inox' }] });
    const res = await GET(makeReq('GET'), ctx('attach'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      material: { face: 'attach', valeur: 'Fixation inox', origin: 'detection' },
    });
  });

  it('PUT sets it, and a typed "Attach" is the same face', async () => {
    const db = store();
    const res = await PUT(makeReq('PUT', { valeur: 'Fixation laiton' }), ctx('Attach'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([
      expect.objectContaining({ face: 'attach', faceLabel: 'Attach', valeur: 'Fixation laiton' }),
    ]);
    expect(await res.json()).toMatchObject({
      material: { face: 'attach', correction: 'value', correctionOrigin: 'user' },
    });
  });

  it('DELETE cancels its correction', async () => {
    const db = store({
      detections: [{ nodeId: NODE_ID, face: 'attach', valeur: 'Fixation inox' }],
      corrections: [row('attach', 'Fixation laiton')],
    });
    const res = await DELETE(makeReq('DELETE'), ctx('attach'));
    expect(res.status).toBe(200);
    expect(db.corrections).toEqual([]);
    expect(await res.json()).toMatchObject({
      deleted: true,
      material: { face: 'attach', valeur: 'Fixation inox', origin: 'detection' },
    });
  });
});
