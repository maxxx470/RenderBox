import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, type Mock } from 'vitest';
import {
  SUPPORT_HOURLY_LIMIT,
  listThreads,
  postUserMessage,
  readThreadAsAdmin,
  readUserConversation,
  replyAsAdmin,
} from './messages';

const NOW = new Date('2026-10-17T10:00:00.000Z');
const mock = (fn: unknown) => fn as Mock;
const msg = (id: string, fromAdmin: boolean, at: string) => ({
  id,
  fromAdmin,
  body: id,
  createdAt: new Date(at),
  readAt: null,
});

describe('support messages', () => {
  it('a user reads the conversation oldest first, and the team’s answers become read', async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      msg('b', true, '2026-10-17T09:00:00Z'),
      msg('a', false, '2026-10-17T08:00:00Z'),
    ] as never);
    const out = await readUserConversation(prismaMock, 'u1', NOW);
    expect(prismaMock.supportMessage.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', fromAdmin: true, readAt: null },
      data: { readAt: NOW },
    });
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('refuses a message past the hourly limit, without writing', async () => {
    prismaMock.supportMessage.count.mockResolvedValueOnce(SUPPORT_HOURLY_LIMIT);
    expect(await postUserMessage(prismaMock, 'u1', 'Bonjour', NOW)).toEqual({
      kind: 'RATE_LIMITED',
    });
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
    // The hour is counted back from now, on the user's own messages only.
    expect(prismaMock.supportMessage.count).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        fromAdmin: false,
        createdAt: { gte: new Date('2026-10-17T09:00:00.000Z') },
      },
    });
  });

  it('stores a user message as the user’s, never as the team’s', async () => {
    prismaMock.supportMessage.count.mockResolvedValueOnce(0);
    prismaMock.supportMessage.create.mockResolvedValueOnce(
      msg('m1', false, '2026-10-17T10:00:00Z') as never,
    );
    const out = await postUserMessage(prismaMock, 'u1', 'Bonjour', NOW);
    expect(out.kind).toBe('OK');
    expect(prismaMock.supportMessage.create.mock.calls[0]![0]!.data).toEqual({
      userId: 'u1',
      body: 'Bonjour',
      fromAdmin: false,
    });
  });

  it('lists conversations latest first, with the unread count per user', async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      {
        userId: 'u1',
        body: 'old',
        fromAdmin: true,
        createdAt: new Date('2026-10-16T08:00:00Z'),
        user: { name: 'A', email: 'a@x' },
      },
      {
        userId: 'u2',
        body: 'new',
        fromAdmin: false,
        createdAt: new Date('2026-10-17T08:00:00Z'),
        user: { name: null, email: 'b@x' },
      },
    ] as never);
    mock(prismaMock.supportMessage.groupBy).mockResolvedValueOnce([
      { userId: 'u2', _count: { _all: 3 } },
    ] as never);
    const threads = await listThreads(prismaMock);
    expect(threads.map((t) => [t.userId, t.unread])).toEqual([
      ['u2', 3],
      ['u1', 0],
    ]);
  });

  it('an admin opening a conversation marks the user’s messages read; unknown user → null', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect(await readThreadAsAdmin(prismaMock, 'nobody', NOW)).toBeNull();
    expect(prismaMock.supportMessage.updateMany).not.toHaveBeenCalled();

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      name: 'A',
      email: 'a@x',
    } as never);
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([] as never);
    await readThreadAsAdmin(prismaMock, 'u1', NOW);
    expect(prismaMock.supportMessage.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', fromAdmin: false, readAt: null },
      data: { readAt: NOW },
    });
  });

  it('an answer is stored as the team’s, notified to the user and audited, in one transaction', async () => {
    prismaMock.$transaction.mockImplementation(((cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock)) as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.supportMessage.create.mockResolvedValueOnce(
      msg('r1', true, '2026-10-17T10:00:00Z') as never,
    );
    const out = await replyAsAdmin(prismaMock, {
      adminId: 'adm',
      userId: 'u1',
      body: 'Voici la réponse',
    });
    expect(out?.id).toBe('r1');
    expect(prismaMock.supportMessage.create.mock.calls[0]![0]!.data).toEqual({
      userId: 'u1',
      body: 'Voici la réponse',
      fromAdmin: true,
      adminId: 'adm',
    });
    const notif = prismaMock.notification.create.mock.calls[0]![0]!.data;
    expect(notif).toMatchObject({
      userId: 'u1',
      type: 'SUPPORT_REPLY',
      dedupeKey: 'support-reply:r1',
    });
    expect(prismaMock.adminAction.create).toHaveBeenCalled();
  });
});
