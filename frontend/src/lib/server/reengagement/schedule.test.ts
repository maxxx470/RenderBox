// When a relance goes out — and above all when we STOP (2026-10-31, owner).
//
// The rules are worth more than the texts: an e-mail too many costs a spam
// complaint on the domain the sign-in codes leave from. Every stop rule the
// owner asked for has a test here.
import { describe, expect, it } from 'vitest';
import {
  pickReengagement,
  TIER_PERIOD_MS,
  type ReengagementFacts,
  type SentRelance,
} from './schedule';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-01T09:00:00.000Z');
const U = 'user_1';

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY);
}

function facts(over: Partial<ReengagementFacts> = {}): ReengagementFacts {
  return {
    createdAt: daysAgo(1),
    hasPaid: false,
    tierPeriodStart: null,
    creditsBalance: 0,
    cheapestRenderCost: 4,
    lastRenderAt: null,
    lastSupportMessageAt: null,
    marketingUnsubscribedAt: null,
    emailBouncedAt: null,
    suspended: false,
    deleted: false,
    sent: [],
    ...over,
  };
}

function sent(kind: SentRelance['kind'], when: Date): SentRelance {
  return { kind, sentAt: when };
}

describe('a prospect gets four relances, then silence for ever', () => {
  it('nothing on the day of the sign-up', () => {
    expect(pickReengagement(facts({ createdAt: daysAgo(0) }), NOW, U)).toBeNull();
  });

  it('day 1, 4, 10 and 18 each fire in turn', () => {
    const steps: [number, string][] = [
      [1, 'prospect_day1'],
      [4, 'prospect_day4'],
      [10, 'prospect_day10'],
      [18, 'prospect_day18'],
    ];
    const history: SentRelance[] = [];
    for (const [day, kind] of steps) {
      const pick = pickReengagement(
        facts({ createdAt: daysAgo(30), sent: [...history] }),
        new Date(daysAgo(30).getTime() + day * DAY),
        U,
      );
      expect(pick?.kind, `day ${day}`).toBe(kind);
      history.push(sent(kind as SentRelance['kind'], new Date(daysAgo(30).getTime() + day * DAY)));
    }
  });

  it('after the fourth, nothing — not on day 19, not on day 400', () => {
    const history = [sent('prospect_day18', daysAgo(5))];
    expect(pickReengagement(facts({ createdAt: daysAgo(23), sent: history }), NOW, U)).toBeNull();
    const old = new Date(NOW.getTime() + 400 * DAY);
    expect(pickReengagement(facts({ createdAt: daysAgo(23), sent: history }), old, U)).toBeNull();
  });

  it('an account already old on the first pass gets the LAST CALL alone', () => {
    // Nobody receives four e-mails in twelve days because the feature
    // shipped after they signed up.
    const pick = pickReengagement(facts({ createdAt: daysAgo(40) }), NOW, U);
    expect(pick?.kind).toBe('prospect_day18');
  });

  it('never two relances inside 72 h', () => {
    const pick = pickReengagement(
      facts({ createdAt: daysAgo(10), sent: [sent('prospect_day4', daysAgo(1))] }),
      NOW,
      U,
    );
    expect(pick).toBeNull();
  });
});

describe('the first payment ends the prospect sequence (the owner’s rule)', () => {
  it('someone who has paid never gets a prospect relance', () => {
    for (const age of [1, 4, 10, 18, 60]) {
      const pick = pickReengagement(facts({ createdAt: daysAgo(age), hasPaid: true }), NOW, U);
      expect(String(pick?.kind ?? ''), `age ${age}`).not.toMatch(/^prospect_/);
    }
  });

  it('and not even after their plan has lapsed', () => {
    const pick = pickReengagement(
      facts({
        createdAt: daysAgo(90),
        hasPaid: true,
        tierPeriodStart: daysAgo(45), // ended 15 days ago
        sent: [sent('lapsed_day7', daysAgo(8))],
      }),
      NOW,
      U,
    );
    expect(String(pick?.kind ?? '')).not.toMatch(/^prospect_/);
  });
});

describe('a subscriber whose plan is running', () => {
  const running = { hasPaid: true, tierPeriodStart: daysAgo(5) };

  it('is told when the balance can no longer pay for a render', () => {
    const pick = pickReengagement(
      facts({ ...running, creditsBalance: 3, cheapestRenderCost: 4 }),
      NOW,
      U,
    );
    expect(pick?.kind).toBe('credits_low');
  });

  it('is not told while the balance still buys one', () => {
    const pick = pickReengagement(
      facts({ ...running, creditsBalance: 4, cheapestRenderCost: 4, lastRenderAt: daysAgo(1) }),
      NOW,
      U,
    );
    expect(pick).toBeNull();
  });

  it('hears once per paid period, not twice', () => {
    const pick = pickReengagement(
      facts({
        ...running,
        creditsBalance: 0,
        sent: [sent('credits_low', daysAgo(4))],
      }),
      NOW,
      U,
    );
    expect(pick).toBeNull();
  });

  it('is nudged after a fortnight with nothing rendered', () => {
    const pick = pickReengagement(
      facts({
        hasPaid: true,
        tierPeriodStart: daysAgo(20),
        creditsBalance: 500,
        lastRenderAt: daysAgo(15),
      }),
      NOW,
      U,
    );
    expect(pick?.kind).toBe('idle_subscriber');
  });

  it('is left alone when they rendered yesterday', () => {
    const pick = pickReengagement(
      facts({ ...running, creditsBalance: 500, lastRenderAt: daysAgo(1) }),
      NOW,
      U,
    );
    expect(pick).toBeNull();
  });
});

