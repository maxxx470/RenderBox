// Pure verification logic used by GET /api/auth/magic-link/verify (the
// emailed link's click target). Deliberately side-effect-free re: cookies —
// the caller issues the session itself via next/headers, since only a
// Route Handler or Server Action can set cookies in Next.js (a plain Server
// Component page cannot mutate cookies during render).
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { hashMagicLinkToken } from './magic-link';

export type VerifyMagicLinkResult =
  | { ok: true; userId: string; email: string; tokenVersion: number }
  | { ok: false; error: 'MAGIC_LINK_INVALID' | 'MAGIC_LINK_EXPIRED' };

export async function verifyMagicLink(
  rawEmail: string,
  token: string,
): Promise<VerifyMagicLinkResult> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, tokenVersion: true, emailVerifiedAt: true },
  });
  // Enumeration resistance is moot here (a click on a real emailed link
  // implies the user already exists), but never distinguish user-not-found
  // from code-not-found regardless.
  if (!user) return { ok: false, error: 'MAGIC_LINK_INVALID' };

  const hash = hashMagicLinkToken(token);
  const codeRow = await prisma.verificationCode.findFirst({
    where: { userId: user.id, code: hash, type: 'MAGIC_LINK', usedAt: null },
    select: { id: true, expiresAt: true },
  });
  if (!codeRow) return { ok: false, error: 'MAGIC_LINK_INVALID' };
  if (codeRow.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'MAGIC_LINK_EXPIRED' };
  }

  // TOCTOU-safe consume (mirrors the pattern the old verify-email route
  // used): updateMany with the usedAt:null guard inline so a concurrent
  // second click on the same link finds 0 rows instead of double-consuming.
  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.verificationCode.updateMany({
        where: { id: codeRow.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) throw new Error('MAGIC_LINK_RACE');
      if (!user.emailVerifiedAt) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'MAGIC_LINK_RACE') {
      return { ok: false, error: 'MAGIC_LINK_INVALID' };
    }
    throw err;
  }

  return { ok: true, userId: user.id, email: user.email, tokenVersion: user.tokenVersion };
}
