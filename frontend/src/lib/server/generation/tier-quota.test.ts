import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkTierQuota, recordTierUsage, activateTier } from './tier-quota';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkTierQuota', () => {
  it('refuses with NO_ACTIVE_TIER when the user has never paid', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: null,
      tierPeriodStart: null,
      generationsUsedInPeriod: 0,
    } as never);

    const result = await checkTierQuota(prismaMock, 'user-1');
    expect(result).toEqual({
      allowed: false,
      reason: 'NO_ACTIVE_TIER',
      tier: null,
      max: null,
      remaining: null,
    });
  });

  it('refuses with TIER_EXPIRED and resets the tier when the period lapsed (>= 30 days)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: 'standard',
      tierPeriodStart: new Date('2026-05-15T00:00:00.000Z'), // exactly 31 days ago
      generationsUsedInPeriod: 10,
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const result = await checkTierQuota(prismaMock, 'user-1');
    expect(result).toEqual({
      allowed: false,
      reason: 'TIER_EXPIRED',
      tier: null,
      max: null,
      remaining: null,
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentTier: null, tierPeriodStart: null, generationsUsedInPeriod: 0 },
    });
  });

  it('refuses with QUOTA_EXCEEDED once generationsUsedInPeriod reaches the tier max', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: 'decouverte', // max 30
      tierPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      generationsUsedInPeriod: 30,
    } as never);

    const result = await checkTierQuota(prismaMock, 'user-1');
    expect(result).toEqual({
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      tier: 'decouverte',
      max: 30,
      remaining: 0,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('allows and reports remaining when quota is not yet reached', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: 'standard', // max 100
      tierPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      generationsUsedInPeriod: 58,
    } as never);

    const result = await checkTierQuota(prismaMock, 'user-1');
    expect(result).toEqual({ allowed: true, tier: 'standard', max: 100, remaining: 42 });
  });

  it('refuses a multi-count request that would overshoot the remaining quota', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      currentTier: 'decouverte', // max 30
      tierPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      generationsUsedInPeriod: 28,
    } as never);

    const result = await checkTierQuota(prismaMock, 'user-1', 4);
    expect(result).toEqual({
      allowed: false,
      reason: 'QUOTA_EXCEEDED',
      tier: 'decouverte',
      max: 30,
      remaining: 2,
    });
  });
});

describe('recordTierUsage', () => {
  it('increments generationsUsedInPeriod by count', async () => {
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    await recordTierUsage(prismaMock, 'user-1', 3);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { generationsUsedInPeriod: { increment: 3 } },
    });
  });

  it('is a no-op for count <= 0', async () => {
    await recordTierUsage(prismaMock, 'user-1', 0);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('activateTier', () => {
  it('sets currentTier, resets tierPeriodStart to now, and zeroes generationsUsedInPeriod', async () => {
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    await activateTier(prismaMock, 'user-1', 'pro');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        currentTier: 'pro',
        tierPeriodStart: new Date('2026-06-15T00:00:00.000Z'),
        generationsUsedInPeriod: 0,
      },
    });
  });

  it('a renewal before expiry extends the period rather than stacking (no carryover)', async () => {
    // Simulate: user already on "standard" with 40 used, buys "standard"
    // again mid-period. activateTier always resets usage to 0 and moves the
    // period start to now — it never adds to the existing counters.
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    await activateTier(prismaMock, 'user-1', 'standard');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        currentTier: 'standard',
        tierPeriodStart: new Date('2026-06-15T00:00:00.000Z'),
        generationsUsedInPeriod: 0,
      },
    });
  });
});
