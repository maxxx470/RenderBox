// POST /api/projects/[projectId]/nodes/[nodeId]/legacy-attach (étape
// 3C.5.2): access (CSRF, session, project owner, node of this project, rows of
// this project), the plan applied all or nothing, never an overwrite,
// repeated requests, races, and the database failing.
//
// No database: the transaction runs against a small in-memory store with an
// undo log — a callback that throws has every write it made reverted, as a
// rollback would. Its unique keys and its compare-and-set mirror the schema
// (MaterialCorrection: (nodeId, face) and legacyMaterialId unique). What this
// shows is the route's behaviour under those rules; it does not show what
// PostgreSQL itself does under real concurrency (row locks, READ COMMITTED
// re-checks, deadlock detection) — the races here are interleavings the
// tests force, not ones the database produced.
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
import { POST } from './route';

const OWNER_ID = 'user-owner';
const PROJECT_ID = 'project-1';
const OTHER_PROJECT = 'project-2';
const NODE_ID = 'node-a';
const SIBLING = 'node-b';
const FOREIGN_NODE = 'node-x';
const T0 = new Date('2026-10-01T10:00:00Z');

// ── The in-memory store ─────────────────────────────────────────────────

interface MaterialRec {
  id: string;
  projectId: string;
  face: string;
  valeur: string;
  attachedNodeId: string | null;
  attachedAt: Date | null;
}
interface CorrectionRec {
  id: string;
  nodeId: string;
  face: string;
  faceLabel: string | null;
  valeur: string | null;
  origin: string;
  legacyMaterialId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface DetectionRec {
  nodeId: string;
  face: string;
  valeur: string;
  confidence: number;
  position: number;
}

let db: {
  nodes: { id: string; projectId: string }[];
  materials: MaterialRec[];
  corrections: CorrectionRec[];
  detections: DetectionRec[];
};
/** Points where a test steps in: a concurrent write, or a failure. */
let hooks: {
  failRead?: 'node' | 'materials' | 'detections' | 'corrections';
  beforeClaim?: (materialId: string) => Promise<void> | void;
  beforeCreate?: (data: { nodeId: string; face: string }) => Promise<void> | void;
};
let seq = 0;

const prismaError = (code: string) => Object.assign(new Error(`prisma ${code}`), { code });

function material(id: string, face: string, valeur: string, extra: Partial<MaterialRec> = {}) {
  return {
    id,
    projectId: PROJECT_ID,
    face,
    valeur,
    attachedNodeId: null,
    attachedAt: null,
    ...extra,
  };
}
function correction(face: string, valeur: string | null, extra: Partial<CorrectionRec> = {}) {
  return {
    id: `c-${++seq}`,
    nodeId: NODE_ID,
    face,
    faceLabel: null,
    valeur,
    origin: 'user',
    legacyMaterialId: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  } satisfies CorrectionRec;
}

function makeTx(undo: (() => void)[]) {
  const read = (what: NonNullable<typeof hooks.failRead>) => {
    if (hooks.failRead === what) throw prismaError('P1001');
  };
  return {
    renderNode: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        read('node');
        const n = db.nodes.find((x) => x.id === where.id);
        return n ? { projectId: n.projectId } : null;
      },
      findMany: async ({ where }: { where: { id: { in: string[] }; projectId: string } }) =>
        db.nodes
          .filter((n) => where.id.in.includes(n.id) && n.projectId === where.projectId)
          .map((n) => ({ id: n.id })),
    },
    material: {
      findMany: async ({ where }: { where: { projectId: string; id: { in: string[] } } }) => {
        read('materials');
        return db.materials
          .filter((m) => m.projectId === where.projectId && where.id.in.includes(m.id))
          .map((m) => ({
            id: m.id,
            projectId: m.projectId,
            face: m.face,
            valeur: m.valeur,
            attachedNodeId: m.attachedNodeId,
          }));
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; projectId: string; attachedNodeId: string | null };
        data: { attachedNodeId: string; attachedAt: Date };
      }) => {
        await hooks.beforeClaim?.(where.id);
        const hit = db.materials.filter(
          (m) =>
            m.id === where.id &&
            m.projectId === where.projectId &&
            m.attachedNodeId === where.attachedNodeId,
        );
        for (const m of hit) {
          const prev = { attachedNodeId: m.attachedNodeId, attachedAt: m.attachedAt };
          Object.assign(m, data);
          undo.push(() => Object.assign(m, prev));
        }
        return { count: hit.length };
      },
    },
    materialDetection: {
      findMany: async ({ where }: { where: { nodeId: string } }) => {
        read('detections');
        return db.detections.filter((d) => d.nodeId === where.nodeId);
      },
    },
    materialCorrection: {
      findMany: async ({ where }: { where: { nodeId: string } }) => {
        read('corrections');
        return db.corrections.filter((c) => c.nodeId === where.nodeId).map((c) => ({ ...c }));
      },
      create: async ({ data }: { data: Omit<CorrectionRec, 'id' | 'createdAt' | 'updatedAt'> }) => {
        await hooks.beforeCreate?.(data);
        if (!db.nodes.some((n) => n.id === data.nodeId)) throw prismaError('P2003');
        if (db.corrections.some((c) => c.nodeId === data.nodeId && c.face === data.face)) {
          throw prismaError('P2002');
        }
        if (
          data.legacyMaterialId !== null &&
          db.corrections.some((c) => c.legacyMaterialId === data.legacyMaterialId)
        ) {
          throw prismaError('P2002');
        }
        const rec: CorrectionRec = { ...data, id: `c-${++seq}`, createdAt: T0, updatedAt: T0 };
        db.corrections.push(rec);
        undo.push(() => {
          db.corrections = db.corrections.filter((c) => c !== rec);
        });
        return { id: rec.id };
      },
    },
  };
}

