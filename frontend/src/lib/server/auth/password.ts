// Email + password sign-in (Phase 9, 2026-10-13, owner: « Google et connexion
// par email et mot de passe »). The starter's six password routes were
// removed by the RenderBox port; this is the smaller shape that replaces
// them, with the same guarantees:
//
//   - A password is only ever attached AFTER the address is proved with an
//     emailed code (signup and reset are the same operation: prove, then
//     set). Nobody can pre-register someone else's address with their own
//     password and wait for the owner to sign in with Google.
//   - Asking for a code never reveals whether the address has an account.
//   - Codes are stored hashed (SHA-256), live AUTH_VERIFICATION_TTL_MIN
//     (15 min), allow 5 tries, and a new code voids the previous one.
//   - Wrong passwords lock the account after AUTH_LOCKOUT_THRESHOLD (10)
//     tries for AUTH_LOCKOUT_DURATION_MIN (15 min). Kept in the database,
//     not in memory: production has no Redis and serverless instances do
//     not share memory.
//   - An unknown address still costs one bcrypt comparison (timing).
//
// Codes are sent at once through Resend (lib/server/email.ts), not through
// the outbox: the queue's drain crons do not run on Vercel's Hobby plan, and
// a sign-in code that arrives tomorrow is no code at all.
import 'server-only';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  generateVerificationCode,
  hashPassword,
  timingSafeCompare,
  verifyPassword,
} from '@/lib/server/auth';
import { createMailer, type Mailer } from '@/lib/server/email';
import { passwordCodeEmail } from './email-templates';

export type CodePurpose = 'signup' | 'reset';

const CODE_TYPE: Record<CodePurpose, string> = { signup: 'SIGNUP', reset: 'PASSWORD_RESET' };

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const PASSWORD_MIN_LENGTH = num(process.env.AUTH_PASSWORD_MIN_LENGTH, 10);
export const PASSWORD_MAX_LENGTH = 128;
const CODE_TTL_MS = num(process.env.AUTH_VERIFICATION_TTL_MIN, 15) * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const LOCK_THRESHOLD = num(process.env.AUTH_LOCKOUT_THRESHOLD, 10);
const LOCK_MS = num(process.env.AUTH_LOCKOUT_DURATION_MIN, 15) * 60_000;

/** True when codes can be emailed — without it the email + password form is
 *  hidden on /connexion and its routes answer 503. */
export function isEmailSignInConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function getMailer(): Mailer | null {
  if (!isEmailSignInConfigured()) return null;
  return createMailer({
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
    EMAIL_FROM: process.env.EMAIL_FROM ?? '',
  });
}

// The passwords people try first; refused whatever their length.
const COMMON = new Set([
  'password',
  'password1',
  'password123',
  'motdepasse',
  'motdepasse1',
  '1234567890',
  '12345678910',
  '0123456789',
  'azertyuiop',
  'qwertyuiop',
  'renderpro',
  'renderpro1',
  'renderbox',
  'iloveyou12',
  'abcdefghij',
  'aaaaaaaaaa',
]);

export type PasswordProblem = 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_COMMON';

export function checkPasswordPolicy(password: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'PASSWORD_TOO_SHORT';
  if (password.length > PASSWORD_MAX_LENGTH) return 'PASSWORD_TOO_LONG';
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'PASSWORD_TOO_COMMON';
  return null;
}

const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

/**
 * Emails a code for `purpose`. Always resolves the same way whether or not
 * the address has an account (the route answers 200 either way):
 *   - signup: the account is created if needed (no password, unverified);
 *   - reset: nothing is sent to an address without an account.
 * A suspended or deleted account gets nothing.
 */
