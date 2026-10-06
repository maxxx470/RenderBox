// Per-user hourly cap on assistant messages — each one is a paid model call.
// Same posture as rate-limit-generation.ts: fail open in dev without Redis,
// fail closed in production.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

const PREFIX = 'rl:assistant:userid:';
const WINDOW_MS = 60 * 60 * 1000;

export async function enforceAssistantRateLimit(userId: string): Promise<NextResponse | null> {
  const max = Number(process.env.ASSISTANT_RATE_LIMIT_MAX_PER_HOUR ?? 40);

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
  const { totalHits, resetTime } = await store.increment(key);
  if (totalHits > max) {
    await store.decrement(key);
    return NextResponse.json(
      {
        error: 'ASSISTANT_RATE_LIMITED',
        message: 'Assistant limit reached for this hour.',
        resetAt: resetTime.toISOString(),
      },
      { status: 429 },
    );
  }
  return null;
}
