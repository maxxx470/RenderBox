// POST /api/projects/[projectId]/edit — Phase 5 advanced editing: add an
// element (with a reference image), retouch a specific zone, or — since
// 2026-10-06 — "annotate": point-and-comment edits (several numbered points,
// one comment each, see generation/annotations.ts), on any RenderNode of the
// project, producing 1-4 sibling variant nodes.
//
// Since 2026-10-06 the source may also be an UPLOADED photo (owner: Commenter
// and Ajouter must work on an image just pinned in the command bar, not only
// on a finished render). A photo has no ambiance, so none is applied: the
// edit changes what was asked and keeps the photo's own light.
//
// Annotate always runs on gpt-image whatever engine the client sends, and
// re-reads the materials from the result: a comment usually changes one.
//
// Multipart (not JSON) because "add_element" needs a file upload alongside
// the other fields — mirrors upload/route.ts's formData() handling. Annotate
// may also carry `markedImage`: the render with its numbered markers drawn
// on, made in the browser, validated and moderated like any upload.
export const runtime = 'nodejs';
// The variants run side by side, each engine call within ENGINE_DEADLINE_MS
// (180 s); the uploads and the rest fit in what is left. 300 s is the
// ceiling on Vercel Hobby with Fluid compute (checked 2026-10-11).
export const maxDuration = 300;

import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { assertProjectOwner, ProjectNotFoundError } from '@/lib/server/idor/assert-project-owner';
import { enforceGenerationRateLimit } from '@/lib/server/middleware/rate-limit-generation';
import {
  creditRefusalResponse,
  debitCredits,
  refundCredits,
} from '@/lib/server/generation/tier-quota';
import { renderPriceFor } from '@/lib/server/generation/render-price';
import {
  generateRender,
  isEngineConfigured,
  EngineNotConfiguredError,
  EngineTimeoutError,
  ENGINE_NAMES,
  resolveEngineVersion,
  type GenerateRenderOutput,
} from '@/lib/server/generation/engines';
import { ENGINE_VERSION_KEYS } from '@/lib/server/generation/engine-versions';
import { uploadBuffer } from '@/lib/server/upload/vercel-blob-client';
import { checkImageFile } from '@/lib/server/upload/check-image-file';
import { buildRenderTree } from '@/lib/server/render-tree';
import { ZoneSchema } from '@/lib/server/generation/describe-zone';
import {
  buildAddElementPrompt,
  buildAnnotationPrompt,
  buildZonePrompt,
} from '@/lib/server/generation/edit-prompts';
import { log } from '@/lib/server/observability/log';
import { isPresetKey } from '@/lib/server/generation/presets';
import { ANNOTATE_ENGINE, AnnotationsSchema } from '@/lib/server/generation/annotations';
import { RATIO_KEYS } from '@/lib/server/generation/ratios';
import { RESOLUTION_KEYS } from '@/lib/server/generation/resolutions';
import { detectAndMergeMaterials } from '@/lib/server/materials/detect-and-merge';
import { loadPromptMaterials, toPromptEntries } from '@/lib/server/materials/node-materials';
import type { ResolvedMaterial } from '@/lib/server/materials/resolve';

const FieldsSchema = z
  .object({
    sourceNodeId: z.string().min(1),
    editType: z.enum(['add_element', 'targeted_retouch', 'annotate']),
    // Optional for annotate only: there the comments carry the instructions
    // and this is just an overall note.
    instruction: z.string().trim().max(2000).default(''),
    variantCount: z.coerce.number().int().min(1).max(4),
    engine: z.enum(ENGINE_NAMES),
    zone: ZoneSchema.optional(),
    annotations: AnnotationsSchema.optional(),
    // Every ratio and size on both engines (2026-10-08) — see output-shape.ts.
    ratio: z.enum(RATIO_KEYS).default('auto'),
    resolution: z.enum(RESOLUTION_KEYS).default('1k'),
    // The engine's version; one of the other engine (annotate forces Pixel
    // IA) is ignored for the engine's default — see resolveEngineVersion.
    version: z.enum(ENGINE_VERSION_KEYS).optional(),
  })
  .refine((v) => v.editType === 'annotate' || v.instruction.length > 0, {
    message: 'instruction is required',
    path: ['instruction'],
  })
  .refine((v) => v.editType !== 'targeted_retouch' || v.zone !== undefined, {
    message: 'zone is required for targeted_retouch',
    path: ['zone'],
  })
  .refine((v) => v.editType !== 'annotate' || v.annotations !== undefined, {
    message: 'annotations are required for annotate',
    path: ['annotations'],
  });

