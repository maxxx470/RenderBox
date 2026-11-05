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
  heroPaymentPillKey,
  isMobileMoneyCountry,
  outOfZoneHintKey,
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

describe('the landing hero pill', () => {
  it('denies the card only while the card is really off', () => {
    // « Pas de carte bancaire ? Le mobile money suffit » reassures a reader
    // today and lies the day the card is activated, so it must follow the
    // same constant as the pricing copy — a landing that offers a card and a
    // pill that denies it is worse than either alone.
    expect(heroPaymentPillKey()).toBe(
      CARD_PAYMENTS_ENABLED ? 'landing.heroWithCard' : 'landing.heroNoCard',
    );
    expect(fr['landing.heroNoCard']).toMatch(/pas de carte/i);
    expect(en['landing.heroNoCard']).toMatch(/no bank card/i);
    expect(fr['landing.heroWithCard']).toMatch(/carte bancaire/i);
    expect(fr['landing.heroWithCard']).not.toMatch(/pas de carte/i);
    expect(en['landing.heroWithCard']).toMatch(/bank card/i);
    expect(en['landing.heroWithCard']).not.toMatch(/no bank card/i);
  });
});

describe('the out-of-zone hint', () => {
  // The two real customers who ever reached the payment page from outside
  // the zone -- Yangon and Innsbruck -- left within a quarter of an hour
  // without finding the card tab. This sentence exists for them.
  it('speaks to a visitor whose country has no mobile money', () => {
    for (const code of ['MM', 'AT', 'IN', 'CA', 'FR', 'US']) {
      expect(outOfZoneHintKey(code), code).toBe('paiement.cardOnlyHint');
    }
  });

  it('stays silent in the six covered countries', () => {
    for (const code of MOBILE_MONEY_COUNTRIES) {
      expect(outOfZoneHintKey(code), code).toBeNull();
    }
  });

  it('stays silent when the country is unknown', () => {
    // Off Vercel, or a visitor with no country header: a guess is not
    // worth a wrong instruction.
    for (const code of [null, undefined, '']) {
      expect(outOfZoneHintKey(code)).toBeNull();
    }
  });

  it('is case- and whitespace-insensitive, so a header cannot slip past', () => {
    expect(outOfZoneHintKey('tg')).toBeNull();
    expect(outOfZoneHintKey(' TG ')).toBeNull();
    expect(isMobileMoneyCountry('ci')).toBe(true);
  });

  it('never points at the card while the card is off', () => {
    // Stranding an out-of-zone customer on a method that is not activated
    // is worse than saying nothing. The constant is the single switch.
    if (!CARD_PAYMENTS_ENABLED) {
      expect(outOfZoneHintKey('MM')).toBeNull();
    } else {
      expect(outOfZoneHintKey('MM')).toBe('paiement.cardOnlyHint');
    }
  });

  it('the sentence it points to exists in both languages and names no operator', () => {
    for (const dict of [fr, en]) {
      const line = dict['paiement.cardOnlyHint'];
      expect(line, 'the hint must exist').toBeTruthy();
      // Same rule as every other payment claim: Moneriz syncs its
      // catalogue every 72 h, so naming an operator is a promise we
      // cannot keep true.
      expect(line).not.toMatch(/moov|wave|orange money|mixx|mtn/i);
    }
  });
});
