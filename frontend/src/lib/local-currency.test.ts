import { describe, it, expect } from 'vitest';
import {
  COUNTRY_CURRENCY,
  SUPPORTED_CURRENCIES,
  XOF_PER_EUR,
  charmPrice,
  localPrice,
  referencePrice,
} from './local-currency';

// Intl inserts a narrow no-break space before the symbol and between
// thousands in French; \s covers both, so the assertions stay readable.
const plain = (s: string | null) => s?.replace(/\s/g, ' ') ?? null;
describe('localPrice', () => {
  it('converts at the fixed CFA–euro parity (exact up to the cent)', () => {
    expect(plain(localPrice(6000, 'FR', 'fr-FR'))).toBe('9,15 €');
    expect(plain(localPrice(15000, 'be', 'fr-FR'))).toBe('22,87 €');
    expect(XOF_PER_EUR).toBe(655.957);
  });

  it('rounds the large units: whole above 100, tens above 1 000', () => {
    expect(plain(localPrice(6000, 'DZ', 'fr-FR'))).toMatch(/^1 380 DZD$/);
    expect(plain(localPrice(6000, 'MA', 'fr-FR'))).toMatch(/^101 MAD$/);
  });

  it('prices the dollar countries from the rate, like every other currency', () => {
    // The dollar line used to be a figure typed into pricing-tiers.ts; it is
    // now computed, so it tracks the euro instead of drifting until a deploy.
    expect(plain(localPrice(6000, 'US', 'en-US'))).toMatch(/^\$10\.\d{2}$/);
    expect(plain(localPrice(6000, 'EC', 'en-US'))).toMatch(/^\$10\.\d{2}$/);
  });

  it('gives Canada its own dollar, not the American one', () => {
    const ca = plain(localPrice(6000, 'CA', 'en-CA'));
    const us = plain(localPrice(6000, 'US', 'en-US'));
    expect(ca).toMatch(/14\.\d{2}/);
    expect(ca).not.toBe(us);
  });

  it('none for the CFA franc zones and an unknown country', () => {
    // There the headline figure already IS the visitor's currency, so a
    // second line would convert FCFA into FCFA.
    for (const c of ['SN', 'CI', 'ML', 'BF', 'TG', 'BJ', 'NE', 'CM', 'GA', 'TD', 'ZZ']) {
      expect(localPrice(6000, c, 'fr-FR'), c).toBeNull();
    }
    expect(localPrice(6000, null, 'en-US')).toBeNull();
  });

  it('every mapped country has a fallback rate', () => {
    for (const [country] of Object.entries(COUNTRY_CURRENCY)) {
      expect(localPrice(6000, country, 'en-US'), country).not.toBeNull();
    }
  });

  it('SUPPORTED_CURRENCIES covers every currency a country maps to', () => {
    for (const [country, currency] of Object.entries(COUNTRY_CURRENCY)) {
      expect(SUPPORTED_CURRENCIES, `${country} → ${currency}`).toContain(currency);
    }
  });

  describe('live rates', () => {
    it('prefers the live rate over the committed fallback', () => {
      // 6000 FCFA = 9.147 €; at 2 units per euro that is 18.29.
      expect(plain(localPrice(6000, 'US', 'en-US', { USD: 2 }))).toBe('$18.29');
    });

    it('falls back when the live set has no entry for that currency', () => {
      const withFallback = plain(localPrice(6000, 'US', 'en-US', { GBP: 2 }));
      const withoutLive = plain(localPrice(6000, 'US', 'en-US'));
      expect(withFallback).toBe(withoutLive);
    });

    it('ignores a non-positive live rate rather than printing zero', () => {
      for (const bad of [0, -1]) {
        expect(plain(localPrice(6000, 'US', 'en-US', { USD: bad }))).toBe(
          plain(localPrice(6000, 'US', 'en-US')),
        );
      }
    });

    it('leaves the euro exact — the peg does not depend on the fetch', () => {
      expect(plain(localPrice(6000, 'FR', 'fr-FR', { EUR: 1 }))).toBe('9,15 €');
    });
  });
});

describe('referencePrice — charm figures ending in 9 (2026-11-27)', () => {
  it('keeps the exact dollar prices', () => {
    expect(plain(referencePrice(9.99, 'USD', 'en-US'))).toBe('$9.99');
    expect(plain(referencePrice(24.99, 'USD', 'en-US'))).toBe('$24.99');
    expect(plain(referencePrice(59.99, 'USD', 'en-US'))).toBe('$59.99');
  });
  it('ends in ,99 under 100 and in 9 above, never with cents above 100', () => {
    expect(plain(referencePrice(9.99, 'EUR', 'fr-FR'))).toBe('8,99 €');
    expect(plain(referencePrice(24.99, 'MAD', 'fr-FR'))).toBe('249 MAD');
    expect(plain(referencePrice(9.99, 'NGN', 'en-US'))).toMatch(/13,290/);
    expect(plain(referencePrice(9.99, 'JPY', 'en-US'))).toMatch(/1,569$/);
  });
  it('never shows less than the real conversion', () => {
    for (const raw of [
      0.5, 7.47, 9.99, 99.995, 100.2, 245.33, 999.4, 1347.89, 13259.39, 221068.69, 1550457.99,
    ]) {
      const v = charmPrice(raw, true);
      expect(v).toBeGreaterThanOrEqual(raw - 1e-6);
      expect(v).toBeLessThan(raw * 1.11 + 1);
    }
  });
});
