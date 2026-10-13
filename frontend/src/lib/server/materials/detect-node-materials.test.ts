// detectNodeMaterials: the detection of ONE image, its claim, its states and
// what it may write. Prisma is the shared mock, backed here by a small
// in-memory database that behaves like PostgreSQL where it matters to this
// service: the unique key (P2002), the CHECK constraints of migration
// 9_phase7_materials_per_node, conditional updateMany, and a transaction that
// is undone when its body throws. The detector is mocked (no SDK, no network).
//
// Limit: concurrency is simulated by interleaving promises over this fake
// database, not by two real PostgreSQL sessions. Row locks and READ COMMITTED
// re-checks are not reproduced; the compare-and-swap conditions are.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const { mockDetect, mockLog } = vi.hoisted(() => ({
  mockDetect: vi.fn(),
  mockLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// The detector mock returns a plain list for a valid answer; anything else
// (an object with a `kind`) is passed through as the detector's result, and
// a rejection reaches the service as an unexpected throw.
vi.mock('@/lib/server/ai/vision-materials', () => ({
  detectMaterialsDetailed: async (...args: unknown[]) => {
    const answer: unknown = await mockDetect(...args);
    return Array.isArray(answer) ? { kind: 'materials', materials: answer } : answer;
  },
}));
vi.mock('@/lib/server/observability/log', () => ({ log: mockLog }));

import {
  detectNodeMaterials,
  errorCodeForVision,
  ATTEMPT_DEADLINE_MS,
  SAVE_TX_MAX_WAIT_MS,
  SAVE_TX_TIMEOUT_MS,
  prepareDetections,
  FAILED_RETRY_COOLDOWN_MS,
  PENDING_STALE_MS,
  type DetectNodeMaterialsResult,
} from './detect-node-materials';

// ─── A tiny PostgreSQL-like store ──────────────────────────────────────────

interface RunRow {
  nodeId: string;
  status: string;
  attempts: number;
  claimToken: string | null;
  detector: string | null;
  errorCode: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  updatedAt: Date;
}
interface DetRow {
  id: string;
  nodeId: string;
  face: string;
  valeur: string;
  confidence: number;
  position: number;
  createdAt: Date;
}
type Where = Record<string, unknown>;
type Data = Record<string, unknown>;
interface Call {
  model: string;
  op: string;
  args: { where?: Where; data?: Data | Data[] };
}

const FACE_CHECK = /^[a-z0-9]+(_[a-z0-9]+)*$/;
const dbError = (code: string) => Object.assign(new Error(`fake database error ${code}`), { code });

function matches(row: object, where: Where = {}): boolean {
  const rec = row as Record<string, unknown>;
  return Object.entries(where).every(([k, v]) =>
    v instanceof Date
      ? rec[k] instanceof Date && (rec[k] as Date).getTime() === v.getTime()
      : rec[k] === v,
  );
}

class FakeDb {
  runs = new Map<string, RunRow>();
  dets: DetRow[] = [];
  calls: Call[] = [];
  ms = Date.parse('2026-10-10T12:00:00.000Z');
  nextId = 0;
  /** Runs right before a transaction body (simulates a competitor committing first). */
  beforeTransaction: (() => void) | null = null;
  /** Runs right before a run is created (simulates a competitor creating it first). */
  beforeCreateRun: (() => void) | null = null;
  failOn: { model: string; op: string } | null = null;

  now = () => new Date(this.ms);

  seedRun(run: Partial<RunRow> & { nodeId: string; status: string }) {
    const row: RunRow = {
      attempts: 1,
      claimToken: null,
      detector: 'vision-materials',
      errorCode: null,
      startedAt: this.now(),
      finishedAt: null,
      updatedAt: this.now(),
      ...run,
    };
    this.runs.set(row.nodeId, row);
  }

  seedDet(d: Omit<DetRow, 'id' | 'createdAt'>) {
    this.dets.push({ ...d, id: `det-${++this.nextId}`, createdAt: this.now() });
  }

  snapshot() {
    return JSON.stringify({ runs: [...this.runs.values()], dets: this.dets });
  }

  record(model: string, op: string, args: Call['args']) {
    this.calls.push({ model, op, args });
    if (this.failOn?.model === model && this.failOn.op === op) throw dbError('P1001');
  }

  api(undo: (() => void)[] | null) {
    return fakeApi(this, undo);
  }
}

