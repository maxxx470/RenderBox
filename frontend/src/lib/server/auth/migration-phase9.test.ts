// Phase 9 migration (email + password sign-in, lockout, onboarding) —
// offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9_auth_onboarding must be sure of before it
// runs on the shared database: it sorts last, and it only ADDS columns that
// are nullable or carry a default — nothing dropped, renamed, rewritten.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9_auth_onboarding';

const folders = readdirSync(MIGRATIONS).filter((f) => statSync(join(MIGRATIONS, f)).isDirectory());
// CRLF on a Windows checkout (core.autocrlf), LF in Git and on Vercel.
const sql = readFileSync(join(MIGRATIONS, NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const byteOrder = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
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
    const sorted = [...folders].sort(byteOrder);
    // Only the engine-versions migrations (2026-10-15/16) may come after it.
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual([
      '9_phase9b_engine_versions',
      '9_phase9c_user_engine_versions',
      '9_phase9d_support_messages',
      '9_phase9e_user_info_seen',
      '9_phase9f_render_provider_credits',
    ]);
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
