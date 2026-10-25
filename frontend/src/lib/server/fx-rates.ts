import 'server-only';
import { SUPPORTED_CURRENCIES } from '@/lib/local-currency';
import { createLogger } from '@/lib/server/logger';

// The daily refresh of the exchange rates behind the plan card's
// local-currency line (lib/local-currency.ts).
//
// ---------------------------------------------------------------------------
// Why this never delays a page
// ---------------------------------------------------------------------------
// `getEurRates()` is SYNCHRONOUS and never awaits the network. It answers with
// whatever it already holds — the live rates if this instance has fetched
// them, `null` otherwise — and starts a refresh in the background when its
// copy is stale. A visitor therefore never waits on open.er-api.com, and the
// very first render on a cold instance simply falls back to the table checked
// into local-currency.ts.
//
// That fallback is why no cron and no Redis are needed here. The figure is
// labelled « ≈ » either way; the only difference between the two sources is
// how far the rate has drifted, and the committed table is days old at worst.
//
// The CFA franc is pegged to the euro by treaty, so the euro figure never
// depends on this fetch at all.

/** How long a fetched set of rates is considered current. */
const TTL_MS = 24 * 60 * 60 * 1000;

/** After a failure, how long before another attempt — the API is optional. */
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

/** The request is background work; it must not hang an instance. */
const TIMEOUT_MS = 4000;

const ENDPOINT = 'https://open.er-api.com/v6/latest/EUR';

const logger = createLogger();

let cache: { rates: Record<string, number>; at: number } | null = null;
let lastFailureAt = 0;
let inFlight: Promise<void> | null = null;

/** Keeps only the currencies the card can format, and only sane numbers. */
function pickSupported(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const code of SUPPORTED_CURRENCIES) {
    const value = source[code];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      out[code] = value;
    }
  }
  // A response that carried almost nothing we recognise is a shape change,
  // not a rate update — keeping it would quietly replace good fallbacks with
  // gaps. The euro itself is always 1, so one entry proves nothing.
  return Object.keys(out).length >= 10 ? out : null;
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch(ENDPOINT, {
      // Our own cache is the one that matters; Next must not add a second,
      // differently-aged one on top of it.
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const rates = pickSupported((body as { rates?: unknown } | null)?.rates);
    if (!rates) throw new Error('unexpected response shape');
    cache = { rates, at: Date.now() };
    lastFailureAt = 0;
  } catch (err) {
    lastFailureAt = Date.now();
    // Not an error for the request that triggered it: the committed table
    // takes over and the page renders exactly as before.
    logger.warn('fx_rates_refresh_failed', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * The rates this instance currently holds (units per euro), or null when it
 * has none yet. Never throws, never awaits — see the note above.
 */
export function getEurRates(): Record<string, number> | null {
  const now = Date.now();
  const stale = !cache || now - cache.at >= TTL_MS;
  const mayRetry = now - lastFailureAt >= RETRY_AFTER_FAILURE_MS;
  if (stale && mayRetry && !inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  return cache?.rates ?? null;
}
