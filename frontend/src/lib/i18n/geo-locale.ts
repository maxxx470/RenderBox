// The language a first-time visitor gets, from the country of their IP
// (2026-10-08, owner): French in a French-speaking country, English
// everywhere else. A language the visitor picked themselves (the FR / EN
// switch, remembered in the locale cookie) always wins over this.
//
// The country comes from Vercel's `x-vercel-ip-country` header (ISO 3166-1
// alpha-2), the province from `x-vercel-ip-country-region`. When the country
// is unknown — no header, as off Vercel — the site speaks English (owner,
// 2026-10-15: « une langue universelle »; French until then).
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
export const FALLBACK_LOCALE: Locale = 'en';

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

/**
 * The same question, from a country the USER TYPED (2026-11-01).
 *
 * `User.country` comes from the onboarding, where the country is a free-text
 * field with suggestions (lib/onboarding.ts) — so the real values in the base
 * are « Togo », « myanmar », « Myanmar (Burma) », « Indian », and nothing.
 * `localeForCountry` above expects an ISO code and would answer English to
 * every one of them, Togo included: that is how the relance e-mails were
 * about to go out in English to French-speaking accounts.
 *
 * So this reads NAMES, in French and in English, accents and case and
 * parentheticals included, and still accepts a bare ISO code. Anything it
 * does not recognise is English, the site's own rule for an unknown country.
 */
function normaliseCountry(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // « Myanmar (Burma) » → « Myanmar »
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** Every francophone country as a reader would write it, either language. */
const FRANCOPHONE_NAMES: ReadonlySet<string> = new Set(
  [
    // Europe
    'France',
    'Belgique',
    'Belgium',
    'Suisse',
    'Switzerland',
    'Luxembourg',
    'Monaco',
    // West and Central Africa
    'Sénégal',
    'Senegal',
    "Côte d'Ivoire",
    'Cote dIvoire',
    'Ivory Coast',
    'Mali',
    'Burkina Faso',
    'Burkina',
    'Niger',
    'Togo',
    'Bénin',
    'Benin',
    'Guinée',
    'Guinea',
    'Guinée équatoriale',
    'Equatorial Guinea',
    'Cameroun',
    'Cameroon',
    'Gabon',
    'Congo',
    'République du Congo',
    'Congo Brazzaville',
    'RD Congo',
    'RDC',
    'République démocratique du Congo',
    'DR Congo',
    'Democratic Republic of the Congo',
    'Congo Kinshasa',
    'Centrafrique',
    'République centrafricaine',
    'Central African Republic',
    'Tchad',
    'Chad',
    'Mauritanie',
    'Mauritania',
    // East Africa and the Indian Ocean
    'Madagascar',
    'Djibouti',
    'Comores',
    'Comoros',
    'Burundi',
    'Rwanda',
    'Seychelles',
    'Maurice',
    'Île Maurice',
    'Mauritius',
    // North Africa
    'Maroc',
    'Morocco',
    'Algérie',
    'Algeria',
    'Tunisie',
    'Tunisia',
    // Americas, Caribbean, Pacific
    'Haïti',
    'Haiti',
    'Québec',
    'Quebec',
    'Vanuatu',
    'Guadeloupe',
    'Martinique',
    'Guyane',
    'French Guiana',
    'Réunion',
    'La Réunion',
    'Mayotte',
    'Polynésie française',
    'French Polynesia',
    'Tahiti',
    'Nouvelle-Calédonie',
    'New Caledonia',
    'Saint-Pierre-et-Miquelon',
    'Wallis-et-Futuna',
    'Saint-Barthélemy',
    'Saint-Martin',
  ].map(normaliseCountry),
);

export function localeForCountryText(text: string | null | undefined): Locale {
  if (!text) return FALLBACK_LOCALE;
  const name = normaliseCountry(text);
  if (!name) return FALLBACK_LOCALE;
  // A bare ISO code, in case one is ever stored here.
  if (name.length === 2 && FRANCOPHONE_COUNTRIES.has(name.toUpperCase())) return 'fr';
  return FRANCOPHONE_NAMES.has(name) ? 'fr' : 'en';
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