describe('a lapsed subscriber: two relances, then stop', () => {
  // A period that started 40 days ago ended 10 days ago.
  const lapsed = { hasPaid: true, tierPeriodStart: daysAgo(40) };

  it('nothing in the first week after the end', () => {
    expect(
      pickReengagement(facts({ hasPaid: true, tierPeriodStart: daysAgo(33) }), NOW, U),
    ).toBeNull();
  });

  it('day 7 after the end', () => {
    expect(pickReengagement(facts(lapsed), NOW, U)?.kind).toBe('lapsed_day7');
  });

  it('then day 30, and nothing more', () => {
    const afterFirst = facts({
      hasPaid: true,
      tierPeriodStart: daysAgo(65), // ended 35 days ago
      sent: [sent('lapsed_day7', daysAgo(28))],
    });
    expect(pickReengagement(afterFirst, NOW, U)?.kind).toBe('lapsed_day30');

    const afterBoth = facts({
      hasPaid: true,
      tierPeriodStart: daysAgo(65),
      sent: [sent('lapsed_day7', daysAgo(28)), sent('lapsed_day30', daysAgo(5))],
    });
    expect(pickReengagement(afterBoth, NOW, U)).toBeNull();
  });

  it('a plan that lapsed long ago does not replay the sequence', () => {
    // Ended 60 days ago, never relanced: the LAST due step only.
    const pick = pickReengagement(facts({ hasPaid: true, tierPeriodStart: daysAgo(90) }), NOW, U);
    expect(pick?.kind).toBe('lapsed_day30');
  });

  it('each new paid period reopens the two relances', () => {
    const pick = pickReengagement(
      facts({
        hasPaid: true,
        tierPeriodStart: daysAgo(40),
        sent: [sent('lapsed_day7', daysAgo(200)), sent('lapsed_day30', daysAgo(180))],
      }),
      NOW,
      U,
    );
    expect(pick?.kind).toBe('lapsed_day7');
  });
});

describe('the long-dormant ex-subscriber: once a semester', () => {
  // Ended 100 days ago, both lapsed relances already sent.
  const dormant = {
    hasPaid: true,
    tierPeriodStart: new Date(NOW.getTime() - (100 * DAY + TIER_PERIOD_MS)),
    sent: [sent('lapsed_day7', daysAgo(93)), sent('lapsed_day30', daysAgo(70))],
  };

  it('is invited back after 90 days without a plan', () => {
    expect(pickReengagement(facts(dormant), NOW, U)?.kind).toBe('winback');
  });

  it('and not again within 180 days', () => {
    const pick = pickReengagement(
      facts({ ...dormant, sent: [...dormant.sent, sent('winback', daysAgo(90))] }),
      NOW,
      U,
    );
    expect(pick).toBeNull();
  });

  it('but again after 180 days', () => {
    const pick = pickReengagement(
      facts({ ...dormant, sent: [...dormant.sent, sent('winback', daysAgo(200))] }),
      NOW,
      U,
    );
    expect(pick?.kind).toBe('winback');
  });
});

describe('the guards have no exception', () => {
  const due = { createdAt: daysAgo(2) }; // day-1 relance is due

  it('an unsubscribe is final', () => {
    expect(
      pickReengagement(facts({ ...due, marketingUnsubscribedAt: daysAgo(10) }), NOW, U),
    ).toBeNull();
  });

  it('a hard bounce stops everything', () => {
    expect(pickReengagement(facts({ ...due, emailBouncedAt: daysAgo(3) }), NOW, U)).toBeNull();
  });

  it('nothing goes to a suspended or deleted account', () => {
    expect(pickReengagement(facts({ ...due, suspended: true }), NOW, U)).toBeNull();
    expect(pickReengagement(facts({ ...due, deleted: true }), NOW, U)).toBeNull();
  });

  it('a live support conversation pauses the lot', () => {
    expect(
      pickReengagement(facts({ ...due, lastSupportMessageAt: daysAgo(3) }), NOW, U),
    ).toBeNull();
    // …and stops pausing once it is a fortnight old.
    expect(
      pickReengagement(facts({ ...due, lastSupportMessageAt: daysAgo(20) }), NOW, U)?.kind,
    ).toBe('prospect_day1');
  });
});

describe('the dedupe key', () => {
  it('names the account and the relance', () => {
    const pick = pickReengagement(facts({ createdAt: daysAgo(2) }), NOW, U);
    expect(pick?.dedupeKey).toBe('user_1:prospect_day1');
  });

  it('carries the paid period for the relances that may come back', () => {
    const pick = pickReengagement(
      facts({ hasPaid: true, tierPeriodStart: new Date('2026-09-22T00:00:00.000Z') }),
      NOW,
      U,
    );
    expect(pick?.dedupeKey).toContain('2026-09-22');
  });
});