export async function POST(
  req: NextRequest,
  ctx0: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const { projectId } = await ctx0.params;
    try {
      await assertProjectOwner(projectId, auth.user.sub);
    } catch (e) {
      if (e instanceof ProjectNotFoundError) {
        return NextResponse.json(
          { error: 'PROJECT_NOT_FOUND', message: 'Project not found' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const form = await req.formData();
    const rawZone = form.get('zone');
    let parsedZone: unknown;
    if (typeof rawZone === 'string' && rawZone.length > 0) {
      try {
        parsedZone = JSON.parse(rawZone);
      } catch {
        return NextResponse.json(
          { error: 'INVALID_ZONE_JSON', message: 'zone must be valid JSON' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }
    const rawAnnotations = form.get('annotations');
    let parsedAnnotations: unknown;
    if (typeof rawAnnotations === 'string' && rawAnnotations.length > 0) {
      try {
        parsedAnnotations = JSON.parse(rawAnnotations);
      } catch {
        return NextResponse.json(
          { error: 'INVALID_ANNOTATIONS_JSON', message: 'annotations must be valid JSON' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const parsed = FieldsSchema.safeParse({
      sourceNodeId: form.get('sourceNodeId'),
      editType: form.get('editType'),
      instruction: form.get('instruction') ?? undefined,
      variantCount: form.get('variantCount') ?? '1',
      engine: form.get('engine'),
      zone: parsedZone,
      annotations: parsedAnnotations,
      ratio: form.get('ratio') || undefined,
      resolution: form.get('resolution') || undefined,
      version: form.get('version') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const {
      sourceNodeId,
      editType,
      instruction,
      variantCount,
      zone,
      annotations,
      ratio,
      resolution,
    } = parsed.data;
    // Annotate is a gpt-image feature: the client's engine choice does not
    // apply to it (see generation/annotations.ts).
    const engine = editType === 'annotate' ? ANNOTATE_ENGINE : parsed.data.engine;
    const version = resolveEngineVersion(engine, parsed.data.version);

    const referenceFile = form.get('referenceImage');
    if (editType === 'add_element' && !(referenceFile instanceof File)) {
      return NextResponse.json(
        { error: 'REFERENCE_IMAGE_REQUIRED', message: 'referenceImage file is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const sourceNode = await prisma.renderNode.findUnique({
      where: { id: sourceNodeId },
      select: {
        id: true,
        projectId: true,
        blobUrl: true,
        mimeType: true,
        kind: true,
        preset: true,
      },
    });
    if (!sourceNode || sourceNode.projectId !== projectId) {
      return NextResponse.json(
        { error: 'SOURCE_NODE_NOT_FOUND', message: 'Source render node not found in this project' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (!isEngineConfigured(engine)) {
      return NextResponse.json(
        { code: 'AI_ENGINE_NOT_CONFIGURED', message: 'AI generation is not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // The result still is what its source was (a 3D plan stays a 3D plan):
    // the node keeps the source's ambiance, so the tree names it. The prompt
    // no longer re-sends it (2026-10-19, the owner's prompt audit): an edit
    // keeps the image's own light, on one path whatever the source — see
    // edit-prompts.ts.
    const preset = sourceNode.preset && isPresetKey(sourceNode.preset) ? sourceNode.preset : null;

    // The source image's own materials (étape 3C.3) go into the prompt of an
    // Ajouter or a retouch, to be kept. Commenter sends none and reads none: a
    // comment typically asks for a material to CHANGE. Every variant starts
    // from this one source node, so they share this one list. Read before the
    // credits, the rate limit and the engine; unreadable, the edit stops here
    // rather than run on a partial list or on the project's old sheet.
    let promptMaterials: ResolvedMaterial[] = [];
    if (editType !== 'annotate') {
      try {
        promptMaterials = await loadPromptMaterials(sourceNode.id);
      } catch (e) {
        const code = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : '';
        log.warn('edit: materials of the source image unavailable', { code });
        return NextResponse.json(
          { error: 'MATERIALS_UNAVAILABLE', message: 'Materials are unavailable, try again' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // Each variant is a distinct AI call and a distinct image: N variants
    // cost N times one image at the size asked for, priced by the server and
    // debited in full, atomically, before any engine call (tier-quota.ts).
    const unitCost = await renderPriceFor(prisma, auth.user.sub, engine, resolution);
    const cost = unitCost * variantCount;
    const debit = await debitCredits(prisma, auth.user.sub, cost);
    if (!debit.ok) return creditRefusalResponse(debit, cost, ctx.requestId);

    // Whatever is still owed back when the request ends: everything until
    // the variants are stored, then the share of those that failed.
    let owed = cost;
    try {
      // Same "charge the full count up front" posture for the hourly cap —
      // never partially (see rate-limit-generation.ts's rollback behavior; on
      // a 429 the credits are refunded below).
      const limited = await enforceGenerationRateLimit(auth.user.sub, variantCount);
      if (limited) return limited;

      let referenceImages: { buffer: Buffer; mimeType: string }[] | undefined;
      if (editType === 'add_element') {
        const checked = await checkImageFile(
          referenceFile as File,
          ctx.requestId,
          'Reference image',
        );
        if (!checked.ok) return checked.res;
        referenceImages = [{ buffer: checked.buffer, mimeType: checked.mimeType }];
      }
      // Optional: without it the prompt still places each comment by its
      // coordinates and region name. So when moderation cannot run (no
      // OPENAI_API_KEY in production, 2026-10-18) the copy is left out —
      // never forwarded unchecked — instead of refusing every comment.
      const markedFile = form.get('markedImage');
      if (editType === 'annotate' && markedFile instanceof File) {
        const checked = await checkImageFile(markedFile, ctx.requestId, 'Marked image');
        if (checked.ok) {
          referenceImages = [{ buffer: checked.buffer, mimeType: checked.mimeType }];
        } else if (checked.code === 'MODERATION_NOT_CONFIGURED') {
          log.warn('edit: marked copy left out, moderation not configured');
        } else {
          return checked.res;
        }
      }

      // The project's old sheet, kept whole in Generation.materialsSnapshot (its
      // schema contract); it no longer reaches the prompt.
      const materials = await prisma.material.findMany({
        where: { projectId },
        select: { face: true, valeur: true, source: true, confidence: true },
      });

      const sourceRes = await fetch(sourceNode.blobUrl);
      if (!sourceRes.ok) {
        return NextResponse.json(
          { code: 'SOURCE_IMAGE_FETCH_FAILED', message: 'Could not read the source image' },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      const sourceImageBuffer = Buffer.from(await sourceRes.arrayBuffer());

      const promptEntries = toPromptEntries(promptMaterials);
      const assembledPrompt =
        editType === 'annotate'
          ? buildAnnotationPrompt({
              engine,
              annotations: annotations!,
              instruction,
              withMarkedImage: referenceImages !== undefined,
            })
          : editType === 'add_element'
            ? buildAddElementPrompt({ engine, instruction, materials: promptEntries })
            : buildZonePrompt({ engine, zone: zone!, instruction, materials: promptEntries });
      const settled = await Promise.allSettled(
        Array.from({ length: variantCount }, () =>
          generateRender(engine, {
            sourceImageBuffer,
            sourceMimeType: sourceNode.mimeType,
            prompt: assembledPrompt,
            referenceImages,
            ...(ratio !== 'auto' ? { aspectRatio: ratio } : {}),
            resolution,
            ...(version ? { version } : {}),
          }),
        ),
      );

      const succeeded: GenerateRenderOutput[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') succeeded.push(r.value);
        else if (r.reason instanceof EngineNotConfiguredError) {
          log.warn('edit: engine reported not configured mid-batch', { engine });
        }
      }

      if (succeeded.length === 0) {
        // A timeout only when every variant ran out of time; any other failure
        // among them keeps the general answer.
        if (
          settled.every((r) => r.status === 'rejected' && r.reason instanceof EngineTimeoutError)
        ) {
          return NextResponse.json(
            { code: 'GENERATION_TIMEOUT', message: 'Generation timed out' },
            { status: 504, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        return NextResponse.json(
          { code: 'GENERATION_FAILED', message: 'All variant generations failed' },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      const createdNodeIds: string[] = [];
      for (const result of succeeded) {
        let uploaded;
        try {
          const pathname = `renderbox/${auth.user.sub}/${projectId}/${randomUUID()}`;
          uploaded = await uploadBuffer(pathname, result.imageBuffer, result.mimeType);
        } catch (e) {
          log.warn('edit: a variant failed to upload (skipped)', { err: String(e) });
          continue;
        }

        const newNodeId = await prisma.$transaction(async (tx) => {
          const newNode = await tx.renderNode.create({
            data: {
              projectId,
              parentId: sourceNodeId,
              kind: 'GENERATED',
              blobUrl: uploaded.blobUrl,
              mimeType: result.mimeType,
              sizeBytes: uploaded.bytes,
              preset,
              engine,
              engineVersion: result.engineVersion ?? null,
              providerCredits: result.providerCredits ?? null,
              editType,
              ...(editType === 'targeted_retouch' ? { editZone: zone! } : {}),
              ...(editType === 'annotate' ? { editZone: { annotations: annotations! } } : {}),
            },
            select: { id: true },
          });
          await tx.generation.create({
            data: {
              nodeId: newNode.id,
              engine,
              preset,
              prompt: assembledPrompt,
              materialsSnapshot: materials,
              // Exactly the materials this variant's prompt lists; [] when none.
              promptMaterials,
            },
          });
          return newNode.id;
        });
        createdNodeIds.push(newNodeId);
      }

      if (createdNodeIds.length === 0) {
        return NextResponse.json(
          { code: 'UPLOAD_FAILED', message: 'Storage write failed for every generated variant' },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      // Only the variants ACTUALLY produced + stored are charged — one that
      // failed the engine call or the upload is refunded.
      owed = unitCost * (variantCount - createdNodeIds.length);

      // A comment usually changes a material ("façade en bois"), so the
      // project's material memory is re-read from the result, as after a
      // generation. Never fails the edit — the renders are already stored.
      let materialsDetected = false;
      const firstResult = succeeded[0];
      if (editType === 'annotate' && firstResult) {
        try {
          await detectAndMergeMaterials(projectId, firstResult.imageBuffer, firstResult.mimeType);
          materialsDetected = true;
        } catch (e) {
          log.warn('edit: material detection after annotate failed (non-fatal)', {
            err: String(e),
          });
        }
      }

      const nodes = await prisma.renderNode.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          parentId: true,
          kind: true,
          createdAt: true,
          preset: true,
          engine: true,
          engineVersion: true,
        },
      });

      return NextResponse.json(
        {
          tree: buildRenderTree(nodes),
          nodeIds: createdNodeIds,
          requestedCount: variantCount,
          createdCount: createdNodeIds.length,
          materialsDetected,
          creditsBalance: debit.balance + owed,
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } finally {
      if (owed > 0) await refundCredits(prisma, auth.user.sub, owed);
    }
  });
}