function fakeApi(store: FakeDb, undo: (() => void)[] | null) {
  const remember = (f: () => void) => undo?.push(f);
  return {
    materialDetectionRun: {
      async findUnique(args: { where: { nodeId: string } }) {
        store.record('run', 'findUnique', args);
        const row = store.runs.get(args.where.nodeId);
        return row ? { ...row } : null;
      },
      async create(args: { data: Data }) {
        store.beforeCreateRun?.();
        store.beforeCreateRun = null;
        store.record('run', 'create', args);
        const d = args.data;
        const nodeId = d.nodeId as string;
        if (store.runs.has(nodeId)) throw dbError('P2002');
        if (!['pending', 'succeeded', 'failed'].includes(d.status as string))
          throw dbError('P2004');
        const row: RunRow = {
          nodeId,
          status: d.status as string,
          attempts: (d.attempts as number | undefined) ?? 0,
          claimToken: (d.claimToken as string | undefined) ?? null,
          detector: (d.detector as string | undefined) ?? null,
          errorCode: null,
          startedAt: (d.startedAt as Date | undefined) ?? store.now(),
          finishedAt: null,
          updatedAt: store.now(),
        };
        store.runs.set(nodeId, row);
        remember(() => store.runs.delete(nodeId));
        return { ...row };
      },
      async updateMany(args: { where: Where; data: Data }) {
        store.record('run', 'updateMany', args);
        let count = 0;
        for (const [id, row] of store.runs) {
          if (!matches(row, args.where)) continue;
          const before = { ...row };
          const rec = row as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(args.data)) {
            if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
              rec[k] = (rec[k] as number) + (v as { increment: number }).increment;
            } else {
              rec[k] = v;
            }
          }
          if (!['pending', 'succeeded', 'failed'].includes(row.status)) throw dbError('P2004');
          row.updatedAt = store.now();
          remember(() => store.runs.set(id, before));
          count++;
        }
        return { count };
      },
      async deleteMany(args: { where: Where }) {
        store.record('run', 'deleteMany', args);
        let count = 0;
        for (const [id, row] of [...store.runs]) {
          if (!matches(row, args.where)) continue;
          store.runs.delete(id);
          remember(() => store.runs.set(id, row));
          count++;
        }
        return { count };
      },
    },
    materialDetection: {
      async findMany(args: {
        where: Where;
        orderBy?: { position: 'asc' };
        select?: Record<string, boolean>;
      }) {
        store.record('det', 'findMany', args);
        return store.dets
          .filter((d) => matches(d, args.where))
          .sort((a, b) => a.position - b.position)
          .map((d) => {
            if (!args.select) return { ...d };
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(args.select)) out[k] = d[k as keyof DetRow];
            return out;
          });
      },
      async deleteMany(args: { where: Where }) {
        store.record('det', 'deleteMany', args);
        const before = store.dets;
        const kept = store.dets.filter((d) => !matches(d, args.where));
        store.dets = kept;
        remember(() => {
          store.dets = before;
        });
        return { count: before.length - kept.length };
      },
      async createMany(args: { data: Data[] }) {
        store.record('det', 'createMany', args);
        const before = store.dets;
        const next = [...store.dets];
        for (const d of args.data) {
          const row = {
            ...(d as Omit<DetRow, 'id' | 'createdAt'>),
            id: `det-${++store.nextId}`,
            createdAt: store.now(),
          };
          if (!FACE_CHECK.test(row.face)) throw dbError('P2004');
          if (!Number.isInteger(row.confidence) || row.confidence < 0 || row.confidence > 100)
            throw dbError('P2004');
          if (next.some((x) => x.nodeId === row.nodeId && x.face === row.face))
            throw dbError('P2002');
          next.push(row);
        }
        store.dets = next;
        remember(() => {
          store.dets = before;
        });
        return { count: args.data.length };
      },
    },
  };
}

let db: FakeDb;
let tokenSeq = 0;

function bind(mock: unknown, impl: unknown) {
  (mock as { mockImplementation: (f: unknown) => void }).mockImplementation(impl);
}

let lastTxOptions: unknown;

