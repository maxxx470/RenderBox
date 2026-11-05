// The relance texts (2026-10-31). What is pinned here is what the owner
// validated, plus the rules a marketing e-mail must never break:
//
//  — both languages, for every relance (the first two sign-ups are in
//    Myanmar: English is not an afterthought);
//  — a working unsubscribe link in every single one, or Gmail files the
//    whole domain — sign-in codes included — as spam;
//  — no price, no credit figure, no delay in seconds: they live in
//    pricing-tiers.ts and provider-cost.ts and would drift;
//  — nothing the landing proof policy forbids (no user count, no rating,
//    no testimonial);
//  — « vous », never « tu »;
//  — and NOT ONE prospect relance telling someone with no credits to
//    launch a render (owner, 2026-10-31: there are no free credits).
import { describe, expect, it } from 'vitest';
import { relanceEmail } from './emails';
import { REENGAGEMENT_KINDS } from './schedule';

const UNSUB = 'https://www.renderpro.app/api/emails/unsubscribe?token=abc.def&lang=fr';

function mail(kind: (typeof REENGAGEMENT_KINDS)[number], locale: 'fr' | 'en') {
  return relanceEmail(kind, { firstName: 'Awa', locale, unsubscribeUrl: UNSUB });
}

const PROSPECT = REENGAGEMENT_KINDS.filter((k) => k.startsWith('prospect_'));

describe('every relance exists in both languages', () => {
  for (const kind of REENGAGEMENT_KINDS) {
    for (const locale of ['fr', 'en'] as const) {
      it(`${kind} / ${locale}`, () => {
        const m = mail(kind, locale);
        expect(m.subject.length).toBeGreaterThan(8);
        expect(m.subject.length).toBeLessThan(80); // not truncated in an inbox
        expect(m.html).toContain('RenderPro');
        expect(m.text.length).toBeGreaterThan(80);
      });
    }
  }
});

describe('every relance carries its unsubscribe link', () => {
  for (const kind of REENGAGEMENT_KINDS) {
    it(kind, () => {
      for (const locale of ['fr', 'en'] as const) {
        const m = mail(kind, locale);
        expect(m.html).toContain(UNSUB.replace(/&/g, '&amp;'));
        expect(m.text).toContain(UNSUB);
      }
    });
  }
});

describe('no figure that would drift', () => {
  for (const kind of REENGAGEMENT_KINDS) {
    it(kind, () => {
      for (const locale of ['fr', 'en'] as const) {
        const body = `${mail(kind, locale).subject} ${mail(kind, locale).text}`;
        expect(body).not.toMatch(/\d+\s*(FCFA|XOF|\$|USD|€|EUR)/i);
        expect(body).not.toMatch(/\d+\s*(crédits?|credits?)/i);
        expect(body).not.toMatch(/\d+\s*(secondes?|seconds?)/i);
        expect(body).not.toMatch(/\b\d+\s*(images?)\b/i);
      }
    });
  }
});

describe('nothing the landing proof policy forbids', () => {
  const FORBIDDEN = [
    /\d[\d\s.,]*\s*(utilisateurs|users|architectes|architects|clients)/i,
    /\b[45][.,]\d\s*(\/\s*5|étoiles|stars)/i,
    /(milliers|thousands) (de|of)/i,
    /gratuit|free trial|essai gratuit/i,
  ];
  for (const kind of REENGAGEMENT_KINDS) {
    it(kind, () => {
      for (const locale of ['fr', 'en'] as const) {
        const body = `${mail(kind, locale).subject} ${mail(kind, locale).text}`;
        for (const re of FORBIDDEN) expect(body, re.source).not.toMatch(re);
      }
    });
  }
});

describe('the French says « vous »', () => {
  for (const kind of REENGAGEMENT_KINDS) {
    it(kind, () => {
      const body = mail(kind, 'fr').text;
      // « tu » / « ton » / « ta » as standalone words. \b is no use here:
      // JS counts « ê » as a NON-word character, so /\btes\b/ matches
      // inside « êtes ». The look-arounds have to count letters, not \w.
      expect(body).not.toMatch(/(?<!\p{L})(tu|ton|ta|tes|toi)(?!\p{L})/iu);
    });
  }
});

