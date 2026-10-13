// POST /api/projects/[projectId]/nodes/[nodeId]/legacy-attach — attaches
// rows of the project's OLD materials sheet (Material) to ONE image, on the
// user's explicit request (étape 3C.5.2, strategy C).
//
// Not under …/materials/ (where it lived until étape 3C.5.5): a static
// segment there wins over ./materials/[face], so a face whose key is
// "attach" could no longer be read, set or cancelled. Nothing static may sit
// beside materials/[face] (routing.test.ts).
//
//   body   { materialIds: string[] }   1 to 50 ids, duplicates counted once
//   200    { attached, alreadyAttached, materials }   materials: the image's
//          faces once written, as GET .../materials lists them
//   409    ATTACH_BLOCKED { lines }   a row cannot be attached: nothing written
//   409    CONFLICT   another request changed these rows meanwhile: nothing written
//   404    PROJECT_NOT_FOUND / NODE_NOT_FOUND    400 VALIDATION_FAILED
//   503    MATERIALS_UNAVAILABLE   the database failed: nothing written
//
// What can be attached is decided by planLegacyAttach (legacy-attach.ts),
// never here: one image per old row, a copy of its value, a face the image
// already corrects or masks never overwritten, all or nothing, a row already
// attached to this image left as it is.
//
// Atomicity and races. The node check, the reads, the plan and the writes run
// in ONE interactive transaction (PostgreSQL's default READ COMMITTED). That
// level does not freeze what was read, so the writes do not trust the plan
// alone — each one re-checks against the rows as they are when written:
//   - the old row is claimed by a compare-and-set update — same project, and
//     still attached to no image (or, for a stale "attached here" mark, to
//     this one): a row another request attached meanwhile updates nothing,
//     and the whole transaction is rolled back (409);
//   - the correction is CREATED, never upserted: a correction the user made
//     on that face meanwhile hits the unique (nodeId, face) key (P2002), and
//     a second correction from the same old row hits the unique
//     legacyMaterialId (P2002) — rolled back either way, never overwritten;
//   - rows are claimed in id order, so two requests over the same rows lock
//     them in the same order; a deadlock or write conflict all the same
//     (P2034) is a 409, as is an image deleted meanwhile (P2003).
// Nothing is retried: a second attempt could land on a correction the user
// has just made. The answer is read inside the same transaction, so a success
// never describes a state other than the one committed.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { assertProjectOwner, ProjectNotFoundError } from '@/lib/server/idor/assert-project-owner';
import { log } from '@/lib/server/observability/log';
import {
  LEGACY_ATTACH_MAX_ROWS,
  planLegacyAttach,
  type LegacyAttachLine,
  type TargetCorrection,
} from '@/lib/server/materials/legacy-attach';
import { describeNodeFaces, type NodeCorrectionRow } from '@/lib/server/materials/node-materials';
import type { NodeMaterialDetection } from '@/lib/server/materials/resolve';

/** An id as Prisma generates them (cuid); anything longer is not one. */
const MAX_ID_LENGTH = 128;

const Body = z
  .object({ materialIds: z.array(z.string().trim().min(1).max(MAX_ID_LENGTH)) })
  .strict();

interface RouteParams {
  params: Promise<{ projectId: string; nodeId: string }>;
}

type Ctx = ReturnType<typeof makeRequestContext>;
type Tx = Prisma.TransactionClient;

function fail(ctx: Ctx, status: number, error: string, message: string, extra = {}) {
  return NextResponse.json(
    { error, message, ...extra },
    { status, headers: { 'x-request-id': ctx.requestId } },
  );
}

function prismaCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
}

/** A database failure: logged by its code only, answered without detail. */
function unavailable(ctx: Ctx, step: string, err: unknown) {
  log.warn('legacy attach: database error', { step, code: prismaCode(err) });
  return fail(ctx, 503, 'MATERIALS_UNAVAILABLE', 'Materials are unavailable, try again');
}

/**
 * Another request won: a unique key taken meanwhile (P2002), an image
 * deleted meanwhile (P2003), a row gone (P2025), a write conflict or a
 * deadlock (P2034).
 */
function isRace(err: unknown): boolean {
  return ['P2002', 'P2003', 'P2025', 'P2034'].includes(prismaCode(err));
}

/** A compare-and-set lost: the old row is no longer as the plan read it. */
class ClaimLost extends Error {
  constructor() {
    super('legacy row claimed meanwhile');
    this.name = 'ClaimLost';
  }
}

interface TargetRows {
  detections: NodeMaterialDetection[];
  corrections: (NodeCorrectionRow & TargetCorrection)[];
}

