import { prismaMock } from '@/test-utils/prisma-mock';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mailer } from '@/lib/server/email';

// bcrypt is slow and not what is under test: a readable stand-in.
vi.mock('@/lib/server/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/auth')>()),
  hashPassword: async (p: string) => `hash:${p}`,
  verifyPassword: async (p: string, h: string) => h === `hash:${p}`,
}));

const {
  checkPasswordLogin,
  checkPasswordPolicy,
  confirmCodeAndSetPassword,
  isEmailSignInConfigured,
  issueCode,
} = await import('./password');

const NOW = new Date('2026-10-13T12:00:00.000Z');
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function mailer() {
  const send = vi.fn().mockResolvedValue({ id: 'mail-1' });
  return { mailer: { send } as unknown as Mailer, send };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('checkPasswordPolicy', () => {
  it('needs 10 characters, refuses the common ones and single repeated characters', () => {
    expect(checkPasswordPolicy('short')).toBe('PASSWORD_TOO_SHORT');
    expect(checkPasswordPolicy('x'.repeat(129))).toBe('PASSWORD_TOO_LONG');
    expect(checkPasswordPolicy('Motdepasse1')).toBe('PASSWORD_TOO_COMMON');
    expect(checkPasswordPolicy('aaaaaaaaaaaa')).toBe('PASSWORD_TOO_COMMON');
    expect(checkPasswordPolicy('Maison-Dakar-2026')).toBeNull();
  });
});

describe('isEmailSignInConfigured', () => {
  it('needs both RESEND_API_KEY and EMAIL_FROM', () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', 'x@y.z');
    expect(isEmailSignInConfigured()).toBe(false);
    vi.stubEnv('RESEND_API_KEY', 're_x');
    expect(isEmailSignInConfigured()).toBe(true);
  });
});

