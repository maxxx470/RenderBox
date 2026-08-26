// Per-user daily cap on AI generation calls — guards real per-call spend
// (Gemini pricing), distinct from the auth rate limiters which guard abuse.
// Mirrors rate-limit-by-userid.ts's fail-open-in-dev / fail-closed-in-prod
// posture when Redis is absent.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

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
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'RATE_LIMIT_BACKEND_UNAVAILABLE', message: 'Rate-limit backend unavailable.' },
        { status: 503 },
      );
    }
    return null;
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
  }
  return null;
}
