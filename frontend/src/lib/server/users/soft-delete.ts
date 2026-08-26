// Phase 6 — reversible account deletion.
//
// deletedAt is set/cleared by an admin (never by the user themselves — no
// self-service delete endpoint ships in v1). Login is refused while set
// (see the same choke-point checks as ACCOUNT_SUSPENDED in
// /api/auth/refresh and /api/auth/refresh-and-return). After
// ACCOUNT_DELETION_GRACE_DAYS, purgeDeletedAccounts() hard-deletes the row.
import 'server-only';
import type { PrismaClient, Prisma } from '@prisma/client';

export const ACCOUNT_DELETION_GRACE_DAYS = Number.parseInt(
  process.env.ACCOUNT_DELETION_GRACE_DAYS ?? '30',
  10,
);

export interface PurgeDeletedAccountsOptions {
  prisma: PrismaClient;
  batchSize?: number; // default 100
  graceDays?: number; // default ACCOUNT_DELETION_GRACE_DAYS
}

/**
 * Hard-deletes User rows whose deletedAt is older than the grace window.
 * Most relations cascade (Project → RenderNode → Material/Generation,
 * VerificationCode, FileUpload, Notification, OAuthAccount); Order.userId
 * is SetNull (payment history survives); AdminAction.actorId is Restrict —
 * an admin account with AdminAction rows fails to delete at the DB level.
 * That failure is caught per-row and skipped (logged), never thrown, so one
 * un-purgeable row doesn't stall the whole batch.
 */
export async function purgeDeletedAccounts(
  opts: PurgeDeletedAccountsOptions,
): Promise<{ purged: number; skipped: number }> {
  const batchSize = opts.batchSize ?? 100;
  const graceDays = opts.graceDays ?? ACCOUNT_DELETION_GRACE_DAYS;
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const candidates = await opts.prisma.user.findMany({
    where: { deletedAt: { lt: cutoff } },
    orderBy: { deletedAt: 'asc' },
    take: batchSize,
    select: { id: true },
  });

  let purged = 0;
  let skipped = 0;
  for (const c of candidates) {
    try {
      await opts.prisma.user.delete({ where: { id: c.id } });
      purged++;
    } catch (e) {
      // Prisma P2003 (FK restrict, e.g. AdminAction.actorId) or a
      // concurrent restore racing the purge — either way, skip and move on.
      const code = (e as Prisma.PrismaClientKnownRequestError)?.code;
      if (code !== 'P2003' && code !== 'P2025') throw e;
      skipped++;
    }
  }
  return { purged, skipped };
}