function install(store: FakeDb) {
  const main = store.api(null);
  bind(prismaMock.materialDetectionRun.findUnique, main.materialDetectionRun.findUnique);
  bind(prismaMock.materialDetectionRun.create, main.materialDetectionRun.create);
  bind(prismaMock.materialDetectionRun.updateMany, main.materialDetectionRun.updateMany);
  bind(prismaMock.materialDetectionRun.deleteMany, main.materialDetectionRun.deleteMany);
  bind(prismaMock.materialDetection.findMany, main.materialDetection.findMany);
  bind(prismaMock.materialDetection.deleteMany, main.materialDetection.deleteMany);
  bind(prismaMock.materialDetection.createMany, main.materialDetection.createMany);
  bind(
    prismaMock.$transaction,
    async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
      lastTxOptions = options;
      store.beforeTransaction?.();
      store.beforeTransaction = null;
      const undo: (() => void)[] = [];
      try {
        return await fn(store.api(undo));
      } catch (e) {
        for (const u of undo.reverse()) u();
        throw e;
      }
    },
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const NODE = 'node-a';
const OTHER = 'node-b';
const IMAGE = Buffer.from('bytes-of-node-a');
const loadImage = vi.fn(async () => IMAGE);

function run(nodeId = NODE): Promise<DetectNodeMaterialsResult> {
  return detectNodeMaterials(
    { node: { id: nodeId, mimeType: 'image/jpeg' }, loadImage },
    { now: () => db.now(), newClaimToken: () => `tok-${++tokenSeq}` },
  );
}

const THREE = [
  { face: 'Façade principale', valeur: 'Enduit blanc', confidence: 94 },
  { face: 'toiture', valeur: 'Zinc', confidence: 88 },
  { face: 'Menuiseries', valeur: 'Aluminium noir', confidence: 71 },
];

const minutes = (n: number) => n * 60_000;
const detsOf = (nodeId: string) =>
  db.dets.filter((d) => d.nodeId === nodeId).sort((a, b) => a.position - b.position);

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  db = new FakeDb();
  install(db);
  tokenSeq = 0;
  mockDetect.mockReset();
  loadImage.mockClear();
  for (const f of Object.values(mockLog)) f.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

// ─── 1, 2, 3, 18 — first detection and reuse ─────────────────────────────────

describe('detectNodeMaterials — first detection and reuse', () => {
  it('1. first detection with several materials: canonical rows on this node, run succeeded', async () => {
    mockDetect.mockResolvedValue(THREE);
    const result = await run();

    expect(mockDetect).toHaveBeenCalledTimes(1);
    expect(mockDetect).toHaveBeenCalledWith(IMAGE, 'image/jpeg', {
      deadlineMs: ATTEMPT_DEADLINE_MS,
    });
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'succeeded',
      nodeId: NODE,
      reused: false,
      materials: [
        {
          nodeId: NODE,
          face: 'facade_principale',
          valeur: 'Enduit blanc',
          confidence: 94,
          position: 0,
        },
        { nodeId: NODE, face: 'toiture', valeur: 'Zinc', confidence: 88, position: 1 },
        {
          nodeId: NODE,
          face: 'menuiseries',
          valeur: 'Aluminium noir',
          confidence: 71,
          position: 2,
        },
      ],
    });
    expect(detsOf(NODE).map((d) => [d.face, d.position])).toEqual([
      ['facade_principale', 0],
      ['toiture', 1],
      ['menuiseries', 2],
    ]);
    expect(db.runs.get(NODE)).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      claimToken: null,
      errorCode: null,
      detector: 'vision-materials',
      finishedAt: db.now(),
    });
  });

  it('2. a detection that finds nothing is a success with zero rows, not a failure', async () => {
    mockDetect.mockResolvedValue([]);
    const result = await run();
    expect(result).toEqual({ status: 'succeeded', nodeId: NODE, reused: false, materials: [] });
    expect(db.runs.get(NODE)?.status).toBe('succeeded');
    expect(detsOf(NODE)).toEqual([]);
  });

  it('3. a succeeded run is reused: no detector call, no image read, rows in position order', async () => {
    db.seedRun({ nodeId: NODE, status: 'succeeded', finishedAt: db.now() });
    db.seedDet({ nodeId: NODE, face: 'toiture', valeur: 'Zinc', confidence: 80, position: 1 });
    db.seedDet({ nodeId: NODE, face: 'sol', valeur: 'Béton', confidence: 60, position: 0 });
    const before = db.snapshot();

    const result = await run();

    expect(mockDetect).not.toHaveBeenCalled();
    expect(loadImage).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'succeeded',
      nodeId: NODE,
      reused: true,
      materials: [
        { nodeId: NODE, face: 'sol', valeur: 'Béton', confidence: 60, position: 0 },
        { nodeId: NODE, face: 'toiture', valeur: 'Zinc', confidence: 80, position: 1 },
      ],
    });
    expect(db.snapshot()).toBe(before);
  });

  it('18. an empty result is reused like any other, even long after', async () => {
    mockDetect.mockResolvedValue([]);
    await run();
    db.ms += minutes(60 * 24);
    const second = await run();
    expect(second).toEqual({ status: 'succeeded', nodeId: NODE, reused: true, materials: [] });
    expect(mockDetect).toHaveBeenCalledTimes(1);
  });

  it('reuses a succeeded run even when the detector is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    db.seedRun({ nodeId: NODE, status: 'succeeded' });
    expect(await run()).toMatchObject({ status: 'succeeded', reused: true });
  });
});

// ─── 4, 5, 6, 7 — claims and concurrency ─────────────────────────────────────

