/**
 * The relance facts for a handful of accounts, so the back-office can SAY
 * where each one stands (2026-11-01, owner: « tu me fais savoir si ça a été
 * relancé dans l'espace admin, la section utilisateurs »).
 *
 * run.ts gathers the same facts for the daily pass, but it cannot be reused
 * here: it starts from its OWN candidate query, which filters the guarded
 * accounts out before anything else and then hands schedule.ts `false` for
 * every guard. The admin needs the opposite — a desubscribed or bounced
 * account must still appear, saying WHY it hears nothing more. So this reads
 * the guard columns for real, and takes the ids it is given.
 *
 * Read-only, batched (one query per fact, not per user), and the numbers it
 * feeds are computed by schedule.ts's `reengagementProgress` — the same
 * module the sender obeys, so the page cannot drift from the rules.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { offeredPrices } from '@/lib/provider-cost';
import { TIER_PERIOD_MS, type ReengagementFacts, type ReengagementKind } from './schedule';

/** The cheapest render the command bar offers, in credits. */
function cheapestRenderCost(): number {
  const costs = offeredPrices().map((p) => p.credits);
  return costs.length > 0 ? Math.min(...costs) : 1;
}

/** One relance that went out, newest first — what the user's file lists. */
export interface RelanceRow {
  kind: ReengagementKind;
  sentAt: Date;
}

export interface ReengagementFactsByUser {
  facts: Map<string, ReengagementFacts>;
  /** Per user, the relances already sent, newest first. */
  history: Map<string, RelanceRow[]>;
}

export async function gatherReengagementFacts(
  prisma: PrismaClient,
  userIds: readonly string[],
  now: Date,
): Promise<ReengagementFactsByUser> {
  const empty: ReengagementFactsByUser = { facts: new Map(), history: new Map() };
  if (userIds.length === 0) return empty;
  const ids = [...userIds];

  // `?? []` on every read, as the admin routes next door do: a mocked or
  // empty result must leave the page working, never throw. A missing fact
  // only means the relance cell reads « — ».
  const users =
    (await prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        createdAt: true,
        tierPeriodStart: true,
        creditsBalance: true,
        status: true,
        deletedAt: true,
        marketingUnsubscribedAt: true,
        emailBouncedAt: true,
      },
    })) ?? [];
  if (users.length === 0) return empty;

  const [paidRowsRaw, supportRowsRaw, sentRowsRaw] = await Promise.all([
    prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: 'PAID' },
      _count: { _all: true },
    }),
    prisma.supportMessage.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, fromAdmin: false },
      _max: { createdAt: true },
    }),
    prisma.reengagementEmail.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, kind: true, sentAt: true },
      orderBy: { sentAt: 'desc' },
    }),
  ]);
  const paidRows = paidRowsRaw ?? [];
  const supportRows = supportRowsRaw ?? [];
  const sentRows = sentRowsRaw ?? [];

  const hasPaid = new Set(
    paidRows.map((r) => r.userId).filter((id): id is string => typeof id === 'string'),
  );

  const lastSupport = new Map<string, Date>();
  for (const r of supportRows) {
    if (r._max.createdAt) lastSupport.set(r.userId, r._max.createdAt);
  }

  const history = new Map<string, RelanceRow[]>();
  for (const r of sentRows) {
    const list = history.get(r.userId) ?? [];
    list.push({ kind: r.kind as ReengagementKind, sentAt: r.sentAt });
    history.set(r.userId, list);
  }

  // The last render matters only to a subscriber whose plan is running —
  // it is the « nothing made for a fortnight » rule, and nothing else.
  const activeIds = users
    .filter(
      (u) => u.tierPeriodStart && u.tierPeriodStart.getTime() + TIER_PERIOD_MS > now.getTime(),
    )
    .map((u) => u.id);
  const lastRender = new Map<string, Date>();
  if (activeIds.length > 0) {
    const nodes =
      (await prisma.renderNode.findMany({
        where: { kind: 'GENERATED', project: { userId: { in: activeIds } } },
        select: { createdAt: true, project: { select: { userId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      })) ?? [];
    for (const n of nodes) {
      const uid = n.project.userId;
      if (!lastRender.has(uid)) lastRender.set(uid, n.createdAt);
    }
  }

  const cheapest = cheapestRenderCost();
  const facts = new Map<string, ReengagementFacts>();
  for (const u of users) {
    facts.set(u.id, {
      createdAt: u.createdAt,
      hasPaid: hasPaid.has(u.id),
      tierPeriodStart: u.tierPeriodStart,
      creditsBalance: u.creditsBalance,
      cheapestRenderCost: cheapest,
      lastRenderAt: lastRender.get(u.id) ?? null,
      lastSupportMessageAt: lastSupport.get(u.id) ?? null,
      marketingUnsubscribedAt: u.marketingUnsubscribedAt,
      emailBouncedAt: u.emailBouncedAt,
      suspended: u.status === 'SUSPENDED',
      deleted: u.deletedAt !== null,
      sent: history.get(u.id) ?? [],
    });
  }

  return { facts, history };
}
