// The per-image materials routes (étapes 3C.2–3C.5) against a REAL PostgreSQL:
// the throw-away local sandbox only (frontend/scripts/pg-sandbox, step T1).
// What the mocked route tests cannot show is checked here: migration 9's
// constraints and indexes as PostgreSQL enforces them, real concurrent
// requests on two pooled connections, real row locks.
//
// Skipped unless RB_PG_TEST=1. When it runs, it refuses — fails, never skips
// silently — unless the URL is the sandbox's (guard.mjs), no value of
// frontend/.env or .env.local reached the process (names checked, values never
// read), and the server that answers holds the sandbox's marker. Outbound
// fetch is blocked for the whole suite. Every row it creates has an id
// starting with this run's prefix (plus the auth-disabled demo user) and is
// deleted in afterAll — and in beforeAll itself if setting up fails — before
// Prisma is disconnected; T1 then counts what is left.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import {
  checkSandboxEnv,
  envKeyNames,
  leakedEnvNames,
  sandboxUrl,
} from '../../../../../../../scripts/pg-sandbox/guard.mjs';

mockNextCookies();

const RUN_PG = process.env.RB_PG_TEST === '1';
const RUN = `rbpg${randomBytes(4).toString('hex')}`;
const DEMO = 'auth-disabled-demo-user';
const OTHER_USER = `${RUN}-u2`;
const P = `${RUN}-p`;
const R = `${RUN}-r`;
const N1 = `${RUN}-n1`;
const N2 = `${RUN}-n2`;
const N3 = `${RUN}-n3`;

/** vitest.setup.ts's fixtures (set with ||= once rb_env emptied the real ones). */
const SETUP_FIXTURES: Record<string, string> = {
  JWT_SECRET: 'vitest-fixture-jwt-secret-with-enough-entropy-for-tests',
  ENCRYPTION_KEY: 'aGVsbG8td29ybGQtdGhpcy1pcy0zMi1ieXRlcy1sb25n',
  COOKIE_PREFIX: 'app',
};

type AttachRoute = typeof import('./legacy-attach/route');
type FaceRoute = typeof import('./materials/[face]/route');

let prisma: PrismaClient | undefined;
let attachRoute: AttachRoute;
let faceRoute: FaceRoute;
let cleaned = false;

function db(): PrismaClient {
  if (!prisma) throw new Error('Prisma non initialisé');
  return prisma;
}

const HEADERS = {
  'content-type': 'application/json',
  'x-csrf-token': 'csrf-tok',
  cookie: 'app-csrf=csrf-tok',
};

function attach(projectId: string, nodeId: string, materialIds: string[]) {
  return attachRoute.POST(
    new NextRequest(`https://test/api/projects/${projectId}/nodes/${nodeId}/legacy-attach`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ materialIds }),
    }),
    { params: Promise.resolve({ projectId, nodeId }) },
  );
}

function faceReq(method: string, projectId: string, nodeId: string, face: string, body?: unknown) {
  const url = `https://test/api/projects/${projectId}/nodes/${nodeId}/materials/${encodeURIComponent(face)}`;
  const req =
    body === undefined
      ? new NextRequest(url, { method, headers: HEADERS })
      : new NextRequest(url, { method, headers: HEADERS, body: JSON.stringify(body) });
  return [req, { params: Promise.resolve({ projectId, nodeId, face }) }] as const;
}
const putFace = (nodeId: string, face: string, valeur: string | null, projectId = P) =>
  faceRoute.PUT(...faceReq('PUT', projectId, nodeId, face, { valeur }));
const deleteFace = (nodeId: string, face: string) =>
  faceRoute.DELETE(...faceReq('DELETE', P, nodeId, face));
const getFace = (nodeId: string, face: string) => faceRoute.GET(...faceReq('GET', P, nodeId, face));

const statusOf = (r: PromiseSettledResult<Response>) =>
  r.status === 'fulfilled' ? r.value.status : -1;

async function cleanup() {
  if (!prisma || cleaned) return;
  // Users cascade to their projects, nodes, old-sheet rows, detections and corrections.
  const mine = { OR: [{ id: { startsWith: RUN } }, { id: DEMO }] };
  await prisma.user.deleteMany({ where: mine });
  const left =
    (await prisma.user.count({ where: mine })) +
    (await prisma.project.count({ where: { id: { startsWith: RUN } } })) +
    (await prisma.renderNode.count({ where: { id: { startsWith: RUN } } })) +
    (await prisma.material.count({ where: { id: { startsWith: RUN } } })) +
    (await prisma.materialCorrection.count({ where: { nodeId: { startsWith: RUN } } }));
  if (left !== 0) throw new Error(`nettoyage incomplet : ${left} ligne(s) restante(s)`);
  cleaned = true;
}

