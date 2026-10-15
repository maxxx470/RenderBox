import { describe, it, expect } from 'vitest';
import { localeForCountry, resolveLocale } from './geo-locale';

describe('localeForCountry', () => {
  it('gives French to French-speaking countries', () => {
    for (const c of ['FR', 'SN', 'CI', 'BE', 'CM', 'MA', 'HT', 're']) {
      expect(localeForCountry(c)).toBe('fr');
    }
  });

  it('gives English to every other country', () => {
    for (const c of ['US', 'GB', 'NG', 'GH', 'DE', 'BR', 'CN', 'IN']) {
      expect(localeForCountry(c)).toBe('en');
    }
  });

  it('decides Canada by province', () => {
    expect(localeForCountry('CA', 'QC')).toBe('fr');
    expect(localeForCountry('CA', 'ON')).toBe('en');
    expect(localeForCountry('CA')).toBe('en');
  });

  it('falls back to English when the country is unknown (owner, 2026-10-15)', () => {
    expect(localeForCountry(null)).toBe('en');
    expect(localeForCountry('')).toBe('en');
    expect(resolveLocale({ cookie: undefined, country: undefined })).toBe('en');
  });
});

describe('resolveLocale', () => {
  it("puts the visitor's own choice before their country", () => {
    expect(resolveLocale({ cookie: 'fr', country: 'US' })).toBe('fr');
    expect(resolveLocale({ cookie: 'en', country: 'SN' })).toBe('en');
  });

  it('falls back to the country when no choice was made', () => {
    expect(resolveLocale({ cookie: undefined, country: 'US' })).toBe('en');
    expect(resolveLocale({ cookie: 'xx', country: 'SN' })).toBe('fr');
  });
});
