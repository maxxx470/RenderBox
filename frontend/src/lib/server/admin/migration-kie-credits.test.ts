// Kie credits migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9h_kie_credits must be sure of before it runs on
// the shared database (local = production): it sorts last, it creates the
// KieTopUp table and nothing else, and its one data change divides by 10 only
// the providerCredits stored before 2026-10-20 (Kie's tenths) — never a
// balance, never a row deleted.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9h_kie_credits';

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
  it('sorts after every migration before it (only 9_phase9i_building_sheets follows)', () => {
    const sorted = [...folders].sort(byteOrder);
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual(['9_phase9i_building_sheets']);
  });

  it('creates the KieTopUp table, its indexes and its link to the admin', () => {
    expect(statements[0]).toMatch(/^CREATE TABLE "KieTopUp" \(/);
    expect(statements.slice(1, 4)).toEqual([
      'CREATE INDEX "KieTopUp_createdAt_idx" ON "KieTopUp"("createdAt")',
      'CREATE INDEX "KieTopUp_adminId_idx" ON "KieTopUp"("adminId")',
      'ALTER TABLE "KieTopUp" ADD CONSTRAINT "KieTopUp_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    ]);
  });

  it('only divides the providerCredits stored before 2026-10-20 by 10', () => {
    expect(statements.slice(4)).toEqual([
      'UPDATE "RenderNode" SET "providerCredits" = "providerCredits" / 10 WHERE "providerCredits" IS NOT NULL AND "createdAt" < TIMESTAMP \'2026-10-20 00:00:00\'',
    ]);
  });

  it('drops, deletes and truncates nothing, and touches no balance', () => {
    const code = statements.join(';');
    expect(code).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
    expect(code.replace('ON DELETE SET NULL', '')).not.toMatch(/\bDELETE\b/i);
    expect(code).not.toMatch(/creditsBalance/);
  });
});
