// The price in the visitor's own currency, for information only (owner,
// 2026-10-16: « oui » to the currency study's recommendation). Payment stays
// in FCFA: Maketou charges the price set on its product (payments/maketou.ts)
// and nothing here changes what is charged. The plan card shows this line in
// place of the dollar one when the visitor's country (Vercel's
// `x-vercel-ip-country`, the header that already picks the language) has a
// currency below; the CFA franc zones, the dollar countries and an unknown
// country keep the dollar line.
//
// The FCFA is pegged to the euro (655.957 XOF = 1 EUR, fixed by treaty), so
// the euro figure is exact up to rounding. The other rates move: they are
// the rates of RATES_DATE (open.er-api.com, EUR base), refreshed by hand —
// hence the « ≈ » in front of every figure.
//
// Not server-only: the plan card (a client component) formats it.

/** When the floating rates below were read. */
export const RATES_DATE = '2026-10-16';

/** Fixed by treaty: the West and Central African CFA francs to the euro. */
export const XOF_PER_EUR = 655.957;

/** Units of each currency for one euro, on RATES_DATE. */
const PER_EUR: Record<string, number> = {
  EUR: 1,
  CHF: 0.929184,
  GBP: 0.84542,
  CAD: 1.591546,
  MAD: 10.972393,
  DZD: 150.8801,
  TND: 3.361704,
  GNF: 9872.854438,
  CDF: 2599.233083,
  MGA: 5072.998443,
  NGN: 1491.497754,
  GHS: 13.071177,
  HTG: 146.855565,
  MRU: 45.165665,
  DJF: 199.315497,
  KMF: 491.96775,
  BIF: 3366.313239,
  RWF: 1658.436662,
  SCR: 15.897576,
  MUR: 53.044026,
  XPF: 119.332,
};

const EURO_COUNTRIES = [
  // The euro area and the states that use the euro.
  'FR', 'BE', 'LU', 'MC', 'DE', 'AT', 'ES', 'IT', 'PT', 'NL', 'IE', 'FI', 'GR',
  'EE', 'LV', 'LT', 'SK', 'SI', 'MT', 'CY', 'HR', 'AD', 'SM', 'VA', 'ME', 'XK',
  // French overseas departments and territories on the euro.
  'GP', 'MQ', 'GF', 'RE', 'YT', 'BL', 'MF', 'PM',
]; // prettier-ignore

/** ISO 3166-1 country → the currency its visitors see the price in. */
export const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  ...Object.fromEntries(EURO_COUNTRIES.map((c) => [c, 'EUR'])),
  CH: 'CHF', LI: 'CHF', GB: 'GBP', CA: 'CAD',
  MA: 'MAD', EH: 'MAD', DZ: 'DZD', TN: 'TND',
  GN: 'GNF', CD: 'CDF', MG: 'MGA', NG: 'NGN', GH: 'GHS', HT: 'HTG', MR: 'MRU',
  DJ: 'DJF', KM: 'KMF', BI: 'BIF', RW: 'RWF', SC: 'SCR', MU: 'MUR',
  PF: 'XPF', NC: 'XPF', WF: 'XPF',
}; // prettier-ignore

/**
 * The FCFA price as text in the country's currency (« 9,15 € », « 1 380 DZD »),
 * or null when the country has none of the currencies above.
 */
export function localPrice(
  priceXof: number,
  country: string | null | undefined,
  intl: string,
): string | null {
  const currency = country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined;
  const rate = currency ? PER_EUR[currency] : undefined;
  if (!currency || !rate) return null;
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
