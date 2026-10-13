// /api/projects/[projectId]/nodes/[nodeId]/materials/[face] — the user's
// correction of one material face on ONE image (Phase 7, étape 3C.2).
//
//   GET     the face as it resolves on this image (a correction beats the
//           detection of its face), with where its correction comes from
//           as stored (correctionOrigin, étape 3C.5.5)
//   PUT     { valeur: "…" } sets the face's value on this image;
//           { valeur: null } removes the face from this image, even when the
//           detector sees it — the correction row stays, holding the removal
//   DELETE  cancels the correction: the detection, if any, applies again
//
// Only the rows of this node are read or written — never another image's,
// never a value of the project's old Material sheet (only an attached row's
// mark, see below), never a detection. What is stored here is what the
// generate and edit routes send for this image since étape 3C.3, through
// loadPromptMaterials (node-materials.ts): a render made from this image,
// and an edit that re-applies its ambiance (never Commenter). This route
// itself starts no generation. The face in the path is any label ("Façade
// principale"); it is stored under its canonical key (canonical-face.ts),
// the label kept for display.
//
// A correction attached from the project's old sheet (étape 3C.5.2: origin
// "legacy_attach", legacyMaterialId set, the old row marked attachedNodeId)
// stops being the old row's the moment the user acts on it (étape 3C.5.3):
//   - PUT makes it the user's own: origin "user", legacyMaterialId cleared,
//     and the old row's mark released;
//   - DELETE removes it and releases the old row's mark.
// The old row is released only if it is still marked as attached to THIS
// image — never if it was attached to another one meanwhile — and only for
// the row the correction really came from; a correction the user typed
// never touches the old sheet. Correction and mark change in one
// transaction: never one without the other.
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
import { canonicalizeFace } from '@/lib/server/materials/canonical-face';
import {
  describeNodeFace,
  loadNodeMaterialRows,
  normalizeCorrectionText,
} from '@/lib/server/materials/node-materials';

/** Same bound as the old sheet's manual edit and the detection service. */
const MAX_VALUE_LENGTH = 500;
/** The label shown for a face; its canonical key is at most 64 characters. */
const MAX_LABEL_LENGTH = 200;

const Body = z.object({ valeur: z.union([z.string(), z.null()]) }).strict();

interface RouteParams {
  params: Promise<{ projectId: string; nodeId: string; face: string }>;
}

type Ctx = ReturnType<typeof makeRequestContext>;

function fail(ctx: Ctx, status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message },
    { status, headers: { 'x-request-id': ctx.requestId } },
  );
}

/** A database failure: logged by its code only, answered without detail. */
function unavailable(ctx: Ctx, step: string, err: unknown) {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
  log.warn('node materials: database error', { step, code });
  return fail(ctx, 503, 'MATERIALS_UNAVAILABLE', 'Materials are unavailable, try again');
}

/**
 * A write that lost a race with another request on the same (node, face):
 * the row appeared meanwhile (P2002, unique key) or vanished meanwhile
 * (P2025, a DELETE between Prisma's read and its update).
 */
function isWriteRace(err: unknown): boolean {
  if (err instanceof CorrectionChanged) return true;
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err.code === 'P2002' || err.code === 'P2025' || err.code === 'P2034')
  );
}

/**
 * The checks every method shares: CSRF (mutations), session, project owner,
 * a usable face, and a node that belongs to this very project. A node or a
 * project the user cannot see is a 404, whichever it is.
 */
async function authorize(
  req: NextRequest,
  ctx: Ctx,
  params: RouteParams['params'],
  mutating: boolean,
): Promise<NextResponse | { projectId: string; nodeId: string; face: string; faceLabel: string }> {
  if (mutating) {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;
  }

  const auth = await requireAuth(req.headers.get('authorization'));
  if (auth instanceof NextResponse) return auth;

  const { projectId, nodeId, face: rawFace } = await params;
  try {
    await assertProjectOwner(projectId, auth.user.sub);
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      return fail(ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    }
    throw e;
  }

  // Next.js has already decoded the path segment: decoding it again would
  // turn a label holding "%20" or "%25" into another face. A segment Next
  // cannot decode never reaches this handler (Next answers its own 400).
  const faceLabel = normalizeCorrectionText(rawFace);
  const canonical = canonicalizeFace(faceLabel);
  if (!canonical.ok) {
    return fail(
      ctx,
      400,
      'VALIDATION_FAILED',
      canonical.reason === 'empty' ? 'Face name is empty' : 'Face name is too long',
    );
  }
  if (faceLabel.length > MAX_LABEL_LENGTH) {
    return fail(ctx, 400, 'VALIDATION_FAILED', 'Face name is too long');
  }

  let node;
  try {
    node = await prisma.renderNode.findUnique({
      where: { id: nodeId },
      select: { projectId: true },
    });
  } catch (e) {
    return unavailable(ctx, 'node', e);
  }
  if (!node || node.projectId !== projectId) {
    return fail(ctx, 404, 'NODE_NOT_FOUND', 'Image not found in this project');
  }

  return { projectId, nodeId, face: canonical.face, faceLabel };
}

/**
 * The correction changed between this request's read and its write (another
 * request removed it, re-linked it or made it the user's): the transaction is
 * rolled back and handled as a write race — retried once, then a 409.
 */
class CorrectionChanged extends Error {
  constructor() {
    super('correction changed meanwhile');
    this.name = 'CorrectionChanged';
  }
}

/**
 * Releases the old sheet's row a correction was attached from — only while
 * that row is still this project's and still marked as attached to this very
 * image. Marked for another image (or for none), it is left as it is.
 */
