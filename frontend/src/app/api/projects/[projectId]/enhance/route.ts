// POST /api/projects/[projectId]/enhance — improves an existing image (the
// /app/enhance page) without redesigning it: sharper, better lit, more
// believable materials. Same guard rail as generate/route.ts (CSRF, owner
// check, hourly rate limit, monthly quota charged only once a render is
// stored); what differs is the prompt — see generation/enhance.ts — and that
// no ambiance preset applies, so the node carries `editType: 'enhance'` and a
// null preset.
//
// The source may be an upload or a previous render: enhancing a render
// RenderBox itself produced is the main use, but an architect's own render
// from another tool is just as valid an input.
//
// Multipart since 2026-10-08 (owner): each ticked improvement may carry ONE
// reference image (file field `ref_<option>`, e.g. ref_materials) that the
// engine uses as a guide for that aspect only; the free-text instruction can
// stand alone, with nothing ticked; and a ratio may be asked for ('auto', the
// default, keeps the framing). References go through the same gate as the
// edit route's (size, MIME, magic bytes, moderation) — check-image-file.ts.
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
} from '@/lib/server/generation/engines';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/vercel-blob-client';
import {
  buildEnhancePrompt,
  ENHANCE_OPTION_KEYS,
  ENHANCE_STRENGTHS,
  type EnhanceOptionKey,
} from '@/lib/server/generation/enhance';
import { RATIO_KEYS } from '@/lib/server/generation/ratios';
import { RESOLUTION_KEYS } from '@/lib/server/generation/resolutions';
import { checkImageFile } from '@/lib/server/upload/check-image-file';
import type { ReferenceImage } from '@/lib/server/generation/engines/types';

const Fields = z
  .object({
    sourceNodeId: z.string().min(1),
    engine: z.enum(ENGINE_NAMES),
    options: z.array(z.enum(ENHANCE_OPTION_KEYS)).max(ENHANCE_OPTION_KEYS.length),
    strength: z.enum(ENHANCE_STRENGTHS),
    instruction: z.string().trim().max(2000).optional(),
    ratio: z.enum(RATIO_KEYS).default('auto'),
    resolution: z.enum(RESOLUTION_KEYS).default('1k'),
  })
  .refine((v) => v.options.length > 0 || Boolean(v.instruction), {
    message: 'tick an improvement or describe one',
    path: ['options'],
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

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'multipart form expected' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const text = (key: string) => {
      const v = form.get(key);
      return typeof v === 'string' && v !== '' ? v : undefined;
    };
    const parsed = Fields.safeParse({
      sourceNodeId: text('sourceNodeId'),
      engine: text('engine'),
      options: form.getAll('options').filter((v): v is string => typeof v === 'string'),
      strength: text('strength'),
      instruction: text('instruction'),
      ratio: text('ratio'),
      resolution: text('resolution'),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { sourceNodeId, engine, options, strength, instruction, ratio, resolution } = parsed.data;

    // One reference per ticked improvement, in the options' fixed order so the
    // prompt numbers them the way they are sent. A reference for an option
    // that is not ticked is refused rather than silently dropped.
    const refFiles: { key: EnhanceOptionKey; file: File }[] = [];
    for (const key of ENHANCE_OPTION_KEYS) {
      const file = form.get(`ref_${key}`);
      if (!(file instanceof File) || file.size === 0) continue;
      if (!options.includes(key)) {
        return NextResponse.json(
          { error: 'VALIDATION_FAILED', message: `ref_${key} needs its option ticked` },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      refFiles.push({ key, file });
    }

    const limited = await enforceGenerationRateLimit(auth.user.sub);
    if (limited) return limited;

    const quota = await checkTierQuota(prisma, auth.user.sub);
    if (!quota.allowed) {
      // `error`, not `code` — see generate/route.ts.
      return NextResponse.json(
        { error: quota.reason, message: 'Monthly generation quota check failed' },
        {
          status: quota.reason === 'QUOTA_EXCEEDED' ? 402 : 403,
          headers: { 'x-request-id': ctx.requestId },
        },
      );
    }

    const sourceNode = await prisma.renderNode.findUnique({
      where: { id: sourceNodeId },
      select: { id: true, projectId: true, blobUrl: true, mimeType: true },
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

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const sourceRes = await fetch(sourceNode.blobUrl);
    if (!sourceRes.ok) {
      return NextResponse.json(
        { code: 'SOURCE_IMAGE_FETCH_FAILED', message: 'Could not read the source image' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const sourceImageBuffer = Buffer.from(await sourceRes.arrayBuffer());

    const referenceImages: ReferenceImage[] = [];
    for (const { key, file } of refFiles) {
      const checked = await checkImageFile(file, ctx.requestId, `Reference image (${key})`);
      if (!checked.ok) return checked.res;
      referenceImages.push({ buffer: checked.buffer, mimeType: checked.mimeType });
    }

    const prompt = buildEnhancePrompt({
      options,
      strength,
      instruction,
      references: refFiles.map((r) => r.key),
    });

    let result;
    try {
      // 'auto' keeps the framing — one of the things enhance preserves; any
      // other ratio is the user's explicit choice in the bar.
      result = await generateRender(engine, {
        sourceImageBuffer,
        sourceMimeType: sourceNode.mimeType,
        prompt,
        ...(referenceImages.length > 0 ? { referenceImages } : {}),
        ...(ratio !== 'auto' ? { aspectRatio: ratio } : {}),
        resolution,
      });
    } catch (e) {
      if (e instanceof EngineNotConfiguredError) {
        return NextResponse.json(
          { code: 'AI_ENGINE_NOT_CONFIGURED', message: 'AI generation is not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { code: 'GENERATION_FAILED', message: 'Generation failed' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let uploaded;
    try {
      const pathname = `renderbox/${auth.user.sub}/${projectId}/${randomUUID()}`;
      uploaded = await uploadBuffer(pathname, result.imageBuffer, result.mimeType);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { code: 'UPLOAD_FAILED', message: 'Storage write failed' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const materials = await prisma.material.findMany({
      where: { projectId },
      select: { face: true, valeur: true, source: true, confidence: true },
    });

    const nodeId = await prisma.$transaction(async (tx) => {
      const node = await tx.renderNode.create({
        data: {
          projectId,
          parentId: sourceNode.id,
          kind: 'GENERATED',
          blobUrl: uploaded.blobUrl,
          mimeType: result.mimeType,
          sizeBytes: uploaded.bytes,
          engine,
          editType: 'enhance',
        },
        select: { id: true },
      });
      await tx.generation.create({
        data: { nodeId: node.id, engine, prompt, materialsSnapshot: materials },
      });
      return node.id;
    });

    // Charged only now that the render exists — see tier-quota.ts.
    await recordTierUsage(prisma, auth.user.sub);

    return NextResponse.json(
      {
        nodeId,
        quotaRemaining: quota.remaining !== null ? Math.max(0, quota.remaining - 1) : null,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
