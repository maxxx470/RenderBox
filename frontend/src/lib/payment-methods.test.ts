// What the site is allowed to CLAIM about paying.
//
// This is a published promise, not a label: a customer who reads « carte
// bancaire » and cannot pay by card has been lied to. The card is OFF on the
// Moneriz account until Moneriz approves it, so these tests pin the copy to
// the real state rather than to whoever edited the dictionary last.
import { describe, it, expect } from 'vitest';
import {
  CARD_PAYMENTS_ENABLED,
  MOBILE_MONEY_COUNTRIES,
  paymentMethodsNoteKey,
} from './payment-methods';
import fr from './i18n/dictionaries/fr';
import en from './i18n/dictionaries/en';

describe('the payment-methods copy', () => {
  it('names a card only in the sentence meant for an activated card', () => {
    // The default sentence must never promise the card.
    expect(fr['tarifs.methodsNote']).not.toMatch(/par carte/i);
    expect(en['tarifs.methodsNote']).not.toMatch(/by bank card|by card/i);
    // ...and must say plainly that it is missing, rather than stay silent.
    expect(fr['tarifs.methodsNote']).toMatch(/carte bancaire n’est pas encore/i);
    expect(en['tarifs.methodsNote']).toMatch(/not available yet/i);
    // The other one is the one to switch to once Moneriz confirms.
    expect(fr['tarifs.methodsNoteWithCard']).toMatch(/carte bancaire/i);
    expect(en['tarifs.methodsNoteWithCard']).toMatch(/bank card/i);
  });

  it('shows the no-card sentence while the card is off', () => {
    expect(paymentMethodsNoteKey()).toBe(
      CARD_PAYMENTS_ENABLED ? 'tarifs.methodsNoteWithCard' : 'tarifs.methodsNote',
    );
  });

  it('names the six covered countries and never an operator', () => {
    for (const d of [fr, en]) {
      for (const sentence of [d['tarifs.methodsNote'], d['tarifs.methodsNoteWithCard']]) {
        // Moneriz syncs its operator catalogue every 72 h and its own page
        // lists what is really available: naming one here would be a claim
        // we cannot keep true.
        expect(sentence).not.toMatch(/moov|wave|orange money|mixx|mtn/i);
      }
    }
    expect(MOBILE_MONEY_COUNTRIES).toHaveLength(6);
    expect([...MOBILE_MONEY_COUNTRIES].sort()).toEqual(['BF', 'BJ', 'CI', 'ML', 'SN', 'TG']);
  });
});