async function releaseLegacyRow(
  tx: Prisma.TransactionClient,
  target: { projectId: string; nodeId: string },
  legacyMaterialId: string,
) {
  await tx.material.updateMany({
    where: { id: legacyMaterialId, projectId: target.projectId, attachedNodeId: target.nodeId },
    data: { attachedNodeId: null, attachedAt: null },
  });
}

/** The face as it now resolves on this node — re-read, never assumed. */
async function currentFace(ctx: Ctx, nodeId: string, face: string) {
  try {
    const rows = await loadNodeMaterialRows(nodeId);
    return describeNodeFace(nodeId, face, rows);
  } catch (e) {
    return unavailable(ctx, 'read', e);
  }
}

export async function GET(req: NextRequest, ctx0: RouteParams): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const target = await authorize(req, ctx, ctx0.params, false);
    if (target instanceof NextResponse) return target;

    const material = await currentFace(ctx, target.nodeId, target.face);
    if (material instanceof NextResponse) return material;
    return NextResponse.json({ material }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PUT(req: NextRequest, ctx0: RouteParams): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const target = await authorize(req, ctx, ctx0.params, true);
    if (target instanceof NextResponse) return target;

    const parsed = Body.safeParse(await req.json().catch(() => undefined));
    if (!parsed.success) {
      return fail(ctx, 400, 'VALIDATION_FAILED', 'Expected { "valeur": string | null }');
    }
    let valeur: string | null = null;
    if (parsed.data.valeur !== null) {
      valeur = normalizeCorrectionText(parsed.data.valeur);
      if (!valeur) {
        return fail(ctx, 400, 'VALIDATION_FAILED', 'valeur is empty; send null to remove the face');
      }
      if (valeur.length > MAX_VALUE_LENGTH) {
        return fail(ctx, 400, 'VALIDATION_FAILED', `valeur is longer than ${MAX_VALUE_LENGTH}`);
      }
    }

    const { nodeId, face, faceLabel } = target;
    // One row per (node, face), the user's from now on. In one transaction:
    // read the face's correction, then write it only if it is still as read —
    // an absent one is created (another request inserting first: P2002), a
    // present one is updated by id and link (removed or re-linked meanwhile:
    // CorrectionChanged); one that came from the old sheet loses its link and
    // the old row its mark. The write never reaches a correction it has not
    // read, so a link it did not see is never left behind. A lost race rolls
    // the whole transaction back; one more attempt re-reads and settles it,
    // the last write wins. A second race is a 409: two attempts, never more.
    const write = () =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.materialCorrection.findUnique({
          where: { nodeId_face: { nodeId, face } },
          select: { id: true, legacyMaterialId: true },
        });
        if (!existing) {
          await tx.materialCorrection.create({
            data: { nodeId, face, faceLabel, valeur, origin: 'user' },
            select: { id: true },
          });
          return;
        }
        const { count } = await tx.materialCorrection.updateMany({
          where: { id: existing.id, legacyMaterialId: existing.legacyMaterialId },
          data: { faceLabel, valeur, origin: 'user', legacyMaterialId: null },
        });
        if (count !== 1) throw new CorrectionChanged();
        if (existing.legacyMaterialId) {
          await releaseLegacyRow(tx, target, existing.legacyMaterialId);
        }
      });
    try {
      try {
        await write();
      } catch (e) {
        if (!isWriteRace(e)) throw e;
        await write();
      }
    } catch (e) {
      if (isWriteRace(e)) {
        return fail(ctx, 409, 'CONFLICT', 'The correction changed meanwhile, try again');
      }
      return unavailable(ctx, 'write', e);
    }

    const material = await currentFace(ctx, nodeId, face);
    if (material instanceof NextResponse) return material;
    return NextResponse.json({ material }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(req: NextRequest, ctx0: RouteParams): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const target = await authorize(req, ctx, ctx0.params, true);
    if (target instanceof NextResponse) return target;

    const { nodeId, face } = target;
    // In one transaction: read the face's correction, delete it only if it
    // is still the one read (same row, same link), and release the old row it
    // came from, if any. No correction to cancel is not an error. Never
    // retried: a correction that changed meanwhile — made the user's, or gone
    // and replaced by another one (a new attach) — is not the one the user
    // asked to cancel, so it is never deleted on their behalf: gone, nothing
    // to cancel; replaced, a 409 and everything rolled back.
    let deleted: number;
    try {
      deleted = await prisma.$transaction(async (tx) => {
        const read = () =>
          tx.materialCorrection.findUnique({
            where: { nodeId_face: { nodeId, face } },
            select: { id: true, legacyMaterialId: true },
          });
        const existing = await read();
        if (!existing) return 0;
        const { count } = await tx.materialCorrection.deleteMany({
          where: { id: existing.id, legacyMaterialId: existing.legacyMaterialId },
        });
        if (count !== 1) {
          if (!(await read())) return 0;
          throw new CorrectionChanged();
        }
        if (existing.legacyMaterialId) {
          await releaseLegacyRow(tx, target, existing.legacyMaterialId);
        }
        return 1;
      });
    } catch (e) {
      if (isWriteRace(e)) {
        return fail(ctx, 409, 'CONFLICT', 'The correction changed meanwhile, try again');
      }
      return unavailable(ctx, 'delete', e);
    }

    const material = await currentFace(ctx, nodeId, face);
    if (material instanceof NextResponse) return material;
    return NextResponse.json(
      { deleted: deleted > 0, material },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
