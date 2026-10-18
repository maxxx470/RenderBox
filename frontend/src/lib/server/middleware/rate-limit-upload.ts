// Per-IP rate limit on photo uploads.
//
// Uploads had no rate limit at all before this — only a byte-size cap
// (UPLOAD_MAX_BYTES). That's fine under normal auth, but under AUTH_DISABLED
// (see auth-disabled.ts) every visitor shares the same demo userId, so a
// per-user limit would just be one shared bucket easily exhausted by a
// single visitor looping the upload button. Keying on IP instead gives each
// visitor their own bucket regardless of the shared identity underneath.
//
// Without Redis in production (no Upstash on Vercel, 2026-10-18) it counts
// the account's uploads of the last hour in the database instead of refusing
// every upload with a 503 — that refusal was the « création rapide a échoué »
// the owner saw. The guard stays on, shared by every instance, keyed on the
// account rather than the IP (AUTH_DISABLED only runs on Preview); two
// uploads at the same moment can each pass and a deleted upload no longer
// counts. Without Redis in development it is off, as before.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';
import { prisma } from '@/lib/server/prisma';

const PREFIX = 'rl:upload:ip:';
const WINDOW_MS = 60 * 60 * 1000;

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export async function enforceUploadRateLimit(
  req: NextRequest,
  userId: string,
): Promise<NextResponse | null> {
  const max = Number(process.env.UPLOAD_RATE_LIMIT_MAX_PER_HOUR ?? 20);

  if (!redis) {
    if (process.env.NODE_ENV !== 'production') return null;
    const since = new Date(Date.now() - WINDOW_MS);
    const uploaded = await prisma.renderNode.count({
      where: { kind: 'UPLOADED', project: { userId }, createdAt: { gte: since } },
    });
    return uploaded >= max ? tooManyUploads(max, new Date(Date.now() + WINDOW_MS)) : null;
  }

  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS });
  const { totalHits, resetTime } = await store.increment(`${PREFIX}${clientIp(req)}`);
  return totalHits > max ? tooManyUploads(max, resetTime) : null;
}

function tooManyUploads(max: number, resetTime: Date): NextResponse {
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
