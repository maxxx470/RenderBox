import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { purgeDeletedAccounts } from './soft-delete';

describe('purgeDeletedAccounts', () => {
  it('hard-deletes candidates past the grace window', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }] as never);
    prismaMock.user.delete.mockResolvedValue({} as never);

    const result = await purgeDeletedAccounts({ prisma: prismaMock, graceDays: 30 });

    expect(result).toEqual({ purged: 2, skipped: 0 });
    expect(prismaMock.user.delete).toHaveBeenCalledTimes(2);
    const whereArg = prismaMock.user.findMany.mock.calls[0]![0]!.where as {
      deletedAt: { lt: Date };
    };
    expect(whereArg.deletedAt.lt).toBeInstanceOf(Date);
  });

  it('returns { purged: 0, skipped: 0 } with no candidates (no delete calls)', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([] as never);
    const result = await purgeDeletedAccounts({ prisma: prismaMock });
    expect(result).toEqual({ purged: 0, skipped: 0 });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('skips (does not throw) a row that fails with FK restrict P2003', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }] as never);
    prismaMock.user.delete
      .mockRejectedValueOnce(Object.assign(new Error('FK restrict'), { code: 'P2003' }))
      .mockResolvedValueOnce({} as never);

    const result = await purgeDeletedAccounts({ prisma: prismaMock });
    expect(result).toEqual({ purged: 1, skipped: 1 });
  });

  it('re-throws an unrelated error', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: 'u1' }] as never);
    prismaMock.user.delete.mockRejectedValueOnce(new Error('boom'));
    await expect(purgeDeletedAccounts({ prisma: prismaMock })).rejects.toThrow('boom');
  });

  it('uses batchSize as the findMany take', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([] as never);
    await purgeDeletedAccounts({ prisma: prismaMock, batchSize: 42 });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 42 }));
  });
});
