/**
 * What we are allowed to SAY about how a customer can pay.
 *
 * The checkout deliberately named no payment method until 2026-11-03: Moneriz's
 * own page decides what it offers, and promising a bank card that is not
 * activated would have been a lie on our side. Mobile money is now proven —
 * a real test payment went through on Togolese operators on 2026-11-03 — so
 * the pricing surfaces say so (owner: « maintenant qu'on est sûr que le mobile
 * money fonctionne, tu dois mettre ça »).
 *
 * The card is NOT proven. It runs through Stripe, is OFF by default on every
 * new Moneriz account, and is granted only after Moneriz reviews the business.
 * The request was sent on 2026-11-03 and the decision is theirs.
 *
 * **This file is the one line to change when that decision lands** (owner:
 * « il suffit juste qu'on nous confirme »). It is a constant and not an env
 * var on purpose: the copy it switches is a public claim about what the
 * product accepts, so it belongs in the repo, in a commit, reviewable — not
 * in a dashboard where it could be flipped without the wording being re-read.
 * Never name it `NEXT_PUBLIC_MONERIZ_*` either: no Moneriz value should ever
 * carry a public prefix, even a harmless one.
 */

/**
 * Turned on 2026-11-03, the day Moneriz approved the identity file and then
 * the card activation (owner: « maintenant la carte fonctionne »). Set it
 * back to `false` and redeploy if the card ever stops being offered — the
 * copy must never promise a method Moneriz's own page does not show.
 */
export const CARD_PAYMENTS_ENABLED = true;

/**
 * The six countries Moneriz covers for mobile money, in XOF only — the same
 * list as MONERIZ_COUNTRIES in lib/server/payments/moneriz.ts, repeated here
 * because this file is client-safe and that one is `server-only`. A test
 * pins the two together so they cannot drift.
 *
 * We name the COUNTRIES and never the operators: the operators differ per
 * country, Moneriz syncs its catalogue every 72 h, and its own page lists
 * whatever is actually available at that moment. Printing « Moov Money,
 * Wave… » here would be a claim we cannot keep true.
 */
export const MOBILE_MONEY_COUNTRIES = ['BJ', 'BF', 'CI', 'ML', 'SN', 'TG'] as const;

/** Which sentence the pricing surfaces show, given the card's real state. */
export function paymentMethodsNoteKey(): 'tarifs.methodsNote' | 'tarifs.methodsNoteWithCard' {
  return CARD_PAYMENTS_ENABLED ? 'tarifs.methodsNoteWithCard' : 'tarifs.methodsNote';
}

/**
 * The landing hero's own pill, the red « Paiement » badge under the title.
 *
 * It reads « Pas de carte bancaire ? Le mobile money suffit » — reassuring
 * while the card is off, and FALSE the day it is on, because it tells a
 * reader there is no card. It follows the same constant so the two can never
 * disagree: a landing that offers a card and a pill that denies it is worse
 * than either alone.
 */
export function heroPaymentPillKey(): 'landing.heroNoCard' | 'landing.heroWithCard' {
  return CARD_PAYMENTS_ENABLED ? 'landing.heroWithCard' : 'landing.heroNoCard';
}

/**
 * Does Moneriz's mobile money cover this visitor's country?
 *
 * The code is an ISO-3166 alpha-2 from `x-vercel-ip-country` (the same
 * header that picks the language and the currency) — NEVER `User.country`,
 * which is free text from the onboarding and holds « myanmar », « Myanmar
 * (Burma) », « Österreich » and « Indian » in production.
 */
export function isMobileMoneyCountry(code: string | null | undefined): boolean {
  if (!code) return false;
  const up = code.trim().toUpperCase();
  return (MOBILE_MONEY_COUNTRIES as readonly string[]).includes(up);
}

/**
 * The line shown above the payment frame to a visitor whose country has no
 * mobile money — or null, when there is nothing useful to say.
 *
 * **Why this exists** (2026-11-05, owner, after reading the two real
 * attempts out of the production base). Both outside customers who ever
 * tried to buy were out of zone: one in Yangon, one in Innsbruck. Both
 * opened the payment page, saw Moov Money and Wave, recognised nothing,
 * and left — in 13 and 11 minutes. Two thirds of the sign-ups are outside
 * the six countries, Myanmar being the first country of all, ahead of Togo.
 *
 * Moneriz CANNOT be asked to pre-select the card: its own documentation
 * lists every field a checkout session takes and none of them chooses,
 * restricts or orders the methods — « Le client choisit ensuite son moyen
 * de paiement ». The one endpoint that takes a `paymentType` is the
 * advanced `POST /v1/payments`, where we would collect the card number
 * ourselves and inherit PCI scope and 3-D Secure.
 *
 * So the help goes where we are still in control: our own page, in the
 * seconds before the frame opens. It does not change what Moneriz shows,
 * it tells the customer what to look for in it.
 *
 * It returns null when the card is off (`CARD_PAYMENTS_ENABLED`), because
 * pointing an out-of-zone customer at a method that is not activated would
 * strand them worse than silence; and null for a covered country, where
 * mobile money is the natural path and the sentence would only add noise.
 * An unknown country also gets null: off Vercel, and for the visitors whose
 * country header is missing, a guess is not worth a wrong instruction.
 */
export function outOfZoneHintKey(
  visitorCountry: string | null | undefined,
): 'paiement.cardOnlyHint' | null {
  if (!CARD_PAYMENTS_ENABLED) return null;
  if (!visitorCountry) return null;
  return isMobileMoneyCountry(visitorCountry) ? null : 'paiement.cardOnlyHint';
}