/** A snapshot of everything the route may write, to prove nothing changed. */
const snapshot = () => structuredClone({ materials: db.materials, corrections: db.corrections });

// ── Requests ────────────────────────────────────────────────────────────

function makeReq(body: unknown, opts: { csrf?: boolean } = {}): NextRequest {
  const csrf = opts.csrf ?? true;
  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/nodes/${NODE_ID}/legacy-attach`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-access-token',
      ...(csrf ? { 'x-csrf-token': 'csrf-tok', cookie: 'app-csrf=csrf-tok' } : {}),
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const ctx = (nodeId = NODE_ID) => ({ params: Promise.resolve({ projectId: PROJECT_ID, nodeId }) });
const attach = (ids: unknown, nodeId = NODE_ID) => POST(makeReq({ materialIds: ids }), ctx(nodeId));

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

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
  seq = 0;
  hooks = {};
  db = {
    nodes: [
      { id: NODE_ID, projectId: PROJECT_ID },
      { id: SIBLING, projectId: PROJECT_ID },
      { id: FOREIGN_NODE, projectId: OTHER_PROJECT },
    ],
    materials: [
      material('m-toit', 'toiture', 'Ardoise naturelle'),
      material('m-fac', 'Façade principale', 'Enduit blanc'),
      material('m-sol', 'sol', 'Béton ciré'),
      { ...material('m-foreign', 'menuiseries', 'Alu'), projectId: OTHER_PROJECT },
    ],
    corrections: [],
    detections: [],
  };
  signIn();
  prismaMock.project.findUnique.mockResolvedValue({ userId: OWNER_ID } as never);
  prismaMock.$transaction.mockImplementation((async (cb: (tx: unknown) => Promise<unknown>) => {
    const undo: (() => void)[] = [];
    try {
      return await cb(makeTx(undo));
    } catch (e) {
      for (const revert of undo.reverse()) revert();
      throw e;
    }
  }) as never);
});

// ── Access ──────────────────────────────────────────────────────────────

describe('access', () => {
  it('403 without the CSRF token, nothing read or written', async () => {
    const before = snapshot();
    const res = await POST(makeReq({ materialIds: ['m-toit'] }, { csrf: false }), ctx());
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });

  it('401 without a session', async () => {
    vi.mocked(verifyToken).mockResolvedValue(null as never);
    const res = await POST(
      new NextRequest(`https://test/api/projects/${PROJECT_ID}/nodes/${NODE_ID}/legacy-attach`, {
        method: 'POST',
        headers: { 'x-csrf-token': 'csrf-tok', cookie: 'app-csrf=csrf-tok' },
        body: JSON.stringify({ materialIds: ['m-toit'] }),
      }),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('404 PROJECT_NOT_FOUND for a project of another user, or none', async () => {
    for (const project of [{ userId: 'someone-else' }, null]) {
      prismaMock.project.findUnique.mockResolvedValue(project as never);
      const res = await attach(['m-toit']);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('PROJECT_NOT_FOUND');
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('503 when the ownership check cannot be read', async () => {
    prismaMock.project.findUnique.mockRejectedValue(prismaError('P1001'));
    const res = await attach(['m-toit']);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('MATERIALS_UNAVAILABLE');
  });

  it('404 NODE_NOT_FOUND for an image that does not exist or is in another project', async () => {
    for (const nodeId of ['ghost', FOREIGN_NODE]) {
      const before = snapshot();
      const res = await attach(['m-toit'], nodeId);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: 'NODE_NOT_FOUND',
        message: 'Image not found in this project',
      });
      expect(snapshot()).toEqual(before);
    }
  });

  it('a row of another project is "not found" — never attached, nothing of it shown', async () => {
    const before = snapshot();
    const res = await attach(['m-foreign']);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ATTACH_BLOCKED');
    expect(body.lines).toEqual([
      { materialId: 'm-foreign', status: 'blocked', reason: 'not_found', face: null },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/menuiseries|Alu|project-2/);
    expect(snapshot()).toEqual(before);
  });

  it('an unknown id is "not found", nothing written', async () => {
    const before = snapshot();
    const res = await attach(['nope']);
    expect(res.status).toBe(409);
    expect((await res.json()).lines[0]).toMatchObject({ reason: 'not_found' });
    expect(snapshot()).toEqual(before);
  });

  it('never touches the database outside the transaction for materials', async () => {
    await attach(['m-toit']);
    expect(prismaMock.material.findMany).not.toHaveBeenCalled();
    expect(prismaMock.material.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.materialCorrection.create).not.toHaveBeenCalled();
    expect(prismaMock.materialCorrection.upsert).not.toHaveBeenCalled();
  });
});