export async function issueCode(
  prisma: PrismaClient,
  mailer: Mailer,
  args: { email: string; purpose: CodePurpose; locale: 'fr' | 'en' },
): Promise<void> {
  const email = args.email.trim().toLowerCase();
  const type = CODE_TYPE[args.purpose];
  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!user) {
    if (args.purpose === 'reset') return;
    user = await prisma.user.create({
      data: { email },
      select: { id: true, status: true, deletedAt: true },
    });
  }
  if (user.status !== 'ACTIVE' || user.deletedAt) return;

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.$transaction([
    // One live code at a time.
    prisma.verificationCode.updateMany({
      where: { userId: user.id, type, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.verificationCode.create({
      data: { userId: user.id, type, code: hashCode(code), expiresAt },
    }),
  ]);
  const tpl = passwordCodeEmail({
    code,
    purpose: args.purpose,
    locale: args.locale,
    expiresAt: expiresAt.toISOString(),
  });
  await mailer.send({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

export interface SignedInUser {
  id: string;
  email: string;
  tokenVersion: number;
}

export type ConfirmResult =
  | { ok: true; user: SignedInUser }
  | { ok: false; error: 'CODE_INVALID' | 'CODE_EXPIRED' | 'CODE_TOO_MANY_ATTEMPTS' };

/**
 * Proves the address with the code, then sets the password (and the name on
 * a signup, if the account has none). A reset also signs every other
 * session out (tokenVersion + 1). Clears any lockout.
 */
export async function confirmCodeAndSetPassword(
  prisma: PrismaClient,
  args: {
    email: string;
    code: string;
    password: string;
    purpose: CodePurpose;
    name?: string | undefined;
  },
): Promise<ConfirmResult> {
  const email = args.email.trim().toLowerCase();
  const type = CODE_TYPE[args.purpose];
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, status: true, deletedAt: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.deletedAt)
    return { ok: false, error: 'CODE_INVALID' };

  const row = await prisma.verificationCode.findFirst({
    where: { userId: user.id, type, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, code: true, expiresAt: true, attempts: true },
  });
  if (!row) return { ok: false, error: 'CODE_INVALID' };
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await prisma.verificationCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return { ok: false, error: 'CODE_TOO_MANY_ATTEMPTS' };
  }
  if (!timingSafeCompare(hashCode(args.code.trim().toUpperCase()), row.code)) {
    await prisma.verificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: 'CODE_INVALID' };
  }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: 'CODE_EXPIRED' };

  const passwordHash = await hashPassword(args.password);
  const name = args.name?.trim();
  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Consumed once: a second submit of the same code finds nothing.
      const consumed = await tx.verificationCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) throw new Error('CODE_RACE');
      return tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          emailVerifiedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
          ...(args.purpose === 'reset' ? { tokenVersion: { increment: 1 } } : {}),
          ...(args.purpose === 'signup' && name && !user.name ? { name } : {}),
        },
        select: { id: true, email: true, tokenVersion: true },
      });
    });
    return { ok: true, user: updated };
  } catch (err) {
    if (err instanceof Error && err.message === 'CODE_RACE')
      return { ok: false, error: 'CODE_INVALID' };
    throw err;
  }
}

let dummyHash: Promise<string> | null = null;

export type LoginResult =
  | { ok: true; user: SignedInUser }
  | { ok: false; error: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'ACCOUNT_SUSPENDED' };

/** Checks an email + password. Same answer for an unknown address and a
 *  wrong password; the lock and the suspension are only told after the
 *  password itself was right (or, for the lock, without checking it). */
export async function checkPasswordLogin(
  prisma: PrismaClient,
  args: { email: string; password: string },
): Promise<LoginResult> {
  const email = args.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      tokenVersion: true,
      passwordHash: true,
      emailVerifiedAt: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!user?.passwordHash || !user.emailVerifiedAt) {
    dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
    await verifyPassword(args.password, await dummyHash);
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: 'ACCOUNT_LOCKED' };
  }
  if (!(await verifyPassword(args.password, user.passwordHash))) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= LOCK_THRESHOLD;
    await prisma.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
        : { failedLoginAttempts: attempts },
    });
    return { ok: false, error: lock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS' };
  }
  if (user.status !== 'ACTIVE' || user.deletedAt) return { ok: false, error: 'ACCOUNT_SUSPENDED' };
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }
  return { ok: true, user: { id: user.id, email: user.email, tokenVersion: user.tokenVersion } };
}
