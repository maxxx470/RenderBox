// Support messages migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9d_support_messages must be sure of before it runs
// on the shared database (local = production): it sorts after the folders before it (Prisma
// applies folders in byte order of the name), and it only creates the new table, its
// indexes and its foreign key — nothing existing is altered, dropped or changed.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9d_support_messages';

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
  it('sorts after every migration folder that came before it', () => {
    const sorted = [...folders].sort(byteOrder);
    // Only the later 2026-10-17 migrations may come after it.
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual([
      '9_phase9e_user_info_seen',
      '9_phase9f_render_provider_credits',
      '9_phase9g_render_sheet',
      '9_phase9h_kie_credits',
    ]);
  });

  it('only creates the SupportMessage table, its indexes and its link to User', () => {
    expect(statements).toHaveLength(4);
    expect(statements[0]).toMatch(/^CREATE TABLE "SupportMessage" \(/);
    expect(statements[1]).toMatch(
      /^CREATE INDEX "SupportMessage_userId_createdAt_idx" ON "SupportMessage"/,
    );
    expect(statements[2]).toMatch(
      /^CREATE INDEX "SupportMessage_fromAdmin_readAt_idx" ON "SupportMessage"/,
    );
    expect(statements[3]).toMatch(
      /^ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/,
    );
  });

  it('touches no existing table and changes no data', () => {
    // The foreign key's own wording (REFERENCES "User", ON DELETE / ON UPDATE CASCADE) aside.
    const others = statements
      .join('\n')
      .replace(/REFERENCES "User"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE/g, '');
    expect(others).not.toMatch(
      /"User"|\bDROP\b|\bRENAME\b|\bALTER COLUMN\b|\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bTRUNCATE\b/i,
    );
  });
});
