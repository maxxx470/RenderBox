/**
 * One pass of the relance sender (2026-10-31). Called by the
 * /api/cron/reengagement route, once a day.
 *
 * It gathers the facts, asks schedule.ts what each account is owed, and
 * sends. The decision lives entirely in schedule.ts; nothing here decides
 * who gets what.
 *
 * AT MOST ONCE, deliberately. The ReengagementEmail row is written BEFORE
 * the send, and its `dedupeKey` is unique — so two instances firing at the
 * same instant cannot both send, and a Resend hiccup burns that relance
 * rather than risking a second copy. For a marketing e-mail that is the
 * right side to err on: a missed relance costs nothing, a duplicate costs
 * a spam complaint on the domain our sign-in codes leave from.
 *
 * Nothing is sent, and nothing is written, when Resend is not configured.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import type { Mailer } from '@/lib/server/email';
import { createLogger } from '@/lib/server/logger';
import { localeForCountryText } from '@/lib/i18n/geo-locale';
import { offeredPrices } from '@/lib/provider-cost';
import { relanceEmail } from './emails';
import {
  pickReengagement,
  TIER_PERIOD_MS,
  type ReengagementFacts,
  type ReengagementKind,
  type SentRelance,
} from './schedule';
import { unsubscribeUrl } from './unsubscribe-token';
import { isDeliverableAddress } from './deliverable';

const log = createLogger();

/** Accounts looked at in one pass. The base is small; raise with it. */
export const CANDIDATE_LIMIT = 500;
/** Relances actually sent in one pass, so a cold start cannot blast the list. */
export const SEND_LIMIT = 50;

export interface RunReengagementInput {
  prisma: PrismaClient;
  mailer: Mailer;
  /** JWT_SECRET — signs the unsubscribe links. */
  secret: string;
  now?: Date;
  sendLimit?: number;
  requestId?: string;
}

export interface RunReengagementResult {
  looked: number;
  sent: number;
  failed: number;
  byKind: Record<string, number>;
  /**
   * Accounts dropped because their address cannot receive mail at all.
   * Reported so the cron log says it out loud rather than the pass
   * quietly looking at fewer people than the base holds.
   */
  undeliverable?: number;
}

/** The cheapest render the command bar offers, in credits. */
function cheapestRenderCost(): number {
  const costs = offeredPrices().map((p) => p.credits);
  return costs.length > 0 ? Math.min(...costs) : 1;
}

