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

  // Reversed on 2026-11-05 (owner: « s'il y a des textes qui font penser
  // a une promotion et tout, j'aimerais que tu les supprimes », taking the
  // Wispr Flow announcement in their own inbox as the model -- product
  // copy, no selling). The last call used to name the plan plainly and
  // link to the pricing page; it now points at the public example pages,
  // which need no account. The half of the rule that matters is untouched
  // and sits just above: no relance may promise a render the reader
  // cannot run.
  it('and no prospect relance sells a plan or links to pricing', () => {
    for (const kind of PROSPECT) {
      for (const locale of ['fr', 'en'] as const) {
        const m = mail(kind, locale);
        const body = `${m.subject} ${m.text}`.toLowerCase();
        // « plan » alone is not forbidden: « un plan 2D » is what these
        // e-mails are about.
        for (const word of ['formule', 'tarif', 'pricing', 'abonnement', 'subscription']) {
          expect(body, `${kind}/${locale} says « ${word} »`).not.toContain(word);
        }
        expect(m.html, `${kind}/${locale} links to pricing`).not.toContain('tarifs');
      }
    }
  });
});

describe('the relances say the product animates an image into a video', () => {
  // 2026-11-08, owner: « tu devras faire comprendre aux utilisateurs qu'on a
  // la fonctionnalité de générer des animations à partir des images ». The
  // five relances that DESCRIBE the product carry it; the four that state a
  // fact (a balance running out, a plan ended, one closing question) do not,
  // and that split is pinned both ways — the first half so a rewrite cannot
  // drop the feature, the second so none of them turns into an announcement.
  const DESCRIBE = [
    'prospect_day1',
    'prospect_day4',
    'prospect_day18',
    'idle_subscriber',
    'winback',
  ] as const;
  const FACTUAL = ['prospect_day10', 'credits_low', 'lapsed_day7', 'lapsed_day30'] as const;

  for (const kind of DESCRIBE) {
    it(kind, () => {
      expect(mail(kind, 'fr').text.toLowerCase()).toMatch(/vidéo|animation|animer/);
      expect(mail(kind, 'en').text.toLowerCase()).toMatch(/video|animat/);
    });
  }

  for (const kind of FACTUAL) {
    it(`${kind} stays a fact, not an announcement`, () => {
      expect(mail(kind, 'fr').text.toLowerCase()).not.toMatch(/vidéo|animation/);
      expect(mail(kind, 'en').text.toLowerCase()).not.toMatch(/video|animat/);
    });
  }

  it('and never names a clip length — it would drift', () => {
    for (const kind of REENGAGEMENT_KINDS) {
      for (const locale of ['fr', 'en'] as const) {
        const body = mail(kind, locale).text;
        expect(body, kind).not.toMatch(/\d+\s*(s\b|secondes?|seconds?)/i);
      }
    }
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

describe('no emoji anywhere, subject or body', () => {
  // The owner validated emoji in the body on 2026-10-31 and this block
  // asserted they were present. They removed them on 2026-11-05, taking
  // the Wispr Flow announcement in their own inbox as the model: product
  // copy, no decoration, and not one emoji in it. The assertion is
  // inverted rather than deleted so the reversal is on the record.
  for (const kind of REENGAGEMENT_KINDS) {
    for (const locale of ['fr', 'en'] as const) {
      it(`${kind}/${locale}`, () => {
        const m = mail(kind, locale);
        const scan = `${m.subject} ${m.text}`;
        // The arrow in a CTA label is punctuation, not an emoji.
        const found = [...scan].filter((ch) => /\p{Extended_Pictographic}/u.test(ch) && ch !== '→');
        expect(found, `${kind}/${locale} still carries ${found.join('')}`).toEqual([]);
      });
    }
  }
});

describe('the shape of the e-mail', () => {
  // An earlier version of this block asserted « no border-radius, no
  // card, no letterhead » on the theory that a designed e-mail is what
  // sends Gmail's Promotions tab. The owner disproved it with a
  // counter-example: a full newsletter -- logo, serif headline, hero
  // images, buttons, social icons, postal address -- sitting in their
  // Primary tab. Those assertions were pinning a wrong belief, so they
  // are gone rather than quietly loosened. What stays are the things
  // that are true on their own terms.
  for (const kind of REENGAGEMENT_KINDS) {
    for (const locale of ['fr', 'en'] as const) {
      const m = mail(kind, locale);

      it(`${kind}/${locale}: no emoji in the subject line`, () => {
        // Not a deliverability claim -- a house rule. The reference the
        // owner chose has none either, and the body keeps the emoji they
        // validated (pinned by the test above).
        expect(/\p{Extended_Pictographic}/u.test(m.subject), m.subject).toBe(false);
      });

      it(`${kind}/${locale}: the preheader is read aloud, not hidden`, () => {
        // It used to sit in a `display:none` div, written for the inbox
        // list and invisible once opened. It is now the subtitle under
        // the headline, so the reader sees the sentence it was written
        // to be.
        expect(m.html).not.toContain('display:none');
        // And the subject is shown as a display headline, not only in
        // the envelope, so the opened mail says what it is about.
        expect(m.html).toContain('Georgia');
      });

      it(`${kind}/${locale}: the way out survives every redesign`, () => {
        // Non-negotiable. A reader with no way out clicks « Spam », and
        // the sign-in codes leave from this same domain.
        expect(m.html).toContain(UNSUB.replace(/&/g, '&amp;'));
      });
    }
  }
});

describe('what an inbox forces that a browser does not', () => {
  for (const kind of REENGAGEMENT_KINDS) {
    const m = mail(kind, 'fr');

    it(`${kind}: every image is absolute and carries alt text`, () => {
      // A mail client has no origin to resolve a relative path against,
      // and Gmail hides images until a sender is trusted -- so the mail
      // must still read with every picture missing.
      const imgs = [...m.html.matchAll(/<img[^>]*>/g)].map((x) => x[0]);
      expect(imgs.length).toBeGreaterThan(0);
      for (const img of imgs) {
        expect(img, 'image must be absolute').toMatch(/src="https:\/\//);
        expect(img, 'image must carry alt').toMatch(/alt="/);
      }
    });

    it(`${kind}: every gradient has a solid colour under it`, () => {
      // Outlook drops background-image. Without the fallback the brand
      // band would paint white text on white.
      const count = (re: RegExp) => [...m.html.matchAll(re)].length;
      expect(count(/background-image:linear-gradient/g)).toBeGreaterThan(0);
      // The band declares bgcolor + background-color; the button declares
      // `background:` before its image. Neither may rely on the gradient.
      expect(m.html).toContain('bgcolor=');
    });
  }
});
