// What the RenderPro back-office overview shows (owner, 2026-10-15: « crée
// l'espace admin »): who signs up, who pays, what is rendered and with which
// engine, and what the onboarding tells about the users. Computed at request
// time from aggregate queries — admin traffic is tiny.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

const DAY = 24 * 60 * 60 * 1000;
// A plan lasts 30 days from tierPeriodStart (tier-quota.ts).
const TIER_PERIOD_MS = 30 * DAY;

export interface Count {
  key: string;
  count: number;
}

export interface AdminInsights {
  users: { total: number; new7d: number; new30d: number; onboarded: number };
  /** Accounts whose plan period is still running, per plan. */
  activePlans: Count[];
  renders: { month: number; total: number; byEngineMonth: Count[] };
  /** PAID orders, in FCFA, over today, this week (since Monday), this month,
   *  this year and in all — UTC days (owner, 2026-10-17). */
  revenue: {
    todayXof: number;
    weekXof: number;
    monthXof: number;
    yearXof: number;
    totalXof: number;
    paidOrdersToday: number;
    paidOrdersWeek: number;
    paidOrdersMonth: number;
    paidOrdersYear: number;
  };
  creditsLeft: number;
  /** Sign-ups per day over the last 30 days, oldest first (ISO date keys). */
  signups30d: Count[];
  professions: Count[];
  countries: Count[];
  referrals: Count[];
  recentUsers: {
    id: string;
    name: string | null;
    email: string;
    profession: string | null;
    country: string | null;
    currentTier: string | null;
    createdAt: Date;
  }[];
}

const byCount = (a: Count, b: Count) => b.count - a.count || a.key.localeCompare(b.key);

/** Prisma groupBy rows → sorted counts, NULL keys dropped. */
function counts<K extends string>(
  rows: ({ _count: { _all: number } } & Record<K, string | null>)[] | undefined,
  key: K,
  top?: number,
): Count[] {
  const out = (rows ?? [])
    .filter((r) => r[key])
    .map((r) => ({ key: r[key] as string, count: r._count._all }))
    .sort(byCount);
  return top ? out.slice(0, top) : out;
}

export async function computeInsights(
  prisma: PrismaClient,
  now = new Date(),
): Promise<AdminInsights> {
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // The week starts on Monday.
  const startOfWeek = new Date(startOfDay.getTime() - ((startOfDay.getUTCDay() + 6) % 7) * DAY);
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  // A payment counts on the day it was paid (createdAt for the rare older row without paidAt).
  const paidSince = (from: Date) => ({
    status: 'PAID',
    OR: [{ paidAt: { gte: from } }, { paidAt: null, createdAt: { gte: from } }],
  });
  const since7 = new Date(now.getTime() - 7 * DAY);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const live = { deletedAt: null };

  const [
    total,
    new7d,
    new30d,
    onboarded,
    plans,
    rendersMonth,
    rendersTotal,
    engines,
    revenueMonth,
    revenueTotal,
    revenueToday,
    revenueWeek,
    revenueYear,
    credits,
    recentSignups,
    professions,
    countries,
    referrals,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count({ where: live }),
    prisma.user.count({ where: { ...live, createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { ...live, createdAt: { gte: since30 } } }),
    prisma.user.count({ where: { ...live, onboardedAt: { not: null } } }),
    prisma.user.groupBy({
      by: ['currentTier'],
      where: {
        ...live,
        currentTier: { not: null },
        tierPeriodStart: { gt: new Date(now.getTime() - TIER_PERIOD_MS) },
      },
      _count: { _all: true },
    }),
    prisma.renderNode.count({ where: { kind: 'GENERATED', createdAt: { gte: startOfMonth } } }),
    prisma.renderNode.count({ where: { kind: 'GENERATED' } }),
    prisma.renderNode.groupBy({
      by: ['engine'],
      where: { kind: 'GENERATED', createdAt: { gte: startOfMonth } },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: paidSince(startOfMonth),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    prisma.order.aggregate({
      where: paidSince(startOfDay),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: paidSince(startOfWeek),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: paidSince(startOfYear),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.user.aggregate({ where: live, _sum: { creditsBalance: true } }),
    prisma.user.findMany({
      where: { ...live, createdAt: { gte: since30 } },
      select: { createdAt: true },
    }),
    prisma.user.groupBy({ by: ['profession'], where: live, _count: { _all: true } }),
    prisma.user.groupBy({ by: ['country'], where: live, _count: { _all: true } }),
    prisma.user.groupBy({ by: ['referralSource'], where: live, _count: { _all: true } }),
    prisma.user.findMany({
      where: live,
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        name: true,
        email: true,
        profession: true,
        country: true,
        currentTier: true,
        createdAt: true,
      },
    }),
  ]);

  // One bar per day, empty days included, so the chart has no holes.
  const perDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    perDay.set(new Date(now.getTime() - i * DAY).toISOString().slice(0, 10), 0);
  }
  for (const u of recentSignups ?? []) {
    const k = u.createdAt.toISOString().slice(0, 10);
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  return {
    users: { total, new7d, new30d, onboarded },
    activePlans: counts(plans as never, 'currentTier'),
    renders: {
      month: rendersMonth,
      total: rendersTotal,
      byEngineMonth: counts(engines as never, 'engine'),
    },
    revenue: {
      todayXof: revenueToday?._sum.amount ?? 0,
      weekXof: revenueWeek?._sum.amount ?? 0,
      monthXof: revenueMonth?._sum.amount ?? 0,
      yearXof: revenueYear?._sum.amount ?? 0,
      totalXof: revenueTotal?._sum.amount ?? 0,
      paidOrdersToday: revenueToday?._count._all ?? 0,
      paidOrdersWeek: revenueWeek?._count._all ?? 0,
      paidOrdersMonth: revenueMonth?._count._all ?? 0,
      paidOrdersYear: revenueYear?._count._all ?? 0,
    },
    creditsLeft: credits?._sum.creditsBalance ?? 0,
    signups30d: [...perDay].map(([key, count]) => ({ key, count })),
    professions: counts(professions as never, 'profession'),
    countries: counts(countries as never, 'country', 10),
    referrals: counts(referrals as never, 'referralSource'),
    recentUsers: recentUsers ?? [],
  };
}
