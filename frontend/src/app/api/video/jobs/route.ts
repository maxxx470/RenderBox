// The video module's two public calls (2026-11-07).
//
//   POST — ask for a clip. Everything that can refuse does so before a
//          credit moves: the engine's own catalogue, then the price grid,
//          then the balance. See lib/server/video/start.ts for why the
//          order of its six steps is the design.
//   GET  — the account's clips, newest first. The page polls this while a
//          clip is working, which is also what keeps the sweeper running
//          without anybody scheduling it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { SITE_URL } from '@/lib/seo';
import {
  VIDEO_MODEL_KEYS,
  isVideoRequestShapeValid,
  type VideoModelKey,
} from '@/lib/server/generation/video-models';
import {
  ANIMATION_INTENSITY,
  CAMERA_MOVES,
  ENVIRONMENT_ELEMENTS,
} from '@/lib/server/generation/video-prompt';
import { startVideoJob } from '@/lib/server/video/start';
import { sweepVideoJobsOpportunistically } from '@/lib/server/video/sweep';

const log = createLogger();

/** How many clips the page shows. */
const PAGE = 20;

const Body = z.object({
  model: z.enum(VIDEO_MODEL_KEYS as unknown as [VideoModelKey, ...VideoModelKey[]]),
  mode: z.enum(['first', 'first_last', 'reference']),
  /** The render to animate — a RenderNode this account owns. */
  sourceNodeId: z.string().min(1).optional(),
  endNodeId: z.string().min(1).optional(),
  referenceNodeIds: z.array(z.string().min(1)).max(7).optional(),
  camera: z.enum(Object.keys(CAMERA_MOVES) as [string, ...string[]]),
  environment: z.array(z.enum(Object.keys(ENVIRONMENT_ELEMENTS) as [string, ...string[]])).max(11),
  intensity: z.enum(Object.keys(ANIMATION_INTENSITY) as [string, ...string[]]),
  duration: z.number().int().positive(),
  resolution: z.string().min(1).max(16),
  ratio: z.string().min(1).max(16).optional(),
  audio: z.boolean(),
  /** The user's own words. The preservation block still comes first. */
  request: z.string().max(2000).optional(),
});

/**
 * Read one of the account's images. The ownership check IS the
 * `project: { userId }` filter — another account's id simply matches
 * nothing, which is the same guard the reference images use.
 */
async function readOwnedImage(
  nodeId: string,
  userId: string,
): Promise<{ nodeId: string; buffer: Buffer; mimeType: string } | null> {
  const node = await prisma.renderNode.findFirst({
    where: { id: nodeId, project: { userId } },
    select: { id: true, blobUrl: true, mimeType: true },
  });
  if (!node) return null;
  const res = await fetch(node.blobUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  return {
    nodeId: node.id,
    buffer: Buffer.from(await res.arrayBuffer()),
    mimeType: node.mimeType,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrf = verifyCsrf(req);
    if (csrf) return csrf;
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    const body = parsed.data;

    // The shape is checked here too, not only in the adapter: the client
    // reads the same catalogue, so a mismatch means a stale page, and the
    // user should be told rather than charged.
    if (
      !isVideoRequestShapeValid({
        model: body.model,
        mode: body.mode,
        duration: body.duration,
        resolution: body.resolution,
        ...(body.ratio === undefined ? {} : { ratio: body.ratio }),
      })
    ) {
      return NextResponse.json({ error: 'UNSUPPORTED_SETTINGS' }, { status: 400 });
    }

    const userId = auth.user.sub;
    const source = body.sourceNodeId ? await readOwnedImage(body.sourceNodeId, userId) : null;
    if (body.mode !== 'reference' && !source) {
      return NextResponse.json({ error: 'SOURCE_NOT_FOUND' }, { status: 404 });
    }
    const endFrame = body.endNodeId ? await readOwnedImage(body.endNodeId, userId) : null;
    if (body.mode === 'first_last' && !endFrame) {
      return NextResponse.json({ error: 'END_FRAME_NOT_FOUND' }, { status: 404 });
    }
    // A reference we cannot read is DROPPED, never fatal — the same rule the
    // image references follow.
    const references = (
      await Promise.all((body.referenceNodeIds ?? []).map((id) => readOwnedImage(id, userId)))
    ).filter((r): r is NonNullable<typeof r> => r !== null);

    const result = await startVideoJob(
      prisma,
      {
        userId,
        source,
        endFrame,
        references,
        settings: {
          model: body.model,
          mode: body.mode,
          camera: body.camera as keyof typeof CAMERA_MOVES,
          environment: body.environment as (keyof typeof ENVIRONMENT_ELEMENTS)[],
          intensity: body.intensity as keyof typeof ANIMATION_INTENSITY,
          duration: body.duration,
          resolution: body.resolution,
          audio: body.audio,
          ...(body.ratio === undefined ? {} : { ratio: body.ratio }),
          ...(body.request === undefined ? {} : { request: body.request }),
        },
      },
      SITE_URL,
    );

    if (!result.ok) {
      // `error` (not `code`) is the field lib/api.ts's ApiError.code reads.
      const status =
        result.code === 'INSUFFICIENT_CREDITS' || result.code === 'NO_ACTIVE_TIER'
          ? 402
          : result.code === 'PRICE_NOT_VERIFIED'
            ? 409
            : result.code === 'INVALID_REQUEST'
              ? 400
              : 503;
      log.warn('video: a clip was refused', { code: result.code, model: body.model });
      return NextResponse.json(
        {
          error: result.code,
          ...(result.balance === undefined ? {} : { balance: result.balance }),
          ...(result.cost === undefined ? {} : { cost: result.cost }),
        },
        { status },
      );
    }

    return NextResponse.json({ jobId: result.jobId, credits: result.credits }, { status: 201 });
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    // The page polls this while a clip works, so it is also the heartbeat
    // that settles what the callback never closed.
    await sweepVideoJobsOpportunistically(prisma);

    const jobs = await prisma.videoJob.findMany({
      where: { userId: auth.user.sub },
      orderBy: { createdAt: 'desc' },
      take: PAGE,
      select: {
        id: true,
        model: true,
        mode: true,
        camera: true,
        duration: true,
        resolution: true,
        status: true,
        creditsCharged: true,
        failCode: true,
        createdAt: true,
        finishedAt: true,
        sourceNodeId: true,
        // blobUrl is NEVER sent: on Vercel Blob it is world-readable by URL,
        // and on R2 it is a key, not a link. The clip is fetched through
        // /api/video/jobs/[id]/file, which checks ownership first.
      },
    });

    return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
