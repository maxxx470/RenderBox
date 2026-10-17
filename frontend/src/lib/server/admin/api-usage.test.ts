import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { computeApiUsage, usageLevel } from './api-usage';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const node = (days: number, engineVersion: string | null, providerCredits: number | null) => ({
  createdAt: ago(days),
  engine: engineVersion?.startsWith('pixel') ? 'gpt_image' : 'nanobanana',
  engineVersion,
  providerCredits,
});

describe('computeApiUsage — the Kie usage in /admin', () => {
  it('sums the costs, gives the pace and the days the balance lasts', async () => {
    prismaMock.renderNode.findMany.mockResolvedValueOnce([
      node(0.1, 'visio-pro', 24), // today
      node(2, 'pixel-2-5', 12),
      node(6, 'visio-pro', 18),
      node(20, 'visio-pro', 18), // in the month, not the week
      node(3, 'visio-pro', null), // made on Kie before costs were stored
      node(1, null, null), // the direct engine: Kie refused
    ] as never);

    const usage = await computeApiUsage(prismaMock, async () => 540, true, NOW);

    expect(usage.balance).toBe(540);
    expect(usage.balanceUsd).toBe(2.7);
    expect(usage.spent).toEqual({ today: 24, week: 54, month: 72 });
    expect(usage.kieImages30d).toBe(5);
    expect(usage.pricedImages30d).toBe(4);
    expect(usage.directImages7d).toBe(1);
    expect(usage.avgPerImage).toBe(18);
    // 54 credits over the 6 days since the first cost of the week.
    expect(usage.perDay).toBe(9);
    expect(usage.daysLeft).toBe(60);
    expect(usage.level).toBe('low'); // 540 < 2 000 credits
    expect(usage.byVersion30d[0]).toEqual({ key: 'visio-pro', images: 4, credits: 60 });
    expect(usage.daily30d).toHaveLength(30);
    expect(usage.daily30d.at(-1)).toEqual({ key: '2026-10-20', credits: 24 });
  });

  it('still answers when Kie does not give the balance', async () => {
    prismaMock.renderNode.findMany.mockResolvedValueOnce([] as never);
    const usage = await computeApiUsage(
      prismaMock,
      async () => {
        throw new Error('kie down');
      },
      true,
      NOW,
    );
    expect(usage.balance).toBeNull();
    expect(usage.balanceError).toBe(true);
    expect(usage.level).toBe('unknown');
    expect(usage.daysLeft).toBeNull();
  });

  it('warns by balance or by days left', () => {
    expect(usageLevel(null, null)).toBe('unknown');
    expect(usageLevel(400, null)).toBe('critical');
    expect(usageLevel(50_000, 2)).toBe('critical');
    expect(usageLevel(1_500, 30)).toBe('low');
    expect(usageLevel(50_000, 5)).toBe('low');
    expect(usageLevel(50_000, 30)).toBe('ok');
  });
});
