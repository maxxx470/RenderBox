// Gate #2 for AI generation — the REAL, paid monthly quota (30/100/300 per
// tier, see lib/pricing-tiers.ts). Fully independent of
// rate-limit-generation.ts's hourly/daily anti-abuse cap: both gates must
// pass before an engine call is made, and neither replaces the other (see
// CLAUDE.md "Modèle de tarification").
//
// Lazy by design — expiry is detected and cleared the moment a user tries to
// generate (or loads a page that displays their quota), never by a cron
// sweeping every account.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';

const TIER_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type TierQuotaReason = 'NO_ACTIVE_TIER' | 'TIER_EXPIRED' | 'QUOTA_EXCEEDED';

export interface TierQuotaResult {
  allowed: boolean;
  reason?: TierQuotaReason;
  /** Which tier is active, or null (no active tier). */
  tier: PricingTierId | null;
  /** The tier's monthly quota, or null when there's no active tier. */
  max: number | null;
  /** Generations left in the current period, or null when there's no active tier. */
  remaining: number | null;
  /**
   * When the current period ends, or null when there's no active tier.
   *
   * Returned here rather than re-read by callers: this function already loads
   * `tierPeriodStart`, and on a `connection_limit=1` pooled connection every
   * extra query is a serialized round trip to the database, not a parallel
   * one. It is also the only place that knows whether the period is still
   * valid — a caller reading the column itself could show a lapsed date.
   */
  periodEndsAt: Date | null;
}

/**
 * Checks (and, on the display-only `count: 0` path, also surfaces) the
 * user's real paid quota. `count` is how many generations this attempt would
 * consume (1 for a standard render, N for an N-variant edit) — pass 0 from a
 * page load to read status only, with no effect on the allowed/not-allowed
 * outcome beyond the tier-active / expired checks.
 */
export async function checkTierQuota(
  prisma: PrismaClient,
  userId: string,
  count = 1,
): Promise<TierQuotaResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentTier: true, tierPeriodStart: true, generationsUsedInPeriod: true },
  });

  if (!user?.currentTier) {
    return {
      allowed: false,
      reason: 'NO_ACTIVE_TIER',
      tier: null,
      max: null,
      remaining: null,
      periodEndsAt: null,
    };
  }

  const tier = getPricingTier(user.currentTier);
  if (!tier) {
    // Defensive — currentTier holds a value pricing-tiers.ts no longer
    // recognizes (e.g. a retired tier id). Treat exactly like no active tier.
    return {
      allowed: false,
      reason: 'NO_ACTIVE_TIER',
      tier: null,
      max: null,
      remaining: null,
      periodEndsAt: null,
    };
  }

  if (!user.tierPeriodStart || Date.now() - user.tierPeriodStart.getTime() >= TIER_PERIOD_MS) {
    // Period lapsed without a renewal — no "grace" generation even if the
    // old period had unused headroom left.
    await prisma.user.update({
      where: { id: userId },
      data: { currentTier: null, tierPeriodStart: null, generationsUsedInPeriod: 0 },
    });
    return {
      allowed: false,
      reason: 'TIER_EXPIRED',
      tier: null,
      max: null,
      remaining: null,
      periodEndsAt: null,
    };
  }

  const periodEndsAt = new Date(user.tierPeriodStart.getTime() + TIER_PERIOD_MS);
  const remaining = tier.generationsPerMonth - user.generationsUsedInPeriod;
  if (remaining < count) {
    return {
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      tier: tier.id,
      max: tier.generationsPerMonth,
      remaining: Math.max(0, remaining),
      periodEndsAt,
    };
  }

  return { allowed: true, tier: tier.id, max: tier.generationsPerMonth, remaining, periodEndsAt };
}

/**
 * Records N successful generations against the current period. Call this
 * AFTER the engine call(s) succeeded — never before, never for a failed or
 * partially-failed batch's failed variants. A 4-variant edit where only 3
 * variants actually produced + uploaded a RenderNode decrements by 3, not 4.
 */
export async function recordTierUsage(
  prisma: PrismaClient,
  userId: string,
  count = 1,
): Promise<void> {
  if (count <= 0) return;
  await prisma.user.update({
    where: { id: userId },
    data: { generationsUsedInPeriod: { increment: count } },
  });
}

/**
 * Activates or renews a tier — called once an Order actually transitions to
 * PAID (see maketou-reconcile.ts). A renewal before the current period
 * expires extends the period from now() rather than stacking: no carryover
 * of unused generations across periods, consistent with a monthly
 * subscription model rather than a cumulative credit system.
 */
export async function activateTier(
  prisma: PrismaClient,
  userId: string,
  tier: PricingTierId,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { currentTier: tier, tierPeriodStart: new Date(), generationsUsedInPeriod: 0 },
  });
}
