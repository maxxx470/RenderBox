// Per-user daily cap on AI generation calls — guards real per-call spend
// (Gemini pricing), distinct from the auth rate limiters which guard abuse.
// Without Redis in production (no Upstash on Vercel, 2026-10-18) it counts
// the account's renders of the last 24 h in the database instead of refusing
// every render with a 503, which stopped all generation. The database is
// shared by every instance, so the cap holds across them; two requests
// running at the same moment can each pass (credits are still debited one
// conditional update at a time) and a deleted render no longer counts.
// Without Redis in development the cap is off, as before.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';
import { prisma } from '@/lib/server/prisma';

const PREFIX = 'rl:generation:userid:';
const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * @param count Number of generation "units" this request will consume
 *   (Phase 5: a multi-variant edit consumes `variantCount`, not 1 — each
 *   variant is a distinct AI call and a distinct cost). Defaults to 1 for
 *   the standard single-render /generate route. Rejecting never leaves a
 *   partial charge behind: if adding `count` would exceed the daily max,
 *   every increment made in this call is rolled back before returning 429.
 */
export async function enforceGenerationRateLimit(
  userId: string,
  count = 1,
): Promise<NextResponse | null> {
  const max = Number(process.env.GENERATION_RATE_LIMIT_MAX_PER_DAY ?? 20);

  if (!redis) {
    if (process.env.NODE_ENV !== 'production') return null;
    const made = await prisma.renderNode.count({
      where: {
        kind: { not: 'UPLOADED' },
        project: { userId },
        createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
      },
    });
    return made + count > max ? dailyLimitReached(max, WINDOW_MS / 1000) : null;
  }

  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS });
  const key = `${PREFIX}${userId}`;

  let totalHits = 0;
  let resetTime = new Date();
  for (let i = 0; i < count; i++) {
    const result = await store.increment(key);
    totalHits = result.totalHits;
    resetTime = result.resetTime;
    if (totalHits > max) {
      // Roll back every increment made in this call — a rejected request
      // must never leave a partial charge behind.
      for (let j = 0; j <= i; j++) {
        await store.decrement(key);
      }
      const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
      return dailyLimitReached(max, retryAfter);
    }
  }
  return null;
}

function dailyLimitReached(max: number, retryAfter: number): NextResponse {
  return NextResponse.json(
    {
      error: 'GENERATION_DAILY_LIMIT_EXCEEDED',
      message: 'Daily generation limit reached. Try again tomorrow.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(max),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
