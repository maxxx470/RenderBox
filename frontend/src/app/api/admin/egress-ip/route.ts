// GET /api/admin/egress-ip — « depuis quelle adresse IP ce serveur appelle-t-il
// le monde extérieur ? » (2026-11-01, owner: « il faut forcément remplir
// l'adresse IP » — MoneyFusion's application form makes its IP allowlist
// mandatory.)
//
// A serverless function has no stable outbound address: Vercel runs it on AWS
// in the project's region (fra1) and the IP can differ between invocations,
// between instances and over time. A provider that filters on IP is therefore
// a standing risk here, and the only way to talk about it honestly is to
// MEASURE it rather than guess — so this calls an echo service several times
// and reports every distinct address it came back as, which also shows how
// much the address moves.
//
// It is ADMIN-only and read-only: it reveals infrastructure, and a public
// endpoint that makes the server fetch an arbitrary third party on request is
// not something to leave open. The services are hardcoded for that reason —
// nothing from the request decides what is fetched.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

/** Fixed list: nothing from the request may choose what we call. */
const ECHO_SERVICES = [
  'https://api.ipify.org?format=json',
  'https://ifconfig.me/all.json',
  'https://api.ipify.org?format=json',
  'https://ifconfig.me/all.json',
] as const;

const TIMEOUT_MS = 4000;

function readIp(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  // ipify says `ip`, ifconfig.me says `ip_addr`.
  for (const key of ['ip', 'ip_addr']) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

async function askOnce(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return readIp(await res.json());
  } catch {
    // One service being down says nothing about our address — try the next.
    return null;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const answers = await Promise.all(ECHO_SERVICES.map((url) => askOnce(url)));
    const seen = [...new Set(answers.filter((ip): ip is string => ip !== null))];

    return NextResponse.json(
      {
        /** Every distinct address this instance was seen as, just now. */
        addresses: seen,
        /** More than one here means the address is NOT stable — do not pin it. */
        stable: seen.length === 1,
        checks: ECHO_SERVICES.length,
        answered: answers.filter((a) => a !== null).length,
        region: process.env.VERCEL_REGION ?? null,
        note:
          seen.length === 0
            ? 'No echo service answered — try again, this says nothing about the address itself.'
            : seen.length === 1
              ? 'One address this time. It can still change on another instance or another day: a provider IP allowlist stays a risk.'
              : 'Several addresses in one pass — this server has no fixed outbound IP. An allowlist of one address will refuse payments.',
      },
      { headers: { 'x-request-id': ctx.requestId, 'cache-control': 'no-store' } },
    );
  });
}
