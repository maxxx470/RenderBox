// Gate #2 for AI generation — the paid CREDITS (since 2026-10-13; a monthly
// count of renders before). A plan grants its credits (lib/pricing-tiers.ts)
// for 30 days; each image produced costs RENDER_COST (1K / 2K) or
// RENDER_COST_4K, whatever made it. Fully independent of
// rate-limit-generation.ts's hourly anti-abuse cap: both gates must pass
// before an engine call is made, and neither replaces the other.
//
// The order a route follows:
//   1. debitCredits() BEFORE any engine call — one conditional UPDATE, so two
//      quick clicks can never spend the same credits twice;
//   2. refundCredits() for whatever was debited and not produced (an engine
//      or storage failure, a variant that failed, a request stopped after the
//      debit).
// The cost is always computed by the server from the request it validated
// (renderCost), never taken from the client.
//
// Lazy by design — expiry is detected and cleared the moment a user tries to
// generate (or loads a page that displays their credits), never by a cron
// sweeping every account. Credits left at the end of a period are lost: no
// carryover.
//
// Credits without a plan (2026-10-17, owner: credits an admin adds must show
// on the user's dashboard and be spendable): an account with no active plan
// but a positive balance — credits given by hand in the back-office — spends
// them like a plan's, with no end date. Without a plan and with nothing left,
// it is NO_ACTIVE_TIER as before.
import 'server-only';
import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';
import type { EngineName } from './engines/types';
import { parseEngineVersions, type EngineVersionKey } from './engine-versions';

const TIER_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type CreditRefusal = 'NO_ACTIVE_TIER' | 'TIER_EXPIRED' | 'INSUFFICIENT_CREDITS';

export interface CreditStatus {
  /** Set when there is no plan to spend from. */
  reason?: 'NO_ACTIVE_TIER' | 'TIER_EXPIRED';
  /** Which tier is active, or null (no active tier). */
  tier: PricingTierId | null;
  /** The plan's monthly credits, or null when there's no active tier. */
  max: number | null;
  /** Credits left — the plan's, or credits given without a plan — or null
   *  when there is nothing to spend from (no plan, nothing given). */
  remaining: number | null;
  /**
   * When the current period ends — the credits left expire then — or null
   * when there's no active tier.
   *
   * Returned here rather than re-read by callers: this function already loads
   * `tierPeriodStart`, and on a `connection_limit=1` pooled connection every
   * extra query is a serialized round trip to the database, not a parallel
   * one. It is also the only place that knows whether the period is still
   * valid — a caller reading the column itself could show a lapsed date.
   */
  periodEndsAt: Date | null;
  /**
   * The onboarding is done (User.onboardedAt set). Read in the same query
   * because the app layout needs both on every page (connection_limit=1:
   * one round trip, not two); /app sends a user who is not onboarded to
   * /bienvenue. False for an unknown account.
   */
  onboarded: boolean;
  /**
   * The version chosen for each engine (User.engineVersions over the
   * defaults) — read here for the same one-round-trip reason: the app layout
   * hands it to the command bar on every page.
   */
  engineVersions: Record<EngineName, EngineVersionKey>;
  /**
   * Since when the in-app Info page counts a film as new for this account:
   * its last visit there (User.infoSeenAt), or its creation date when it
   * never opened it; null for an unknown account. Same one-round-trip reason:
   * the rail shows the « Info » badge on every page.
   */
  infoSince: Date | null;
}

const NONE = { tier: null, max: null, remaining: null, periodEndsAt: null } as const;

/**
 * The user's plan and credits, for display and as the first step of a debit.
 * Also clears a lapsed period (its credits expire), so opening any app page
 * keeps the plan honest.
 */
