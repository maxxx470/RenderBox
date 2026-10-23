// THE cost grid of RenderPro (2026-10-22, owner — « Phase 2 : les crédits du
// site deviennent de VRAIS crédits Kie »): one site credit is one Kie credit,
// no conversion. Every paid action debits exactly what Kie charges for the
// engine VERSION and the size used — no rounding, no minimum, no tier, the same
// price for everyone, administrators included. The debit (the routes), the
// send buttons, the plan cards, the assistant, /llms.txt and the admin read
// this file and nothing else; no cost constant lives anywhere else.
//
// Not `server-only`: the command bar shows the price before the click. The
// server still prices every request itself, from the engine, version and size
// it validated — never from a figure the client sends.
import type { PricingTier } from '@/lib/pricing-tiers';
import {
  DEFAULT_ENGINE_VERSION,
  type EngineVersionKey,
} from '@/lib/server/generation/engine-versions';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import type { EngineName } from '@/lib/server/generation/engines/types';
import {
  DEFAULT_RESOLUTION,
  RESOLUTION_KEYS,
  type ResolutionKey,
} from '@/lib/server/generation/resolutions';

// ── Configurable constants (owner, 2026-10-22) ──────────────────────────────
/** What one Kie credit costs: 200 credits for 1 $ (kie.ai/pricing). */
export const KIE_USD_PER_CREDIT = 0.005;
/** The dollar in FCFA, fixed by the owner for the accounts. */
export const XOF_PER_USD = 600;
/** One credit in FCFA (0.005 $ × 600 = 3 FCFA). */
export const XOF_PER_CREDIT = KIE_USD_PER_CREDIT * XOF_PER_USD;
/** Maketou's commission on each payment made through its API. */
export const MAKETOU_FEE_RATE = 0.08;
/** What the materials-sheet analysis cost (2026-10-19 → 23). The analysis is gone
 *  (2026-10-23): only used to refund one that was started and never finished. */
export const SHEET_COST = 2;
/** A message to the team (the assistant panel). */
export const ASSISTANT_COST: number = 0;

/**
 * Kie credits per image, for every engine version × size. `null` = no
 * verified price: that combination is refused (409 PRICE_NOT_VERIFIED) until
 * the owner confirms a price. Where each figure comes from:
 *  - visio-2-1 (Nano Banana 2.1, Visio today): kie.ai/nano-banana-2-1, read on
 *    2026-10-22 (4 / 6 / 9), and 4 billed for a 1K render on 2026-10-21;
 *  - pixel-2-5 (GPT Image 2.5 Sunburst, Pixel IA today): billed in the paid
 *    tests of 2026-10-17 (6 / 10 / 16), 6 and 16 seen again on the renders;
 *  - visio-pro (Nano Banana Pro, Visio until 2026-10-19): billed 2026-10-17
 *    (18 / 18 / 24);
 *  - visio-3 (Seedream 5.0 Pro, Visio 2026-10-19 → 20): kie.ai's price and the
 *    renders, 7 at 1K, 14 at 2K; 4K asks Kie for a 2K render (enlarged after).
 * The other versions are no longer offered (resolveEngineVersion only runs
 * each engine's default) and have no verified price.
 */
export const KIE_PRICES: Record<EngineVersionKey, Record<ResolutionKey, number | null>> = {
  'visio-1': { '1k': null, '2k': null, '4k': null },
  'visio-pro': { '1k': 18, '2k': 18, '4k': 24 },
  'visio-2': { '1k': null, '2k': null, '4k': null },
  'visio-2-1': { '1k': 4, '2k': 6, '4k': 9 },
  'visio-2-lite': { '1k': null, '2k': null, '4k': null },
  'visio-3': { '1k': 7, '2k': 14, '4k': 14 },
  'pixel-1-5': { '1k': null, '2k': null, '4k': null },
  'pixel-2': { '1k': null, '2k': null, '4k': null },
  'pixel-2-5': { '1k': 6, '2k': 10, '4k': 16 },
};

/** The version a request runs on: the one resolved, else the engine's default
 *  (the direct engines, without Kie, are priced like it). */
export function priceVersion(engine: EngineName, version?: EngineVersionKey | null) {
  return version ?? DEFAULT_ENGINE_VERSION[engine];
}

/**
 * What `count` images cost, in credits — or null when that version × size has
 * no verified price. Exactly the grid times the count.
 */