describe('detectNodeMaterials — claims', () => {
  it('4. a recent pending claim: "in_progress", no second detection, nothing written', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'theirs',
      startedAt: new Date(db.ms - 30_000),
    });
    const before = db.snapshot();
    expect(await run()).toEqual({ status: 'in_progress', nodeId: NODE });
    expect(mockDetect).not.toHaveBeenCalled();
    expect(loadImage).not.toHaveBeenCalled();
    expect(db.snapshot()).toBe(before);
  });

  it('4b. the claim is still recent at 89 s, abandoned at 90 s', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'theirs',
      startedAt: new Date(db.ms - PENDING_STALE_MS + 1000),
    });
    expect((await run()).status).toBe('in_progress');
    db.ms += 1000;
    mockDetect.mockResolvedValue([]);
    expect((await run()).status).toBe('succeeded');
  });

  it('5. an abandoned pending claim is taken over by compare-and-swap, and counted as an attempt', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'crashed',
      startedAt: new Date(db.ms - 120_000),
    });
    mockDetect.mockResolvedValue(THREE.slice(0, 1));
    const result = await run();

    expect(result).toMatchObject({ status: 'succeeded', reused: false });
    expect(db.runs.get(NODE)).toMatchObject({ status: 'succeeded', attempts: 2, claimToken: null });
    const takeover = db.calls.find((c) => c.model === 'run' && c.op === 'updateMany');
    expect(takeover?.args.where).toEqual({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'crashed',
      startedAt: new Date(db.ms - 120_000),
    });
  });

  it('5b. two workers racing for the same abandoned claim: only one takes it', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'crashed',
      startedAt: new Date(db.ms - 120_000),
    });
    mockDetect.mockResolvedValue(THREE);
    const results = await Promise.all([run(), run()]);

    expect(results.map((r) => r.status).sort()).toEqual(['in_progress', 'succeeded']);
    expect(mockDetect).toHaveBeenCalledTimes(1);
    expect(db.runs.get(NODE)).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(detsOf(NODE)).toHaveLength(3);
  });

  it('5c. an abandoned claim after the third attempt is not taken over automatically', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      attempts: 3,
      startedAt: new Date(db.ms - minutes(5)),
    });
    expect(await run()).toMatchObject({
      status: 'retry_later',
      reason: 'max_attempts',
      retryAfter: null,
    });
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('6. two concurrent first calls on the same node: one detection, one "in_progress"', async () => {
    mockDetect.mockResolvedValue(THREE);
    const results = await Promise.all([run(), run()]);

    expect(results.map((r) => r.status).sort()).toEqual(['in_progress', 'succeeded']);
    expect(mockDetect).toHaveBeenCalledTimes(1);
    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(db.runs.size).toBe(1);
    expect(detsOf(NODE)).toHaveLength(3);
  });

  it('7. P2002 on create (a competitor created the run first) is an expected outcome, not an error', async () => {
    db.beforeCreateRun = () =>
      db.seedRun({
        nodeId: NODE,
        status: 'pending',
        claimToken: 'competitor',
        startedAt: db.now(),
      });
    const result = await run();

    expect(result).toEqual({ status: 'in_progress', nodeId: NODE });
    expect(mockDetect).not.toHaveBeenCalled();
    expect(db.runs.get(NODE)).toMatchObject({ claimToken: 'competitor', attempts: 1 });
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('7b. P2002 when the competitor has already succeeded: its result is reused', async () => {
    db.beforeCreateRun = () => {
      db.seedRun({ nodeId: NODE, status: 'succeeded' });
      db.seedDet({ nodeId: NODE, face: 'toiture', valeur: 'Tuiles', confidence: 90, position: 0 });
    };
    const result = await run();
    expect(result).toEqual({
      status: 'succeeded',
      nodeId: NODE,
      reused: true,
      materials: [{ nodeId: NODE, face: 'toiture', valeur: 'Tuiles', confidence: 90, position: 0 }],
    });
    expect(mockDetect).not.toHaveBeenCalled();
  });
});

// ─── 8, 9 — failures and retries ─────────────────────────────────────────────

describe('detectNodeMaterials — failures and retries', () => {
  const unavailable = () => ({ kind: 'error', code: 'unavailable' });

  it('8. a failure is recorded, then retried only after 10 minutes and below 3 attempts', async () => {
    mockDetect.mockResolvedValue(unavailable());

    expect(await run()).toEqual({
      status: 'failed',
      nodeId: NODE,
      errorCode: 'detector_unavailable',
    });
    const failedAt = db.now();
    expect(db.runs.get(NODE)).toMatchObject({
      status: 'failed',
      attempts: 1,
      claimToken: null,
      errorCode: 'detector_unavailable',
      finishedAt: failedAt,
    });
    expect(mockDetect).toHaveBeenCalledTimes(1); // never twice in one call

    db.ms += minutes(5);
    expect(await run()).toEqual({
      status: 'retry_later',
      nodeId: NODE,
      reason: 'cooldown',
      retryAfter: new Date(failedAt.getTime() + FAILED_RETRY_COOLDOWN_MS),
      lastErrorCode: 'detector_unavailable',
    });
    expect(mockDetect).toHaveBeenCalledTimes(1);

    db.ms += minutes(6); // 11 min after the failure
    expect((await run()).status).toBe('failed');
    expect(db.runs.get(NODE)?.attempts).toBe(2);
    expect(mockDetect).toHaveBeenCalledTimes(2);

    db.ms += minutes(11);
    expect((await run()).status).toBe('failed');
    expect(db.runs.get(NODE)?.attempts).toBe(3);

    db.ms += minutes(60);
    expect(await run()).toEqual({
      status: 'retry_later',
      nodeId: NODE,
      reason: 'max_attempts',
      retryAfter: null,
      lastErrorCode: 'detector_unavailable',
    });
    expect(mockDetect).toHaveBeenCalledTimes(3);
  });

  it('8b. a retry that succeeds replaces the failed state', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'failed',
      errorCode: 'detector_error',
      finishedAt: new Date(db.ms - minutes(15)),
    });
    mockDetect.mockResolvedValue(THREE.slice(1, 2));
    expect(await run()).toMatchObject({ status: 'succeeded', reused: false });
    expect(db.runs.get(NODE)).toMatchObject({ status: 'succeeded', attempts: 2, errorCode: null });
  });

  it('8c. two workers retrying the same failed run: only one claims it', async () => {
    db.seedRun({ nodeId: NODE, status: 'failed', finishedAt: new Date(db.ms - minutes(15)) });
    mockDetect.mockResolvedValue([]);
    const results = await Promise.all([run(), run()]);
    expect(results.map((r) => r.status).sort()).toEqual(['in_progress', 'succeeded']);
    expect(mockDetect).toHaveBeenCalledTimes(1);
    expect(db.runs.get(NODE)?.attempts).toBe(2);
  });

  it('8d. an image that cannot be read is a failure of this attempt', async () => {
    loadImage.mockRejectedValueOnce(new Error('blob fetch failed'));
    expect(await run()).toEqual({ status: 'failed', nodeId: NODE, errorCode: 'image_unavailable' });
    expect(mockDetect).not.toHaveBeenCalled();
    expect(db.runs.get(NODE)).toMatchObject({ status: 'failed', errorCode: 'image_unavailable' });
  });

  it('9. detector not configured: nothing recorded, nothing called, the next call can detect', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await run()).toEqual({ status: 'not_configured', nodeId: NODE });
    expect(db.runs.size).toBe(0);
    expect(loadImage).not.toHaveBeenCalled();
    expect(mockDetect).not.toHaveBeenCalled();

    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockDetect.mockResolvedValue(THREE);
    expect(await run()).toMatchObject({ status: 'succeeded', reused: false });
  });

  it('9b. "not configured" reported by the detector after the claim: the new run is removed', async () => {
    mockDetect.mockResolvedValue({ kind: 'not_configured' });
    expect(await run()).toEqual({ status: 'not_configured', nodeId: NODE });
    expect(db.runs.size).toBe(0);
  });

  it('9c. "not configured" after taking over a failed run: the failed run is restored as it was', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'failed',
      attempts: 2,
      errorCode: 'detector_timeout',
      startedAt: new Date(db.ms - minutes(20)),
      finishedAt: new Date(db.ms - minutes(19)),
    });
    mockDetect.mockResolvedValue({ kind: 'not_configured' });

    expect(await run()).toEqual({ status: 'not_configured', nodeId: NODE });
    expect(db.runs.get(NODE)).toMatchObject({
      status: 'failed',
      attempts: 2,
      claimToken: null,
      errorCode: 'detector_timeout',
      startedAt: new Date(db.ms - minutes(20)),
      finishedAt: new Date(db.ms - minutes(19)),
    });
  });

  it('9d. with no detector key, a failed run eligible for retry is left untouched', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    db.seedRun({ nodeId: NODE, status: 'failed', finishedAt: new Date(db.ms - minutes(15)) });
    const before = db.snapshot();
    expect(await run()).toEqual({ status: 'not_configured', nodeId: NODE });
    expect(db.snapshot()).toBe(before);
  });
});

