import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { log } from '@/lib/server/observability/log';
import { KieError } from '@/lib/server/generation/engines/kie';

// The API usage of the back-office (2026-10-17, owner: « mets-moi les
// utilisations de mon abonnement API … si c'est en train de finir »): the Kie
// balance, read live from Kie, and what the images cost, read from
// RenderNode.providerCredits (Kie's `creditsConsumed`, stored per image since
// that day — older images have no cost). Kie is a prepaid wallet: no
// subscription, the owner tops it up on kie.ai.

const DAY = 24 * 60 * 60 * 1000;
/** Kie's public price: 200 credits for 1 $ (its pricing page, 2026-10-17). */
export const KIE_USD_PER_CREDIT = 0.005;
/** Below these balances the page warns (≈ 2.5 $ and ≈ 10 $). */
export const KIE_CRITICAL_CREDITS = 500;
export const KIE_LOW_CREDITS = 2_000;

export type ApiUsageLevel = 'unknown' | 'ok' | 'low' | 'critical';

export interface ApiUsage {
  /** KIE_API_KEY is set on the server. */
  configured: boolean;
  /** Credits left on the Kie account; null when unknown. */
  balance: number | null;
  balanceUsd: number | null;
  /** Kie did not answer the balance (network, key refused). */
  balanceError: boolean;
  /** Kie's own reason when it gave no balance: its body code (401 key
   *  refused, 402 no credits, 429 limit…) or null (network, timeout), and its
   *  message. Shown to the admin; never holds the key. */
  balanceProblem: { code: number | null; message: string } | null;
  spent: { today: number; week: number; month: number };
  /** Images made through Kie over 30 days, with and without a known cost. */
  kieImages30d: number;
  pricedImages30d: number;
  /** Images made on the direct engines over 7 days — Kie refused (no
   *  credits, key) or was not set: a sign the balance ran out. */
  directImages7d: number;
  avgPerImage: number | null;
  /** Credits spent per day over the last week (or since costs are known). */
  perDay: number | null;
  daysLeft: number | null;
  level: ApiUsageLevel;
  byVersion30d: { key: string; images: number; credits: number }[];
  daily30d: { key: string; credits: number }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function usageLevel(balance: number | null, daysLeft: number | null): ApiUsageLevel {
  if (balance === null) return 'unknown';
  if (balance < KIE_CRITICAL_CREDITS || (daysLeft !== null && daysLeft < 3)) return 'critical';
  if (balance < KIE_LOW_CREDITS || (daysLeft !== null && daysLeft < 7)) return 'low';
  return 'ok';
}

export async function computeApiUsage(
  prisma: PrismaClient,
  readBalance: () => Promise<number | null>,
  configured: boolean,
  now: Date = new Date(),
): Promise<ApiUsage> {
  const since = new Date(now.getTime() - 30 * DAY);
  const [balanceResult, nodes] = await Promise.all([
    readBalance().then(
      (b) => ({ ok: true as const, b }),
      (err: unknown) => {
        log.warn('admin api usage: kie balance unavailable', {
          error: err instanceof Error ? err.message : String(err),
        });
        const code = err instanceof KieError ? err.code : null;
        const message =
          err instanceof Error && err.name === 'TimeoutError'
            ? 'timeout'
            : err instanceof Error
              ? err.message.slice(0, 200)
              : String(err).slice(0, 200);
        return { ok: false as const, b: null, problem: { code, message } };
      },
    ),
    prisma.renderNode.findMany({
      where: { kind: 'GENERATED', createdAt: { gte: since } },
      select: { createdAt: true, engine: true, engineVersion: true, providerCredits: true },
    }),
  ]);

  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekAgo = now.getTime() - 7 * DAY;
  const spent = { today: 0, week: 0, month: 0 };
  const byVersion = new Map<string, { images: number; credits: number }>();
  const daily = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    daily.set(new Date(startToday - i * DAY).toISOString().slice(0, 10), 0);
  }
  let kieImages = 0;
  let priced = 0;
  let directImages7d = 0;
  let firstPricedWeek: number | null = null;

  for (const n of nodes) {
    const at = n.createdAt.getTime();
    if (!n.engineVersion) {
      if (n.engine && at >= weekAgo) directImages7d++;
      continue;
    }
    kieImages++;
    const v = byVersion.get(n.engineVersion) ?? { images: 0, credits: 0 };
    v.images++;
    if (n.providerCredits !== null) {
      const c = n.providerCredits;
      priced++;
      v.credits += c;
      spent.month += c;
      if (at >= weekAgo) {
        spent.week += c;
        firstPricedWeek = firstPricedWeek === null ? at : Math.min(firstPricedWeek, at);
      }
      if (at >= startToday) spent.today += c;
      const day = n.createdAt.toISOString().slice(0, 10);
      if (daily.has(day)) daily.set(day, (daily.get(day) ?? 0) + c);
    }
    byVersion.set(n.engineVersion, v);
  }

  // The pace: the week's spend over the days it covers — fewer than 7 while
  // the costs have been stored for less than a week (at least one day).
  const days =
    firstPricedWeek === null
      ? 7
      : Math.min(7, Math.max(1, (now.getTime() - firstPricedWeek) / DAY));
  const perDay = spent.week > 0 ? spent.week / days : null;
  const balance = balanceResult.b;
  const daysLeft = balance !== null && perDay ? balance / perDay : null;

  return {
    configured,
    balance,
    balanceUsd: balance === null ? null : round(balance * KIE_USD_PER_CREDIT),
    balanceError: configured && !balanceResult.ok,
    balanceProblem: balanceResult.ok ? null : balanceResult.problem,
    spent: { today: round(spent.today), week: round(spent.week), month: round(spent.month) },
    kieImages30d: kieImages,
    pricedImages30d: priced,
    directImages7d,
    avgPerImage: priced > 0 ? round(spent.month / priced) : null,
    perDay: perDay === null ? null : round(perDay),
    daysLeft: daysLeft === null ? null : Math.round(daysLeft * 10) / 10,
    level: usageLevel(balance, daysLeft),
    byVersion30d: [...byVersion.entries()]
      .map(([key, v]) => ({ key, images: v.images, credits: round(v.credits) }))
      .sort((a, b) => b.images - a.images),
    daily30d: [...daily.entries()].map(([key, credits]) => ({ key, credits: round(credits) })),
  };
}
