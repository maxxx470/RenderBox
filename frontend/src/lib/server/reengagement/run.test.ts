// One pass of the sender (2026-10-31). The decision is schedule.ts's job and
// is tested there; what matters here is that the pass cannot send the same
// relance twice, and cannot write to someone who asked us to stop.
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { runReengagement } from './run';

const SECRET = 'a-secret-long-enough-to-be-a-jwt-secret-0123456789';
const NOW = new Date('2026-11-01T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

interface FakeUser {
  id: string;
  email: string;
  name: string | null;
  country: string | null;
  createdAt: Date;
  tierPeriodStart: Date | null;
  creditsBalance: number;
}

function fakePrisma(
  users: FakeUser[],
  opts: { alreadySent?: { userId: string; kind: string }[] } = {},
) {
  const keys = new Set<string>();
  const created: { userId: string; kind: string; dedupeKey: string }[] = [];
  const sentRows = (opts.alreadySent ?? []).map((s) => ({
    userId: s.userId,
    kind: s.kind,
    sentAt: new Date(NOW.getTime() - 30 * DAY),
  }));

  const prisma = {
    user: { findMany: vi.fn(async () => users) },
    order: { groupBy: vi.fn(async () => []) },
    supportMessage: { groupBy: vi.fn(async () => []) },
    renderNode: { findMany: vi.fn(async () => []) },
    reengagementEmail: {
      findMany: vi.fn(async () => sentRows),
      create: vi.fn(
        async ({ data }: { data: { userId: string; kind: string; dedupeKey: string } }) => {
          if (keys.has(data.dedupeKey)) throw new Error('unique constraint');
          keys.add(data.dedupeKey);
          created.push(data);
          return data;
        },
      ),
    },
  };

  return { prisma: prisma as unknown as PrismaClient, created, keys };
}

function user(over: Partial<FakeUser> = {}): FakeUser {
  return {
    id: 'u1',
    email: 'awa@gmail.com',
    name: 'Awa Diop',
    country: 'SN',
    createdAt: new Date(NOW.getTime() - 2 * DAY),
    tierPeriodStart: null,
    creditsBalance: 0,
    ...over,
  };
}

function fakeMailer() {
  const sent: { to: string; subject: string; html: string }[] = [];
  return {
    sent,
    mailer: {
      send: vi.fn(async (input: { to: string; subject: string; html: string }) => {
        sent.push(input);
        return { id: 'mail_1' };
      }),
    },
  };
}

describe('one pass of the relance sender', () => {
  it('sends the day-1 relance, in the language of the account’s country', async () => {
    const { prisma, created } = fakePrisma([user()]);
    const { mailer, sent } = fakeMailer();

    const result = await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    expect(result.sent).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0]!.kind).toBe('prospect_day1');
    expect(sent[0]!.to).toBe('awa@gmail.com');
    // Senegal reads French.
    expect(sent[0]!.html).toContain('Bonjour Awa');
  });

  it('writes to an account in Myanmar in English', async () => {
    const { prisma } = fakePrisma([user({ country: 'MM', name: 'Aung' })]);
    const { mailer, sent } = fakeMailer();

    await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    expect(sent[0]!.html).toContain('Hi Aung');
    expect(sent[0]!.html).toContain('lang=en');
  });

  it('reserves the relance BEFORE sending, so it can never go twice', async () => {
    const { prisma, created } = fakePrisma([user()]);
    const { mailer } = fakeMailer();

    const first = await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });
    // Same pass again with the reservation already taken: the create throws
    // on the unique key and the pass simply moves on.
    const second = await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(created).toHaveLength(1);
  });

  it('a failed send burns the relance rather than risking a second copy', async () => {
    const { prisma, created } = fakePrisma([user()]);
    const mailer = {
      send: vi.fn(async () => {
        throw new Error('resend down');
      }),
    };

    const result = await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    // The row stays: at most once, deliberately.
    expect(created).toHaveLength(1);
  });

  it('every e-mail carries a signed unsubscribe link and the RFC header', async () => {
    const { prisma } = fakePrisma([user()]);
    const { mailer } = fakeMailer();

    await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    const call = mailer.send.mock.calls[0]![0] as {
      html: string;
      listUnsubscribe?: { url?: string };
    };
    expect(call.listUnsubscribe?.url).toContain('/api/emails/unsubscribe?token=');
    expect(call.html).toContain('/api/emails/unsubscribe?token=');
  });

  it('asks the database only for accounts that may be written to', async () => {
    const { prisma } = fakePrisma([]);
    const { mailer } = fakeMailer();

    await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    const where = (
      prisma.user.findMany as unknown as { mock: { calls: [{ where: Record<string, unknown> }][] } }
    ).mock.calls[0]![0].where;
    expect(where.marketingUnsubscribedAt).toBeNull();
    expect(where.emailBouncedAt).toBeNull();
    expect(where.status).toBe('ACTIVE');
    expect(where.deletedAt).toBeNull();
  });

  it('sends nothing to an address that cannot receive mail, and writes no row', async () => {
    // Shapes taken from the five seed accounts in production. Those five
    // are soft-deleted, so the query already excludes them -- this pins
    // the case the query does NOT cover: an undeliverable address on a
    // live account. The sign-in codes leave from the same domain as the
    // relances, so one bounce is not a cosmetic problem.
    const seeds = [
      user({ id: 's1', email: 'dev-bypass@localhost' }),
      user({ id: 's2', email: 'admin@example.com' }),
      user({ id: 's3', email: 'unverified@example.com' }),
    ];
    const { prisma } = fakePrisma([...seeds, user({ id: 'real', email: 'awa@gmail.com' })]);
    const { mailer, sent } = fakeMailer();

    const result = await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    expect(sent.map((m) => m.to)).toEqual(['awa@gmail.com']);
    expect(result.sent).toBe(1);
    expect(result.undeliverable).toBe(3);
    // `looked` counts who could actually be written to, not who the
    // query returned — otherwise the cron log overstates the reach.
    expect(result.looked).toBe(1);
    // No row for a dropped account: the relance stays owed, not burnt.
    const created = (
      prisma.reengagementEmail.create as unknown as {
        mock: { calls: [{ data: { userId: string } }][] };
      }
    ).mock.calls.map((c) => c[0].data.userId);
    expect(created).toEqual(['real']);
  });

  it('stops at the send limit, so a cold start cannot blast the list', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      user({ id: `u${i}`, email: `u${i}@gmail.com` }),
    );
    const { prisma } = fakePrisma(many);
    const { mailer, sent } = fakeMailer();

    const result = await runReengagement({
      prisma,
      mailer,
      secret: SECRET,
      now: NOW,
      sendLimit: 3,
    });

    expect(result.sent).toBe(3);
    expect(sent).toHaveLength(3);
  });

  it('says nothing to an account that already had its last call', async () => {
    const { prisma } = fakePrisma([user({ createdAt: new Date(NOW.getTime() - 40 * DAY) })], {
      alreadySent: [{ userId: 'u1', kind: 'prospect_day18' }],
    });
    const { mailer, sent } = fakeMailer();

    const result = await runReengagement({ prisma, mailer, secret: SECRET, now: NOW });

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
