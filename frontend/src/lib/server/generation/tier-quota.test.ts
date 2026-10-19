import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCreditStatus,
  debitCredits,
  refundCredits,
  activateTier,
  creditRefusalResponse,
} from './tier-quota';

const NOW = new Date('2026-06-15T00:00:00.000Z');
const CUTOFF = new Date('2026-05-16T00:00:00.000Z'); // NOW − 30 days

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const activeUser = (tier: string, creditsBalance: number) =>
  ({
    currentTier: tier,
    tierPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
    creditsBalance,
  }) as never;

describe('credits given without a plan', () => {
  it('shows them and lets them be spent, with no end date', async () => {
    const planless = { currentTier: null, tierPeriodStart: null, creditsBalance: 100 };
    prismaMock.user.findUnique.mockResolvedValueOnce(planless as never);
    const status = await getCreditStatus(prismaMock, 'user-1');
    expect(status).toMatchObject({ tier: null, max: null, remaining: 100, periodEndsAt: null });
    expect(status.reason).toBeUndefined();

    prismaMock.user.findUnique.mockResolvedValueOnce(planless as never);
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    expect(await debitCredits(prismaMock, 'user-1', 50)).toEqual({ ok: true, balance: 50 });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', currentTier: null, creditsBalance: { gte: 50 } },
      data: { creditsBalance: { decrement: 50 } },
    });
  });
});

