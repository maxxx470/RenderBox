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
} from '@/lib/server/generation/enhance';

const Body = z.object({
  sourceNodeId: z.string().min(1),
  engine: z.enum(ENGINE_NAMES),
  options: z.array(z.enum(ENHANCE_OPTION_KEYS)).min(1).max(ENHANCE_OPTION_KEYS.length),
  strength: z.enum(ENHANCE_STRENGTHS),
  instruction: z.string().trim().max(2000).optional(),
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

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { sourceNodeId, engine, options, strength, instruction } = parsed.data;

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

    const prompt = buildEnhancePrompt({ options, strength, instruction });

    let result;
    try {
      // No aspectRatio: the framing is one of the things enhance preserves.
      result = await generateRender(engine, {
        sourceImageBuffer,
        sourceMimeType: sourceNode.mimeType,
        prompt,
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