// ── Validation ──────────────────────────────────────────────────────────

describe('validation', () => {
  it.each([
    ['no body', 'not json'],
    ['no materialIds', {}],
    ['not a list', { materialIds: 'm-toit' }],
    ['a number in the list', { materialIds: [42] }],
    ['an empty id', { materialIds: ['  '] }],
    ['an extra field', { materialIds: ['m-toit'], nodeId: SIBLING }],
    ['an id far too long', { materialIds: ['x'.repeat(129)] }],
  ])('400 for %s, nothing read or written', async (_what, body) => {
    const res = await POST(makeReq(body), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('400 for an empty list', async () => {
    const res = await attach([]);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('materialIds is empty');
  });

  it('400 over 50 ids; 50 is fine', async () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `m${i}`);
    const res = await attach(tooMany);
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    const fifty = await attach(tooMany.slice(0, 50));
    expect(fifty.status).toBe(409); // unknown ids: blocked, but read
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a duplicated id is counted once', async () => {
    const res = await attach(['m-toit', 'm-toit']);
    expect(res.status).toBe(200);
    expect((await res.json()).attached).toEqual(['m-toit']);
    expect(db.corrections).toHaveLength(1);
  });
});

// ── The plan, applied ───────────────────────────────────────────────────

describe('attaching', () => {
  it('attaches several rows: one correction each on this image, each row marked', async () => {
    const res = await attach(['m-toit', 'm-fac']);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attached).toEqual(['m-toit', 'm-fac']);
    expect(body.alreadyAttached).toEqual([]);
    expect(db.corrections.map(({ id: _id, createdAt: _c, updatedAt: _u, ...c }) => c)).toEqual(
      expect.arrayContaining([
        {
          nodeId: NODE_ID,
          face: 'toiture',
          faceLabel: null,
          valeur: 'Ardoise naturelle',
          origin: 'legacy_attach',
          legacyMaterialId: 'm-toit',
        },
        {
          nodeId: NODE_ID,
          face: 'facade_principale',
          faceLabel: 'Façade principale',
          valeur: 'Enduit blanc',
          origin: 'legacy_attach',
          legacyMaterialId: 'm-fac',
        },
      ]),
    );
    for (const id of ['m-toit', 'm-fac']) {
      const m = db.materials.find((x) => x.id === id)!;
      expect(m.attachedNodeId).toBe(NODE_ID);
      expect(m.attachedAt).toBeInstanceOf(Date);
    }
    // The old sheet itself is not changed: same faces, same values.
    expect(db.materials.find((m) => m.id === 'm-toit')).toMatchObject({
      face: 'toiture',
      valeur: 'Ardoise naturelle',
    });
    expect(db.materials.find((m) => m.id === 'm-sol')!.attachedNodeId).toBeNull();
  });

  it('answers with the image’s faces as committed: the attached rows as corrections', async () => {
    db.detections.push({
      nodeId: NODE_ID,
      face: 'toiture',
      valeur: 'Tuile',
      confidence: 90,
      position: 0,
    });
    const body = await (await attach(['m-toit'])).json();
    expect(body.materials).toEqual([
      {
        face: 'toiture',
        faceLabel: null,
        valeur: 'Ardoise naturelle',
        origin: 'correction',
        confidence: null,
        correction: 'value',
        correctionOrigin: 'legacy_attach',
        detected: { valeur: 'Tuile', confidence: 90 },
      },
    ]);
  });

  it('only this image changes: a sibling image gains nothing', async () => {
    await attach(['m-toit', 'm-sol']);
    expect(db.corrections.every((c) => c.nodeId === NODE_ID)).toBe(true);
    expect(db.corrections.filter((c) => c.nodeId === SIBLING)).toEqual([]);
  });

  it('one blocked row and nothing at all is written; every line says why', async () => {
    db.corrections.push(correction('toiture', 'Zinc'));
    const before = snapshot();
    const res = await attach(['m-sol', 'm-toit']);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ATTACH_BLOCKED');
    expect(body.lines).toEqual([
      expect.objectContaining({ materialId: 'm-sol', status: 'attach' }),
      {
        materialId: 'm-toit',
        status: 'blocked',
        reason: 'face_corrected',
        face: 'toiture',
        correction: 'value',
      },
    ]);
    expect(snapshot()).toEqual(before);
  });

  it('a face the user masked is protected: blocked, the removal untouched', async () => {
    db.corrections.push(correction('toiture', null));
    const before = snapshot();
    const res = await attach(['m-toit']);
    expect(res.status).toBe(409);
    expect((await res.json()).lines[0]).toMatchObject({ correction: 'removed' });
    expect(snapshot()).toEqual(before);
  });

  it('two rows on one canonical face: both blocked, nothing written', async () => {
    db.materials.push(material('m-fac2', 'facade_principale', 'Brique'));
    const before = snapshot();
    const res = await attach(['m-fac', 'm-fac2']);
    expect(res.status).toBe(409);
    expect((await res.json()).lines.map((l: { reason: string }) => l.reason)).toEqual([
      'duplicate_face',
      'duplicate_face',
    ]);
    expect(snapshot()).toEqual(before);
  });

  it('a row attached to another image of this project is blocked, naming that image', async () => {
    db.materials.find((m) => m.id === 'm-toit')!.attachedNodeId = SIBLING;
    const before = snapshot();
    const res = await attach(['m-toit']);
    expect(res.status).toBe(409);
    expect((await res.json()).lines[0]).toEqual({
      materialId: 'm-toit',
      status: 'blocked',
      reason: 'attached_elsewhere',
      face: 'toiture',
      attachedNodeId: SIBLING,
    });
    expect(snapshot()).toEqual(before);
  });

  it('a mark pointing at an image outside this project is blocked without naming it', async () => {
    db.materials.find((m) => m.id === 'm-toit')!.attachedNodeId = FOREIGN_NODE;
    const body = await (await attach(['m-toit'])).json();
    expect(body.lines[0]).toEqual({
      materialId: 'm-toit',
      status: 'blocked',
      reason: 'attached_elsewhere',
      face: 'toiture',
    });
    expect(JSON.stringify(body)).not.toContain(FOREIGN_NODE);
  });
});