describe('issueCode', () => {
  it('signup: creates the account (no password), voids older codes, stores the code HASHED and emails it', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'u1',
      status: 'ACTIVE',
      deletedAt: null,
    } as never);
    const { mailer: m, send } = mailer();

    await issueCode(prismaMock, m, { email: ' Awa@Example.com ', purpose: 'signup', locale: 'fr' });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { email: 'awa@example.com' },
      select: { id: true, status: true, deletedAt: true },
    });
    expect(prismaMock.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', type: 'SIGNUP', usedAt: null },
      data: { usedAt: NOW },
    });
    const created = prismaMock.verificationCode.create.mock.calls[0]![0].data as {
      code: string;
      type: string;
      expiresAt: Date;
    };
    expect(created.type).toBe('SIGNUP');
    expect(created.expiresAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
    const mail = send.mock.calls[0]![0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe('awa@example.com');
    const code = /[A-Z0-9]{8}/.exec(mail.subject)![0];
    expect(mail.text).toContain(code);
    // Never the raw code in the database.
    expect(created.code).toBe(sha(code));
    expect(created.code).not.toContain(code);
  });

  it('reset: an unknown address gets nothing and no account is created', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const { mailer: m, send } = mailer();
    await issueCode(prismaMock, m, { email: 'nobody@x.com', purpose: 'reset', locale: 'en' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('a suspended or deleted account gets nothing', async () => {
    const { mailer: m, send } = mailer();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'SUSPENDED',
      deletedAt: null,
    } as never);
    await issueCode(prismaMock, m, { email: 'a@x.com', purpose: 'reset', locale: 'fr' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'ACTIVE',
      deletedAt: NOW,
    } as never);
    await issueCode(prismaMock, m, { email: 'a@x.com', purpose: 'signup', locale: 'fr' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('confirmCodeAndSetPassword', () => {
  const user = { id: 'u1', email: 'a@x.com', name: null, status: 'ACTIVE', deletedAt: null };
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    code: sha('ABCD2345'),
    expiresAt: new Date(NOW.getTime() + 60_000),
    attempts: 0,
    ...over,
  });
  const args = {
    email: 'a@x.com',
    code: 'abcd2345',
    password: 'Maison-Dakar-2026',
    purpose: 'signup' as const,
    name: 'Awa Diop',
  };

  it('a right code proves the address, sets the password and the name, signs in', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue(row() as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      email: 'a@x.com',
      tokenVersion: 0,
    } as never);

    const res = await confirmCodeAndSetPassword(prismaMock, args);

    expect(res).toEqual({ ok: true, user: { id: 'u1', email: 'a@x.com', tokenVersion: 0 } });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        passwordHash: 'hash:Maison-Dakar-2026',
        emailVerifiedAt: NOW,
        failedLoginAttempts: 0,
        lockedUntil: null,
        name: 'Awa Diop',
      },
      select: { id: true, email: true, tokenVersion: true },
    });
  });

  it('a reset also signs every other session out (tokenVersion + 1)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue(row() as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.update.mockResolvedValue({
      id: 'u1',
      email: 'a@x.com',
      tokenVersion: 4,
    } as never);

    await confirmCodeAndSetPassword(prismaMock, { ...args, purpose: 'reset' });

    const data = prismaMock.user.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.tokenVersion).toEqual({ increment: 1 });
    expect(data).not.toHaveProperty('name');
  });

  it('a wrong code counts an attempt and changes nothing', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue(row() as never);
    const res = await confirmCodeAndSetPassword(prismaMock, { ...args, code: 'ZZZZ2345' });
    expect(res).toEqual({ ok: false, error: 'CODE_INVALID' });
    expect(prismaMock.verificationCode.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { attempts: { increment: 1 } },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('an expired code, a code tried 5 times, an unknown address are refused', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user as never);
    prismaMock.verificationCode.findFirst.mockResolvedValueOnce(
      row({ expiresAt: new Date(NOW.getTime() - 1) }) as never,
    );
    expect(await confirmCodeAndSetPassword(prismaMock, args)).toEqual({
      ok: false,
      error: 'CODE_EXPIRED',
    });
    prismaMock.verificationCode.findFirst.mockResolvedValueOnce(row({ attempts: 5 }) as never);
    expect(await confirmCodeAndSetPassword(prismaMock, args)).toEqual({
      ok: false,
      error: 'CODE_TOO_MANY_ATTEMPTS',
    });
    prismaMock.user.findUnique.mockResolvedValue(null);
    expect(await confirmCodeAndSetPassword(prismaMock, args)).toEqual({
      ok: false,
      error: 'CODE_INVALID',
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('the same code used twice at once: the second finds it consumed', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue(row() as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 0 });
    expect(await confirmCodeAndSetPassword(prismaMock, args)).toEqual({
      ok: false,
      error: 'CODE_INVALID',
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('checkPasswordLogin', () => {
  const account = (over: Record<string, unknown> = {}) => ({
    id: 'u1',
    email: 'a@x.com',
    tokenVersion: 2,
    passwordHash: 'hash:Maison-Dakar-2026',
    emailVerifiedAt: NOW,
    failedLoginAttempts: 0,
    lockedUntil: null,
    status: 'ACTIVE',
    deletedAt: null,
    ...over,
  });

  it('the right password signs in', async () => {
    prismaMock.user.findUnique.mockResolvedValue(account() as never);
    expect(
      await checkPasswordLogin(prismaMock, { email: 'A@x.com', password: 'Maison-Dakar-2026' }),
    ).toEqual({ ok: true, user: { id: 'u1', email: 'a@x.com', tokenVersion: 2 } });
  });

  it('an unknown address and an account without a password answer exactly like a wrong password', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect(
      await checkPasswordLogin(prismaMock, { email: 'n@x.com', password: 'whatever12' }),
    ).toEqual({
      ok: false,
      error: 'INVALID_CREDENTIALS',
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(account({ passwordHash: null }) as never);
    expect(
      await checkPasswordLogin(prismaMock, { email: 'a@x.com', password: 'whatever12' }),
    ).toEqual({
      ok: false,
      error: 'INVALID_CREDENTIALS',
    });
  });

  it('a wrong password counts; the 10th locks the account for 15 minutes', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(account({ failedLoginAttempts: 3 }) as never);
    expect(
      await checkPasswordLogin(prismaMock, { email: 'a@x.com', password: 'nope-nope-1' }),
    ).toEqual({
      ok: false,
      error: 'INVALID_CREDENTIALS',
    });
    expect(prismaMock.user.update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: { failedLoginAttempts: 4 },
    });

    prismaMock.user.findUnique.mockResolvedValueOnce(account({ failedLoginAttempts: 9 }) as never);
    expect(
      await checkPasswordLogin(prismaMock, { email: 'a@x.com', password: 'nope-nope-1' }),
    ).toEqual({
      ok: false,
      error: 'ACCOUNT_LOCKED',
    });
    expect(prismaMock.user.update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: { failedLoginAttempts: 0, lockedUntil: new Date(NOW.getTime() + 15 * 60_000) },
    });
  });

  it('a locked account is refused even with the right password, without checking it', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      account({ lockedUntil: new Date(NOW.getTime() + 60_000) }) as never,
    );
    expect(
      await checkPasswordLogin(prismaMock, { email: 'a@x.com', password: 'Maison-Dakar-2026' }),
    ).toEqual({ ok: false, error: 'ACCOUNT_LOCKED' });
  });

  it('a suspended account is told so only after the right password', async () => {
    prismaMock.user.findUnique.mockResolvedValue(account({ status: 'SUSPENDED' }) as never);
    expect(
      await checkPasswordLogin(prismaMock, { email: 'a@x.com', password: 'nope-nope-1' }),
    ).toEqual({
      ok: false,
      error: 'INVALID_CREDENTIALS',
    });
    expect(
      await checkPasswordLogin(prismaMock, { email: 'a@x.com', password: 'Maison-Dakar-2026' }),
    ).toEqual({ ok: false, error: 'ACCOUNT_SUSPENDED' });
  });

  it('a success clears the failed attempts', async () => {
    prismaMock.user.findUnique.mockResolvedValue(account({ failedLoginAttempts: 4 }) as never);
    await checkPasswordLogin(prismaMock, { email: 'a@x.com', password: 'Maison-Dakar-2026' });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });
});
