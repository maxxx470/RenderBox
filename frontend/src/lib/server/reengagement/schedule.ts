/**
 * WHEN a relance goes out, and — more important — WHEN WE STOP.
 *
 * (2026-10-31, owner: « ajoute les mails de relance pour relancer les
 * inscrits », then « on arrête l'envoi quand l'utilisateur fait le paiement
 * une fois, et s'il fait un abonnement et que ça fait un très long moment
 * sans renouveler ».)
 *
 * The whole decision is this one pure function, so the rules can be read and
 * tested without a database, a mailer or a clock. The cron only gathers the
 * facts and obeys.
 *
 * The rules, in the order they bind:
 *
 *  1. A PROSPECT (never paid) gets four relances — day 1, 4, 10 and 18 —
 *     then silence, for ever. Past three weeks an inactive sign-up almost
 *     never converts, while every extra e-mail buys spam complaints; and the
 *     sign-in codes leave from the SAME domain, so a reputation ruined by
 *     relances takes the e-mails people actually need down with it.
 *  2. The FIRST PAYMENT ends that sequence definitively (the owner's rule).
 *     Someone who has paid is not a prospect any more and never sees those
 *     four again, even if their plan lapses later.
 *  3. A PAYING subscriber may hear from us twice: when their balance can no
 *     longer pay for a render, and once if they have made nothing for a
 *     fortnight. Once per paid period each.
 *  4. A LAPSED subscriber gets two relances, 7 and 30 days after the period
 *     ended, keyed to that period — then stop. Two ignored relances are an
 *     answer.
 *  5. A LONG-DORMANT ex-subscriber (no plan for 90 days) gets one single
 *     « come back » e-mail, and not another for 180 days. They have paid
 *     once, so they are the warmest list there is — but once a semester.
 *
 * And four guards that override every rule above: an unsubscribe is final,
 * a hard bounce stops everything, nothing is sent to a suspended or deleted
 * account, never two relances within 72 h, and a live support conversation
 * pauses the lot (a human is already talking to them).
 */
import 'server-only';

export const REENGAGEMENT_KINDS = [
  'prospect_day1',
  'prospect_day4',
  'prospect_day10',
  'prospect_day18',
  'credits_low',
  'idle_subscriber',
  'lapsed_day7',
  'lapsed_day30',
  'winback',
] as const;

