// POST /api/projects/[projectId]/generate — runs the chosen AI engine
// (Nanobanana or, since Phase 4, ChatGPT Image) against a source RenderNode +
// that image's own materials (étape 3C.3), then creates a child RenderNode + a
// Generation trace row.
export const runtime = 'nodejs';
// The engine call may take up to ENGINE_DEADLINE_MS (180 s); the rest of the
// request fits in what is left. 300 s is the ceiling on Vercel Hobby with
// Fluid compute (checked 2026-10-11).
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
import { checkTierQuota, recordTierUsage } from '@/lib/server/generation/tier-quota';
import {
  generateRender,
  isEngineConfigured,
  EngineNotConfiguredError,
  EngineTimeoutError,
  ENGINE_NAMES,
} from '@/lib/server/generation/engines';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/vercel-blob-client';
import { buildRenderTree } from '@/lib/server/render-tree';
import { detectAndMergeMaterials } from '@/lib/server/materials/detect-and-merge';
import { loadPromptMaterials, toPromptEntries } from '@/lib/server/materials/node-materials';
import type { ResolvedMaterial } from '@/lib/server/materials/resolve';
import { PRESET_KEYS } from '@/lib/server/generation/presets';
import { TEMPLATE_KEYS } from '@/lib/server/generation/templates';
import { RATIO_KEYS } from '@/lib/server/generation/ratios';
import { RESOLUTION_KEYS } from '@/lib/server/generation/resolutions';
import { buildGenerationPrompt } from '@/lib/server/generation/build-prompt';
import { log } from '@/lib/server/observability/log';

const Body = z.object({
  sourceNodeId: z.string().min(1),
  // Null or absent: no ambiance — a faithful photo render (PHOTO_RENDER_MODIFIER).
  preset: z.enum(PRESET_KEYS).nullish(),
  engine: z.enum(ENGINE_NAMES),
  customPrompt: z.string().trim().max(2000).optional(),
  // Started from a template (the image generator page): the prompt is the
  // template's, sent without any ambiance, and the node keeps the template's
  // key as its preset (the four lights, named in the tree).
  template: z.enum(TEMPLATE_KEYS).optional(),
  ratio: z.enum(RATIO_KEYS).optional(),
  resolution: z.enum(RESOLUTION_KEYS).optional(),
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

    const quota = await checkTierQuota(prisma, auth.user.sub);
    if (!quota.allowed) {
      // `error` (not `code`) is the field lib/api.ts's ApiError.code reads —
      // the frontend switches on err.code to tell "no active tier" apart
      // from "quota exhausted" apart from the daily rate limit further down.
      return NextResponse.json(
        { error: quota.reason, message: 'Monthly generation quota check failed' },
        {
          status: quota.reason === 'QUOTA_EXCEEDED' ? 402 : 403,
          headers: { 'x-request-id': ctx.requestId },
        },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    // Every ratio and size on both engines (2026-10-08) — see output-shape.ts.
    const { sourceNodeId, engine, customPrompt, ratio, resolution, template } = parsed.data;
    // The ambiance whose modifier goes into the prompt — none for a template.
    const promptPreset = template ? null : (parsed.data.preset ?? null);
    // What the node records: the template's key or the ambiance.
    const preset = template ?? promptPreset;

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

    // The materials of the SOURCE image only (étape 3C.3): its detections and
    // the user's corrections on it, resolved (node-materials.ts). Never another
    // image's, never the project's old sheet — an old project correction
    // counts again only once explicitly attached to an image. Read before the
    // engine call and before any usage is recorded; unreadable, the generation
    // stops here rather than run on a partial or borrowed list.
    let promptMaterials: ResolvedMaterial[];
    try {
      promptMaterials = await loadPromptMaterials(sourceNode.id);
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : '';
      log.warn('generate: materials of the source image unavailable', { code });
      return NextResponse.json(
        { error: 'MATERIALS_UNAVAILABLE', message: 'Materials are unavailable, try again' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // The daily cap, once every precondition holds (étape 3C.3-R2): a request
    // that cannot start — invalid body, unknown source, a service not
    // configured, unreadable materials, no monthly quota — never takes a daily
    // unit; there is nothing to give back, so no DECR. One call, one unit (an
    // immediate INCR; on a 429 the limiter rolls its own increment back). A
    // request that gets past here counts, even if the engine then fails.
    const limited = await enforceGenerationRateLimit(auth.user.sub);
    if (limited) return limited;

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

    const assembledPrompt = buildGenerationPrompt({
      materialsSnapshot: toPromptEntries(promptMaterials),
      preset: promptPreset,
      customPrompt,
      photoRender: !template && !promptPreset,
    });

    let result;
    try {
      result = await generateRender(engine, {
        sourceImageBuffer,
        sourceMimeType: sourceNode.mimeType,
        prompt: assembledPrompt,
        ...(ratio && ratio !== 'auto' ? { aspectRatio: ratio } : {}),
        ...(resolution ? { resolution } : {}),
      });
    } catch (e) {
      if (e instanceof EngineNotConfiguredError) {
        return NextResponse.json(
          { code: 'AI_ENGINE_NOT_CONFIGURED', message: 'AI generation is not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (e instanceof EngineTimeoutError) {
        return NextResponse.json(
          { code: 'GENERATION_TIMEOUT', message: 'Generation timed out' },
          { status: 504, headers: { 'x-request-id': ctx.requestId } },
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

    const newNodeId = await prisma.$transaction(async (tx) => {
      const newNode = await tx.renderNode.create({
        data: {
          projectId,
          parentId: sourceNode.id,
          kind: 'GENERATED',
          blobUrl: uploaded.blobUrl,
          mimeType: result.mimeType,
          sizeBytes: uploaded.bytes,
          preset,
          engine,
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
          // Exactly the materials the prompt lists; [] when it lists none.
          promptMaterials,
        },
      });
      return newNode.id;
    });

    // Only after the render was actually produced + stored — never before,
    // never on a failed engine call (see tier-quota.ts's doc comment).
    await recordTierUsage(prisma, auth.user.sub);

    // Detect + merge materials from the render that was JUST produced (Phase
    // 2). Never lets a Vision hiccup fail the generation the user asked for
    // — the render + tree above are already committed by this point.
    let materialsDetected = false;
    try {
      await detectAndMergeMaterials(projectId, result.imageBuffer, result.mimeType);
      materialsDetected = true;
    } catch (e) {
      log.warn('generate: material detection failed (non-fatal)', { err: String(e) });
    }

    const nodes = await prisma.renderNode.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, parentId: true, kind: true, createdAt: true, preset: true, engine: true },
    });

    return NextResponse.json(
      {
        tree: buildRenderTree(nodes),
        nodeId: newNodeId,
        materialsDetected,
        quotaRemaining: quota.remaining !== null ? Math.max(0, quota.remaining - 1) : null,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
