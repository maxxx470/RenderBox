// POST /api/projects/[projectId]/enhance — improves an existing image (the
// /app/enhance page) without redesigning it: sharper, better lit, more
// believable materials. Same guard rail as generate/route.ts (CSRF, owner
// check, credits debited before the engine and refunded if no render is
// stored, hourly rate limit); what differs is the prompt — see generation/enhance.ts — and that
// no ambiance preset applies, so the node carries `editType: 'enhance'` and a
// null preset.
//
// The source may be an upload or a previous render: enhancing a render
// RenderBox itself produced is the main use, but an architect's own render
// from another tool is just as valid an input.
//
// Multipart since 2026-10-08 (owner): the free-text instruction can stand
// alone, with nothing ticked, and a ratio may be asked for ('auto', the
// default, keeps the framing). Since 2026-10-19 (the owner's prompt audit,
// D6, D8): eight improvements, Lumière's « pièce sombre » sub-option
// (`darkRoom`), the profile « Ambiance » harmonises towards (`ambiance`),
// three intensities — and only the source image is sent: a reference image
// (`ref_<option>`, accepted until then) is refused with 400
// REFERENCES_NOT_ACCEPTED, never forwarded.
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
import {
  ENHANCE_AMBIANCE_KEYS,
  ENHANCE_OPTION_KEYS,
  ENHANCE_STRENGTHS,
} from '@/lib/server/generation/enhance';
import { buildEnhancePrompt } from '@/lib/server/generation/enhance-prompt';
import { RATIO_KEYS } from '@/lib/server/generation/ratios';
import { RESOLUTION_KEYS } from '@/lib/server/generation/resolutions';

const Fields = z
  .object({
    sourceNodeId: z.string().min(1),
    engine: z.enum(ENGINE_NAMES),
    options: z.array(z.enum(ENHANCE_OPTION_KEYS)).max(ENHANCE_OPTION_KEYS.length),
    strength: z.enum(ENHANCE_STRENGTHS),
    darkRoom: z.boolean().default(false),
    ambiance: z.enum(ENHANCE_AMBIANCE_KEYS).optional(),
    instruction: z.string().trim().max(2000).optional(),
    ratio: z.enum(RATIO_KEYS).default('auto'),
    resolution: z.enum(RESOLUTION_KEYS).default('1k'),
    // The engine's version (engine-versions.ts); absent: the engine's default.
    version: z.enum(ENGINE_VERSION_KEYS).optional(),
  })
  .refine((v) => !v.version || ENGINE_VERSIONS[v.version].engine === v.engine, {
    message: 'version does not belong to engine',
    path: ['version'],
  })
  .refine((v) => v.options.length > 0 || Boolean(v.instruction), {
    message: 'tick an improvement or describe one',
    path: ['options'],
  })
  .refine((v) => !v.options.includes('ambiance') || v.ambiance !== undefined, {
    message: 'ambiance needs its profile',
    path: ['ambiance'],
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
      darkRoom: text('darkRoom') === '1',
      ambiance: text('ambiance'),
      instruction: text('instruction'),
      ratio: text('ratio'),
      resolution: text('resolution'),
      version: text('version'),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { sourceNodeId, engine, options, strength, darkRoom, ambiance, instruction } =
      parsed.data;
    const { ratio, resolution } = parsed.data;
    const version = resolveEngineVersion(engine, parsed.data.version);

    // No reference image of any kind reaches the engine (D8): refused, not
    // silently dropped, so a stale client learns it at once.
    for (const [key, value] of form.entries()) {
      if (key.startsWith('ref_') && value instanceof File) {
        return NextResponse.json(
          { error: 'REFERENCES_NOT_ACCEPTED', message: 'Only the source image is sent' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // One image at the size asked for, priced by the server, debited
    // atomically before the engine call — see generate/route.ts.
    const cost = await renderPriceFor(prisma, auth.user.sub, engine, resolution);
    const debit = await debitCredits(prisma, auth.user.sub, cost);
    if (!debit.ok) return creditRefusalResponse(debit, cost, ctx.requestId);

    let owed = cost;
    try {
      const limited = await enforceGenerationRateLimit(auth.user.sub);
      if (limited) return limited;

      const sourceNode = await prisma.renderNode.findUnique({
        where: { id: sourceNodeId },
        select: { id: true, projectId: true, blobUrl: true, mimeType: true },
      });
      if (!sourceNode || sourceNode.projectId !== projectId) {
        return NextResponse.json(
          {
            error: 'SOURCE_NODE_NOT_FOUND',
            message: 'Source render node not found in this project',
          },
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

      const prompt = buildEnhancePrompt({
        engine,
        options,
        strength,
        darkRoom: options.includes('lighting') && darkRoom,
        ambiance: options.includes('ambiance') ? ambiance : undefined,
        instruction,
      });

      let result;
      try {
        // 'auto' keeps the framing — one of the things enhance preserves; any
        // other ratio is the user's explicit choice in the bar.
        result = await generateRender(engine, {
          sourceImageBuffer,
          sourceMimeType: sourceNode.mimeType,
          prompt,
          ...(ratio !== 'auto' ? { aspectRatio: ratio } : {}),
          resolution,
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
            engineVersion: result.engineVersion ?? null,
            providerCredits: result.providerCredits ?? null,
            editType: 'enhance',
          },
          select: { id: true },
        });
        await tx.generation.create({
          data: { nodeId: node.id, engine, prompt, materialsSnapshot: materials },
        });
        return node.id;
      });

      // The render is stored: the credits are spent for good.
      owed = 0;

      return NextResponse.json(
        {
          nodeId,
          creditsBalance: debit.balance,
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } finally {
      if (owed > 0) await refundCredits(prisma, auth.user.sub, owed);
    }
  });
}
