// Google Analytics, and the consent it waits for (2026-10-26, owner: « intègre »).
//
// Three rules shape this file.
//
// 1. **Nothing without an identifier.** Without NEXT_PUBLIC_GA_ID there is no
//    script, no cookie and no banner: a site that measures nothing needs no
//    consent. Analytics is never a condition of the site working, and never a
//    condition of its being indexed.
// 2. **Nothing before consent.** The script is not even fetched until the
//    visitor says yes. Loading it « denied » would still call Google on every
//    page; a refusal here means no request at all. A refusal is remembered
//    like an acceptance, so the banner is asked once.
// 3. **Public pages only.** The signed-in app, the back-office and Paramètres
//    are never measured. Their addresses carry image and project identifiers,
//    and an address is content: `/app/generer?image=abc` would tell Google
//    which picture someone opened. The admin's own figures — sign-ups,
//    renders, revenue — are read from the database, which is the truth, not
//    from a visitor's browser.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

/** Where the visitor's answer is kept — their own browser, nowhere else. */
export const CONSENT_KEY = 'rp-analytics-consent';

export type Consent = 'granted' | 'denied';

/** Addresses that may be measured: the public site, nothing signed in. */
const PRIVATE_PREFIXES = ['/app', '/admin', '/parametres', '/bienvenue'];

export function isMeasurablePath(pathname: string): boolean {
  return !PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The answer already given, or null while none has been. Browser storage can
 *  throw (a private window, blocked site data): no answer, so no measuring. */
export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(consent: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    // A visitor who cannot be remembered is asked again; never a failure.
  }
}