// ── Repeated requests, stale marks ──────────────────────────────────────

describe('idempotence', () => {
  it('the same request twice: the second writes nothing and says "already attached"', async () => {
    await attach(['m-toit', 'm-sol']);
    const after = snapshot();
    const res = await attach(['m-toit', 'm-sol']);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attached: [], alreadyAttached: ['m-toit', 'm-sol'] });
    expect(snapshot()).toEqual(after);
  });

  it('an attached correction the user changed or masked since is left as it is', async () => {
    await attach(['m-toit']);
    const attached = db.corrections[0]!;
    for (const valeur of ['Zinc', null]) {
      attached.valeur = valeur;
      const after = snapshot();
      const res = await attach(['m-toit']);
      expect(res.status).toBe(200);
      expect((await res.json()).alreadyAttached).toEqual(['m-toit']);
      expect(snapshot()).toEqual(after);
    }
  });

  it('a stale "attached here" mark with no correction left is attached again, once', async () => {
    db.materials.find((m) => m.id === 'm-toit')!.attachedNodeId = NODE_ID;
    const res = await attach(['m-toit']);
    expect(res.status).toBe(200);
    expect((await res.json()).attached).toEqual(['m-toit']);
    expect(db.corrections).toEqual([
      expect.objectContaining({ face: 'toiture', legacyMaterialId: 'm-toit' }),
    ]);
  });

  it('a stale mark never overwrites an independent correction of the face', async () => {
    db.materials.find((m) => m.id === 'm-toit')!.attachedNodeId = NODE_ID;
    db.corrections.push(correction('toiture', 'Zinc'));
    const before = snapshot();
    const res = await attach(['m-toit']);
    expect(res.status).toBe(409);
    expect((await res.json()).lines[0]).toMatchObject({ reason: 'face_corrected' });
    expect(snapshot()).toEqual(before);
  });

  it('a stale mark whose correction sits on another image is a conflict, not a second copy', async () => {
    db.materials.find((m) => m.id === 'm-toit')!.attachedNodeId = NODE_ID;
    db.corrections.push(
      correction('toiture', 'Ardoise naturelle', { nodeId: SIBLING, legacyMaterialId: 'm-toit' }),
    );
    const before = snapshot();
    const res = await attach(['m-toit']);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');
    expect(snapshot()).toEqual(before);
  });
});

