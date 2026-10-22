// Render sheet migration — offline shape checks. Reads files only.
//
// What a reviewer of 9_phase9g_render_sheet must be sure of before it runs on
// the shared database (local = production): it sorts last (Prisma applies
// folders in byte order of the name) and it only adds — two nullable columns
// and a unique index (every image before it has a NULL code; several NULLs
// are allowed) — and changes no data.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase9g_render_sheet';

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
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual(['9_phase9h_kie_credits']);
  });

  it('only adds the nullable code and sheet columns and a unique index on the code', () => {
    expect(statements).toEqual([
      'ALTER TABLE "RenderNode" ADD COLUMN "code" TEXT',
      'ALTER TABLE "RenderNode" ADD COLUMN "sheet" JSONB',
      'CREATE UNIQUE INDEX "RenderNode_code_key" ON "RenderNode"("code")',
    ]);
  });

  it('drops, deletes and updates nothing', () => {
    expect(sql).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE)\b/i);
  });
});
