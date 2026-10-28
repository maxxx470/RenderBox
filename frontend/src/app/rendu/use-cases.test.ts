// The use-case pages (2026-10-28). These pages are published for search
// engines and quoted by AI assistants, so what is checked here is what would
// be expensive to get wrong: a picture that 404s on a page Google just
// indexed, a title too long to be read in a result, an address that changed
// under a page that had started to rank, a claim the landing proof policy
// forbids.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PRESET_KEYS } from '@/lib/server/generation/presets';
import { getUseCase, relatedUseCases, USE_CASES, USE_CASE_SLUGS, useCasePath } from './use-cases';

const LOCALES = ['fr', 'en'] as const;
const PUBLIC_DIR = join(process.cwd(), 'public');

describe('every use-case page', () => {
  it('has a unique, lowercase, accent-free slug', () => {
    expect(new Set(USE_CASE_SLUGS).size).toBe(USE_CASES.length);
    for (const slug of USE_CASE_SLUGS) {
      // An address is a promise: a crawler that indexed /rendu/<slug> comes
      // back to it. Accents and capitals make two spellings of one page.
      expect(slug, slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('names an ambiance that exists, when it names one', () => {
    for (const uc of USE_CASES) {
      if (uc.preset) expect(PRESET_KEYS, uc.slug).toContain(uc.preset);
    }
  });

  it('dates itself by a real day', () => {
    for (const uc of USE_CASES) {
      expect(uc.lastModified, uc.slug).toMatch(/^20\d\d-\d\d-\d\d$/);
    }
  });

  it('points only at pictures the site really serves', () => {
    for (const uc of USE_CASES) {
      const images = [uc.hero.after, ...(uc.hero.before ? [uc.hero.before] : []), ...uc.gallery];
      for (const img of images) {
        expect(img.src.startsWith('/'), `${uc.slug}: ${img.src}`).toBe(true);
        expect(existsSync(join(PUBLIC_DIR, img.src)), `${uc.slug}: ${img.src}`).toBe(true);
        // The pages lay rows out from these numbers (rowColumns): a wrong
        // ratio crops a picture rather than failing loudly.
        expect(img.w, img.src).toBeGreaterThan(0);
        expect(img.h, img.src).toBeGreaterThan(0);
      }
    }
  });

  it('says everything in both languages', () => {
    for (const uc of USE_CASES) {
      for (const locale of LOCALES) {
        expect(uc.seo[locale].title.length, uc.slug).toBeGreaterThan(10);
        expect(uc.seo[locale].description.length, uc.slug).toBeGreaterThan(50);
        expect(uc.h1[locale].length, uc.slug).toBeGreaterThan(10);
        expect(uc.lede[locale].length, uc.slug).toBeGreaterThan(50);
        expect(uc.steps[locale].length, uc.slug).toBeGreaterThan(2);
        expect(uc.queries[locale].length, uc.slug).toBeGreaterThan(1);
        for (const section of uc.sections) {
          expect(section.heading[locale].length, uc.slug).toBeGreaterThan(5);
          expect(section.body[locale].length, uc.slug).toBeGreaterThan(100);
        }
        for (const item of uc.faq) {
          expect(item.q[locale].length, uc.slug).toBeGreaterThan(8);
          expect(item.a[locale].length, uc.slug).toBeGreaterThan(20);
        }
      }
    }
  });

  it('keeps its title short enough to be read whole in a result', () => {
    for (const uc of USE_CASES) {
      for (const locale of LOCALES) {
        // Google cuts around 60 characters, and the root layout appends
        // « · RenderPro » after this.
        expect(uc.seo[locale].title.length, `${uc.slug} ${locale}`).toBeLessThanOrEqual(60);
        // And a description past ~160 is truncated mid-sentence.
        expect(uc.seo[locale].description.length, `${uc.slug} ${locale}`).toBeLessThanOrEqual(170);
      }
    }
  });

  it('carries at least two questions, since they go out as structured data', () => {
    for (const uc of USE_CASES) expect(uc.faq.length, uc.slug).toBeGreaterThanOrEqual(2);
  });

  it('promises nothing the landing proof policy forbids', () => {
    // Same rule as the landing: only verifiable claims. No invented rating,
    // no user count, no « gratuit » while nothing is free, and no figure for
    // a price or a credit cost — those live in pricing-tiers.ts and
    // provider-cost.ts and would drift the day they change.
    const forbidden = [
      /\bgratuit\b/i,
      /\bfree trial\b/i,
      /\b\d+[.,]\d\s*\/\s*5\b/,
      /\b\d[\d\s]{2,}\s*(utilisateurs|users|architectes|architects)\b/i,
      /\bFCFA\b/,
      /\bcrédits?\s*:\s*\d/i,
      /\b\d+\s*(secondes|seconds)\b/i,
    ];
    for (const uc of USE_CASES) {
      const text = JSON.stringify(uc);
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${uc.slug} / ${pattern}`).toBe(false);
      }
    }
  });
});

describe('the use-case helpers', () => {
  it('finds a page by its slug, and nothing by an unknown one', () => {
    expect(getUseCase('croquis-en-rendu')?.slug).toBe('croquis-en-rendu');
    expect(getUseCase('does-not-exist')).toBeUndefined();
  });

  it('builds the address under /rendu', () => {
    expect(useCasePath('croquis-en-rendu')).toBe('/rendu/croquis-en-rendu');
  });

  it('offers three other pages, never the page itself', () => {
    for (const uc of USE_CASES) {
      const related = relatedUseCases(uc.slug);
      expect(related, uc.slug).toHaveLength(3);
      expect(
        related.map((r) => r.slug),
        uc.slug,
      ).not.toContain(uc.slug);
      expect(new Set(related.map((r) => r.slug)).size, uc.slug).toBe(3);
    }
  });

  it('leaves no page unreachable from the others', () => {
    // Every page is offered by at least one other, so none is an orphan that
    // only the sitemap knows about.
    const offered = new Set(USE_CASES.flatMap((uc) => relatedUseCases(uc.slug).map((r) => r.slug)));
    for (const slug of USE_CASE_SLUGS) expect(offered, slug).toContain(slug);
  });
});
