// Building sheets migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9i_building_sheets must be sure of before it runs
// on the shared database (local = production): it runs after the migrations written before it, it creates the
// BuildingSheet table (deleted with its project) and adds one nullable column
// to Generation — nothing dropped, deleted or rewritten. The Claude analysis
// that used them was removed on 2026-10-23 (owner: « il n'y aura plus
// d'analyse »); the table and the column stay in the base, unused.
import { describe, expect, it } from 'vitest';
import { expectAppliedAfterEarlier } from '@/test-utils/migration-order';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9i_building_sheets';

// CRLF on a Windows checkout (core.autocrlf), LF in Git and on Vercel.
const sql = readFileSync(join(MIGRATIONS, NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
const statements = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

describe(`migration ${NAME}`, () => {
  it('sorts after every existing migration folder', () => {
    expectAppliedAfterEarlier(NAME);
  });

  it('creates the BuildingSheet table, its index and its link to the project', () => {
    expect(statements[0]).toMatch(/^CREATE TABLE "BuildingSheet" \(/);
    expect(statements.slice(1, 3)).toEqual([
      'CREATE INDEX "BuildingSheet_projectId_kind_idx" ON "BuildingSheet"("projectId", "kind")',
      'ALTER TABLE "BuildingSheet" ADD CONSTRAINT "BuildingSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    ]);
  });

  it('adds one nullable column to Generation, and nothing else', () => {
    expect(statements.slice(3)).toEqual(['ALTER TABLE "Generation" ADD COLUMN "analysis" JSONB']);
  });

  it('drops, deletes, truncates and updates nothing', () => {
    const code = statements.join(';').replace('ON DELETE CASCADE', '');
    expect(code).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE "|INSERT)\b/i);
  });
});
