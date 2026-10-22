// Kie cost per image migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9f_render_provider_credits must be sure of before it runs
// on the shared database (local = production): it sorts after the folders before it
// (Prisma applies folders in byte order of the name) and it only adds one nullable column.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9f_render_provider_credits';

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
  it('sorts after every existing migration folder', () => {
    const sorted = [...folders].sort(byteOrder);
    // Only 9_phase9g_render_sheet (2026-10-19) may come after it.
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual([
      '9_phase9g_render_sheet',
      '9_phase9h_kie_credits',
    ]);
  });

  it('only adds the nullable RenderNode.providerCredits column and changes no data', () => {
    expect(statements).toEqual([
      'ALTER TABLE "RenderNode" ADD COLUMN "providerCredits" DOUBLE PRECISION',
    ]);
  });
});