/** The target image's own detections and corrections — never another image's. */
async function readTarget(tx: Tx, nodeId: string): Promise<TargetRows> {
  const detections = await tx.materialDetection.findMany({
    where: { nodeId },
    select: { nodeId: true, face: true, valeur: true, confidence: true, position: true },
  });
  const corrections = await tx.materialCorrection.findMany({
    where: { nodeId },
    select: {
      id: true,
      nodeId: true,
      face: true,
      faceLabel: true,
      valeur: true,
      origin: true,
      legacyMaterialId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { detections, corrections };
}

/**
 * The blocked lines as the client may see them: an "attached to image X"
 * names X only if X is an image of this project — nothing of another project
 * ever leaves this route.
 */
async function visibleLines(
  tx: Tx,
  projectId: string,
  lines: LegacyAttachLine[],
): Promise<LegacyAttachLine[]> {
  const named = [
    ...new Set(
      lines.flatMap((l) =>
        l.status === 'blocked' && l.attachedNodeId !== undefined ? [l.attachedNodeId] : [],
      ),
    ),
  ];
  if (named.length === 0) return lines;
  const own = new Set(
    (
      await tx.renderNode.findMany({
        where: { id: { in: named }, projectId },
        select: { id: true },
      })
    ).map((n) => n.id),
  );
  return lines.map((l) => {
    if (l.status !== 'blocked' || l.attachedNodeId === undefined || own.has(l.attachedNodeId)) {
      return l;
    }
    return { materialId: l.materialId, status: 'blocked', reason: l.reason, face: l.face };
  });
}

type Outcome =
  | { kind: 'node_not_found' }
  | { kind: 'invalid'; message: string }
  | { kind: 'blocked'; lines: LegacyAttachLine[] }
  | { kind: 'done'; attached: string[]; alreadyAttached: string[]; rows: TargetRows };

async function attach(
  tx: Tx,
  projectId: string,
  nodeId: string,
  materialIds: string[],
): Promise<Outcome> {
  const node = await tx.renderNode.findUnique({
    where: { id: nodeId },
    select: { projectId: true },
  });
  if (!node || node.projectId !== projectId) return { kind: 'node_not_found' };

  // Only this project's rows are read: an id of another project's row is
  // simply not found.
  const legacy = await tx.material.findMany({
    where: { projectId, id: { in: materialIds } },
    select: { id: true, projectId: true, face: true, valeur: true, attachedNodeId: true },
  });
  const before = await readTarget(tx, nodeId);

  const plan = planLegacyAttach({
    projectId,
    nodeId,
    requestedIds: materialIds,
    legacy,
    detections: before.detections,
    corrections: before.corrections,
  });
  if (plan.batchError) {
    return {
      kind: 'invalid',
      message: plan.batchError === 'empty' ? 'materialIds is empty' : 'Too many materialIds',
    };
  }
  if (!plan.ok) return { kind: 'blocked', lines: await visibleLines(tx, projectId, plan.lines) };

  const attachedAt = new Date();
  const writes = [...plan.writes].sort((a, b) =>
    a.materialId < b.materialId ? -1 : a.materialId > b.materialId ? 1 : 0,
  );
  for (const w of writes) {
    // Compare-and-set: the row is still this project's and still free (or
    // still marked for this very image) — otherwise someone else got it.
    const claimed = await tx.material.updateMany({
      where: { id: w.materialId, projectId, attachedNodeId: w.reattach ? nodeId : null },
      data: { attachedNodeId: nodeId, attachedAt },
    });
    if (claimed.count !== 1) throw new ClaimLost();
    // A create, never an upsert: an existing correction is never overwritten.
    await tx.materialCorrection.create({
      data: {
        nodeId,
        face: w.face,
        faceLabel: w.faceLabel,
        valeur: w.valeur,
        origin: 'legacy_attach',
        legacyMaterialId: w.materialId,
      },
      select: { id: true },
    });
  }

  return {
    kind: 'done',
    attached: plan.writes.map((w) => w.materialId),
    alreadyAttached: plan.lines.flatMap((l) => (l.status === 'already_here' ? [l.materialId] : [])),
    rows: writes.length > 0 ? await readTarget(tx, nodeId) : before,
  };
}

export async function POST(req: NextRequest, ctx0: RouteParams): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { projectId, nodeId } = await ctx0.params;
    try {
      await assertProjectOwner(projectId, auth.user.sub);
    } catch (e) {
      if (e instanceof ProjectNotFoundError) {
        return fail(ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      }
      return unavailable(ctx, 'project', e);
    }

    const parsed = Body.safeParse(await req.json().catch(() => undefined));
    if (!parsed.success) {
      return fail(ctx, 400, 'VALIDATION_FAILED', 'Expected { "materialIds": string[] }');
    }
    const materialIds = parsed.data.materialIds;
    if (materialIds.length === 0) {
      return fail(ctx, 400, 'VALIDATION_FAILED', 'materialIds is empty');
    }
    if (materialIds.length > LEGACY_ATTACH_MAX_ROWS) {
      return fail(ctx, 400, 'VALIDATION_FAILED', `At most ${LEGACY_ATTACH_MAX_ROWS} materialIds`);
    }

    let outcome: Outcome;
    try {
      outcome = await prisma.$transaction((tx) => attach(tx, projectId, nodeId, materialIds));
    } catch (e) {
      if (e instanceof ClaimLost || isRace(e)) {
        log.warn('legacy attach: lost a race, rolled back', { code: prismaCode(e) });
        return fail(ctx, 409, 'CONFLICT', 'These materials changed meanwhile, try again');
      }
      return unavailable(ctx, 'attach', e);
    }

    switch (outcome.kind) {
      case 'node_not_found':
        return fail(ctx, 404, 'NODE_NOT_FOUND', 'Image not found in this project');
      case 'invalid':
        return fail(ctx, 400, 'VALIDATION_FAILED', outcome.message);
      case 'blocked':
        return fail(ctx, 409, 'ATTACH_BLOCKED', 'Some materials cannot be attached', {
          lines: outcome.lines,
        });
      case 'done':
        if (outcome.attached.length > 0) {
          log.info('legacy attach: attached', { count: outcome.attached.length });
        }
        return NextResponse.json(
          {
            attached: outcome.attached,
            alreadyAttached: outcome.alreadyAttached,
            materials: describeNodeFaces(nodeId, outcome.rows),
          },
          { headers: { 'x-request-id': ctx.requestId } },
        );
    }
  });
}
