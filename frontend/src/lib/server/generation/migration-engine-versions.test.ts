// Engine-versions migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9b_engine_versions must be sure of before it runs
// on the shared database: it sorts last, and it only adds one nullable column.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9b_engine_versions';

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
    // Only 9_phase9c_user_engine_versions (2026-10-16) may come after it.
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual([
      '9_phase9c_user_engine_versions',
      '9_phase9d_support_messages',
      '9_phase9e_user_info_seen',
      '9_phase9f_render_provider_credits',
      '9_phase9g_render_sheet',
      '9_phase9h_kie_credits',
      '9_phase9i_building_sheets',
    ]);
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
