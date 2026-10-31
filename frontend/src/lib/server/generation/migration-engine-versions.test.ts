// Engine-versions migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9b_engine_versions must be sure of before it runs
// on the shared database: it runs after the migrations written before it, and it only adds one nullable column.
import { describe, expect, it } from 'vitest';
import { expectAppliedAfterEarlier } from '@/test-utils/migration-order';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9b_engine_versions';

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

  it('is one nullable column on RenderNode', () => {
    expect(statements).toEqual(['ALTER TABLE "RenderNode" ADD COLUMN "engineVersion" TEXT']);
  });

  it('contains no destructive or data-changing operation', () => {
    expect(code).not.toMatch(
      /\bDROP\b|\bRENAME\b|\bALTER COLUMN\b|\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bTRUNCATE\b|NOT NULL/i,
    );
  });
});
