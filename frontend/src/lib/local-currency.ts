// The price in the visitor's own currency, for information only (owner,
// 2026-10-16: « oui » to the currency study's recommendation). Payment stays
// in FCFA: Maketou charges the price set on its product (payments/maketou.ts)
// and nothing here changes what is charged. The plan card shows this line
// under the FCFA figure, in the currency of the visitor's country (Vercel's
// `x-vercel-ip-country`, the header that already picks the language).
//
// WHY IT EXISTS (owner, 2026-10-25): « une personne qui ne connaît pas le
// franc CFA, en voyant ces chiffres, va penser que la monnaie est grande ».
// 6 000 FCFA reads as a large number to anyone outside the franc zone. The
// second line is what turns it back into something they can judge.
//
// The CFA franc zones are deliberately absent from the table below: there the
// headline figure already IS the visitor's currency, and a second line would
// convert FCFA into FCFA.
//
// ---------------------------------------------------------------------------
// Where the rates come from
// ---------------------------------------------------------------------------
// The FCFA is pegged to the euro (655.957 XOF = 1 EUR, fixed by treaty), so
// every conversion goes through the euro and the euro figure is exact up to
// rounding.
//
// The other rates move. Two sources, in order:
//   1. live — lib/server/fx-rates.ts refreshes them once a day from
//      open.er-api.com and the root layout hands them down (lib/fx-rates.tsx).
//   2. the table below, read on RATES_DATE, used whenever the live fetch is
//      unavailable (offline, API down, local dev).
// Either way the figure is an approximation, hence the « ≈ » the plan card
// puts in front of it.
//
// Not server-only: the plan card (a client component) formats it.

/** When the fallback rates below were read. */
export const RATES_DATE = '2026-10-25';

/** Fixed by treaty: the West and Central African CFA francs to the euro. */
export const XOF_PER_EUR = 655.957;

/**
 * Units of each currency for one euro, on RATES_DATE — the fallback used when
 * the live rates are unavailable.
 *
 * Every currency named in COUNTRY_CURRENCY must appear here, so the card never
 * has to choose between a stale figure and no figure at all. A test enforces
 * it.
 */
const PER_EUR: Record<string, number> = {
  EUR: 1,
  // Europe outside the euro
  CHF: 0.923882,
  GBP: 0.837668,
  SEK: 11.12469,
  NOK: 10.452647,
  DKK: 7.474863,
  PLN: 4.399496,
  CZK: 24.321177,
  RON: 5.348863,
  TRY: 55.716555,
  // The Americas
  USD: 1.120288,
  CAD: 1.568732,
  BRL: 5.652221,
  MXN: 20.9268,
  COP: 3573.959821,
  CLP: 1102.816629,
  PEN: 3.858882,
  DOP: 68.924748,
  HTG: 147.305402,
  // Africa
  MAD: 10.998143,
  DZD: 151.153189,
  TND: 3.362968,
  EGP: 61.953831,
  NGN: 1486.920864,
  GHS: 13.064217,
  GNF: 9910.388245,
  CDF: 2603.87218,
  MGA: 5065.215208,
  MRU: 45.093099,
  DJF: 199.098545,
  KMF: 491.96775,
  BIF: 3372.794919,
  RWF: 1659.238148,
  SCR: 15.633,
  MUR: 52.751959,
  ZAR: 18.573538,
  KES: 145.559339,
  TZS: 2937.247482,
  UGX: 4608.456798,
  ETB: 190.121561,
  ZMW: 22.604847,
  AOA: 1072.676488,
  // The Middle East and Asia
  AED: 4.114254,
  SAR: 4.201077,
  QAR: 4.077845,
  ILS: 3.484657,
  INR: 106.261082,
  PKR: 310.08171,
  BDT: 138.616719,
  CNY: 7.486433,
  JPY: 175.707972,
  KRW: 1484.301196,
  SGD: 1.431739,
  HKD: 8.780902,
  THB: 37.810019,
  IDR: 20191.939553,
  MYR: 4.573741,
  PHP: 71.221464,
  VND: 28954.150278,
  // Oceania
  AUD: 1.594654,
  NZD: 1.966176,
  XPF: 119.332,
};

/** The currencies the card knows how to show — what the live fetch keeps. */
export const SUPPORTED_CURRENCIES: readonly string[] = Object.keys(PER_EUR);