// ─── 10, 11, 20 — claim lost and database failures ───────────────────────────

describe('detectNodeMaterials — a stale attempt never writes', () => {
  it('10. claim taken over while the detector ran: nothing saved, the winner keeps its rows', async () => {
    mockDetect.mockImplementation(async () => {
      // Meanwhile another worker took the claim over and finished.
      db.runs.set(NODE, {
        ...db.runs.get(NODE)!,
        status: 'succeeded',
        claimToken: null,
        attempts: 2,
      });
      db.seedDet({ nodeId: NODE, face: 'toiture', valeur: 'Ardoise', confidence: 99, position: 0 });
      return THREE;
    });
    const result = await run();

    expect(result).toEqual({ status: 'claim_lost', nodeId: NODE });
    expect(detsOf(NODE).map((d) => d.valeur)).toEqual(['Ardoise']);
    expect(db.runs.get(NODE)).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(db.calls.some((c) => c.model === 'det' && c.op !== 'findMany')).toBe(false);
  });

  it('11. claim taken over right as the save starts: the re-check fails, nothing is replaced', async () => {
    mockDetect.mockResolvedValue(THREE);
    db.beforeTransaction = () => {
      db.runs.set(NODE, { ...db.runs.get(NODE)!, claimToken: 'thief', startedAt: db.now() });
      db.seedDet({ nodeId: NODE, face: 'sol', valeur: 'Parquet', confidence: 70, position: 0 });
    };
    const result = await run();

    expect(result).toEqual({ status: 'claim_lost', nodeId: NODE });
    expect(db.runs.get(NODE)).toMatchObject({ status: 'pending', claimToken: 'thief' });
    expect(detsOf(NODE).map((d) => d.valeur)).toEqual(['Parquet']);
    expect(
      db.calls.some((c) => c.model === 'det' && (c.op === 'deleteMany' || c.op === 'createMany')),
    ).toBe(false);
  });

  it('11b. a detector failure after losing the claim does not overwrite the winner', async () => {
    mockDetect.mockImplementation(async () => {
      db.runs.set(NODE, { ...db.runs.get(NODE)!, claimToken: 'thief' });
      throw new Error('boom');
    });
    expect(await run()).toEqual({ status: 'claim_lost', nodeId: NODE });
    expect(db.runs.get(NODE)).toMatchObject({
      status: 'pending',
      claimToken: 'thief',
      errorCode: null,
    });
  });

  it('20. the database fails while saving: everything is undone and the attempt is marked failed', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'old',
      startedAt: new Date(db.ms - 120_000),
    });
    db.seedDet({ nodeId: NODE, face: 'toiture', valeur: 'Ancienne', confidence: 50, position: 0 });
    db.failOn = { model: 'det', op: 'createMany' };
    mockDetect.mockResolvedValue(THREE);

    const result = await run();

    expect(result).toEqual({ status: 'failed', nodeId: NODE, errorCode: 'persist_error' });
    expect(detsOf(NODE).map((d) => d.valeur)).toEqual(['Ancienne']); // the delete was rolled back
    expect(db.runs.get(NODE)).toMatchObject({
      status: 'failed',
      errorCode: 'persist_error',
      claimToken: null,
    });
  });

  it('20b. the database is down when reading the run: a "failed" result, no throw, no detector call', async () => {
    db.failOn = { model: 'run', op: 'findUnique' };
    expect(await run()).toEqual({ status: 'failed', nodeId: NODE, errorCode: 'db_error' });
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('20c. the database stays down after a failed save: still a result, the claim simply expires', async () => {
    mockDetect.mockResolvedValue(THREE);
    db.beforeTransaction = () => {
      db.failOn = { model: 'run', op: 'updateMany' };
    };
    expect(await run()).toEqual({ status: 'failed', nodeId: NODE, errorCode: 'persist_error' });
    expect(db.runs.get(NODE)).toMatchObject({ status: 'pending' });
    db.failOn = null;
    db.ms += PENDING_STALE_MS;
    expect((await run()).status).toBe('succeeded');
  });
});