export async function getCreditStatus(prisma: PrismaClient, userId: string): Promise<CreditStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currentTier: true,
      tierPeriodStart: true,
      creditsBalance: true,
      onboardedAt: true,
      engineVersions: true,
      infoSeenAt: true,
      createdAt: true,
    },
  });

  // A currentTier pricing-tiers.ts no longer recognizes (a retired id) is
  // treated exactly like no active tier.
  const tier = user?.currentTier ? getPricingTier(user.currentTier) : undefined;
  const onboarded = Boolean(user?.onboardedAt);
  const engineVersions = parseEngineVersions(user?.engineVersions);
  const infoSince = user?.infoSeenAt ?? user?.createdAt ?? null;
  if (!user || !tier) {
    // Credits given by hand without a plan are spendable (header above).
    if (user && !user.currentTier && user.creditsBalance > 0) {
      return {
        ...NONE,
        remaining: user.creditsBalance,
        onboarded,
        engineVersions,
        infoSince,
      };
    }
    return { reason: 'NO_ACTIVE_TIER', ...NONE, onboarded, engineVersions, infoSince };
  }

  if (!user.tierPeriodStart || Date.now() - user.tierPeriodStart.getTime() >= TIER_PERIOD_MS) {
    // Period lapsed without a renewal: the plan ends and its unused credits
    // expire with it.
    await prisma.user.update({
      where: { id: userId },
      data: { currentTier: null, tierPeriodStart: null, creditsBalance: 0 },
    });
    return { reason: 'TIER_EXPIRED', ...NONE, onboarded, engineVersions, infoSince };
  }

  return {
    onboarded,
    engineVersions,
    infoSince,
    tier: tier.id,
    max: tier.creditsPerMonth,
    remaining: Math.max(0, user.creditsBalance),
    periodEndsAt: new Date(user.tierPeriodStart.getTime() + TIER_PERIOD_MS),
  };
}

export type DebitResult =
  | { ok: true; balance: number }
  | { ok: false; reason: CreditRefusal; balance: number | null };

/**
 * Takes `cost` credits, or nothing. The debit is ONE conditional UPDATE —
 * "subtract cost where the plan is still valid and the balance covers it" —
 * which PostgreSQL runs atomically: of two simultaneous requests the second
 * re-reads the row the first changed, and is refused if what is left no
 * longer covers it. No read-then-write window, so no double spend.
 */
export async function debitCredits(
  prisma: PrismaClient,
  userId: string,
  cost: number,
): Promise<DebitResult> {
  const status = await getCreditStatus(prisma, userId);
  if (status.reason || status.remaining === null) {
    return { ok: false, reason: status.reason ?? 'NO_ACTIVE_TIER', balance: null };
  }
  if (cost <= 0) return { ok: true, balance: status.remaining };

  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      // Credits given without a plan: still no plan at the moment of the debit.
      ...(status.tier
        ? {
            currentTier: status.tier,
            tierPeriodStart: { gt: new Date(Date.now() - TIER_PERIOD_MS) },
          }
        : { currentTier: null }),
      creditsBalance: { gte: cost },
    },
    data: { creditsBalance: { decrement: cost } },
  });
  if (count === 0) {
    return { ok: false, reason: 'INSUFFICIENT_CREDITS', balance: status.remaining };
  }
  return { ok: true, balance: Math.max(0, status.remaining - cost) };
}

/** Gives back credits debited for images that were not produced. */
export async function refundCredits(
  prisma: PrismaClient,
  userId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: { creditsBalance: { increment: amount } },
  });
}

/**
 * The answer to a refused debit. `error` (not `code`) is the field
 * lib/api.ts's ApiError.code reads — the frontend switches on it to tell "no
 * plan" apart from "not enough credits" apart from the hourly rate limit, and
 * shows the matching message with a link to the Abonnement page.
 */
export function creditRefusalResponse(
  refusal: Extract<DebitResult, { ok: false }>,
  cost: number,
  requestId: string,
): NextResponse {
  return NextResponse.json(
    {
      error: refusal.reason,
      message:
        refusal.reason === 'INSUFFICIENT_CREDITS'
          ? 'Not enough credits for this request'
          : 'No active plan',
      cost,
      balance: refusal.balance,
    },
    {
      status: refusal.reason === 'INSUFFICIENT_CREDITS' ? 402 : 403,
      headers: { 'x-request-id': requestId },
    },
  );
}

/**
 * Activates or renews a tier — called once an Order actually transitions to
 * PAID (see maketou-reconcile.ts). The balance is SET to the plan's credits
 * and the period restarts now: no carryover of unused credits, consistent
 * with a monthly subscription rather than a cumulative credit system. The
 * one exception: an account with no plan keeps the credits it was given by
 * hand, the plan's credits are added to them (2026-10-17).
 */
export async function activateTier(
  prisma: PrismaClient,
  userId: string,
  tierId: PricingTierId,
): Promise<void> {
  const tier = getPricingTier(tierId);
  if (!tier) throw new Error(`activateTier: unknown tier ${tierId}`);
  const tierPeriodStart = new Date();
  // No plan yet: what was given by hand stays, the plan's credits come on top.
  const first = await prisma.user.updateMany({
    where: { id: userId, currentTier: null },
    data: {
      currentTier: tier.id,
      tierPeriodStart,
      creditsBalance: { increment: tier.creditsPerMonth },
    },
  });
  if (first.count > 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: { currentTier: tier.id, tierPeriodStart, creditsBalance: tier.creditsPerMonth },
  });
}
