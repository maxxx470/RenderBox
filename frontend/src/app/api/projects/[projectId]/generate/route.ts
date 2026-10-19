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
} from '@/lib/server/generation/engines';
import { ENGINE_VERSION_KEYS, ENGINE_VERSIONS } from '@/lib/server/generation/engine-versions';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/vercel-blob-client';
import { buildRenderTree } from '@/lib/server/render-tree';
import { detectAndMergeMaterials } from '@/lib/server/materials/detect-and-merge';
import { loadPromptMaterials, toPromptEntries } from '@/lib/server/materials/node-materials';
import type { ResolvedMaterial } from '@/lib/server/materials/resolve';
import { PRESET_KEYS, isPresetKey } from '@/lib/server/generation/presets';
import { resolvePastedSheet, scheduleSheet } from '@/lib/server/materials/render-sheet';
import { SKY_OPTIONS, TEMPLATE_KEYS } from '@/lib/server/generation/templates';
import { RATIO_KEYS } from '@/lib/server/generation/ratios';
import { RESOLUTION_KEYS } from '@/lib/server/generation/resolutions';
import { buildGenerationPrompt } from '@/lib/server/generation/build-prompt';
import { log } from '@/lib/server/observability/log';

const Body = z
  .object({
    sourceNodeId: z.string().min(1),
    // Null or absent: no ambiance — a faithful photo render (C0, render-profiles.ts).
    preset: z.enum(PRESET_KEYS).nullish(),
    engine: z.enum(ENGINE_NAMES),
    customPrompt: z.string().trim().max(2000).optional(),
    // The ambiance's text as the user left it in the bar (2026-10-19): it
    // replaces that ambiance's own section when it differs from the default.
    ambianceText: z.string().trim().max(4000).optional(),
    // Started from a template (the image generator page): the server builds
    // that light profile's prompt from the key (render-profiles.ts) — the
    // client never sends it — and the node keeps the key as its preset (the
    // four lights, named in the tree). customPrompt is then the user's own
    // note, sent as their request.
    template: z.enum(TEMPLATE_KEYS).optional(),
    // Exterior day's sky (2026-10-19, D2): lightly hazy unless 'sun'.
    sky: z.enum(SKY_OPTIONS).optional(),
    ratio: z.enum(RATIO_KEYS).optional(),
    resolution: z.enum(RESOLUTION_KEYS).optional(),
    // The engine's version (engine-versions.ts); absent: the engine's default.
    version: z.enum(ENGINE_VERSION_KEYS).optional(),
  })
  .refine((b) => !b.version || ENGINE_VERSIONS[b.version].engine === b.engine, {
    message: 'version does not belong to engine',
    path: ['version'],
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
    // Every ratio and size on both engines (2026-10-08) — see output-shape.ts.
    const { sourceNodeId, engine, ratio, resolution, template } = parsed.data;
    // A materials sheet pasted under the prompt (2026-10-19, owner): taken out
    // of the text, its lines go to the prompt as a request and its ambiance
    // is the render's when none was chosen — the renders of one building
    // keep to the same rules.
    const [pastedInText, pastedInRequest] = await Promise.all([
      resolvePastedSheet(parsed.data.ambianceText, auth.user.sub),
      resolvePastedSheet(parsed.data.customPrompt, auth.user.sub),
    ]);
    const ambianceText = pastedInText.rest;
    const customPrompt = pastedInRequest.rest;
    const sheet = pastedInText.sheet ?? pastedInRequest.sheet;
    const version = resolveEngineVersion(engine, parsed.data.version);
    // What the prompt is built on and the node records: the template's key
    // (a light profile) or the ambiance; neither: a faithful photo render.
    const sheetPreset =
      sheet?.ambianceKey && isPresetKey(sheet.ambianceKey) ? sheet.ambianceKey : null;
    const preset = template ?? parsed.data.preset ?? sheetPreset;
    const sky = parsed.data.sky ?? (preset === sheetPreset ? sheet?.sky : undefined) ?? undefined;

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

    // The credits, once every precondition holds: one image at the size asked
    // for, priced by the server (never by the client), debited atomically
    // BEFORE the engine call (tier-quota.ts). Without a plan or enough
    // credits the request stops here, before taking an hourly unit.
    const cost = await renderPriceFor(prisma, auth.user.sub, engine, resolution);
    const debit = await debitCredits(prisma, auth.user.sub, cost);
    if (!debit.ok) return creditRefusalResponse(debit, cost, ctx.requestId);

    // Whatever is still owed back when the request ends: all of it until the
    // render is stored, nothing after.
    let owed = cost;
    try {
      // The hourly cap, once every precondition holds (étape 3C.3-R2): a request
      // that cannot start — invalid body, unknown source, a service not
      // configured, unreadable materials, no credits — never takes a unit;
      // there is nothing to give back, so no DECR. One call, one unit (an
      // immediate INCR; on a 429 the limiter rolls its own increment back, and
      // the credits are refunded below). A request that gets past here counts,
      // even if the engine then fails.
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
        engine,
        materialsSnapshot: toPromptEntries(promptMaterials),
        preset,
        sky,
        customPrompt,
        ambianceText,
        sheet:
          sheet && sheet.lines.length > 0 ? { code: sheet.code, lines: sheet.lines } : undefined,
      });

      let result;
      try {
        result = await generateRender(engine, {
          sourceImageBuffer,
          sourceMimeType: sourceNode.mimeType,
          prompt: assembledPrompt,
          ...(ratio && ratio !== 'auto' ? { aspectRatio: ratio } : {}),
          ...(resolution ? { resolution } : {}),
          ...(version ? { version } : {}),
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
            engineVersion: result.engineVersion ?? null,
            providerCredits: result.providerCredits ?? null,
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

      // The render is stored: the credits are spent for good.
      owed = 0;

      // The image's materials sheet starts here (which colour of the source
      // became which material, the ambiance used) and is completed once the
      // response is sent. Never fails the render.
      try {
        await scheduleSheet({
          nodeId: newNodeId,
          sourceNodeId: sourceNode.id,
          ambiance: preset
            ? { key: preset, sky: preset === 'jour_ext' ? (sky ?? 'hazy') : null }
            : null,
          source: sourceImageBuffer,
          render: result.imageBuffer,
        });
      } catch (e) {
        log.warn('generate: sheet could not start (non-fatal)', { err: String(e) });
      }

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
          nodeId: newNodeId,
          materialsDetected,
          creditsBalance: debit.balance,
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } finally {
      // Engine, storage or database failure, or the hourly cap: nothing was
      // produced, so nothing is charged.
      if (owed > 0) await refundCredits(prisma, auth.user.sub, owed);
    }
  });
}