// ─── 12, 13, 14 — isolation ──────────────────────────────────────────────────

describe('detectNodeMaterials — one image only', () => {
  function seedOther() {
    db.seedRun({ nodeId: OTHER, status: 'succeeded' });
    db.seedDet({
      nodeId: OTHER,
      face: 'toiture',
      valeur: 'Tuiles rouges',
      confidence: 90,
      position: 0,
    });
    db.seedDet({
      nodeId: OTHER,
      face: 'facade_principale',
      valeur: 'Brique',
      confidence: 85,
      position: 1,
    });
  }

  it("12. never reads or overwrites another node's detections, even for the same faces", async () => {
    seedOther();
    const other = JSON.stringify([db.runs.get(OTHER), detsOf(OTHER)]);
    mockDetect.mockResolvedValue(THREE);

    await run();

    expect(JSON.stringify([db.runs.get(OTHER), detsOf(OTHER)])).toBe(other);
    for (const c of db.calls) {
      const where = c.args.where ?? (Array.isArray(c.args.data) ? undefined : c.args.data);
      if (where) expect(where.nodeId, `${c.model}.${c.op}`).toBe(NODE);
      if (Array.isArray(c.args.data)) for (const row of c.args.data) expect(row.nodeId).toBe(NODE);
    }
  });

  it('12b. a node with no run does not borrow the result of another node', async () => {
    seedOther();
    mockDetect.mockResolvedValue([]);
    expect(await run()).toEqual({
      status: 'succeeded',
      nodeId: NODE,
      reused: false,
      materials: [],
    });
  });

  it('13. never touches manual corrections nor the old project-level materials', async () => {
    mockDetect.mockResolvedValue(THREE);
    await run();
    db.ms += minutes(1);
    await run();
    const methods = [
      'findUnique',
      'findFirst',
      'findMany',
      'create',
      'createMany',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ] as const;
    for (const model of [prismaMock.materialCorrection, prismaMock.material]) {
      for (const m of methods) expect(model[m], m).not.toHaveBeenCalled();
    }
    expect(db.calls.every((c) => c.model === 'run' || c.model === 'det')).toBe(true);
  });

  it('14. replacing old detections deletes only the rows of this node', async () => {
    seedOther();
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'crashed',
      startedAt: new Date(db.ms - 120_000),
    });
    db.seedDet({ nodeId: NODE, face: 'toiture', valeur: 'Ancienne', confidence: 40, position: 0 });
    mockDetect.mockResolvedValue(THREE.slice(1));

    await run();

    expect(detsOf(NODE).map((d) => d.valeur)).toEqual(['Zinc', 'Aluminium noir']);
    expect(detsOf(OTHER).map((d) => d.valeur)).toEqual(['Tuiles rouges', 'Brique']);
    const del = db.calls.find((c) => c.model === 'det' && c.op === 'deleteMany');
    expect(del?.args.where).toEqual({ nodeId: NODE });
  });

  it('refuses a blank node id', async () => {
    await expect(run('  ')).rejects.toThrow('node id is required');
  });
});

// ─── 15, 16, 17 — what is stored ─────────────────────────────────────────────

describe('detectNodeMaterials — validation and order of what is stored', () => {
  it('15. faces are canonical; spaces, case and accents merge; invalid faces are skipped', async () => {
    mockDetect.mockResolvedValue([
      { face: '  Façade   PRINCIPALE ', valeur: 'Enduit', confidence: 90 },
      { face: 'facade_principale', valeur: 'Brique', confidence: 99 }, // duplicate after normalisation
      { face: '***', valeur: 'Rien', confidence: 50 }, // empty after normalisation
      { face: 'x'.repeat(65), valeur: 'Trop long', confidence: 50 }, // too long, not truncated
      { face: 'Toiture', valeur: '  Zinc  ', confidence: 80 },
      { face: 'toiture', valeur: 'Tuiles', confidence: 95 }, // duplicate
    ]);
    const result = await run();

    expect(detsOf(NODE).map((d) => [d.face, d.valeur, d.position])).toEqual([
      ['facade_principale', 'Enduit', 0],
      ['toiture', 'Zinc', 1],
    ]);
    expect(result).toMatchObject({ status: 'succeeded' });
    expect(mockLog.warn).toHaveBeenCalledWith('detectNodeMaterials: detections ignored', {
      nodeId: NODE,
      duplicate_face: 2,
      empty_face: 1,
      face_too_long: 1,
    });
  });

  it('16. confidences outside 0-100 (or not integers) are rejected, never clamped', async () => {
    mockDetect.mockResolvedValue([
      { face: 'a', valeur: 'v', confidence: 101 },
      { face: 'b', valeur: 'v', confidence: -1 },
      { face: 'c', valeur: 'v', confidence: 50.5 },
      { face: 'd', valeur: 'v', confidence: '80' },
      { face: 'e', valeur: 'v', confidence: Number.NaN },
      { face: 'f', valeur: 'v', confidence: 0 },
      { face: 'g', valeur: 'v', confidence: 100 },
    ]);
    await run();
    expect(detsOf(NODE).map((d) => [d.face, d.confidence])).toEqual([
      ['f', 0],
      ['g', 100],
    ]);
  });

  it('16b. blank or oversized values are rejected', () => {
    const { rows, rejected } = prepareDetections(NODE, [
      { face: 'a', valeur: '   ', confidence: 10 },
      { face: 'b', valeur: 'x'.repeat(501), confidence: 10 },
      { face: 'c', valeur: 'x'.repeat(500), confidence: 10 },
      { face: 'd', valeur: 42, confidence: 10 },
    ]);
    expect(rows.map((r) => r.face)).toEqual(['c']);
    expect(rejected).toEqual(['invalid_value', 'invalid_value', 'invalid_value']);
  });

  it('17. positions follow the detector order, with no gap after a rejected item', () => {
    const input = [
      { face: 'sol', valeur: 'Béton', confidence: 60 },
      { face: '', valeur: 'x', confidence: 60 },
      { face: 'toiture', valeur: 'Zinc', confidence: 90 },
      { face: 'menuiseries', valeur: 'Bois', confidence: 30 },
    ];
    const first = prepareDetections(NODE, input).rows;
    expect(first.map((r) => [r.face, r.position])).toEqual([
      ['sol', 0],
      ['toiture', 1],
      ['menuiseries', 2],
    ]);
    expect(prepareDetections(NODE, input).rows).toEqual(first); // deterministic
  });
});