// ── Atomicity and races ─────────────────────────────────────────────────

describe('atomicity and races', () => {
  it('a write failing after others: every earlier write is rolled back, 503', async () => {
    let creates = 0;
    hooks.beforeCreate = () => {
      creates += 1;
      if (creates === 2) throw prismaError('P1001');
    };
    const before = snapshot();
    const res = await attach(['m-toit', 'm-fac', 'm-sol']);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('MATERIALS_UNAVAILABLE');
    expect(snapshot()).toEqual(before);
  });

  it('a correction the user made on the face meanwhile: 409, theirs kept, nothing of ours', async () => {
    hooks.beforeCreate = (data) => {
      if (data.face === 'sol' && !db.corrections.some((c) => c.face === 'sol')) {
        db.corrections.push(correction('sol', 'Parquet chêne')); // committed by another request
      }
    };
    const res = await attach(['m-toit', 'm-sol']);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');
    expect(db.corrections).toEqual([
      expect.objectContaining({ face: 'sol', valeur: 'Parquet chêne', origin: 'user' }),
    ]);
    expect(db.materials.every((m) => m.attachedNodeId === null)).toBe(true);
  });

  it('the row attached elsewhere meanwhile: the compare-and-set fails, 409, nothing written', async () => {
    hooks.beforeClaim = (id) => {
      if (id === 'm-toit') db.materials.find((m) => m.id === id)!.attachedNodeId = SIBLING;
    };
    const res = await attach(['m-sol', 'm-toit']);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');
    expect(db.corrections).toEqual([]);
    expect(db.materials.find((m) => m.id === 'm-sol')!.attachedNodeId).toBeNull();
    expect(db.materials.find((m) => m.id === 'm-toit')!.attachedNodeId).toBe(SIBLING);
  });

  it('two requests attaching one row to two images at once: exactly one wins', async () => {
    // Both read the row free and plan to attach it; their claims then run one
    // after the other, as the row lock would order them.
    let arrived = 0;
    let release!: () => void;
    const bothPlanned = new Promise<void>((r) => (release = r));
    let lock = Promise.resolve();
    hooks.beforeClaim = async () => {
      arrived += 1;
      if (arrived === 2) release();
      await bothPlanned;
      const mine = lock;
      let done!: () => void;
      lock = new Promise<void>((r) => (done = r));
      await mine;
      queueMicrotask(done);
    };
    const [a, b] = await Promise.all([attach(['m-toit'], NODE_ID), attach(['m-toit'], SIBLING)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect((await loser.json()).error).toBe('CONFLICT');
    expect(db.corrections).toHaveLength(1);
    const winner = db.corrections[0]!.nodeId;
    expect(db.materials.find((m) => m.id === 'm-toit')!.attachedNodeId).toBe(winner);
  });

  it.each([
    ['P2002', 'a unique key taken meanwhile'],
    ['P2003', 'the image deleted meanwhile'],
    ['P2034', 'a write conflict or deadlock'],
  ])('%s (%s) is a 409 CONFLICT, rolled back, never retried', async (code) => {
    hooks.beforeCreate = () => {
      throw prismaError(code);
    };
    const before = snapshot();
    const res = await attach(['m-toit']);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CONFLICT');
    expect(snapshot()).toEqual(before);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a conflict the transaction itself reports (P2034 on commit) is a 409', async () => {
    prismaMock.$transaction.mockRejectedValue(prismaError('P2034'));
    const res = await attach(['m-toit']);
    expect(res.status).toBe(409);
  });

  it.each(['node', 'materials', 'detections', 'corrections'] as const)(
    'the %s read failing: 503, nothing written',
    async (what) => {
      hooks.failRead = what;
      const before = snapshot();
      const res = await attach(['m-toit']);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        error: 'MATERIALS_UNAVAILABLE',
        message: 'Materials are unavailable, try again',
      });
      expect(snapshot()).toEqual(before);
    },
  );
});