describe('getCreditStatus', () => {
  it('reports NO_ACTIVE_TIER when the user has never paid', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: null,
      tierPeriodStart: null,
      creditsBalance: 0,
    } as never);

    expect(await getCreditStatus(prismaMock, 'user-1')).toEqual({
      onboarded: false,
      engineVersions: { nanobanana: 'visio-3', gpt_image: 'pixel-2-5' },
      infoSince: null,
      reason: 'NO_ACTIVE_TIER',
      tier: null,
      max: null,
      remaining: null,
      periodEndsAt: null,
    });
  });

  it('counts Info news from the last visit, or from the sign-up when the page was never opened', async () => {
    const createdAt = new Date('2026-10-01T00:00:00.000Z');
    const infoSeenAt = new Date('2026-10-15T09:00:00.000Z');
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: null,
      createdAt,
      infoSeenAt: null,
    } as never);
    expect((await getCreditStatus(prismaMock, 'user-1')).infoSince).toEqual(createdAt);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: null,
      createdAt,
      infoSeenAt,
    } as never);
    expect((await getCreditStatus(prismaMock, 'user-1')).infoSince).toEqual(infoSeenAt);
  });

  it('treats a retired tier id like no tier', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(activeUser('gold', 500));
    expect((await getCreditStatus(prismaMock, 'user-1')).reason).toBe('NO_ACTIVE_TIER');
  });

  it('expires the plan and its unused credits once the period lapsed (>= 30 days), lazily', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: 'standard',
      tierPeriodStart: new Date('2026-05-15T00:00:00.000Z'), // 31 days ago
      creditsBalance: 1200,
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    expect(await getCreditStatus(prismaMock, 'user-1')).toEqual({
      onboarded: false,
      engineVersions: { nanobanana: 'visio-3', gpt_image: 'pixel-2-5' },
      infoSince: null,
      reason: 'TIER_EXPIRED',
      tier: null,
      max: null,
      remaining: null,
      periodEndsAt: null,
    });
    // No carryover: the balance goes to 0 with the plan.
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentTier: null, tierPeriodStart: null, creditsBalance: 0 },
    });
  });

  it('reports the balance, the monthly credits and the expiry date of an active plan', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(activeUser('standard', 2350));

    expect(await getCreditStatus(prismaMock, 'user-1')).toEqual({
      onboarded: false,
      engineVersions: { nanobanana: 'visio-3', gpt_image: 'pixel-2-5' },
      infoSince: null,
      tier: 'standard',
      max: 3000,
      remaining: 2350,
      // 30 days after tierPeriodStart — shown as the credits' expiry date.
      periodEndsAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('debitCredits', () => {
  it('debits atomically: one conditional UPDATE that only passes if the balance covers the cost', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(activeUser('decouverte', 1000));
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

    expect(await debitCredits(prismaMock, 'user-1', 50)).toEqual({ ok: true, balance: 950 });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        currentTier: 'decouverte',
        tierPeriodStart: { gt: CUTOFF },
        creditsBalance: { gte: 50 },
      },
      data: { creditsBalance: { decrement: 50 } },
    });
    // Never a read-then-write: no plain update of the balance.
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('a 4K render costs 70', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(activeUser('pro', 8000));
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });

    expect(await debitCredits(prismaMock, 'user-1', 70)).toEqual({ ok: true, balance: 7930 });
    expect(prismaMock.user.updateMany.mock.calls[0]?.[0]?.data).toEqual({
      creditsBalance: { decrement: 70 },
    });
  });

  it('refuses with INSUFFICIENT_CREDITS when the conditional UPDATE matches no row (balance too low)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(activeUser('decouverte', 40));
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await debitCredits(prismaMock, 'user-1', 50)).toEqual({
      ok: false,
      reason: 'INSUFFICIENT_CREDITS',
      balance: 40,
    });
  });

  it('of two quick clicks with credits for one, the second is refused (the database arbitrates)', async () => {
    // Both read 50 left; PostgreSQL applies the first UPDATE, then re-checks
    // "creditsBalance >= 50" for the second against the new row: 0 rows.
    prismaMock.user.findUnique
      .mockResolvedValueOnce(activeUser('decouverte', 50))
      .mockResolvedValueOnce(activeUser('decouverte', 50));
    prismaMock.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [a, b] = await Promise.all([
      debitCredits(prismaMock, 'user-1', 50),
      debitCredits(prismaMock, 'user-1', 50),
    ]);
    expect([a.ok, b.ok]).toEqual([true, false]);
    expect(b).toMatchObject({ reason: 'INSUFFICIENT_CREDITS' });
  });

  it('refuses with NO_ACTIVE_TIER / TIER_EXPIRED without touching the balance', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: null,
      tierPeriodStart: null,
      creditsBalance: 0,
    } as never);
    expect(await debitCredits(prismaMock, 'user-1', 50)).toEqual({
      ok: false,
      reason: 'NO_ACTIVE_TIER',
      balance: null,
    });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: 'pro',
      tierPeriodStart: new Date('2026-05-01T00:00:00.000Z'),
      creditsBalance: 5000,
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    expect(await debitCredits(prismaMock, 'user-1', 50)).toEqual({
      ok: false,
      reason: 'TIER_EXPIRED',
      balance: null,
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('a zero cost (the free assistant) debits nothing but still needs a plan', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(activeUser('standard', 300));
    expect(await debitCredits(prismaMock, 'user-1', 0)).toEqual({ ok: true, balance: 300 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('refundCredits', () => {
  it('gives the credits back', async () => {
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    await refundCredits(prismaMock, 'user-1', 150);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { creditsBalance: { increment: 150 } },
    });
  });

  it('is a no-op for nothing owed', async () => {
    await refundCredits(prismaMock, 'user-1', 0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('creditRefusalResponse', () => {
  it('402 for missing credits, with the cost and the balance', async () => {
    const res = creditRefusalResponse(
      { ok: false, reason: 'INSUFFICIENT_CREDITS', balance: 40 },
      70,
      'req-1',
    );
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({
      error: 'INSUFFICIENT_CREDITS',
      cost: 70,
      balance: 40,
    });
  });

  it('403 without a plan', async () => {
    const res = creditRefusalResponse(
      { ok: false, reason: 'NO_ACTIVE_TIER', balance: null },
      50,
      'r',
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('NO_ACTIVE_TIER');
  });
});

describe('activateTier', () => {
  it('a first plan starts now and adds its credits to those given by hand', async () => {
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    await activateTier(prismaMock, 'user-1', 'pro');
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', currentTier: null },
      data: { currentTier: 'pro', tierPeriodStart: NOW, creditsBalance: { increment: 8000 } },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('a renewal SETS the balance to the plan’s credits — no carryover, no stacking', async () => {
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    await activateTier(prismaMock, 'user-1', 'decouverte');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentTier: 'decouverte', tierPeriodStart: NOW, creditsBalance: 1000 },
    });
  });
});
