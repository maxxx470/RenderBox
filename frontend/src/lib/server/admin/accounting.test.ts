import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { computeAccounting, MONERIZ_FEE_RATE, XOF_PER_USD } from './accounting';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const order = (iso: string, amount: number, provider = 'moneriz') => ({
  amount,
  provider,
  paidAt: new Date(iso),
  createdAt: new Date(iso),
});
const node = (iso: string, engineVersion: string | null, providerCredits: number | null) => ({
  createdAt: new Date(iso),
  engine: 'nanobanana',
  engineVersion,
  providerCredits,
});

describe('computeAccounting — the accounts in /admin', () => {
  it('sets the payments against the provider’s fee and the Kie cost, month by month', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      order('2026-10-02T10:00:00Z', 6_000),
      order('2026-10-15T10:00:00Z', 15_000),
      order('2026-09-20T10:00:00Z', 36_000),
      order('2025-12-01T10:00:00Z', 6_000, 'bictorys'), // last year, unknown provider: no fee booked
    ] as never);
    prismaMock.renderNode.findMany.mockResolvedValueOnce([
      node('2026-10-17T19:00:00Z', 'visio-pro', 18),
      node('2026-10-17T19:02:00Z', 'pixel-2-5', 6),
      node('2026-10-05T10:00:00Z', null, null), // direct engine: cost not recorded
    ] as never);

    const a = await computeAccounting(prismaMock, NOW, []);
    const kie = 24 * 0.005 * XOF_PER_USD; // ≈ 70 FCFA
    // The commission is derived, not written in: it fell from 8 % to 5 %
    // when Moneriz replaced the previous provider on 2026-11-02, and these
    // figures must follow that rate rather than pin an obsolete one.
    const fee = (xof: number) => Math.round(xof * MONERIZ_FEE_RATE);

    expect(a.periods.month).toMatchObject({
      revenueXof: 21_000,
      orders: 2,
      providerFeeXof: fee(21_000),
      kieXof: Math.round(kie),
      kieCredits: 24,
      kieImages: 2,
      directImages: 1,
      expensesXof: Math.round(fee(21_000) + kie),
      resultXof: Math.round(21_000 - fee(21_000) - kie),
    });
    expect(a.periods.lastMonth).toMatchObject({
      revenueXof: 36_000,
      providerFeeXof: fee(36_000),
    });
    expect(a.periods.year.revenueXof).toBe(57_000);
    // 63 000 in all, but the 2025 order is on an unknown provider: its fee
    // is NOT invented, so only the 57 000 of real orders is charged.
    expect(a.periods.all).toMatchObject({
      revenueXof: 63_000,
      providerFeeXof: fee(57_000),
    });
    expect(a.months).toHaveLength(12);
    expect(a.months[0]?.key).toBe('2025-11');
    expect(a.months.at(-1)).toMatchObject({ key: '2026-10', revenueXof: 21_000 });
  });

  it('counts the fixed costs every month from their start, and shows a loss', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([] as never);
    prismaMock.renderNode.findMany.mockResolvedValueOnce([] as never);

    const a = await computeAccounting(prismaMock, NOW, [
      { label: 'Domaine', usdPerMonth: 10, since: '2026-09' },
    ]);
    const monthly = Math.round(10 * XOF_PER_USD);

    expect(a.periods.month.fixedXof).toBe(monthly);
    expect(a.periods.month.resultXof).toBe(-monthly);
    expect(a.periods.all.fixedXof).toBe(Math.round(20 * XOF_PER_USD));
    expect(a.months.at(-3)?.fixedXof).toBe(0); // August: before it started
    expect(a.fixedCosts).toEqual([{ label: 'Domaine', xofPerMonth: monthly }]);
  });
});
