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
 * Set to `true` the day Moneriz confirms the card activation, and nothing
 * else: the three places that sell a plan read it through the dictionary key
 * below. Until then the copy says plainly that the card is not available,
 * which is a limitation, never a promise.
 */
export const CARD_PAYMENTS_ENABLED = false;

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
