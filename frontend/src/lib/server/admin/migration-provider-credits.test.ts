// Kie cost per image migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9f_render_provider_credits must be sure of before it runs
// on the shared database (local = production): it sorts after the folders before it
// (Prisma applies folders in byte order of the name) and it only adds one nullable column.
import { describe, expect, it } from 'vitest';
import { expectAppliedAfterEarlier } from '@/test-utils/migration-order';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9f_render_provider_credits';

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

  it('only adds the nullable RenderNode.providerCredits column and changes no data', () => {
    expect(statements).toEqual([
      'ALTER TABLE "RenderNode" ADD COLUMN "providerCredits" DOUBLE PRECISION',
    ]);
  });
});
