// The language a first-time visitor gets, from the country of their IP
// (2026-10-08, owner): French in a French-speaking country, English
// everywhere else. A language the visitor picked themselves (the FR / EN
// switch, remembered in the locale cookie) always wins over this.
//
// The country comes from Vercel's `x-vercel-ip-country` header (ISO 3166-1
// alpha-2), the province from `x-vercel-ip-country-region`. Neither header
// exists off Vercel (local dev): then the site keeps its historical default,
// French.
import type { Locale } from './dictionaries';

/**
 * Countries and territories where French is an official language or the
 * common language of business and education — the ones a French interface
 * serves best. Canada is decided by province (Quebec), see below.
 */
export const FRANCOPHONE_COUNTRIES: ReadonlySet<string> = new Set([
  // Europe
  'FR',
  'BE',
  'CH',
  'LU',
  'MC',
  // West and Central Africa
  'SN',
  'CI',
  'ML',
  'BF',
  'NE',
  'TG',
  'BJ',
  'GN',
  'CM',
  'GA',
  'CG',
  'CD',
  'CF',
  'TD',
  'GQ',
  'MR',
  // East Africa and the Indian Ocean
  'MG',
  'DJ',
  'KM',
  'BI',
  'RW',
  'SC',
  'MU',
  // North Africa
  'MA',
  'DZ',
  'TN',
  // Americas, Caribbean, Pacific (incl. French overseas territories)
  'HT',
  'VU',
  'GP',
  'MQ',
  'GF',
  'RE',
  'YT',
  'PF',
  'NC',
  'PM',
  'WF',
  'BL',
  'MF',
]);

/** French-speaking provinces of otherwise English-speaking countries. */
const FRANCOPHONE_REGIONS: ReadonlySet<string> = new Set(['CA-QC']);

/** The default when the country is unknown (no Vercel geo headers). */
export const FALLBACK_LOCALE: Locale = 'fr';

export function localeForCountry(
  country: string | null | undefined,
  region?: string | null,
): Locale {
  if (!country) return FALLBACK_LOCALE;
  const code = country.toUpperCase();
  if (FRANCOPHONE_COUNTRIES.has(code)) return 'fr';
  if (region && FRANCOPHONE_REGIONS.has(`${code}-${region.toUpperCase()}`)) return 'fr';
  return 'en';
}

/** The visitor's own choice first, then their country. */
export function resolveLocale(input: {
  cookie: string | null | undefined;
  country: string | null | undefined;
  region?: string | null | undefined;
}): Locale {
  if (input.cookie === 'fr' || input.cookie === 'en') return input.cookie;
  return localeForCountry(input.country, input.region);
}
