// Phase 9 migration (email + password sign-in, lockout, onboarding) —
// offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9_auth_onboarding must be sure of before it
// runs on the shared database: it runs after the migrations written before it, and it only ADDS columns that
// are nullable or carry a default — nothing dropped, renamed, rewritten.
import { describe, expect, it } from 'vitest';
import { expectAppliedAfterEarlier } from '@/test-utils/migration-order';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9_auth_onboarding';

// CRLF on a Windows checkout (core.autocrlf), LF in Git and on Vercel.
const sql = readFileSync(join(MIGRATIONS, NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const code = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');
const statements = code
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

describe(`migration ${NAME}`, () => {
  it('sorts after every migration folder that came before it', () => {
    expectAppliedAfterEarlier(NAME);
  });

  it('is one ALTER TABLE "User" adding the 13 expected columns', () => {
    expect(statements).toHaveLength(1);
    const columns = [...statements[0]!.matchAll(/ADD COLUMN "(\w+)" ([^,]+)/g)].map(
      (m) => `${m[1]} ${m[2]!.trim()}`,
    );
    expect(columns).toEqual([
      'passwordHash TEXT',
      'failedLoginAttempts INTEGER NOT NULL DEFAULT 0',
      'lockedUntil TIMESTAMP(3)',
      'phone TEXT',
      'profession TEXT',
      'company TEXT',
      'teamSize TEXT',
      'projectTypes TEXT[] DEFAULT ARRAY[]::TEXT[]',
      'mainUse TEXT',
      'country TEXT',
      'city TEXT',
      'referralSource TEXT',
      'onboardedAt TIMESTAMP(3)',
    ]);
    // Every NOT NULL column has a default: existing rows stay valid.
    for (const c of columns) if (/NOT NULL/.test(c)) expect(c).toMatch(/DEFAULT/);
  });

  it('contains no destructive or data-changing operation', () => {
    expect(code).not.toMatch(
      /\bDROP\b|\bRENAME\b|\bALTER COLUMN\b|\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bTRUNCATE\b/i,
    );
  });
});
