// The conversation between a user and the RenderPro team (2026-10-17, owner:
// the Assistant panel becomes a message box — « quand les gens envoient leur
// message, je le recevrai dans l'espace admin et je pourrai leur répondre »).
// One conversation per user: the user's messages and the team's answers, in
// order. No AI, no email (Resend is not set up): the answer reaches the user
// in the panel itself, with a notification in the bell.
//
// Kept only while useful (owner, 2026-10-17): once a team answer is a day old,
// it and every message before it in that conversation are deleted; a message
// still waiting for an answer stays, read or not. Each answer is written in the
// journal with who wrote the messages it answers and when (not their text), so
// the trace outlives them. (Not one journal row per user message: a journal
// row pins its author, and a user who has one could never be hard-deleted.)
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '@/lib/server/notifications';
import { logAdminAction } from '@/lib/server/admin/audit';

export const SUPPORT_MAX_LENGTH = 2000;
/** A user may send this many messages per hour — enough to talk, not to flood. */
export const SUPPORT_HOURLY_LIMIT = 20;
const HOUR = 60 * 60 * 1000;
/** How long an answered exchange is kept after the team's answer. */
export const SUPPORT_KEEP_AFTER_ANSWER_MS = 24 * HOUR;
/** The last messages a conversation shows. */
const SHOWN = 200;

export interface SupportMessageView {
  id: string;
  fromAdmin: boolean;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

const VIEW = { id: true, fromAdmin: true, body: true, createdAt: true, readAt: true } as const;

async function conversation(prisma: PrismaClient, userId: string): Promise<SupportMessageView[]> {
  const rows = await prisma.supportMessage.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: SHOWN,
    select: VIEW,
  });
  return rows.reverse();
}

/**
 * Deletes every exchange the team answered more than a day ago: in each
 * conversation, the latest answer older than SUPPORT_KEEP_AFTER_ANSWER_MS and
 * everything before it. Messages sent after that answer — still waiting —
 * stay. Run before each read, so no schedule is needed (Vercel Hobby).
 */
export async function purgeAnsweredMessages(
  prisma: PrismaClient,
  now = new Date(),
): Promise<number> {
  const cut = new Date(now.getTime() - SUPPORT_KEEP_AFTER_ANSWER_MS);
  return prisma.$executeRaw`
    DELETE FROM "SupportMessage" m
    USING (
      SELECT "userId", MAX("createdAt") AS "until"
      FROM "SupportMessage"
      WHERE "fromAdmin" = true AND "createdAt" <= ${cut}
      GROUP BY "userId"
    ) a
    WHERE m."userId" = a."userId" AND m."createdAt" <= a."until"`;
}

/** The user's conversation; the team's answers — and their bell notifications — become read. */
export async function readUserConversation(prisma: PrismaClient, userId: string, now = new Date()) {
  await purgeAnsweredMessages(prisma, now);
  await prisma.supportMessage.updateMany({
    where: { userId, fromAdmin: true, readAt: null },
    data: { readAt: now },
  });
  // Seen in the panel = seen: the bell must not keep announcing it.
  await prisma.notification.updateMany({
    where: { userId, type: 'SUPPORT_REPLY', readAt: null },
    data: { readAt: now },
  });
  return conversation(prisma, userId);
}

/** How many answers of the team the user has not read yet (the rail's dot). */
export function countUnreadAnswers(prisma: PrismaClient, userId: string) {
  return prisma.supportMessage.count({ where: { userId, fromAdmin: true, readAt: null } });
}

export type PostOutcome = { kind: 'OK'; message: SupportMessageView } | { kind: 'RATE_LIMITED' };

export async function postUserMessage(
  prisma: PrismaClient,
  userId: string,
  body: string,
  now = new Date(),
): Promise<PostOutcome> {
  const lastHour = await prisma.supportMessage.count({
    where: { userId, fromAdmin: false, createdAt: { gte: new Date(now.getTime() - HOUR) } },
  });
  if (lastHour >= SUPPORT_HOURLY_LIMIT) return { kind: 'RATE_LIMITED' };
  const message = await prisma.supportMessage.create({
    data: { userId, body, fromAdmin: false },
    select: VIEW,
  });
  return { kind: 'OK', message };
}

export interface SupportThread {
  userId: string;
  name: string | null;
  email: string;
  lastBody: string;
  lastFromAdmin: boolean;
  lastAt: Date;
  /** The user's messages no admin has read yet. */
  unread: number;
}