export function requestPrice(
  engine: EngineName,
  resolution: ResolutionKey | null | undefined,
  count = 1,
  version?: EngineVersionKey | null,
): number | null {
  const unit = KIE_PRICES[priceVersion(engine, version)][resolution ?? DEFAULT_RESOLUTION];
  return unit === null ? null : unit * Math.max(0, count);
}

/** One combination the interface offers: each engine's default version. */
export interface OfferedPrice {
  engine: EngineName;
  version: EngineVersionKey;
  resolution: ResolutionKey;
  credits: number;
}

/** Every engine × size the command bar offers, with its price. */
export function offeredPrices(): OfferedPrice[] {
  const out: OfferedPrice[] = [];
  for (const engine of Object.keys(DEFAULT_ENGINE_VERSION) as EngineName[]) {
    const version = DEFAULT_ENGINE_VERSION[engine];
    for (const resolution of RESOLUTION_KEYS) {
      const credits = KIE_PRICES[version][resolution];
      if (credits !== null) out.push({ engine, version, resolution, credits });
    }
  }
  return out;
}

/**
 * The price shown before a render (the send button, the check before
 * sending): the default version of the engine, which is what the server runs.
 * Every offered combination is priced (a test checks it), so this is a number.
 */
export function offeredPrice(engine: EngineName, resolution: ResolutionKey, count = 1): number {
  return requestPrice(engine, resolution, count) ?? Number.NaN;
}

/** How many images a number of credits buys: with the dearest offered
 *  combination (min) and the cheapest (max). */
export function imageRange(credits: number): { min: number; max: number } {
  const costs = offeredPrices().map((p) => p.credits);
  if (costs.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.floor(credits / Math.max(...costs)),
    max: Math.floor(credits / Math.min(...costs)),
  };
}

/** Kie credits in dollars and in FCFA. */
export function creditsValue(credits: number): { usd: number; xof: number } {
  return { usd: credits * KIE_USD_PER_CREDIT, xof: credits * XOF_PER_CREDIT };
}

/**
 * The margin a plan guarantees even if every credit is spent: what its
 * credits cost on Kie against its price, then less Maketou's commission.
 */
export function planMargin(tier: Pick<PricingTier, 'priceXof' | 'creditsPerMonth'>): {
  kieCostXof: number;
  gross: number;
  net: number;
} {
  const kieCostXof = tier.creditsPerMonth * XOF_PER_CREDIT;
  const gross = 1 - kieCostXof / tier.priceXof;
  return { kieCostXof, gross, net: gross - MAKETOU_FEE_RATE };
}

/**
 * Kie's `creditsConsumed` in Kie credits. It came back in tenths of a credit
 * until 2026-10-19 (60 for a 6-credit image) and in credits on 2026-10-21 (4
 * for a 4-credit image): the unit is read against the grid's price — the
 * reading closer to the expected price wins. Without an expected price the
 * value is kept as is.
 */
export function normalizeKieCredits(raw: number, expected: number | null): number {
  if (!Number.isFinite(raw) || raw < 0) return raw;
  if (expected === null || expected <= 0) return raw;
  const tenths = raw / 10;
  return Math.abs(tenths - expected) < Math.abs(raw - expected) ? tenths : raw;
}

/** The offered prices in one sentence, for the assistant and /llms.txt
 *  (« Visio : 4 crédits en 1K, 6 en 2K, 9 en 4K ; Pixel IA : … »). */
export function describePrices(locale: 'fr' | 'en'): string {
  const byEngine = new Map<EngineName, OfferedPrice[]>();
  for (const p of offeredPrices()) byEngine.set(p.engine, [...(byEngine.get(p.engine) ?? []), p]);
  const unit = locale === 'fr' ? 'crédits' : 'credits';
  const at = locale === 'fr' ? 'en' : 'at';
  return [...byEngine.entries()]
    .map(([engine, prices]) => {
      const parts = prices.map(
        (p, i) => `${p.credits}${i === 0 ? ` ${unit}` : ''} ${at} ${p.resolution.toUpperCase()}`,
      );
      return `${ENGINE_LABELS[engine].name[locale]}${locale === 'fr' ? ' :' : ':'} ${parts.join(', ')}`;
    })
    .join(locale === 'fr' ? ' ; ' : '; ');
}
