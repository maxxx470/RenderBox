// POST /api/csp-report — collector for the report-only CSP set in middleware.
//
// Browsers post here on their own: unauthenticated, no CSRF token, no session.
// That makes it a public write endpoint, so it stores nothing and only logs a
// few whitelisted fields, with a hard body cap to keep a flood cheap.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { log } from '@/lib/server/observability/log';

const MAX_BODY_BYTES = 8 * 1024;

interface CspReportBody {
  'csp-report'?: Record<string, unknown>;
}

/**
 * Pull only the fields worth logging out of a violation report.
 *
 * The raw report is attacker-controlled and can carry long URLs and page
 * contents in `script-sample`; copying it wholesale into the logs would be a
 * log-injection and PII hazard.
 */
export function summarizeReport(body: unknown): Record<string, string> | null {
  if (!body || typeof body !== 'object') return null;
  const report = (body as CspReportBody)['csp-report'];
  if (!report || typeof report !== 'object') return null;

  const pick = (key: string): string | undefined => {
    const value = report[key];
    return typeof value === 'string' ? value.slice(0, 300) : undefined;
  };

  const summary: Record<string, string> = {};
  for (const key of ['document-uri', 'violated-directive', 'blocked-uri', 'effective-directive']) {
    const value = pick(key);
    if (value) summary[key] = value;
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const summary = summarizeReport(parsed);
  if (summary) log.warn('csp.violation', summary);

  // 204 whatever happens: the browser has nothing to do with the outcome, and
  // an error status would only make it retry.
  return new NextResponse(null, { status: 204 });
}
