// The conversation between a user and the RenderPro team (2026-10-17, owner:
// the Assistant panel becomes a message box — « quand les gens envoient leur
// message, je le recevrai dans l'espace admin et je pourrai leur répondre »).
// One conversation per user: the user's messages and the team's answers, in
// order. No AI, no email (Resend is not set up): the answer reaches the user
// in the panel itself, with a notification in the bell.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '@/lib/server/notifications';
import { logAdminAction } from '@/lib/server/admin/audit';

export const SUPPORT_MAX_LENGTH = 2000;
/** A user may send this many messages per hour — enough to talk, not to flood. */
export const SUPPORT_HOURLY_LIMIT = 20;
const HOUR = 60 * 60 * 1000;
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

/** The user's conversation; the team's answers become read. */
export async function readUserConversation(prisma: PrismaClient, userId: string, now = new Date()) {
  await prisma.supportMessage.updateMany({
    where: { userId, fromAdmin: true, readAt: null },
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
export async function listThreads(prisma: PrismaClient): Promise<SupportThread[]> {
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
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return null;
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
      metadata: { messageId: message.id, length: body.length },
    });
    return message;
  });
}