export async function runReengagement(input: RunReengagementInput): Promise<RunReengagementResult> {
  const { prisma, mailer, secret } = input;
  const now = input.now ?? new Date();
  const sendLimit = input.sendLimit ?? SEND_LIMIT;
  const result: RunReengagementResult = { looked: 0, sent: 0, failed: 0, byKind: {} };

  const candidates = await prisma.user.findMany({
    where: {
      marketingUnsubscribedAt: null,
      emailBouncedAt: null,
      status: 'ACTIVE',
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      country: true,
      createdAt: true,
      tierPeriodStart: true,
      creditsBalance: true,
    },
    orderBy: { createdAt: 'asc' },
    take: CANDIDATE_LIMIT,
  });

  // An address that cannot receive mail is dropped BEFORE anything else,
  // and no row is written for it, so it stays merely owed rather than
  // burnt. The query above cannot catch these: the five seed accounts in
  // production (@localhost, @example.com) are ACTIVE, not unsubscribed
  // and not bounced, so they passed every filter — and would have been
  // five hard bounces out of nineteen on the very first send, from the
  // same domain the sign-in codes leave from. `emailBouncedAt` is set by
  // nothing yet, so the guard has to be here, on the way out.
  const reachable = candidates.filter((u) => isDeliverableAddress(u.email));
  const undeliverable = candidates.length - reachable.length;
  if (undeliverable > 0) result.undeliverable = undeliverable;

  result.looked = reachable.length;
  if (reachable.length === 0) return result;

  const ids = reachable.map((u) => u.id);

  // Who has ever paid — the owner's stop rule.
  const paidRows = await prisma.order.groupBy({
    by: ['userId'],
    where: { userId: { in: ids }, status: 'PAID' },
    _count: { _all: true },
  });
  const hasPaid = new Set(
    paidRows.map((r) => r.userId).filter((id): id is string => typeof id === 'string'),
  );

  // A live support conversation pauses everything.
  const supportRows = await prisma.supportMessage.groupBy({
    by: ['userId'],
    where: { userId: { in: ids }, fromAdmin: false },
    _max: { createdAt: true },
  });
  const lastSupport = new Map<string, Date>();
  for (const r of supportRows) {
    if (r._max.createdAt) lastSupport.set(r.userId, r._max.createdAt);
  }

  // The last render, needed only for subscribers whose plan is running.
  const activeIds = reachable
    .filter(
      (u) => u.tierPeriodStart && u.tierPeriodStart.getTime() + TIER_PERIOD_MS > now.getTime(),
    )
    .map((u) => u.id);
  const lastRender = new Map<string, Date>();
  if (activeIds.length > 0) {
    const nodes = await prisma.renderNode.findMany({
      where: { kind: 'GENERATED', project: { userId: { in: activeIds } } },
      select: { createdAt: true, project: { select: { userId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    for (const n of nodes) {
      const uid = n.project.userId;
      if (!lastRender.has(uid)) lastRender.set(uid, n.createdAt);
    }
  }

  // What each of them has already been sent.
  const sentRows = await prisma.reengagementEmail.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, kind: true, sentAt: true },
  });
  const sentByUser = new Map<string, SentRelance[]>();
  for (const r of sentRows) {
    const list = sentByUser.get(r.userId) ?? [];
    list.push({ kind: r.kind as ReengagementKind, sentAt: r.sentAt });
    sentByUser.set(r.userId, list);
  }

  const cheapest = cheapestRenderCost();

  for (const user of reachable) {
    if (result.sent >= sendLimit) break;

    const facts: ReengagementFacts = {
      createdAt: user.createdAt,
      hasPaid: hasPaid.has(user.id),
      tierPeriodStart: user.tierPeriodStart,
      creditsBalance: user.creditsBalance,
      cheapestRenderCost: cheapest,
      lastRenderAt: lastRender.get(user.id) ?? null,
      lastSupportMessageAt: lastSupport.get(user.id) ?? null,
      marketingUnsubscribedAt: null,
      emailBouncedAt: null,
      suspended: false,
      deleted: false,
      sent: sentByUser.get(user.id) ?? [],
    };

    const pick = pickReengagement(facts, now, user.id);
    if (!pick) continue;

    // Reserve it first: the unique dedupeKey is what makes this at-most-once.
    try {
      await prisma.reengagementEmail.create({
        data: { userId: user.id, kind: pick.kind, dedupeKey: pick.dedupeKey, sentAt: now },
      });
    } catch {
      // Already reserved by another instance, or by an earlier pass.
      continue;
    }

    // The onboarding's country is free text (« Togo », « Myanmar (Burma) »),
    // not an ISO code — localeForCountry would answer English to all of it.
    const locale = localeForCountryText(user.country);
    const firstName = user.name?.trim().split(/\s+/)[0] ?? null;
    const mail = relanceEmail(pick.kind, {
      firstName: firstName && firstName.length > 0 ? firstName : null,
      locale,
      unsubscribeUrl: unsubscribeUrl(user.id, secret, locale),
    });

    try {
      await mailer.send({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        listUnsubscribe: { url: unsubscribeUrl(user.id, secret, locale) },
      });
      result.sent++;
      result.byKind[pick.kind] = (result.byKind[pick.kind] ?? 0) + 1;
    } catch (err) {
      result.failed++;
      // The row stays: this relance is spent rather than sent twice.
      log.error('reengagement: send failed, relance skipped', {
        kind: pick.kind,
        userId: user.id,
        requestId: input.requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
