// The plans show the same thing on the landing and in the app (owner,
// 2026-10-13): one shared card, fed only by lib/pricing-tiers.ts. Rendered
// here to static HTML in both tones and both languages, the visible text must
// be identical, carry the credits (never a number of renders), and the two
// pages must use this card and nothing else.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '@/lib/i18n/LocaleContext';
import fr from '@/lib/i18n/dictionaries/fr';
import en from '@/lib/i18n/dictionaries/en';
import { PLAN_FEATURES, PRICING_TIERS, type PricingTier } from '@/lib/pricing-tiers';
import { PricingCard } from './PricingCard';

// Vitest compiles the components' JSX to React.createElement (the classic
// runtime); Next uses the automatic one, so the components never import React.
Object.assign(globalThis, { React });
const { createElement } = React;

type Locale = 'fr' | 'en';

function cardText(tier: PricingTier, locale: Locale, tone: 'band' | 'page'): string {
  const card = createElement(PricingCard, {
    tier,
    tone,
    onSelect: () => {},
    loading: false,
    error: null,
  });
  const html = renderToStaticMarkup(
    createElement(LocaleProvider, { initialLocale: locale, children: card }),
  );
  // The words a visitor reads, in order; the thousands separators of
  // toLocaleString (no-break spaces in French) read as plain spaces.
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\u00a0|\u202f/g, ' ')
    .replace(/&#x27;|&#39;/g, '\x27')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('PricingCard — one card for the landing and the Abonnement page', () => {
  for (const locale of ['fr', 'en'] as const) {
    for (const tier of PRICING_TIERS) {
      it(`${locale} · ${tier.id}: the landing (band) and the app (page) show exactly the same text`, () => {
        expect(cardText(tier, locale, 'page')).toBe(cardText(tier, locale, 'band'));
      });
    }
  }

  it('prints the figures of pricing-tiers.ts: price, dollar equivalent, credits with a thousands separator', () => {
    const [decouverte, standard, pro] = PRICING_TIERS;
    expect(cardText(decouverte!, 'fr', 'band')).toContain('5 900 FCFA');
    expect(cardText(decouverte!, 'fr', 'band')).toContain('500 crédits / mois');
    expect(cardText(standard!, 'fr', 'band')).toContain('1 500 crédits / mois');
    expect(cardText(pro!, 'fr', 'band')).toContain('4 000 crédits / mois');
    expect(cardText(pro!, 'fr', 'band')).toContain('35 900 FCFA');
    // The dollar is computed from the rate table like every other currency
    // (2026-10-28), not a round number written on each plan by hand.
    expect(cardText(pro!, 'fr', 'band')).toContain('≈ 61,31 $US');
    expect(cardText(decouverte!, 'en', 'band')).toContain('500 credits / month');
    expect(cardText(pro!, 'en', 'band')).toContain('4,000 credits / month');
    expect(cardText(pro!, 'en', 'band')).toContain('≈ $61.31');
  });

  it('lists the details in the agreed order, FR and EN, under the credits', () => {
    const order = {
      fr: [
        'crédits / mois',
        'Deux moteurs : Visio et Pixel IA',
        '5 ambiances de rendu',
        'Commenter, Ajouter et Améliorer',
        'Assistant intégré',
      ],
      en: [
        'credits / month',
        'Two engines: Visio and Pixel AI',
        '5 render ambiances',
        'Comment, Add and Enhance',
        'Built-in assistant',
      ],
    };
    for (const locale of ['fr', 'en'] as const) {
      const text = cardText(PRICING_TIERS[1]!, locale, 'page');
      const at = order[locale].map((s) => text.indexOf(s));
      expect(
        at.every((i) => i >= 0),
        `${locale}: ${text}`,
      ).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
    expect(PLAN_FEATURES).toHaveLength(4);
  });

  it('never shows a number of renders, only credits', () => {
    for (const tier of PRICING_TIERS) {
      expect(cardText(tier, 'fr', 'page')).not.toMatch(/rendus?\s*\/|générations/i);
      expect(cardText(tier, 'en', 'page')).not.toMatch(/renders?\s*\/|generations/i);
    }
  });

  it('the landing and the Abonnement page both render this card, and no other plan card exists', () => {
    const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
    const landing = read('LandingClient.tsx');
    const tarifs = read('app/tarifs/TarifsClient.tsx');
    for (const src of [landing, tarifs]) {
      expect(src).toMatch(/import \{[^}]*PricingCard[^}]*\} from '(\.\/|\.\.\/\.\.\/)PricingCard'/);
      expect(src).toContain('<PricingCard');
      // No figure of a plan written into a page.
      expect(src).not.toMatch(/\b(6 ?000|15 ?000|36 ?000|1 ?000|3 ?000|8 ?000)\b/);
    }
    expect(tarifs).not.toMatch(/function PlanCard/);
  });

  it('the dictionaries hold labels only, never a plan’s figure', () => {
    for (const dict of [fr, en] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(dict)) {
        if (!/^(landing\.pricing|tarifs\.)/.test(key)) continue;
        expect(value, key).not.toMatch(/\d[\d\s ,.]*\s*(crédits?|credits?|FCFA|\$)/i);
      }
    }
  });
});
