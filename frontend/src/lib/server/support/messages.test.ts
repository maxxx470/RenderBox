import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, type Mock } from 'vitest';
import {
  SUPPORT_HOURLY_LIMIT,
  SUPPORT_KEEP_AFTER_ANSWER_MS,
  listPendingMessages,
  listThreads,
  pendingMessagesCsv,
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

  it('reading the panel first deletes exchanges answered over a day ago, and clears the bell', async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([] as never);
    await readUserConversation(prismaMock, 'u1', NOW);
    const purge = mock(prismaMock.$executeRaw).mock.calls[0]!;
    expect(String(purge[0])).toMatch(/DELETE FROM "SupportMessage"/);
    expect(purge[1]).toEqual(new Date(NOW.getTime() - SUPPORT_KEEP_AFTER_ANSWER_MS));
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', type: 'SUPPORT_REPLY', readAt: null },
      data: { readAt: NOW },
    });
  });

  it('the export keeps only the messages sent after the team’s last answer, read or not', async () => {
    const um = (id: string, userId: string, at: string, read = false) => ({
      id,
      userId,
      body: id,
      createdAt: new Date(at),
      readAt: read ? NOW : null,
      user: { id: userId, name: null, email: userId + '@x' },
    });
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      um('answered', 'u1', '2026-10-17T07:00:00Z'),
      um('waiting-read', 'u1', '2026-10-17T09:00:00Z', true),
      um('never-answered', 'u2', '2026-10-17T06:00:00Z'),
    ] as never);
    mock(prismaMock.supportMessage.groupBy).mockResolvedValueOnce([
      { userId: 'u1', _max: { createdAt: new Date('2026-10-17T08:00:00Z') } },
    ] as never);
    const out = await listPendingMessages(prismaMock, NOW);
    expect(out.map((m) => m.id)).toEqual(['waiting-read', 'never-answered']);
  });

  it('the CSV opens in Excel with its accents and runs no formula', () => {
    const csv = pendingMessagesCsv([
      {
        id: 'm',
        createdAt: new Date('2026-10-17T09:00:00Z'),
        body: '=HYPERLINK("x") « été »',
        readAt: null,
        user: { id: 'u', name: 'Awa', email: 'a@x' },
      },
    ]);
    expect(
      csv.startsWith(
        String.fromCharCode(0xfeff) +
          ['date', 'nom', 'email', 'lu', 'message'].map((h) => `"${h}"`).join(';'),
      ),
    ).toBe(true);
    expect(csv).toContain('"' + String.fromCharCode(39) + '=HYPERLINK(""x"") « été »"');
    expect(csv).toContain('"non"');
  });

  it('an answer’s journal row says who wrote the messages it answers, and when', async () => {
    prismaMock.$transaction.mockImplementation(((cb: (tx: typeof prismaMock) => unknown) =>
      cb(prismaMock)) as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@x' } as never);
    prismaMock.supportMessage.findFirst.mockResolvedValueOnce({
      createdAt: new Date('2026-10-16T08:00:00Z'),
    } as never);
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      { createdAt: new Date('2026-10-17T08:00:00Z') },
    ] as never);
    prismaMock.supportMessage.create.mockResolvedValueOnce(
      msg('r2', true, '2026-10-17T10:00:00Z') as never,
    );
    await replyAsAdmin(prismaMock, { adminId: 'adm', userId: 'u1', body: 'Réponse' });
    expect(prismaMock.supportMessage.findMany.mock.calls[0]![0]!.where).toEqual({
      userId: 'u1',
      fromAdmin: false,
      createdAt: { gt: new Date('2026-10-16T08:00:00Z') },
    });
    expect(prismaMock.adminAction.create.mock.calls[0]![0]!.data).toMatchObject({
      actorId: 'adm',
      action: 'support.reply',
      metadata: { from: 'a@x', answeredSentAt: ['2026-10-17T08:00:00.000Z'] },
    });
  });
});
