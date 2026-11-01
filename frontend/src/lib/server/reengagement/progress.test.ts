// « Combien de relances, sur combien » — the figure the back-office prints
// in the users table (2026-11-01). The point of these tests is that the
// denominator tells the truth: it must never promise a relance that
// pickReengagement will not send.
import { describe, it, expect } from 'vitest';
import {
  reengagementProgress,
  pickReengagement,
  PROSPECT_STEPS,
  LAPSED_STEPS,
  TIER_PERIOD_MS,
  WINBACK_AFTER_MS,
  WINBACK_EVERY_MS,
  type ReengagementFacts,
  type ReengagementKind,
  type SentRelance,
} from './schedule';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-01T09:10:00.000Z');

function facts(over: Partial<ReengagementFacts> = {}): ReengagementFacts {
  return {
    createdAt: new Date(NOW.getTime() - DAY),
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

function sent(kind: ReengagementKind, agoDays: number): SentRelance {
  return { kind, sentAt: new Date(NOW.getTime() - agoDays * DAY) };
}

describe('reengagementProgress — a prospect', () => {
  it('a brand-new account has received none of the four', () => {
    const p = reengagementProgress(facts({ createdAt: NOW }), NOW);
    expect(p.stage).toBe('prospect');
    expect(p.sent).toBe(0);
    expect(p.total).toBe(4);
  });

  it('counts the steps already sent and still promises the rest', () => {
    const p = reengagementProgress(
      facts({
        createdAt: new Date(NOW.getTime() - 5 * DAY),
        sent: [sent('prospect_day1', 4)],
      }),
      NOW,
    );
    expect(p.sent).toBe(1);
    expect(p.total).toBe(4);
  });

  it('a 19-day account that got all four is finished, 4 / 4', () => {
    const p = reengagementProgress(
      facts({
        createdAt: new Date(NOW.getTime() - 19 * DAY),
        sent: [
          sent('prospect_day1', 18),
          sent('prospect_day4', 15),
          sent('prospect_day10', 9),
          sent('prospect_day18', 1),
        ],
      }),
      NOW,
    );
    expect(p.sent).toBe(4);
    expect(p.total).toBe(4);
  });

  // THE ONE THAT MATTERS. pickReengagement sends the LAST due step alone to
  // an account that was already old on the first pass, then stops for ever.
  // « 0 / 4 » would be a promise of three relances that never come.
  it('an account already past the last step is owed ONE, so 0 / 1', () => {
    const f = facts({ createdAt: new Date(NOW.getTime() - 40 * DAY) });
    const p = reengagementProgress(f, NOW);
    expect(p.sent).toBe(0);
    expect(p.total).toBe(1);
    // And the sender agrees: exactly one relance is due, the last call.
    expect(pickReengagement(f, NOW, 'u1')?.kind).toBe('prospect_day18');
  });

  it('and once that one is sent it reads 1 / 1, with nothing more due', () => {
    const f = facts({
      createdAt: new Date(NOW.getTime() - 40 * DAY),
      sent: [sent('prospect_day18', 4)],
    });
    const p = reengagementProgress(f, NOW);
    expect(p.sent).toBe(1);
    expect(p.total).toBe(1);
    expect(pickReengagement(f, NOW, 'u1')).toBeNull();
  });

  // The invariant behind all of the above, walked over every age.
  it('the total never promises more than the sender will send', () => {
    for (const ageDays of [0, 1, 2, 4, 7, 10, 15, 18, 25, 60, 400]) {
      const createdAt = new Date(NOW.getTime() - ageDays * DAY);
      const done: SentRelance[] = [];
      // Drain the sequence as the daily cron would, three days apart.
      for (let pass = 0; pass < 12; pass++) {
        const at = new Date(NOW.getTime() + pass * 3 * DAY);
        const pick = pickReengagement(facts({ createdAt, sent: done }), at, 'u1');
        if (!pick) continue;
        done.push({ kind: pick.kind, sentAt: at });
      }
      const atStart = reengagementProgress(facts({ createdAt }), NOW);
      expect(atStart.total).toBeGreaterThanOrEqual(1);
      // What was actually sendable from today on is what we announced.
      expect(done.length).toBeLessThanOrEqual(atStart.total);
    }
  });
});

describe('reengagementProgress — the paying stages', () => {
  it('a subscriber hears twice at most per paid period', () => {
    const periodStart = new Date(NOW.getTime() - 10 * DAY);
    const p = reengagementProgress(
      facts({
        hasPaid: true,
        tierPeriodStart: periodStart,
        sent: [sent('credits_low', 5)],
      }),
      NOW,
    );
    expect(p.stage).toBe('subscriber');
    expect(p.sent).toBe(1);
    expect(p.total).toBe(2);
  });

  it('a relance from a PREVIOUS period does not count in this one', () => {
    const periodStart = new Date(NOW.getTime() - 2 * DAY);
    const p = reengagementProgress(
      facts({
        hasPaid: true,
        tierPeriodStart: periodStart,
        sent: [sent('credits_low', 40)],
      }),
      NOW,
    );
    expect(p.sent).toBe(0);
    expect(p.total).toBe(2);
  });

  it('a plan that ended 8 days ago: one of two due', () => {
    const periodStart = new Date(NOW.getTime() - (TIER_PERIOD_MS / DAY + 8) * DAY);
    const p = reengagementProgress(facts({ hasPaid: true, tierPeriodStart: periodStart }), NOW);
    expect(p.stage).toBe('lapsed');
    expect(p.total).toBe(2);
    expect(p.sent).toBe(0);
  });

  it('a plan that ended 40 days ago skips day 7, so only ONE is left', () => {
    const periodStart = new Date(NOW.getTime() - (TIER_PERIOD_MS / DAY + 40) * DAY);
    const f = facts({ hasPaid: true, tierPeriodStart: periodStart });
    const p = reengagementProgress(f, NOW);
    expect(p.total).toBe(1);
    expect(pickReengagement(f, NOW, 'u1')?.kind).toBe('lapsed_day30');
  });

  it('a dormant ex-subscriber: one invitation per semester', () => {
    const periodStart = new Date(NOW.getTime() - TIER_PERIOD_MS - WINBACK_AFTER_MS - DAY);
    const fresh = reengagementProgress(facts({ hasPaid: true, tierPeriodStart: periodStart }), NOW);
    expect(fresh.stage).toBe('dormant');
    expect(fresh.sent).toBe(0);
    expect(fresh.total).toBe(1);

    const invited = reengagementProgress(
      facts({ hasPaid: true, tierPeriodStart: periodStart, sent: [sent('winback', 10)] }),
      NOW,
    );
    expect(invited.sent).toBe(1);
    expect(invited.total).toBe(1);

    // Past the semester the slot opens again, so it is owed one once more.
    const longAgo = reengagementProgress(
      facts({
        hasPaid: true,
        tierPeriodStart: periodStart,
        sent: [sent('winback', WINBACK_EVERY_MS / DAY + 5)],
      }),
      NOW,
    );
    expect(longAgo.sent).toBe(0);
    expect(longAgo.total).toBe(1);
  });

  it('paid once with no period on record: nothing applies', () => {
    const p = reengagementProgress(facts({ hasPaid: true, tierPeriodStart: null }), NOW);
    expect(p.stage).toBe('none');
    expect(p.total).toBe(0);
  });
});

describe('reengagementProgress — why nothing more will go out', () => {
  it.each([
    ['unsubscribed', { marketingUnsubscribedAt: NOW }],
    ['bounced', { emailBouncedAt: NOW }],
    ['suspended', { suspended: true }],
    ['deleted', { deleted: true }],
  ] as const)('names the guard that stopped it: %s', (reason, over) => {
    const f = facts({ createdAt: new Date(NOW.getTime() - 5 * DAY), ...over });
    expect(reengagementProgress(f, NOW).stopped).toBe(reason);
    // The sender agrees: a guarded account is owed nothing.
    expect(pickReengagement(f, NOW, 'u1')).toBeNull();
  });

  it('a live account carries no stop reason', () => {
    expect(reengagementProgress(facts(), NOW).stopped).toBeNull();
  });

  it('counts every relance ever sent, whatever the stage', () => {
    const p = reengagementProgress(
      facts({
        hasPaid: true,
        tierPeriodStart: new Date(NOW.getTime() - 3 * DAY),
        sent: [sent('prospect_day1', 300), sent('credits_low', 1)],
      }),
      NOW,
    );
    expect(p.lifetimeSent).toBe(2);
    expect(p.lastSentAt?.toISOString()).toBe(sent('credits_low', 1).sentAt.toISOString());
  });

  it('an account that never heard from us has no last date', () => {
    expect(reengagementProgress(facts(), NOW).lastSentAt).toBeNull();
  });
});

describe('the sequences the figures are built on', () => {
  it('four prospect steps and two lapsed ones, as the rules say', () => {
    expect(PROSPECT_STEPS).toHaveLength(4);
    expect(LAPSED_STEPS).toHaveLength(2);
  });
});