export type ReengagementKind = (typeof REENGAGEMENT_KINDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** No two relances to the same person inside this window, whatever matches. */
export const MIN_GAP_MS = 3 * DAY_MS;
/** A support message this recent pauses every relance. */
export const SUPPORT_PAUSE_MS = 14 * DAY_MS;
/** The four prospect relances, by the age of the account. */
export const PROSPECT_STEPS: readonly { kind: ReengagementKind; afterDays: number }[] = [
  { kind: 'prospect_day1', afterDays: 1 },
  { kind: 'prospect_day4', afterDays: 4 },
  { kind: 'prospect_day10', afterDays: 10 },
  { kind: 'prospect_day18', afterDays: 18 },
];
/**
 * The one-off catch-up cohort (2026-11-05).
 *
 * Every account created BEFORE this instant receives the four prospect
 * relances in order, whatever its age; everyone who signs up after it
 * follows the ordinary schedule, where an account already old on its
 * first pass gets the last call alone.
 *
 * Why this date and not the day the feature shipped (2026-10-31): the
 * cron answered 405 to every scheduled call until 2026-11-05, so not one
 * relance had ever actually left. Every account on the base at this
 * moment is therefore « someone who was there before the relances
 * existed », which is exactly the cohort the owner asked to reach.
 *
 * It is a constant, not an env var: it decides who receives e-mail, and
 * that belongs in a commit someone can read, not in a dashboard field.
 * Moving it later would re-open the sequence for accounts that already
 * finished it — the `already.has(step.kind)` check is what stops a second
 * copy, so a change here is safe but never silent.
 */
export const REENGAGEMENT_BACKFILL_BEFORE = new Date('2026-11-05T00:00:00.000Z');

/** Is this account part of that one-off catch-up? */
export function isBackfillCohort(createdAt: Date): boolean {
  return createdAt.getTime() < REENGAGEMENT_BACKFILL_BEFORE.getTime();
}

/** A subscriber who has rendered nothing for this long. */
export const IDLE_AFTER_MS = 14 * DAY_MS;
/** After the paid period ended. */
export const LAPSED_STEPS: readonly { kind: ReengagementKind; afterDays: number }[] = [
  { kind: 'lapsed_day7', afterDays: 7 },
  { kind: 'lapsed_day30', afterDays: 30 },
];
/** Without a plan for this long, an ex-subscriber may be asked back. */
export const WINBACK_AFTER_MS = 90 * DAY_MS;
/** And not asked again before this much has passed. */
export const WINBACK_EVERY_MS = 180 * DAY_MS;

export interface SentRelance {
  kind: ReengagementKind;
  sentAt: Date;
}

/** Everything the decision needs — gathered by the cron, nothing more. */
export interface ReengagementFacts {
  createdAt: Date;
  /** Has this account ever had a PAID order? The owner's stop rule. */
  hasPaid: boolean;
  /** Start of the current (or last) paid period; NULL = never had one. */
  tierPeriodStart: Date | null;
  /** Credits left, read with the plan. */
  creditsBalance: number;
  /** The cheapest render the command bar offers, in credits. */
  cheapestRenderCost: number;
  /** When the account last produced an image; NULL = never. */
  lastRenderAt: Date | null;
  /** When the user last wrote to the team; NULL = never. */
  lastSupportMessageAt: Date | null;
  marketingUnsubscribedAt: Date | null;
  emailBouncedAt: Date | null;
  suspended: boolean;
  deleted: boolean;
  sent: readonly SentRelance[];
}

export interface ReengagementPick {
  kind: ReengagementKind;
  /** Unique per send — the database refuses a second row with the same key. */
  dedupeKey: string;
}

/** 30 days, as tier-quota.ts counts a paid period. */
export const TIER_PERIOD_MS = 30 * DAY_MS;

function periodKey(start: Date): string {
  return start.toISOString().slice(0, 10);
}

function sentKinds(facts: ReengagementFacts): Set<ReengagementKind> {
  return new Set(facts.sent.map((s) => s.kind));
}

function lastSentAt(facts: ReengagementFacts): number {
  let latest = 0;
  for (const s of facts.sent) latest = Math.max(latest, s.sentAt.getTime());
  return latest;
}

/**
 * The one relance this account is due right now, or null. Returning null is
 * the normal answer — most accounts, most days, are owed nothing.
 */
export function pickReengagement(
  facts: ReengagementFacts,
  now: Date,
  userId: string,
): ReengagementPick | null {
  // ── The guards. None of them has an exception. ───────────────────────
  if (facts.marketingUnsubscribedAt) return null;
  if (facts.emailBouncedAt) return null;
  if (facts.suspended || facts.deleted) return null;
  const nowMs = now.getTime();
  if (nowMs - lastSentAt(facts) < MIN_GAP_MS) return null;
  if (
    facts.lastSupportMessageAt &&
    nowMs - facts.lastSupportMessageAt.getTime() < SUPPORT_PAUSE_MS
  ) {
    return null;
  }

  const already = sentKinds(facts);
  const periodStart = facts.tierPeriodStart;
  const periodEndsMs = periodStart ? periodStart.getTime() + TIER_PERIOD_MS : null;
  const tierActive = periodEndsMs !== null && periodEndsMs > nowMs;

  // ── A subscriber whose plan is still running. ────────────────────────
  if (tierActive && periodStart) {
    const key = periodKey(periodStart);

    // Out of credits before out of month: the most useful thing we can say.
    if (
      facts.creditsBalance < facts.cheapestRenderCost &&
      !facts.sent.some((s) => s.kind === 'credits_low' && s.sentAt >= periodStart)
    ) {
      return { kind: 'credits_low', dedupeKey: `${userId}:credits_low:${key}` };
    }

    // Paid, and nothing made for a fortnight.
    const idleSince = facts.lastRenderAt ?? periodStart;
    if (
      nowMs - idleSince.getTime() >= IDLE_AFTER_MS &&
      !facts.sent.some((s) => s.kind === 'idle_subscriber' && s.sentAt >= periodStart)
    ) {
      return { kind: 'idle_subscriber', dedupeKey: `${userId}:idle_subscriber:${key}` };
    }

    return null;
  }

  // ── Someone who has paid before, with no plan running. ───────────────
  if (facts.hasPaid) {
    if (periodEndsMs !== null && periodStart) {
      const key = periodKey(periodStart);
      const sinceEnd = nowMs - periodEndsMs;
      // Latest due step only, so a plan that lapsed long ago does not
      // replay the whole sequence from the start.
      for (const step of [...LAPSED_STEPS].reverse()) {
        if (sinceEnd >= step.afterDays * DAY_MS) {
          const key2 = `${userId}:${step.kind}:${key}`;
          if (!facts.sent.some((s) => s.kind === step.kind && s.sentAt >= periodStart)) {
            return { kind: step.kind, dedupeKey: key2 };
          }
          break;
        }
      }

      // Dormant for a season: one invitation back, twice a year at most.
      if (sinceEnd >= WINBACK_AFTER_MS) {
        const lastWinback = facts.sent
          .filter((s) => s.kind === 'winback')
          .reduce((max, s) => Math.max(max, s.sentAt.getTime()), 0);
        if (nowMs - lastWinback >= WINBACK_EVERY_MS) {
          return {
            kind: 'winback',
            dedupeKey: `${userId}:winback:${new Date(nowMs).toISOString().slice(0, 7)}`,
          };
        }
      }
    }
    // Paid once, never had a period on record: nothing sensible to send.
    return null;
  }

  // ── A prospect: four relances, then silence for ever. ────────────────
  const ageMs = nowMs - facts.createdAt.getTime();

  // The accounts that were already signed up before the first relance ever
  // left get the WHOLE sequence, from day 1, however old they are (owner,
  // 2026-11-05: « peu importe la durée de l'utilisateur sur le SaaS, il
  // devra forcément avoir les 4 relances, sans exception … je veux pouvoir
  // faire revenir ceux qui étaient déjà inscrits avant qu'on intègre cette
  // fonction-là »).
  //
  // They are a one-off cohort, not a rule change: anyone signing up after
  // the cutoff follows the normal schedule below. The whole difference is
  // the DIRECTION this loop walks.
  if (isBackfillCohort(facts.createdAt)) {
    // Forward: the first step they have not had yet. Every threshold is
    // long past for these accounts, so the pace is set by MIN_GAP_MS
    // alone — one relance every three days, the four spread over nine,
    // which is close to the natural cadence and never a burst.
    for (const step of PROSPECT_STEPS) {
      if (ageMs < step.afterDays * DAY_MS) break;
      if (already.has(step.kind)) continue;
      return { kind: step.kind, dedupeKey: `${userId}:${step.kind}` };
    }
    return null;
  }

  // Walk from the last step back: an account that was already old when this
  // feature shipped gets the LAST-CALL e-mail alone, not four in twelve days.
  for (let i = PROSPECT_STEPS.length - 1; i >= 0; i--) {
    const step = PROSPECT_STEPS[i]!;
    if (ageMs < step.afterDays * DAY_MS) continue;
    if (already.has(step.kind)) return null; // this step is done, and it was the latest due
    return { kind: step.kind, dedupeKey: `${userId}:${step.kind}` };
  }

  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * « Combien de relances ce compte a-t-il reçues, sur combien ? »
 *
 * (2026-11-01, owner: « ajoute une case dans le tableau où tu mets le
 * nombre de relances sur le nombre total de relances … là je saurais
 * exactement comment ça se passe ».)
 *
 * The same rules as pickReengagement, read the other way round: not « what
 * is owed » but « how far through its sequence is this account ». Pure, so
 * the back-office and the tests agree with the sender by construction.
 *
 * THE DENOMINATOR IS NOT ALWAYS FOUR. pickReengagement walks the prospect
 * steps BACKWARDS and sends only the latest one due, so an account that was
 * already three weeks old on the first pass gets the last-call e-mail ALONE
 * and never another. Printing « 1 / 4 » for it would be a lie that never
 * resolves — the owner would wait for three relances that are not coming.
 * So the total is what this account can still receive plus what it already
 * has: that account reads « 0 / 1 », then « 1 / 1 », and is done.
 * ──────────────────────────────────────────────────────────────────────── */

/** Which part of its life the account is in, for the relances' purposes. */
export type ReengagementStage =
  /** Never paid: the four-step sequence. */
  | 'prospect'
  /** A plan still running: at most two, once per paid period. */
  | 'subscriber'
  /** A plan that ended: two, keyed to that period. */
  | 'lapsed'
  /** No plan for 90 days: one invitation back per semester. */
  | 'dormant'
  /** Nothing applies — paid once with no period on record. */
  | 'none';

/** Why no further relance will go out, whatever the stage says. */
export type ReengagementStop = 'unsubscribed' | 'bounced' | 'suspended' | 'deleted' | null;

export interface ReengagementProgress {
  stage: ReengagementStage;
  /** Relances received in the window the stage counts. */
  sent: number;
  /** How many that window will ever bring, this one included. */
  total: number;
  /** Every relance ever sent to this account, all stages. */
  lifetimeSent: number;
  lastSentAt: Date | null;
  /** Set = the sequence is over for good, and `sent / total` is history. */
  stopped: ReengagementStop;
}

/**
 * Of a time-based sequence, how many steps are done and how many this
 * account will ever see — see the note above on why that is not `length`.
 */
function stepProgress(
  steps: readonly { kind: ReengagementKind; afterDays: number }[],
  isSent: (kind: ReengagementKind) => boolean,
  elapsedMs: number,
): { sent: number; total: number } {
  const sent = steps.filter((s) => isSent(s.kind)).length;
  let future = 0;
  let latestDue: ReengagementKind | null = null;
  for (const step of steps) {
    if (elapsedMs >= step.afterDays * DAY_MS) latestDue = step.kind;
    else future++;
  }
  // The latest due step is the only past one still sendable; the earlier
  // ones are skipped for ever, so they are not part of this account's total.
  const pending = latestDue !== null && !isSent(latestDue) ? 1 : 0;
  return { sent, total: sent + future + pending };
}

export function reengagementProgress(facts: ReengagementFacts, now: Date): ReengagementProgress {
  const nowMs = now.getTime();
  const lastMs = lastSentAt(facts);
  const base = {
    lifetimeSent: facts.sent.length,
    lastSentAt: lastMs > 0 ? new Date(lastMs) : null,
    stopped: (facts.marketingUnsubscribedAt
      ? 'unsubscribed'
      : facts.emailBouncedAt
        ? 'bounced'
        : facts.deleted
          ? 'deleted'
          : facts.suspended
            ? 'suspended'
            : null) as ReengagementStop,
  };

  const periodStart = facts.tierPeriodStart;
  const periodEndsMs = periodStart ? periodStart.getTime() + TIER_PERIOD_MS : null;
  const tierActive = periodEndsMs !== null && periodEndsMs > nowMs;

  // A subscriber: two relances per paid period, each on a state, not a date.
  if (tierActive && periodStart) {
    const inPeriod = (kind: ReengagementKind) =>
      facts.sent.some((s) => s.kind === kind && s.sentAt >= periodStart);
    const sent = (inPeriod('credits_low') ? 1 : 0) + (inPeriod('idle_subscriber') ? 1 : 0);
    return { ...base, stage: 'subscriber', sent, total: 2 };
  }

  if (facts.hasPaid) {
    if (periodEndsMs === null || !periodStart) {
      return { ...base, stage: 'none', sent: 0, total: 0 };
    }
    const sinceEnd = nowMs - periodEndsMs;

    // Dormant for a season: one invitation back, and not another for six months.
    if (sinceEnd >= WINBACK_AFTER_MS) {
      const lastWinback = facts.sent
        .filter((s) => s.kind === 'winback')
        .reduce((max, s) => Math.max(max, s.sentAt.getTime()), 0);
      const sent = lastWinback > 0 && nowMs - lastWinback < WINBACK_EVERY_MS ? 1 : 0;
      return { ...base, stage: 'dormant', sent, total: 1 };
    }

    const { sent, total } = stepProgress(
      LAPSED_STEPS,
      (kind) => facts.sent.some((s) => s.kind === kind && s.sentAt >= periodStart),
      sinceEnd,
    );
    return { ...base, stage: 'lapsed', sent, total };
  }

  // A prospect: the four steps, of which it may only ever see the latest due.
  const already = sentKinds(facts);

  // Unless it is in the catch-up cohort, which receives all four in order
  // however old it is. Counting it with stepProgress would print « 1 / 1 »
  // for a 30-day-old account and hide the three relances still coming —
  // the exact lie the denominator rule exists to prevent, in the other
  // direction.
  if (isBackfillCohort(facts.createdAt)) {
    const sent = PROSPECT_STEPS.filter((step) => already.has(step.kind)).length;
    return { ...base, stage: 'prospect', sent, total: PROSPECT_STEPS.length };
  }

  const { sent, total } = stepProgress(
    PROSPECT_STEPS,
    (kind) => already.has(kind),
    nowMs - facts.createdAt.getTime(),
  );
  return { ...base, stage: 'prospect', sent, total };
}
