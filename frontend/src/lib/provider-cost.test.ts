import { describe, expect, it } from 'vitest';
import { PRICING_TIERS } from './pricing-tiers';
import {
  ASSISTANT_COST,
  KIE_PRICES,
  KIE_USD_PER_CREDIT,
  MAKETOU_FEE_RATE,
  SHEET_COST,
  XOF_PER_CREDIT,
  XOF_PER_USD,
  creditsValue,
  describePrices,
  imageRange,
  normalizeKieCredits,
  offeredPrice,
  offeredPrices,
  planMargin,
  requestPrice,
} from './provider-cost';
import { DEFAULT_ENGINE_VERSION, ENGINE_VERSION_KEYS } from './server/generation/engine-versions';
import { RESOLUTION_KEYS } from './server/generation/resolutions';

describe('the constants (owner, 2026-10-22)', () => {
  it('1 credit = 0.005 $, 1 $ = 600 FCFA, so 1 credit = 3 FCFA; Maketou 8 %', () => {
    expect(KIE_USD_PER_CREDIT).toBe(0.005);
    expect(XOF_PER_USD).toBe(600);
    expect(XOF_PER_CREDIT).toBe(3);
    expect(MAKETOU_FEE_RATE).toBe(0.08);
    expect(creditsValue(1000)).toEqual({ usd: 5, xof: 3000 });
  });

  it('a materials sheet costs 2 credits, a message to the team nothing', () => {
    expect(SHEET_COST).toBe(2);
    expect(ASSISTANT_COST).toBe(0);
  });
});

describe('the grid: every engine version × size', () => {
  it('has a row for every version and a cell for every size', () => {
    expect(Object.keys(KIE_PRICES).sort()).toEqual([...ENGINE_VERSION_KEYS].sort());
    for (const v of ENGINE_VERSION_KEYS) {
      expect(Object.keys(KIE_PRICES[v]).sort()).toEqual([...RESOLUTION_KEYS].sort());
    }
  });

  it('the verified prices', () => {
    expect(KIE_PRICES['visio-2-1']).toEqual({ '1k': 4, '2k': 6, '4k': 9 });
    expect(KIE_PRICES['pixel-2-5']).toEqual({ '1k': 6, '2k': 10, '4k': 16 });
    expect(KIE_PRICES['visio-pro']).toEqual({ '1k': 18, '2k': 18, '4k': 24 });
    expect(KIE_PRICES['visio-3']).toEqual({ '1k': 7, '2k': 14, '4k': 14 });
  });

  it('every combination the interface offers is priced (no blocked default)', () => {
    for (const engine of Object.keys(
      DEFAULT_ENGINE_VERSION,
    ) as (keyof typeof DEFAULT_ENGINE_VERSION)[]) {
      for (const r of RESOLUTION_KEYS) {
        expect(KIE_PRICES[DEFAULT_ENGINE_VERSION[engine]][r]).not.toBeNull();
        expect(Number.isFinite(offeredPrice(engine, r))).toBe(true);
      }
    }
    expect(offeredPrices()).toHaveLength(2 * RESOLUTION_KEYS.length);
  });

  it('each offered engine × size × variant count debits exactly the grid times the count', () => {
    for (const engine of ['nanobanana', 'gpt_image'] as const) {
      const version = DEFAULT_ENGINE_VERSION[engine];
      for (const r of RESOLUTION_KEYS) {
        for (const n of [1, 2, 3, 4]) {
          expect(requestPrice(engine, r, n)).toBe(KIE_PRICES[version][r]! * n);
          expect(requestPrice(engine, r, n, version)).toBe(KIE_PRICES[version][r]! * n);
        }
      }
    }
  });

  it('a version is priced as itself, and no size is the default size (1K)', () => {
    expect(requestPrice('nanobanana', '1k', 1, 'visio-pro')).toBe(18);
    expect(requestPrice('nanobanana', '4k', 2, 'visio-3')).toBe(28);
    expect(requestPrice('nanobanana', undefined)).toBe(4);
    expect(requestPrice('gpt_image', null)).toBe(6);
  });

  it('a version without a verified price is blocked (null), never guessed', () => {
    for (const v of ['visio-1', 'visio-2', 'visio-2-lite', 'pixel-1-5', 'pixel-2'] as const) {
      for (const r of RESOLUTION_KEYS) expect(requestPrice('nanobanana', r, 1, v)).toBeNull();
    }
  });
});

describe('what the plans buy, and what they guarantee', () => {
  it('the image range comes from the grid: dearest offered for the min, cheapest for the max', () => {
    // Dearest: Pixel IA 4K (16); cheapest: Visio 1K (4).
    expect(imageRange(500)).toEqual({ min: 31, max: 125 });
    expect(imageRange(1500)).toEqual({ min: 93, max: 375 });
    expect(imageRange(4000)).toEqual({ min: 250, max: 1000 });
    expect(imageRange(3)).toEqual({ min: 0, max: 0 });
  });

  // Prices end in 900 since 2026-10-28, which costs four tenths of a point.
  it('guaranteed margins: gross 74.6 / 69.8 / 66.6 %, net of Maketou 66.6 / 61.8 / 58.6 %', () => {
    const m = PRICING_TIERS.map((t) => planMargin(t));
    expect(m.map((x) => x.kieCostXof)).toEqual([1500, 4500, 12000]);
    const pct = (x: number) => Math.round(x * 1000) / 10;
    expect(m.map((x) => pct(x.gross))).toEqual([74.6, 69.8, 66.6]);
    expect(m.map((x) => pct(x.net))).toEqual([66.6, 61.8, 58.6]);
    // Every plan still earns more than two thirds of its price before Maketou.
    for (const x of m) expect(x.gross).toBeGreaterThan(0.66);
  });

  it('describes the offered prices in both languages', () => {
    expect(describePrices('fr')).toBe(
      'Visio : 4 crédits en 1K, 6 en 2K, 9 en 4K ; Pixel IA : 6 crédits en 1K, 10 en 2K, 16 en 4K',
    );
    expect(describePrices('en')).toBe(
      'Visio: 4 credits at 1K, 6 at 2K, 9 at 4K; Pixel AI: 6 credits at 1K, 10 at 2K, 16 at 4K',
    );
  });
});

describe('normalizeKieCredits — Kie changed its unit', () => {
  it('reads tenths (until 2026-10-19) and credits (from 2026-10-21) against the price', () => {
    expect(normalizeKieCredits(60, 6)).toBe(6);
    expect(normalizeKieCredits(160, 16)).toBe(16);
    expect(normalizeKieCredits(180, 18)).toBe(18);
    expect(normalizeKieCredits(6, 6)).toBe(6);
    expect(normalizeKieCredits(4, 4)).toBe(4);
  });

  it('keeps the value without an expected price', () => {
    expect(normalizeKieCredits(60, null)).toBe(60);
  });
});
