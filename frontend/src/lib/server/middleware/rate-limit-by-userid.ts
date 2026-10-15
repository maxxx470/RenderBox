// D-ADMIN-05 — Per-userId admin rate limiter. 100 req/min per admin
// userId, regardless of source IP (admins often share office IPs).
//
// Pattern: mirrors `createEmailLimiter` (per-email) but keyed on a
// stable `User.id` instead of an email string. Backed by the same
// `RedisRateLimitStore` (Upstash) when available.
//
// Usage from a Route Handler:
//   const auth = await requireAdmin('ADMIN');
//   if (auth instanceof NextResponse) return auth;
//   const limited = await enforceAdminRateLimit(auth.admin.id);
//   if (limited) return limited;
//
// Threat T-03-01-03: rate-limits the back-office surface — without it,
// a compromised admin token could be used to scrape PII at unbounded rate.
//
// Without Redis (UPSTASH env missing) the limit is counted in memory, per
// instance, and logged once — the same degraded mode as the per-email
// limiter (rate-limit-by-email.ts). Until 2026-10-15 production failed
// CLOSED with 503 here (WR-03), but RenderPro runs on Vercel without Upstash
// on purpose: every /api/admin/* route answered 503, /admin's access check
// failed and sent every admin back to /app (owner: « ça me ramène sur le
// dashboard »). Every route still requires an ADMIN session first; set
// ADMIN_RATE_LIMIT_FAIL_CLOSED=1 to bring the 503 back once Redis exists.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { MemoryRateLimitStore, RedisRateLimitStore } from '@/lib/server/rate-limit-store';
import { log } from '@/lib/server/observability/log';

const ADMIN_PREFIX = 'rl:admin:userid:';
const WINDOW_MS = 60_000;
const MAX_HITS = 100;

// The per-instance fallback, kept across requests of the same instance.
let memoryStore: MemoryRateLimitStore | null = null;

/**
 * Enforce the per-userId admin rate limit. Returns a 429 NextResponse when
 * the userId has exceeded MAX_HITS in WINDOW_MS, otherwise returns null and
 * the caller should proceed.
 *
 * Without Redis the hits are counted in memory (see the header), unless
 * ADMIN_RATE_LIMIT_FAIL_CLOSED=1, which answers 503 instead.
 */
export async function enforceAdminRateLimit(userId: string): Promise<NextResponse | null> {
  if (!redis && process.env.ADMIN_RATE_LIMIT_FAIL_CLOSED === '1') {
    return NextResponse.json(
      {
        error: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
        message: 'Rate-limit backend unavailable.',
      },
      { status: 503 },
    );
  }
  if (!redis && !memoryStore) {
    log.warn('admin-limiter using in-memory fallback (Redis absent)');
    memoryStore = new MemoryRateLimitStore({ windowMs: WINDOW_MS });
  }
  // Use empty `prefix` since we encode the full keyspace into the key
  // ourselves — the existing store applies its own prefix on top, so we
  // pass '' and prepend rl:admin:userid: explicitly to keep the keyspace
  // contract documented at this call site.
  const store = redis
    ? new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS })
    : memoryStore!;
  const { totalHits, resetTime } = await store.increment(`${ADMIN_PREFIX}${userId}`);
  if (totalHits > MAX_HITS) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'TOO_MANY_REQUESTS',
        message: 'Admin rate limit exceeded; retry shortly.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(MAX_HITS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime.getTime() / 1000)),
        },
      },
    );
  }
  return null;
}
