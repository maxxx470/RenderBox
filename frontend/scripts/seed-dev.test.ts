// Companion unit test for `scripts/seed-dev.ts`.
//
// Asserts:
//   1. NODE_ENV=production refuses with exit 1 BEFORE any prisma call.
//   2. 3 seed users + the dev-bypass fake user are upserted (idempotent —
//      runs upsert, not create).
//   3. The unverified seed user has emailVerifiedAt=null.
//   4. The dev-bypass fake user is upserted keyed on its fixed id.
//
// Tests invoke `main([], { prisma })` directly with a mocked Prisma client
// (no subprocess spawn, no real DB). The CLI entrypoint guard
// (`if (import.meta.url === ...)`) keeps the auto-run path inert when
// imported by Vitest.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { main } from './seed-dev';
import { DEV_FAKE_USER_ID, DEV_FAKE_USER_EMAIL } from '../src/lib/server/dev-bypass';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

const ORIG_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  mockReset(prismaMock);
});

afterEach(() => {
  process.env.NODE_ENV = ORIG_NODE_ENV;
  vi.restoreAllMocks();
});

describe('scripts/seed-dev (SCRIPT-01)', () => {
  it('refuses to run with NODE_ENV=production and exits 1 BEFORE any prisma call', async () => {
    process.env.NODE_ENV = 'production';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code}__`);
    }) as never);

    await expect(main([], { prisma: prismaMock })).rejects.toThrow('__exit:1__');
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/production/i));
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('upserts each seed user (idempotent — runs upsert, not create)', async () => {
    process.env.NODE_ENV = 'test';
    prismaMock.user.upsert.mockResolvedValue({
      email: 'admin@example.com',
      role: 'SUPERADMIN',
      emailVerifiedAt: new Date(),
    } as never);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    // 3 seed users + 1 dev-bypass fake user → 4 upserts.
    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(4);
    const firstCall = prismaMock.user.upsert.mock.calls[0]?.[0];
    expect(firstCall?.where).toEqual({ email: 'admin@example.com' });
    expect(firstCall?.create).toMatchObject({
      email: 'admin@example.com',
      role: 'SUPERADMIN',
    });
  });

  it('upserts the dev-bypass fake user keyed on its fixed id', async () => {
    process.env.NODE_ENV = 'test';
    prismaMock.user.upsert.mockResolvedValue({
      email: 'admin@example.com',
      role: 'SUPERADMIN',
      emailVerifiedAt: new Date(),
    } as never);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    const lastCall = prismaMock.user.upsert.mock.calls[3]?.[0];
    expect(lastCall?.where).toEqual({ id: DEV_FAKE_USER_ID });
    expect(lastCall?.create).toMatchObject({
      id: DEV_FAKE_USER_ID,
      email: DEV_FAKE_USER_EMAIL,
      role: 'USER',
    });
  });

  it('marks the unverified seed user with emailVerifiedAt=null', async () => {
    process.env.NODE_ENV = 'test';
    prismaMock.user.upsert.mockResolvedValue({
      email: 'x',
      role: 'USER',
      emailVerifiedAt: null,
    } as never);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await main([], { prisma: prismaMock });

    // The third seed user (`unverified@example.com`) has skipVerify=true.
    const thirdCall = prismaMock.user.upsert.mock.calls[2]?.[0];
    expect(thirdCall?.where).toEqual({ email: 'unverified@example.com' });
    expect((thirdCall?.create as { emailVerifiedAt: Date | null }).emailVerifiedAt).toBeNull();
  });
});
