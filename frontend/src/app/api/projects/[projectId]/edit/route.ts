// POST /api/projects/[projectId]/edit — Phase 5 advanced editing: add an
// element (with a reference image) or retouch a specific zone of an
// already-GENERATED RenderNode, producing 1-4 sibling variant nodes.
//
// Multipart (not JSON) because "add_element" needs a file upload alongside
// the other fields — mirrors upload/route.ts's formData() handling.
export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { assertProjectOwner, ProjectNotFoundError } from '@/lib/server/idor/assert-project-owner';
import { enforceGenerationRateLimit } from '@/lib/server/middleware/rate-limit-generation';
import { checkTierQuota, recordTierUsage } from '@/lib/server/generation/tier-quota';
import {
  generateRender,
  isEngineConfigured,
  EngineNotConfiguredError,
  ENGINE_NAMES,
  type GenerateRenderOutput,
} from '@/lib/server/generation/engines';
import { uploadBuffer } from '@/lib/server/upload/vercel-blob-client';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';
import { buildRenderTree } from '@/lib/server/render-tree';
import { buildGenerationPrompt } from '@/lib/server/generation/build-prompt';
import { describeZone, ZoneSchema } from '@/lib/server/generation/describe-zone';
import {
  moderateImage,
  ModerationNotConfiguredError,
} from '@/lib/server/moderation/moderate-image';
import { log } from '@/lib/server/observability/log';
import type { PresetKey } from '@/lib/server/generation/presets';

const FieldsSchema = z
  .object({
    sourceNodeId: z.string().min(1),
    editType: z.enum(['add_element', 'targeted_retouch']),
    instruction: z.string().trim().min(1).max(2000),
    variantCount: z.coerce.number().int().min(1).max(4),
    engine: z.enum(ENGINE_NAMES),
    zone: ZoneSchema.optional(),
  })
  .refine((v) => v.editType !== 'targeted_retouch' || v.zone !== undefined, {
    message: 'zone is required for targeted_retouch',
    path: ['zone'],
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

    const parsed = FieldsSchema.safeParse({
      sourceNodeId: form.get('sourceNodeId'),
      editType: form.get('editType'),
      instruction: form.get('instruction'),
      variantCount: form.get('variantCount') ?? '1',
      engine: form.get('engine'),
      zone: parsedZone,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { sourceNodeId, editType, instruction, variantCount, engine, zone } = parsed.data;

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
    if (sourceNode.kind !== 'GENERATED') {
      return NextResponse.json(
        {
          error: 'SOURCE_NOT_EDITABLE',
          message: 'Only a previously generated render can be edited, not a raw upload',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!isEngineConfigured(engine)) {
      return NextResponse.json(
        { code: 'AI_ENGINE_NOT_CONFIGURED', message: 'AI generation is not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Each variant is a distinct AI call — charge the full count up front,
    // before any engine call, and never partially (see
    // rate-limit-generation.ts's rollback behavior).
    const limited = await enforceGenerationRateLimit(auth.user.sub, variantCount);
    if (limited) return limited;

    // Same "charge the full count up front" posture as the rate limit above
    // — a 4-variant request needs 4 remaining in the monthly quota, not 1.
    const quota = await checkTierQuota(prisma, auth.user.sub, variantCount);
    if (!quota.allowed) {
      // `error` (not `code`) is the field lib/api.ts's ApiError.code reads —
      // the frontend switches on err.code to tell "no active tier" apart
      // from "quota exhausted" apart from the hourly rate limit above.
      return NextResponse.json(
        { error: quota.reason, message: 'Monthly generation quota check failed' },
        {
          status: quota.reason === 'QUOTA_EXCEEDED' ? 402 : 403,
          headers: { 'x-request-id': ctx.requestId },
        },
      );
    }

    let referenceImages: { buffer: Buffer; mimeType: string }[] | undefined;
    if (editType === 'add_element') {
      const file = referenceFile as File;
      const allowedMime = (process.env.UPLOAD_ALLOWED_MIME ?? 'image/jpeg,image/png,image/webp')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const maxBytes = Number.parseInt(process.env.UPLOAD_MAX_BYTES ?? '15728640', 10);

      if (file.size > maxBytes) {
        return NextResponse.json(
          { code: 'FILE_TOO_LARGE', message: `Max ${maxBytes} bytes` },
          { status: 413, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (!allowedMime.includes(file.type)) {
        return NextResponse.json(
          { code: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
          { status: 415, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const { match, sniffed } = verifyMagicBytes(buf, file.type);
      if (sniffed && !match) {
        return NextResponse.json(
          { code: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
          { status: 415, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      let moderation;
      try {
        moderation = await moderateImage(buf, file.type);
      } catch (e) {
        if (e instanceof ModerationNotConfiguredError) {
          return NextResponse.json(
            { code: 'MODERATION_NOT_CONFIGURED', message: 'Content moderation is not configured' },
            { status: 503, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        throw e;
      }
      if (moderation.flagged) {
        log.warn('edit: reference image flagged by moderation', {
          categories: moderation.categories,
        });
        return NextResponse.json(
          { code: 'CONTENT_FLAGGED', message: 'Reference image was flagged by content moderation' },
          { status: 422, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      referenceImages = [{ buffer: buf, mimeType: file.type }];
    }

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

    const editInstruction =
      editType === 'add_element'
        ? `Add the following element into the scene, using the attached reference image for its appearance: ${instruction}`
        : `${describeZone(zone!)} Requested change: ${instruction}`;

    // Materials sheet + preset are inherited from the node being edited, not
    // re-specified by the caller — an edit is a refinement of an already
    // materials-tagged render, not a new generation.
    const preset: PresetKey = (sourceNode.preset as PresetKey | null) ?? 'jour_ext';
    const assembledPrompt = buildGenerationPrompt({
      materialsSnapshot: materials,
      preset,
      customPrompt: editInstruction,
    });

    const settled = await Promise.allSettled(
      Array.from({ length: variantCount }, () =>
        generateRender(engine, {
          sourceImageBuffer,
          sourceMimeType: sourceNode.mimeType,
          prompt: assembledPrompt,
          referenceImages,
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
            editType,
            ...(editType === 'targeted_retouch' ? { editZone: zone! } : {}),
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

    // Each ACTUALLY produced + stored variant decrements the monthly quota
    // by 1 — a requested variant that failed the engine call or the upload
    // is never charged.
    await recordTierUsage(prisma, auth.user.sub, createdNodeIds.length);

    const nodes = await prisma.renderNode.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, parentId: true, kind: true, createdAt: true, preset: true, engine: true },
    });

    return NextResponse.json(
      {
        tree: buildRenderTree(nodes),
        nodeIds: createdNodeIds,
        requestedCount: variantCount,
        createdCount: createdNodeIds.length,
        quotaRemaining:
          quota.remaining !== null ? Math.max(0, quota.remaining - createdNodeIds.length) : null,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
