import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const { mockAccounting } = vi.hoisted(() => ({ mockAccounting: vi.fn() }));
vi.mock('./accounting', () => ({ computeAccounting: mockAccounting }));

import {
  computeKieStock,
  coverageLevel,
  readStockBalance,
  stockRefusal,
  stockRoom,
} from './kie-stock';

const ALL = { revenueXof: 36000, kieXof: 300, kieCredits: 100, maketouFeeXof: 2880 };

beforeEach(() => {
  mockAccounting.mockResolvedValue({ periods: { all: ALL } });
  prismaMock.user.aggregate.mockResolvedValue({
    _sum: { creditsBalance: 4000 },
    _count: { _all: 2 },
  } as never);
  prismaMock.kieTopUp.findMany.mockResolvedValue([] as never);
  prismaMock.user.findUnique.mockResolvedValue({ creditsBalance: 3000 } as never);
});

describe('coverageLevel', () => {
  it('red under 100 %, orange under 120 %, green above — and green when nothing is held', () => {
    expect(coverageLevel(0.99)).toBe('red');
    expect(coverageLevel(1)).toBe('orange');
    expect(coverageLevel(1.19)).toBe('orange');
    expect(coverageLevel(1.2)).toBe('green');
    expect(coverageLevel(null)).toBe('green');
  });
});

describe('computeKieStock', () => {
  it('compares the live Kie balance with the credits the accounts hold, in the same unit', async () => {
    const s = await computeKieStock(prismaMock, async () => 4400, true);
    expect(s.balance).toBe(4400);
    expect(s.balanceUsd).toBeCloseTo(22, 10);
    expect(s.balanceXof).toBe(13200);
    expect(s.circulation).toBe(4000);
    // the demo account's share is shown, and still counted in the circulation
    expect(s.demoCredits).toBe(3000);
    expect(s.coverage).toBeCloseTo(1.1, 10);
    expect(s.level).toBe('orange');
  });

  it('estimates the images left with every offered engine × size', async () => {
    const s = await computeKieStock(prismaMock, async () => 160, true);
    const row = (engine: string, r: string) =>
      s.imagesLeft.find((x) => x.engine === engine && x.resolution === r)?.images;
    expect(row('nanobanana', '1k')).toBe(40);
    expect(row('gpt_image', '4k')).toBe(10);
  });

  it('the finances: revenue less the Kie cost and Maketou, and the margin', async () => {
    const s = await computeKieStock(prismaMock, async () => 1000, true);
    expect(s.finances).toEqual({
      revenueXof: 36000,
      kieCreditsConsumed: 100,
      kieCostXof: 300,
      maketouFeeXof: 2880,
      profitXof: 32820,
      margin: 32820 / 36000,
    });
  });

  it('each plan’s guaranteed margin comes from the constants', async () => {
    const s = await computeKieStock(prismaMock, async () => 1000, true);
    expect(
      s.plans.map((p) => [p.id, Math.round(p.gross * 1000) / 10, Math.round(p.net * 1000) / 10]),
    ).toEqual([
      ['decouverte', 74.6, 66.6],
      ['standard', 69.8, 61.8],
      ['pro', 66.6, 58.6],
    ]);
  });

  it('an unreadable balance is never invented: unknown, and red while credits are held', async () => {
    const s = await computeKieStock(
      prismaMock,
      async () => {
        throw new Error('down');
      },
      true,
    );
    expect(s.balance).toBeNull();
    expect(s.coverage).toBeNull();
    expect(s.level).toBe('red');
    expect(s.imagesLeft.every((r) => r.images === null)).toBe(true);
  });
});

// The room a hand-given credit has to fit in (2026-10-26, owner).
describe('the room in the stock', () => {
  it('reads Kie only when there is an account to read', async () => {
    expect(await readStockBalance(false, async () => 500)).toEqual({ kind: 'open' });
    expect(await readStockBalance(true, async () => 500)).toEqual({ kind: 'known', balance: 500 });
    expect(
      await readStockBalance(true, async () => {
        throw new Error('down');
      }),
    ).toEqual({ kind: 'unknown' });
    // No key: Kie answers null rather than throwing.
    expect(await readStockBalance(true, async () => null)).toEqual({ kind: 'unknown' });
  });

  it('is the balance less what the accounts already hold', () => {
    expect(stockRoom({ kind: 'known', balance: 10_000 }, 7_000)).toBe(3_000);
    expect(stockRoom({ kind: 'unknown' }, 7_000)).toBeNull();
    expect(stockRoom({ kind: 'open' }, 7_000)).toBeNull();
  });

  it('lets a gift through up to the room, and refuses beyond it', () => {
    const known = { kind: 'known' as const, balance: 10_000 };
    expect(stockRefusal(known, 3_000, 7_000)).toBeNull();
    expect(stockRefusal(known, 3_001, 7_000)).toEqual({
      error: 'STOCK_TOO_LOW',
      requested: 3_001,
      room: 3_000,
      balance: 10_000,
      circulation: 7_000,
    });
  });

  it('refuses rather than guessing when the balance is unknown, and never without an account', () => {
    expect(stockRefusal({ kind: 'unknown' }, 10, 0)).toEqual({ error: 'STOCK_UNKNOWN' });
    expect(stockRefusal({ kind: 'open' }, 10_000, 0)).toBeNull();
  });

  it('taking credits back is always allowed: it gives room back', () => {
    // The circulation falls by what was removed, so the room rises by as much.
    const known = { kind: 'known' as const, balance: 1_000 };
    expect(stockRefusal(known, -500, 5_000)).toBeNull();
    expect(stockRoom(known, 5_000)).toBe(-4_000);
    expect(stockRoom(known, 4_500)).toBe(-3_500);
  });
});
