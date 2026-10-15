import { prismaMock } from '@/test-utils/prisma-mock';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const issueSession = vi.fn();
vi.mock('@/lib/server/auth/session', () => ({ issueSession }));
vi.mock('@/lib/server/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/auth')>()),
  hashPassword: async (p: string) => `hash:${p}`,
}));

const { POST } = await import('./route');

let ip = 0;
const req = (body: unknown) =>
  new NextRequest('http://localhost/api/auth/password/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}` },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('EMAIL_FROM', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  issueSession.mockReset();
});

describe('POST /api/auth/password/signup', () => {
  it('creates the account and signs in (201)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'u1',
      email: 'a@x.com',
      tokenVersion: 0,
    } as never);
    const res = await POST(req({ email: 'a@x.com', password: 'Maison-Dakar-2026', name: 'Awa' }));
    expect(res.status).toBe(201);
    expect(issueSession).toHaveBeenCalledWith({ id: 'u1', email: 'a@x.com', tokenVersion: 0 });
  });

  it('409 EMAIL_TAKEN for an address that has an account, no session', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as never);
    const res = await POST(req({ email: 'b@x.com', password: 'Maison-Dakar-2026' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'EMAIL_TAKEN' });
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('refuses a weak password before touching the database', async () => {
    const res = await POST(req({ email: 'c@x.com', password: 'court' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'PASSWORD_TOO_SHORT' });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('once email sending is configured, accounts go through the code: 409 VERIFICATION_REQUIRED', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('EMAIL_FROM', 'RenderPro <no-reply@example.com>');
    const res = await POST(req({ email: 'd@x.com', password: 'Maison-Dakar-2026' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'VERIFICATION_REQUIRED' });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});