// ─── 19 — no secret ever stored or logged ────────────────────────────────────

describe('detectNodeMaterials — errors are fixed codes', () => {
  const SECRET = 'sk-ant-api03-SECRET-VALUE';

  it.each([
    ['timeout', 'detector_timeout'],
    ['rate_limited', 'detector_rate_limited'],
    ['auth', 'detector_auth'],
    ['unavailable', 'detector_unavailable'],
    ['rejected', 'detector_rejected'],
    ['unknown', 'detector_error'],
  ] as const)('19. detector error %s is stored as %s', async (visionCode, code) => {
    expect(errorCodeForVision(visionCode)).toBe(code);
    mockDetect.mockResolvedValue({ kind: 'error', code: visionCode });
    expect(await run()).toEqual({ status: 'failed', nodeId: NODE, errorCode: code });
    expect(db.runs.get(NODE)?.errorCode).toBe(code);
  });

  it.each([
    [Object.assign(new Error(`401 invalid x-api-key ${SECRET}`), { status: 401 })],
    [new Error(`unexpected ${SECRET} https://api.example.test/?key=${SECRET}`)],
    ['a thrown string'],
  ])(
    '19. an unexpected throw (%s) is "detector_error", its message stored nowhere',
    async (error) => {
      mockDetect.mockRejectedValue(error);

      const result = await run();

      expect(result).toEqual({ status: 'failed', nodeId: NODE, errorCode: 'detector_error' });
      expect(db.runs.get(NODE)?.errorCode).toBe('detector_error');
      expect(db.snapshot()).not.toContain('SECRET');
      expect(db.snapshot()).not.toContain('api.example.test');
      expect(JSON.stringify(Object.values(mockLog).map((f) => f.mock.calls))).not.toContain(
        'SECRET',
      );
      expect(JSON.stringify(result)).not.toContain('SECRET');
    },
  );

  it('never logs the image bytes', async () => {
    mockDetect.mockResolvedValue(THREE);
    await run();
    expect(JSON.stringify(Object.values(mockLog).map((f) => f.mock.calls))).not.toContain(
      'bytes-of-node-a',
    );
  });
});

// ─── Étape 3A.1 — unreadable answers and timing ──────────────────────────────

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('detectNodeMaterials — an unreadable answer is not "nothing found"', () => {
  it.each(['no_text_block', 'not_json', 'unexpected_shape'])(
    '%s: a failed attempt, no row, never a reusable empty success',
    async (reason) => {
      mockDetect.mockResolvedValue({ kind: 'invalid_response', reason });
      expect(await run()).toEqual({
        status: 'failed',
        nodeId: NODE,
        errorCode: 'detector_invalid_response',
      });
      expect(db.runs.get(NODE)).toMatchObject({
        status: 'failed',
        errorCode: 'detector_invalid_response',
        claimToken: null,
      });
      expect(detsOf(NODE)).toEqual([]);
    },
  );

  it('follows the retry rules, then a valid empty answer becomes a reused success', async () => {
    mockDetect.mockResolvedValue({ kind: 'invalid_response', reason: 'not_json' });
    await run();

    db.ms += minutes(1);
    expect(await run()).toMatchObject({ status: 'retry_later', reason: 'cooldown' });

    db.ms += minutes(10);
    mockDetect.mockResolvedValue([]);
    expect(await run()).toEqual({
      status: 'succeeded',
      nodeId: NODE,
      reused: false,
      materials: [],
    });

    db.ms += minutes(60);
    expect(await run()).toEqual({ status: 'succeeded', nodeId: NODE, reused: true, materials: [] });
    expect(mockDetect).toHaveBeenCalledTimes(2);
  });
});

