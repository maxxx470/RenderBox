import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, type Mock } from 'vitest';
import { computeInsights } from './insights';

// groupBy's overloaded type hides the mock methods.
const mock = (fn: unknown) => fn as Mock;

const NOW = new Date('2026-10-15T12:00:00.000Z');

describe('computeInsights', () => {
  it('sums, sorts and labels what the overview shows; empty days stay on the chart', async () => {
    prismaMock.user.count
      .mockResolvedValueOnce(12) // total
      .mockResolvedValueOnce(3) // 7 days
      .mockResolvedValueOnce(5) // 30 days
      .mockResolvedValueOnce(8); // onboarded
    mock(prismaMock.user.groupBy)
      .mockResolvedValueOnce([
        { currentTier: 'pro', _count: { _all: 1 } },
        { currentTier: 'standard', _count: { _all: 4 } },
      ] as never)
      .mockResolvedValueOnce([
        { profession: 'architect', _count: { _all: 6 } },
        { profession: null, _count: { _all: 4 } },
      ] as never)
      .mockResolvedValueOnce([{ country: 'Sénégal', _count: { _all: 7 } }] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.renderNode.count.mockResolvedValueOnce(40).mockResolvedValueOnce(300);
    mock(prismaMock.renderNode.groupBy).mockResolvedValueOnce([
      { engine: 'gpt_image', _count: { _all: 10 } },
      { engine: 'nanobanana', _count: { _all: 30 } },
    ] as never);
    prismaMock.order.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 51000 }, _count: { _all: 4 } } as never)
      .mockResolvedValueOnce({ _sum: { amount: null } } as never)
      .mockResolvedValueOnce({ _sum: { amount: 6000 }, _count: { _all: 1 } } as never) // today
      .mockResolvedValueOnce({ _sum: { amount: 21000 }, _count: { _all: 2 } } as never) // week
      .mockResolvedValueOnce({ _sum: { amount: 87000 }, _count: { _all: 7 } } as never); // year
    prismaMock.user.aggregate.mockResolvedValueOnce({ _sum: { creditsBalance: 9000 } } as never);
    prismaMock.user.findMany
      .mockResolvedValueOnce([
        { createdAt: new Date('2026-10-14T09:00:00Z') },
        { createdAt: new Date('2026-10-14T18:00:00Z') },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const i = await computeInsights(prismaMock, NOW);

    // 2026-10-15 is a Thursday: the week began on Monday the 12th (UTC).
    const whereOf = (n: number) =>
      prismaMock.order.aggregate.mock.calls[n]![0]!.where as { OR: { paidAt?: { gte: Date } }[] };
    expect(whereOf(2).OR[0]!.paidAt!.gte.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(whereOf(3).OR[0]!.paidAt!.gte.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(whereOf(4).OR[0]!.paidAt!.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');

    expect(i.users).toEqual({ total: 12, new7d: 3, new30d: 5, onboarded: 8 });
    expect(i.activePlans).toEqual([
      { key: 'standard', count: 4 },
      { key: 'pro', count: 1 },
    ]);
    expect(i.renders).toEqual({
      month: 40,
      total: 300,
      byEngineMonth: [
        { key: 'nanobanana', count: 30 },
        { key: 'gpt_image', count: 10 },
      ],
    });
    expect(i.revenue).toEqual({
      todayXof: 6000,
      weekXof: 21000,
      monthXof: 51000,
      yearXof: 87000,
      totalXof: 0,
      paidOrdersToday: 1,
      paidOrdersWeek: 2,
      paidOrdersMonth: 4,
      paidOrdersYear: 7,
    });
    expect(i.creditsLeft).toBe(9000);
    // Unanswered onboarding questions are not a category.
    expect(i.professions).toEqual([{ key: 'architect', count: 6 }]);
    expect(i.signups30d).toHaveLength(30);
    expect(i.signups30d.at(-1)).toEqual({ key: '2026-10-15', count: 0 });
    expect(i.signups30d.find((d) => d.key === '2026-10-14')?.count).toBe(2);
    expect(i.signups30d.filter((d) => d.count === 0)).toHaveLength(29);
  });
});
