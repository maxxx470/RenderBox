import { describe, it, expect } from 'vitest';
import { localeForCountry, localeForCountryText, resolveLocale } from './geo-locale';

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

describe('localeForCountryText — the country the USER TYPED', () => {
  // `User.country` is the onboarding's free-text field, so these are the real
  // values read out of the production base on 2026-11-01. Sent through
  // localeForCountry they ALL answered English, Togo included — which would
  // have put the relance e-mails in the wrong language for three accounts.
  it('reads the values actually in the base', () => {
    expect(localeForCountryText('Togo')).toBe('fr');
    expect(localeForCountryText('myanmar')).toBe('en');
    expect(localeForCountryText('Myanmar (Burma)')).toBe('en');
    expect(localeForCountryText('Indian')).toBe('en');
    expect(localeForCountryText(null)).toBe('en');
  });

  it('reads a French name, however it is written', () => {
    for (const c of [
      'Sénégal',
      'senegal',
      'SÉNÉGAL',
      "Côte d'Ivoire",
      'Côte d’Ivoire',
      'cote divoire',
    ]) {
      expect(localeForCountryText(c), c).toBe('fr');
    }
  });

  it('reads the English name of the same country', () => {
    for (const c of [
      'Ivory Coast',
      'Belgium',
      'Switzerland',
      'Cameroon',
      'Morocco',
      'Chad',
      'Haiti',
    ]) {
      expect(localeForCountryText(c), c).toBe('fr');
    }
  });

  it('still accepts a bare ISO code', () => {
    expect(localeForCountryText('TG')).toBe('fr');
    expect(localeForCountryText('mm')).toBe('en');
  });

  it('answers English for the rest of the world', () => {
    for (const c of [
      'Nigeria',
      'Ghana',
      'India',
      'United States',
      'Brazil',
      'Kenya',
      '   ',
      '???',
    ]) {
      expect(localeForCountryText(c), c).toBe('en');
    }
  });
});
