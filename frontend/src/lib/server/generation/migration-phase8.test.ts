// Phase 8 migration (renders become credits) — offline shape checks.
// Reads files only: no database, no Prisma engine, no network.
//
// What a reviewer of 9_phase8_credits must be sure of before it runs on the
// shared database: it sorts after every other folder, it only adds (one
// column with a default, one CHECK), and its one UPDATE converts what each
// ACTIVE plan has left at 50 credits a render — nothing is dropped.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PRICING_TIERS, RENDER_COST } from '@/lib/pricing-tiers';

// Package root (frontend/), as in observability/runtime-enforcement.test.ts.
const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase8_credits';

const folders = readdirSync(MIGRATIONS).filter((f) => statSync(join(MIGRATIONS, f)).isDirectory());
// CRLF on a Windows checkout (core.autocrlf), LF in Git and on Vercel.
const sql = readFileSync(join(MIGRATIONS, NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const byteOrder = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const statements = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

describe(`migration ${NAME}`, () => {
  it('sorts after every migration folder that came before it (Prisma applies them in byte order)', () => {
    const sorted = [...folders].sort(byteOrder);
    // Only 9_phase9_auth_onboarding (2026-10-13) may come after it.
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual(['9_phase9_auth_onboarding']);
    expect(sorted.indexOf('20260829225539_tier_quota')).toBeLessThan(sorted.indexOf(NAME));
  });

  it('adds creditsBalance, not null with a default, and guards it with a CHECK >= 0', () => {
    expect(statements).toContain(
      'ALTER TABLE "User" ADD COLUMN "creditsBalance" INTEGER NOT NULL DEFAULT 0',
    );
    expect(statements).toContain(
      'ALTER TABLE "User" ADD CONSTRAINT "User_creditsBalance_nonnegative" CHECK ("creditsBalance" >= 0)',
    );
  });

  it('converts the renders left on an active plan at 50 credits each, using the old quotas', () => {
    const update = statements.find((s) => s.startsWith('UPDATE'));
    expect(update).toBeDefined();
    expect(RENDER_COST).toBe(50);
    expect(update).toContain('SET "creditsBalance" = 50 * GREATEST( 0,');
    expect(update).toContain(`WHEN 'decouverte' THEN 30`);
    expect(update).toContain(`WHEN 'standard' THEN 100`);
    expect(update).toContain(`WHEN 'pro' THEN 300`);
    expect(update).toContain('- "generationsUsedInPeriod"');
    // Only accounts whose 30-day period is still running.
    expect(update).toContain(`"tierPeriodStart" > NOW() - INTERVAL '30 days'`);
    // Every plan of pricing-tiers.ts is converted.
    for (const tier of PRICING_TIERS) expect(update).toContain(`WHEN '${tier.id}'`);
  });

  it('is additive: exactly those three statements, nothing dropped or renamed', () => {
    expect(statements).toHaveLength(3);
    expect(sql).not.toMatch(
      /\bDROP\b|\bRENAME\b|\bALTER COLUMN\b|\bDELETE\b|\bTRUNCATE\b|\bINSERT\b/i,
    );
  });
});
