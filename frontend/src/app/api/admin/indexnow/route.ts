// POST /api/admin/indexnow — hand every indexable address to IndexNow, which
// forwards to Bing, Yandex, Seznam and Naver (2026-11-01, owner: « fais
// l'indexation sur bing et microsoft si possible »). Google does not take
// part: it is reached by the sitemap and Search Console.
//
// GET says what would be submitted, and where the key lives, without sending
// anything. ADMIN and up; the POST is audited, because it speaks to the
// outside world on the site's behalf.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { indexableUrls, keyLocation, submitToIndexNow } from '@/lib/server/seo/indexnow';

const log = createLogger();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const urls = indexableUrls();
    return NextResponse.json(
      { urls, count: urls.length, keyLocation: keyLocation() },
      { headers: { 'x-request-id': ctx.requestId, 'cache-control': 'no-store' } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const urls = indexableUrls();
    let result;
    try {
      result = await submitToIndexNow(urls, AbortSignal.timeout(15_000));
    } catch (err) {
      log.error('indexnow: submission failed', {
        requestId: ctx.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'INDEXNOW_UNREACHABLE' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'seo.indexnow_submit',
      targetType: 'site',
      metadata: { submitted: result.submitted, status: result.status, ok: result.ok },
    });

    log.info('indexnow submitted', { ...result, requestId: ctx.requestId });
    return NextResponse.json(result, { headers: { 'x-request-id': ctx.requestId } });
  });
}