describe('detectNodeMaterials — the claim outlives every live attempt', () => {
  it('the budget and the save fit inside the claim, with margin', () => {
    expect(ATTEMPT_DEADLINE_MS + SAVE_TX_MAX_WAIT_MS + SAVE_TX_TIMEOUT_MS).toBeLessThan(
      PENDING_STALE_MS,
    );
  });

  it('the save transaction is bounded', async () => {
    mockDetect.mockResolvedValue(THREE);
    await run();
    expect(lastTxOptions).toEqual({ maxWait: SAVE_TX_MAX_WAIT_MS, timeout: SAVE_TX_TIMEOUT_MS });
  });

  it('the detector gets what is left of the budget after reading the image', async () => {
    loadImage.mockImplementationOnce(async () => {
      db.ms += 20_000;
      return IMAGE;
    });
    mockDetect.mockResolvedValue([]);
    await run();
    expect(mockDetect).toHaveBeenCalledWith(IMAGE, 'image/jpeg', {
      deadlineMs: ATTEMPT_DEADLINE_MS - 20_000,
    });
  });

  it('an image read that uses up the budget: no detector call, a timeout failure', async () => {
    loadImage.mockImplementationOnce(async () => {
      db.ms += ATTEMPT_DEADLINE_MS;
      return IMAGE;
    });
    expect(await run()).toEqual({ status: 'failed', nodeId: NODE, errorCode: 'detector_timeout' });
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('an image read that never ends is cut at the deadline', async () => {
    const started = Date.now();
    const result = await detectNodeMaterials(
      {
        node: { id: NODE, mimeType: 'image/jpeg' },
        loadImage: () => new Promise<Buffer>(() => {}),
      },
      { now: () => db.now(), newClaimToken: () => 'tok-slow', attemptDeadlineMs: 30 },
    );
    expect(result).toEqual({ status: 'failed', nodeId: NODE, errorCode: 'image_unavailable' });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('an image read that fails after the deadline is absorbed (no unhandled rejection)', async () => {
    const result = await detectNodeMaterials(
      {
        node: { id: NODE, mimeType: 'image/jpeg' },
        loadImage: () =>
          new Promise<Buffer>((_resolve, reject) =>
            setTimeout(() => reject(new Error('late')), 60),
          ),
      },
      { now: () => db.now(), newClaimToken: () => 'tok-late', attemptDeadlineMs: 20 },
    );
    expect(result.status).toBe('failed');
    await new Promise((r) => setTimeout(r, 100));
  });

  it('a live attempt is not taken over while its claim is valid, even at the end of its budget', async () => {
    const first = deferred<unknown>();
    mockDetect.mockReturnValueOnce(first.promise);
    const firstRun = run();
    await vi.waitFor(() => expect(mockDetect).toHaveBeenCalledTimes(1));

    db.ms += ATTEMPT_DEADLINE_MS; // the detector cannot run longer than this
    expect(await run()).toEqual({ status: 'in_progress', nodeId: NODE });

    first.resolve(THREE);
    expect(await firstRun).toMatchObject({ status: 'succeeded', reused: false });
    expect(mockDetect).toHaveBeenCalledTimes(1);
    expect(db.runs.get(NODE)).toMatchObject({ status: 'succeeded', attempts: 1 });
  });

  it('an attempt frozen past its claim is overtaken, then writes nothing when it wakes up', async () => {
    const first = deferred<unknown>();
    mockDetect
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([{ face: 'toiture', valeur: 'Ardoise', confidence: 90 }]);
    const firstRun = run();
    await vi.waitFor(() => expect(mockDetect).toHaveBeenCalledTimes(1));

    db.ms += PENDING_STALE_MS;
    expect(await run()).toMatchObject({ status: 'succeeded', reused: false });

    first.resolve(THREE);
    expect(await firstRun).toEqual({ status: 'claim_lost', nodeId: NODE });
    expect(detsOf(NODE).map((d) => d.valeur)).toEqual(['Ardoise']);
    expect(db.runs.get(NODE)).toMatchObject({ status: 'succeeded', attempts: 2, claimToken: null });
  });

  it('a frozen attempt that wakes up with a failure does not mark the winner failed', async () => {
    const first = deferred<unknown>();
    mockDetect.mockReturnValueOnce(first.promise).mockResolvedValueOnce([]);
    const firstRun = run();
    await vi.waitFor(() => expect(mockDetect).toHaveBeenCalledTimes(1));

    db.ms += PENDING_STALE_MS;
    await run();
    first.resolve({ kind: 'error', code: 'timeout' });

    expect(await firstRun).toEqual({ status: 'claim_lost', nodeId: NODE });
    expect(db.runs.get(NODE)).toMatchObject({ status: 'succeeded', errorCode: null });
  });

  it('three workers on one abandoned claim: exactly one detection', async () => {
    db.seedRun({
      nodeId: NODE,
      status: 'pending',
      claimToken: 'crashed',
      startedAt: new Date(db.ms - PENDING_STALE_MS),
    });
    mockDetect.mockResolvedValue(THREE);
    const results = await Promise.all([run(), run(), run()]);
    expect(results.map((r) => r.status).sort()).toEqual([
      'in_progress',
      'in_progress',
      'succeeded',
    ]);
    expect(mockDetect).toHaveBeenCalledTimes(1);
    expect(detsOf(NODE)).toHaveLength(3);
  });
});