describe('a prospect is never told to launch a render they cannot pay for', () => {
  // Owner, 2026-10-31, choosing A: no welcome credits. A new sign-up has a
  // balance of zero, so « lancez votre premier rendu » would be a promise
  // the plans dialog immediately breaks.
  for (const kind of PROSPECT) {
    it(kind, () => {
      for (const locale of ['fr', 'en'] as const) {
        const body = `${mail(kind, locale).subject} ${mail(kind, locale).text}`.toLowerCase();
        expect(body).not.toContain('premier rendu');
        expect(body).not.toContain('first render');
        expect(body).not.toContain('lancer un rendu →');
      }
    });
  }

  it('and the last call says plainly that a plan is needed', () => {
    expect(mail('prospect_day18', 'fr').text).toContain('formule');
    expect(mail('prospect_day18', 'en').text.toLowerCase()).toContain('plan');
  });
});

describe('the last relance of a sequence says it is the last', () => {
  it('prospect_day18', () => {
    expect(mail('prospect_day18', 'fr').text).toContain('dernier e-mail');
    expect(mail('prospect_day18', 'en').text).toContain('last email');
  });
  it('lapsed_day30', () => {
    expect(mail('lapsed_day30', 'fr').text).toContain('dernier e-mail');
    expect(mail('lapsed_day30', 'en').text).toContain('last email');
  });
});

describe('the greeting', () => {
  it('uses the first name when there is one', () => {
    expect(mail('prospect_day1', 'fr').text.startsWith('Bonjour Awa,')).toBe(true);
    expect(mail('prospect_day1', 'en').text.startsWith('Hi Awa,')).toBe(true);
  });

  it('drops it cleanly when there is none', () => {
    const m = relanceEmail('prospect_day1', {
      firstName: null,
      locale: 'fr',
      unsubscribeUrl: UNSUB,
    });
    expect(m.text.startsWith('Bonjour,')).toBe(true);
    expect(m.text).not.toContain('Bonjour ,');
  });

  it('escapes a name that carries HTML', () => {
    const m = relanceEmail('prospect_day1', {
      firstName: '<script>x</script>',
      locale: 'fr',
      unsubscribeUrl: UNSUB,
    });
    expect(m.html).not.toContain('<script>');
  });
});

describe('the links point at the live site in the reader’s language', () => {
  for (const kind of REENGAGEMENT_KINDS) {
    it(kind, () => {
      for (const locale of ['fr', 'en'] as const) {
        const m = mail(kind, locale);
        const links = [...m.html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((x) => x[1]!);
        expect(links.length).toBeGreaterThan(0);
        for (const href of links) {
          expect(href.startsWith('https://www.renderpro.app')).toBe(true);
          if (!href.includes('/api/emails/unsubscribe')) {
            expect(href).toContain(`lang=${locale}`);
          }
        }
      }
    });
  }
});

describe('the emoji the owner asked for are there', () => {
  it('every relance carries at least one', () => {
    for (const kind of REENGAGEMENT_KINDS) {
      for (const locale of ['fr', 'en'] as const) {
        const m = mail(kind, locale);
        expect(/\p{Extended_Pictographic}/u.test(`${m.subject}${m.text}`), kind).toBe(true);
      }
    }
  });
});

describe('the shape that keeps these out of the Promotions tab', () => {
  // Gmail's tab is a per-recipient heuristic and nothing can force
  // Primary (2026-11-05, owner: « je veux qu'elles s'affichent dans la
  // boîte mail elle-même »). What CAN be done is to stop sending the
  // signals that say « bulk marketing » — so the ones that were removed
  // are pinned here, or the newsletter shape creeps back one commit at
  // a time and nobody notices until the open rate falls.
  for (const kind of REENGAGEMENT_KINDS) {
    for (const locale of ['fr', 'en'] as const) {
      const m = mail(kind, locale);

      it(`${kind}/${locale}: no emoji in the subject line`, () => {
        // The single heaviest Promotions signal. The body keeps the
        // owner's emoji — the test above pins that they are still there.
        expect(/\p{Extended_Pictographic}/u.test(m.subject), m.subject).toBe(false);
      });

      it(`${kind}/${locale}: no button, no card, no letterhead, no preheader`, () => {
        expect(m.html, 'a coloured CTA slab reads as marketing').not.toContain('border-radius');
        expect(m.html, 'no page background behind a card').not.toContain('background:#EEEEF1');
        expect(m.html, 'hidden preheader text is a newsletter tell').not.toContain('display:none');
      });

      it(`${kind}/${locale}: the way out survives all of it`, () => {
        // Non-negotiable: dropping this wins Primary for a week, then
        // loses the domain to spam complaints -- and the sign-in codes
        // leave from that same domain.
        expect(m.html).toContain(UNSUB.replace(/&/g, '&amp;'));
      });
    }
  }
});