/** Every conversation, the latest first, for /admin/messages. */
export async function listThreads(
  prisma: PrismaClient,
  now = new Date(),
): Promise<SupportThread[]> {
  await purgeAnsweredMessages(prisma, now);
  const [latest, unread] = await Promise.all([
    prisma.supportMessage.findMany({
      distinct: ['userId'],
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        body: true,
        fromAdmin: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.supportMessage.groupBy({
      by: ['userId'],
      where: { fromAdmin: false, readAt: null },
      _count: { _all: true },
    }),
  ]);
  const unreadBy = new Map((unread ?? []).map((u) => [u.userId, u._count._all]));
  return (latest ?? [])
    .map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      lastBody: m.body,
      lastFromAdmin: m.fromAdmin,
      lastAt: m.createdAt,
      unread: unreadBy.get(m.userId) ?? 0,
    }))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

/** Conversations with a message no admin has read yet (the admin nav's badge). */
export async function countUnreadThreads(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.supportMessage.groupBy({
    by: ['userId'],
    where: { fromAdmin: false, readAt: null },
  });
  return (rows ?? []).length;
}

/** One conversation, seen by an admin: the user's messages become read. */
export async function readThreadAsAdmin(prisma: PrismaClient, userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      profession: true,
      country: true,
      currentTier: true,
    },
  });
  if (!user) return null;
  await purgeAnsweredMessages(prisma, now);
  await prisma.supportMessage.updateMany({
    where: { userId, fromAdmin: false, readAt: null },
    data: { readAt: now },
  });
  return { user, messages: await conversation(prisma, userId) };
}

/** An admin's answer: stored, notified to the user, audited — all in one transaction. */
export async function replyAsAdmin(
  prisma: PrismaClient,
  input: { adminId: string; userId: string; body: string },
): Promise<SupportMessageView | null> {
  const { adminId, userId, body } = input;
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return null;
    // The messages this answer covers: the user's, since the team's last answer.
    const previous = await tx.supportMessage.findFirst({
      where: { userId, fromAdmin: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const answered = await tx.supportMessage.findMany({
      where: {
        userId,
        fromAdmin: false,
        ...(previous ? { createdAt: { gt: previous.createdAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const message = await tx.supportMessage.create({
      data: { userId, body, fromAdmin: true, adminId },
      select: VIEW,
    });
    await createNotification(tx as unknown as PrismaClient, {
      userId,
      type: 'SUPPORT_REPLY',
      // The brand as the title: it reads the same in both languages, and the
      // answer itself (written in the user's language) is the body.
      title: 'RenderPro',
      body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
      data: { messageId: message.id },
      dedupeKey: `support-reply:${message.id}`,
    });
    await logAdminAction(tx, {
      actorId: adminId,
      action: 'support.reply',
      targetType: 'User',
      targetId: userId,
      metadata: {
        messageId: message.id,
        length: body.length,
        from: user.email,
        answeredSentAt: (answered ?? []).map((m) => m.createdAt.toISOString()),
      },
    });
    return message;
  });
}

export interface PendingMessage {
  id: string;
  createdAt: Date;
  body: string;
  readAt: Date | null;
  user: { id: string; name: string | null; email: string };
}

/**
 * The users' messages still waiting for an answer — those sent after the
 * team's last answer in their conversation (or with no answer at all), read
 * or not. The admin's « Exporter les nouveaux messages ».
 */
export async function listPendingMessages(
  prisma: PrismaClient,
  now = new Date(),
): Promise<PendingMessage[]> {
  await purgeAnsweredMessages(prisma, now);
  const [userMessages, answers] = await Promise.all([
    prisma.supportMessage.findMany({
      where: { fromAdmin: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        body: true,
        readAt: true,
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.supportMessage.groupBy({
      by: ['userId'],
      where: { fromAdmin: true },
      _max: { createdAt: true },
    }),
  ]);
  const lastAnswer = new Map((answers ?? []).map((a) => [a.userId, a._max.createdAt]));
  return (userMessages ?? [])
    .filter((m) => {
      const answered = lastAnswer.get(m.userId);
      return !answered || m.createdAt > answered;
    })
    .map(({ userId: _userId, ...m }) => m);
}

/** One CSV cell: quoted, inner quotes doubled, and no formula a spreadsheet would run. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The pending messages as a CSV file (UTF-8 with a BOM, so Excel reads the accents). */
export function pendingMessagesCsv(rows: PendingMessage[]): string {
  const head = ['date', 'nom', 'email', 'lu', 'message'].map(csvCell).join(';');
  const lines = rows.map((m) =>
    [m.createdAt.toISOString(), m.user.name ?? '', m.user.email, m.readAt ? 'oui' : 'non', m.body]
      .map(csvCell)
      .join(';'),
  );
  return '﻿' + [head, ...lines].join('\r\n') + '\r\n';
}