const EURO_COUNTRIES = [
  // The euro area and the states that use the euro.
  'FR', 'BE', 'LU', 'MC', 'DE', 'AT', 'ES', 'IT', 'PT', 'NL', 'IE', 'FI', 'GR',
  'EE', 'LV', 'LT', 'SK', 'SI', 'MT', 'CY', 'HR', 'AD', 'SM', 'VA', 'ME', 'XK',
  // French overseas departments and territories on the euro.
  'GP', 'MQ', 'GF', 'RE', 'YT', 'BL', 'MF', 'PM',
]; // prettier-ignore

// Countries that use the US dollar as their own currency. Listed rather than
// left to the fallback so the figure is COMPUTED from the rate like every
// other one: the dollar line used to be a number typed into pricing-tiers.ts,
// which drifts as the euro moves and cannot be refreshed without a deploy.
const USD_COUNTRIES = ['US', 'EC', 'PA', 'SV', 'TL', 'PR', 'GU', 'VI', 'MH', 'FM', 'PW']; // prettier-ignore

/** ISO 3166-1 country → the currency its visitors see the price in. */
export const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(EURO_COUNTRIES.map((c) => [c, 'EUR'])),
  ...Object.fromEntries(USD_COUNTRIES.map((c) => [c, 'USD'])),
  // Europe outside the euro
  CH: 'CHF', LI: 'CHF', GB: 'GBP', SE: 'SEK', NO: 'NOK', DK: 'DKK',
  PL: 'PLN', CZ: 'CZK', RO: 'RON', TR: 'TRY',
  // The Americas
  CA: 'CAD', BR: 'BRL', MX: 'MXN', CO: 'COP', CL: 'CLP', PE: 'PEN',
  DO: 'DOP', HT: 'HTG',
  // Africa — the CFA franc zones are absent on purpose (see the header).
  MA: 'MAD', EH: 'MAD', DZ: 'DZD', TN: 'TND', EG: 'EGP',
  NG: 'NGN', GH: 'GHS', GN: 'GNF', CD: 'CDF', MG: 'MGA', MR: 'MRU',
  DJ: 'DJF', KM: 'KMF', BI: 'BIF', RW: 'RWF', SC: 'SCR', MU: 'MUR',
  ZA: 'ZAR', KE: 'KES', TZ: 'TZS', UG: 'UGX', ET: 'ETB', ZM: 'ZMW', AO: 'AOA',
  // The Middle East and Asia
  AE: 'AED', SA: 'SAR', QA: 'QAR', IL: 'ILS',
  IN: 'INR', PK: 'PKR', BD: 'BDT', CN: 'CNY', JP: 'JPY', KR: 'KRW',
  SG: 'SGD', HK: 'HKD', TH: 'THB', ID: 'IDR', MY: 'MYR', PH: 'PHP', VN: 'VND',
  // Oceania
  AU: 'AUD', NZ: 'NZD', PF: 'XPF', NC: 'XPF', WF: 'XPF',
}; // prettier-ignore

/**
 * The FCFA price as text in the country's currency (« 9,15 € », « 1 380 DZD »),
 * or null when the country has none of the currencies above — which is the
 * case for the CFA franc zones, where the headline figure already is the
 * visitor's own currency.
 *
 * `liveRates` is the daily refresh (units per euro); anything missing from it
 * falls back to the table above.
 */
export function localPrice(
  priceXof: number,
  country: string | null | undefined,
  intl: string,
  liveRates?: Readonly<Record<string, number>> | null,
): string | null {
  const currency = country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined;
  if (!currency) return null;
  const live = liveRates?.[currency];
  // A rate of 0 or a negative one would silently produce "0 €" — treat any
  // non-positive live value as missing rather than as an answer.
  const rate = typeof live === 'number' && live > 0 ? live : PER_EUR[currency];
  if (!rate) return null;
  const raw = (priceXof / XOF_PER_EUR) * rate;
  // Cents for the small units, whole units above 100, tens above 1 000: a
  // false precision on an indicative figure would read as a promise.
  const amount = raw >= 1000 ? Math.round(raw / 10) * 10 : raw >= 100 ? Math.round(raw) : raw;
  const digits = raw >= 100 ? 0 : 2;
  return new Intl.NumberFormat(intl, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}