function envNamesOfDotenvFiles(): string[] {
  const names: string[] = [];
  for (const f of ['.env', '.env.local']) {
    const p = join(process.cwd(), f);
    if (existsSync(p)) names.push(...envKeyNames(readFileSync(p, 'utf8')));
  }
  return names;
}

async function assertServerIdentity(client: PrismaClient, root: string) {
  const m = /^nonce=([0-9a-f]{32})\npath=([A-Za-z]:\/rb-pgtest)\n$/.exec(
    readFileSync(`${root}/.rb-pgtest-marker`, 'utf8'),
  );
  if (!m || m[2] !== root) throw new Error('marqueur du bac à sable invalide');
  const rows = await client.$queryRaw<{ ok: boolean }[]>`
    select (current_database() = 'rb_materials_test'
      and current_user = 'rb_test'
      and inet_server_addr() = inet '127.0.0.1'
      and inet_server_port() = 55432
      and shobj_description((select oid from pg_database where datname = current_database()), 'pg_database')
        = ${'rb-pgtest-' + m[1]}) as ok`;
  if (rows[0]?.ok !== true) throw new Error('le serveur joint n’est pas le bac à sable');
}

async function node(id: string, projectId: string) {
  await db().renderNode.create({
    data: {
      id,
      projectId,
      kind: 'UPLOADED',
      blobUrl: 'https://example.invalid/x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    },
  });
}
async function legacyRow(id: string, projectId: string, face: string, valeur = 'Tuile') {
  await db().material.create({ data: { id, projectId, face, valeur, source: 'manuel' } });
}

describe.skipIf(!RUN_PG)('per-image materials on a real PostgreSQL (local sandbox only)', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') throw new Error('NODE_ENV=production : refusé');
    const root = process.env.RB_PGTEST_ROOT ?? '';
    let password: string | null = null;
    try {
      password = readFileSync(`${root}/pw.txt`, 'utf8');
    } catch {
      password = null;
    }
    const verdict = checkSandboxEnv(process.env, root, password);
    if (verdict !== 'SHELL_OK') throw new Error(`garde : ${verdict}`);
    vi.stubGlobal('fetch', () => {
      throw new Error('réseau interdit pendant les tests PostgreSQL');
    });
    try {
      ({ prisma } = await import('@/lib/server/prisma'));
      // Prisma's client loads frontend/.env at construction: prove nothing came from it.
      const url = sandboxUrl(password ?? '');
      const leaked = leakedEnvNames(process.env, envNamesOfDotenvFiles(), {
        ...SETUP_FIXTURES,
        DATABASE_URL: url,
        DIRECT_URL: url,
        AUTH_DISABLED: 'true',
      });
      if (leaked.length > 0)
        throw new Error(`valeurs de production présentes : ${leaked.join(', ')}`);
      await assertServerIdentity(db(), root);
      attachRoute = await import('./legacy-attach/route');
      faceRoute = await import('./materials/[face]/route');

      await db().user.deleteMany({ where: { id: DEMO } }); // a previous run's leftovers
      await db().user.create({ data: { id: DEMO, email: `${RUN}-demo@rb-pgtest.invalid` } });
      await db().user.create({ data: { id: OTHER_USER, email: `${RUN}-u2@rb-pgtest.invalid` } });
      await db().project.create({ data: { id: P, userId: DEMO, name: 'P' } });
      await db().project.create({ data: { id: R, userId: OTHER_USER, name: 'R' } });
      await node(N1, P);
      await node(N2, P);
      await node(N3, R);
    } catch (e) {
      try {
        await cleanup();
      } finally {
        await prisma?.$disconnect();
      }
      throw e;
    }
  }, 60_000);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await prisma?.$disconnect();
      vi.unstubAllGlobals();
    }
  }, 60_000);

  describe('migration 9 as PostgreSQL enforces it', () => {
    it('its 10 constraints and 5 indexes exist', async () => {
      const [c] = await db().$queryRaw<
        { n: bigint }[]
      >`select count(*) as n from pg_constraint where conname in (
        'MaterialCorrection_face_canonical_check','MaterialCorrection_origin_check','MaterialDetectionRun_status_check',
        'MaterialDetection_confidence_check','MaterialDetection_face_canonical_check','Material_attachedNodeId_fkey',
        'MaterialDetectionRun_nodeId_fkey','MaterialDetection_nodeId_fkey','MaterialCorrection_nodeId_fkey',
        'MaterialCorrection_legacyMaterialId_fkey')`;
      const [i] = await db().$queryRaw<
        { n: bigint }[]
      >`select count(*) as n from pg_indexes where indexname in (
        'MaterialDetectionRun_status_updatedAt_idx','MaterialDetection_nodeId_face_key',
        'MaterialCorrection_legacyMaterialId_key','MaterialCorrection_nodeId_face_key','Material_attachedNodeId_idx')`;
      expect(Number(c?.n)).toBe(10);
      expect(Number(i?.n)).toBe(5);
    });

    it('CHECK: a correction’s origin is "user" or "legacy_attach" only', async () => {
      await expect(
        db().materialCorrection.create({
          data: { nodeId: N1, face: 'origin_check', valeur: 'x', origin: 'bogus' },
        }),
      ).rejects.toThrow();
      expect(
        await db().materialCorrection.count({ where: { nodeId: N1, face: 'origin_check' } }),
      ).toBe(0);
    });

    it('CHECK: faces are canonical keys, detections’ confidence within 0–100', async () => {
      await expect(
        db().materialCorrection.create({ data: { nodeId: N1, face: 'Bad Face', valeur: 'x' } }),
      ).rejects.toThrow();
      await expect(
        db().materialDetection.create({
          data: { nodeId: N1, face: 'toiture_det', valeur: 'x', confidence: 101, position: 0 },
        }),
      ).rejects.toThrow();
      await expect(
        db().materialDetection.create({
          data: { nodeId: N1, face: 'Toiture Det', valeur: 'x', confidence: 50, position: 0 },
        }),
      ).rejects.toThrow();
    });

    it('UNIQUE: one correction per (image, face); one correction per old-sheet row', async () => {
      await db().materialCorrection.create({
        data: { nodeId: N1, face: 'unique_face', valeur: 'a' },
      });
      await expect(
        db().materialCorrection.create({ data: { nodeId: N1, face: 'unique_face', valeur: 'b' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await legacyRow(`${RUN}-mu`, P, 'unique_row');
      await db().materialCorrection.create({
        data: { nodeId: N1, face: 'u_row_a', valeur: 'a', legacyMaterialId: `${RUN}-mu` },
      });
      await expect(
        db().materialCorrection.create({
          data: { nodeId: N2, face: 'u_row_b', valeur: 'b', legacyMaterialId: `${RUN}-mu` },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('FOREIGN KEYS: deleting an old-sheet row unlinks its correction; deleting an image removes its corrections and frees the rows marked for it', async () => {
      const n4 = `${RUN}-n4`;
      await node(n4, P);
      await legacyRow(`${RUN}-mf1`, P, 'fk_one');
      await legacyRow(`${RUN}-mf2`, P, 'fk_two');
      await db().material.update({
        where: { id: `${RUN}-mf2` },
        data: { attachedNodeId: n4, attachedAt: new Date() },
      });
      const kept = await db().materialCorrection.create({
        data: {
          nodeId: N1,
          face: 'fk_one',
          valeur: 'a',
          origin: 'legacy_attach',
          legacyMaterialId: `${RUN}-mf1`,
        },
      });
      await db().materialCorrection.create({ data: { nodeId: n4, face: 'fk_two', valeur: 'b' } });

      await db().material.delete({ where: { id: `${RUN}-mf1` } });
      expect(
        (await db().materialCorrection.findUnique({ where: { id: kept.id } }))?.legacyMaterialId,
      ).toBeNull();

      await db().renderNode.delete({ where: { id: n4 } });
      expect(await db().materialCorrection.count({ where: { nodeId: n4 } })).toBe(0);
      expect(
        (await db().material.findUnique({ where: { id: `${RUN}-mf2` } }))?.attachedNodeId,
      ).toBeNull();
    });
  });

  describe('materials/[face] — PUT, GET, DELETE', () => {
    it('sets, reads and cancels one face of one image', async () => {
      const put = await putFace(N1, 'Façade Nord', 'Brique');
      expect(put.status).toBe(200);
      const got = await getFace(N1, 'Façade Nord');
      expect((await got.json()).material).toMatchObject({
        face: 'facade_nord',
        valeur: 'Brique',
        correction: 'value',
      });
      expect(
        await db().materialCorrection.count({ where: { nodeId: N2, face: 'facade_nord' } }),
      ).toBe(0);
      const del = await deleteFace(N1, 'Façade Nord');
      expect(await del.json()).toMatchObject({ deleted: true });
      expect(
        await db().materialCorrection.count({ where: { nodeId: N1, face: 'facade_nord' } }),
      ).toBe(0);
    });

    it('another user’s project is a 404, nothing written', async () => {
      const res = await putFace(N3, 'toiture', 'Zinc', R);
      expect(res.status).toBe(404);
      expect(await db().materialCorrection.count({ where: { nodeId: N3 } })).toBe(0);
    });

    it('two concurrent first writes on one face end in exactly one row (20 rounds)', async () => {
      for (let i = 0; i < 20; i++) {
        const face = `race_${i}`;
        const results = await Promise.allSettled([putFace(N1, face, 'A'), putFace(N1, face, 'B')]);
        const statuses = results.map(statusOf);
        for (const s of statuses) expect([200, 409]).toContain(s);
        expect(statuses).toContain(200);
        const rows = await db().materialCorrection.findMany({ where: { nodeId: N1, face } });
        expect(rows).toHaveLength(1);
        expect(['A', 'B']).toContain(rows[0]?.valeur);
      }
    }, 120_000);

    it('a PUT racing a DELETE leaves zero or one row, never two, never an error (10 rounds)', async () => {
      for (let i = 0; i < 10; i++) {
        const face = `put_del_${i}`;
        expect((await putFace(N1, face, 'old')).status).toBe(200);
        const results = await Promise.allSettled([putFace(N1, face, 'new'), deleteFace(N1, face)]);
        for (const s of results.map(statusOf)) expect([200, 409]).toContain(s);
        const rows = await db().materialCorrection.findMany({ where: { nodeId: N1, face } });
        expect(rows.length).toBeLessThanOrEqual(1);
        if (rows[0]) expect(rows[0].valeur).toBe('new');
      }
    }, 120_000);
  });

  describe('legacy-attach — rows of the old sheet onto one image', () => {
    it('attaches once; the same request again writes nothing', async () => {
      const m = `${RUN}-ma`;
      await legacyRow(m, P, 'toiture_attach', 'Ardoise');
      const first = await attach(P, N1, [m]);
      expect(first.status).toBe(200);
      expect((await first.json()).attached).toEqual([m]);
      expect((await db().material.findUnique({ where: { id: m } }))?.attachedNodeId).toBe(N1);
      const second = await attach(P, N1, [m]);
      expect(second.status).toBe(200);
      expect((await second.json()).alreadyAttached).toEqual([m]);
      expect(await db().materialCorrection.count({ where: { legacyMaterialId: m } })).toBe(1);
    });

    it('a row of another project is not found; nothing is written', async () => {
      const foreign = `${RUN}-mr`;
      await legacyRow(foreign, R, 'toiture_foreign');
      const res = await attach(P, N1, [foreign]);
      expect(res.status).toBe(409);
      expect((await res.json()).lines[0]).toMatchObject({ reason: 'not_found' });
      expect(
        (await db().material.findUnique({ where: { id: foreign } }))?.attachedNodeId,
      ).toBeNull();
      expect(await db().materialCorrection.count({ where: { legacyMaterialId: foreign } })).toBe(0);
    });

    it('one row attached to two images at once: exactly one wins, on both connections (10 rounds)', async () => {
      for (let i = 0; i < 10; i++) {
        const m = `${RUN}-mc${i}`;
        await legacyRow(m, P, `concurrent_${i}`);
        const results = await Promise.allSettled([attach(P, N1, [m]), attach(P, N2, [m])]);
        const statuses = results.map(statusOf);
        expect(statuses.filter((s) => s === 200)).toHaveLength(1);
        expect(statuses.filter((s) => s === 409)).toHaveLength(1);
        const winner = statuses[0] === 200 ? N1 : N2;
        expect((await db().material.findUnique({ where: { id: m } }))?.attachedNodeId).toBe(winner);
        const links = await db().materialCorrection.findMany({ where: { legacyMaterialId: m } });
        expect(links.map((l) => l.nodeId)).toEqual([winner]);
      }
    }, 120_000);

    it('an attach waits for a real row lock held elsewhere, then completes', async () => {
      const m = `${RUN}-ml`;
      await legacyRow(m, P, 'locked_row');
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let locked!: () => void;
      const lockTaken = new Promise<void>((r) => (locked = r));
      const holder = db().$transaction(
        async (tx) => {
          await tx.$queryRaw`select id from "Material" where id = ${m} for update`;
          locked();
          await gate;
        },
        { timeout: 30_000 },
      );
      let settled = false;
      try {
        await lockTaken;
        const pending = attach(P, N1, [m]).finally(() => {
          settled = true;
        });
        await new Promise((r) => setTimeout(r, 700));
        expect(settled).toBe(false);
        release();
        await holder;
        const res = await pending;
        expect(res.status).toBe(200);
        expect((await db().material.findUnique({ where: { id: m } }))?.attachedNodeId).toBe(N1);
      } finally {
        release();
        await holder.catch(() => undefined);
      }
    }, 60_000);
  });
});
