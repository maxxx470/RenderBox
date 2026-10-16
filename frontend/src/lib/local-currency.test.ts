import { describe, it, expect } from 'vitest';
import { COUNTRY_CURRENCY, XOF_PER_EUR, localPrice } from './local-currency';

// Intl puts a narrow no-break space before € and between thousands in French.
const plain = (s: string | null) => s?.replace(/[\u202f\u00a0]/g, ' ') ?? null;

describe('localPrice', () => {
  it('converts at the fixed CFA–euro parity (exact up to the cent)', () => {
    expect(plain(localPrice(6000, 'FR', 'fr-FR'))).toBe('9,15 €');
    expect(plain(localPrice(15000, 'be', 'fr-FR'))).toBe('22,87 €');
    expect(XOF_PER_EUR).toBe(655.957);
  });

  it('rounds the large units: whole above 100, tens above 1 000', () => {
    expect(plain(localPrice(6000, 'DZ', 'fr-FR'))).toMatch(/^1 380 DZD$/);
    expect(plain(localPrice(6000, 'MA', 'fr-FR'))).toMatch(/^100 MAD$/);
  });

  it('none for the CFA franc zones, the dollar countries and an unknown country', () => {
    for (const c of ['SN', 'CI', 'CM', 'GA', 'US', 'EC', 'ZZ']) {
      expect(localPrice(6000, c, 'fr-FR')).toBeNull();
    }
    expect(localPrice(6000, null, 'en-US')).toBeNull();
  });

  it('every mapped country has a rate', () => {
    for (const [country] of Object.entries(COUNTRY_CURRENCY)) {
      expect(localPrice(6000, country, 'en-US'), country).not.toBeNull();
    }
  });
});
