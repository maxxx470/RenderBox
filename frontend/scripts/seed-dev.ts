// Dev seed script. Creates 3 sample users for local development against a
// real Postgres. RenderBox is password-less (Google OAuth + magic link
// only), so these rows have no password — sign in via the magic link at
// /connexion using the seeded email. Refuses to run with NODE_ENV=production
// to prevent accidental destructive seeding in prod.
//
// Usage: pnpm seed:dev
//
// Idempotent — uses upsert keyed on email, so running multiple times
// does not duplicate rows.
//
// Exports `main(args, deps)` so tests can inject a mocked PrismaClient (no
// DB connection at module import time). The CLI guard at the bottom mirrors
// `make-superadmin.ts`.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { DEV_FAKE_USER_ID, DEV_FAKE_USER_EMAIL } from '../src/lib/server/dev-bypass';

const SEED_USERS = [
  { email: 'admin@example.com', role: 'SUPERADMIN' },
  { email: 'user@example.com', role: 'USER' },
  { email: 'unverified@example.com', role: 'USER', skipVerify: true },
] as const;

interface SeedDeps {
  // Injectable for tests — defaults to a freshly-instantiated PrismaClient
  // when called as a CLI.
  prisma?: PrismaClient;
}

export async function main(_args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-dev in production.');
    process.exit(1);
  }

  const prisma = deps.prisma ?? new PrismaClient();
  try {
    for (const seed of SEED_USERS) {
      const emailVerifiedAt = 'skipVerify' in seed && seed.skipVerify ? null : new Date();
      const user = await prisma.user.upsert({
        where: { email: seed.email },
        update: { role: seed.role },
        create: {
          email: seed.email,
          role: seed.role,
          emailVerifiedAt,
        },
        select: { email: true, role: true, emailVerifiedAt: true },
      });
      const verified = user.emailVerifiedAt ? 'verified' : 'unverified';
      console.log(`✓ ${user.email} (${user.role}, ${verified})`);
    }

    // Fixed-id user backing DEV_BYPASS_AUTH (see lib/server/dev-bypass.ts) —
    // keyed on id, not email, so the bypass identity always resolves to a
    // real row and IDOR checks (project.userId === session.userId) keep
    // working even when auth itself is skipped.
    await prisma.user.upsert({
      where: { id: DEV_FAKE_USER_ID },
      update: {},
      create: {
        id: DEV_FAKE_USER_ID,
        email: DEV_FAKE_USER_EMAIL,
        role: 'USER',
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`✓ dev-bypass fake user ready (${DEV_FAKE_USER_ID})`);

    console.log('\nSign in with the magic link at /connexion using one of these emails.');
  } finally {
    // Only disconnect the real client; tests pass their own mock and close
    // it themselves.
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
}

// CLI entrypoint guard — only run when invoked as a script, not when
// imported by tests. Compares resolved filesystem paths (see
// make-superadmin.ts for why a raw string comparison silently no-ops on
// Windows).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
