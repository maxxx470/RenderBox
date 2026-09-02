// Per-IP rate limit on photo uploads.
//
// Uploads had no rate limit at all before this — only a byte-size cap
// (UPLOAD_MAX_BYTES). That's fine under normal auth, but under AUTH_DISABLED
// (see auth-disabled.ts) every visitor shares the same demo userId, so a
// per-user limit would just be one shared bucket easily exhausted by a
// single visitor looping the upload button. Keying on IP instead gives each
// visitor their own bucket regardless of the shared identity underneath.
//
// Mirrors rate-limit-by-userid.ts's fail-open-in-dev / fail-closed-in-prod
// posture (WR-03) when Redis is absent: a misconfigured deploy must not
// silently disable this guard in production.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

const PREFIX = 'rl:upload:ip:';
const WINDOW_MS = 60 * 60 * 1000;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export async function enforceUploadRateLimit(req: NextRequest): Promise<NextResponse | null> {
  const max = Number(process.env.UPLOAD_RATE_LIMIT_MAX_PER_HOUR ?? 20);

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
  const { totalHits, resetTime } = await store.increment(`${PREFIX}${clientIp(req)}`);
  if (totalHits > max) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'UPLOAD_RATE_LIMIT_EXCEEDED', message: 'Too many uploads. Try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime.getTime() / 1000)),
        },
      },
    );
  }
  return null;
}
