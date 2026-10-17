// Phase 7 migration (materials per image) — offline shape checks.
// Reads files only: no database, no Prisma engine, no network.
//
// Guards the two things a reviewer of 9_phase7_materials_per_node must be
// sure of before it runs on the shared database:
//   - it sorts after every other folder (Prisma applies them in byte order
//     of the name; a timestamp name would run before RenderNode exists);
//   - it is strictly additive: every statement is on an allow-list, and
//     nothing drops, alters, renames, updates or deletes existing data.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Package root (frontend/), as in observability/runtime-enforcement.test.ts.
const ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'prisma/migrations');
const NAME = '9_phase7_materials_per_node';

const folders = readdirSync(MIGRATIONS).filter((f) => statSync(join(MIGRATIONS, f)).isDirectory());
// CRLF on a Windows checkout (core.autocrlf), LF in Git and on Vercel: read
// it the same either way.
const sql = readFileSync(join(MIGRATIONS, NAME, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');

/** Byte order of the folder name, the order Prisma applies migrations in. */
const byteOrder = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** The statements, comments removed, whitespace collapsed. */
const statements = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const NEW_TABLES = ['MaterialDetectionRun', 'MaterialDetection', 'MaterialCorrection'];

describe(`migration ${NAME}`, () => {
  it('sorts after every migration folder that came before it', () => {
    const sorted = [...folders].sort(byteOrder);
    // Only the later phases (2026-10-13) may come after it.
    expect(sorted.slice(sorted.indexOf(NAME) + 1)).toEqual([
      '9_phase8_credits',
      '9_phase9_auth_onboarding',
      '9_phase9b_engine_versions',
      '9_phase9c_user_engine_versions',
      '9_phase9d_support_messages',
    ]);
    // ...and in particular after the folders that create what it references.
    for (const dep of ['5_phase1_renderbox_core', '6_phase2_materials_memory']) {
      expect(sorted.indexOf(dep)).toBeGreaterThanOrEqual(0);
      expect(sorted.indexOf(dep)).toBeLessThan(sorted.indexOf(NAME));
    }
  });

  it('creates exactly the three new tables', () => {
    const created = statements
      .map((s) => /^CREATE TABLE "(\w+)"/.exec(s)?.[1])
      .filter((t): t is string => Boolean(t));
    expect(created.sort()).toEqual([...NEW_TABLES].sort());
  });

  it('adds only nullable columns to the existing tables: Material.attachedNodeId, Material.attachedAt, Generation.promptMaterials', () => {
    const added: string[] = [];
    for (const s of statements) {
      const m = /^ALTER TABLE "(\w+)" (ADD COLUMN .*)$/.exec(s);
      if (!m) continue;
      for (const col of m[2]!.split(/,\s*(?=ADD COLUMN)/)) {
        const c = /^ADD COLUMN "(\w+)" ([A-Z0-9()]+)(.*)$/.exec(col.trim());
        expect(c, col).not.toBeNull();
        expect(c![3], `${m[1]}.${c![1]} must be nullable`).not.toMatch(/NOT NULL|DEFAULT/);
        added.push(`${m[1]}.${c![1]} ${c![2]}`);
      }
    }
    expect(added.sort()).toEqual([
      'Generation.promptMaterials JSONB',
      'Material.attachedAt TIMESTAMP(3)',
      'Material.attachedNodeId TEXT',
    ]);
  });

  it('declares the expected foreign keys and their onDelete rules', () => {
    const fks = statements
      .map((s) =>
        /^ALTER TABLE "(\w+)" ADD CONSTRAINT "\w+" FOREIGN KEY \("(\w+)"\) REFERENCES "(\w+)"\("id"\) ON DELETE (CASCADE|SET NULL)/.exec(
          s,
        ),
      )
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]}.${m[2]} -> ${m[3]} ${m[4]}`);
    expect(fks.sort()).toEqual([
      'Material.attachedNodeId -> RenderNode SET NULL',
      'MaterialCorrection.legacyMaterialId -> Material SET NULL',
      'MaterialCorrection.nodeId -> RenderNode CASCADE',
      'MaterialDetection.nodeId -> RenderNode CASCADE',
      'MaterialDetectionRun.nodeId -> RenderNode CASCADE',
    ]);
  });

  it('declares the expected unique constraints, keys and indexes', () => {
    expect(statements).toEqual(
      expect.arrayContaining([
        'CREATE UNIQUE INDEX "MaterialDetection_nodeId_face_key" ON "MaterialDetection"("nodeId", "face")',
        'CREATE UNIQUE INDEX "MaterialCorrection_nodeId_face_key" ON "MaterialCorrection"("nodeId", "face")',
        'CREATE UNIQUE INDEX "MaterialCorrection_legacyMaterialId_key" ON "MaterialCorrection"("legacyMaterialId")',
        'CREATE INDEX "MaterialDetectionRun_status_updatedAt_idx" ON "MaterialDetectionRun"("status", "updatedAt")',
        'CREATE INDEX "Material_attachedNodeId_idx" ON "Material"("attachedNodeId")',
      ]),
    );
    expect(sql).toContain('CONSTRAINT "MaterialDetectionRun_pkey" PRIMARY KEY ("nodeId")');
  });

  it('declares the CHECK constraints, and none on MaterialCorrection.valeur (null = removal)', () => {
    const checks = statements
      .map((s) => /^ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" CHECK (.*)$/.exec(s))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[2]} ${m[3]}`);
    const FACE = `(("face" COLLATE "C") ~ '^[a-z0-9]+(_[a-z0-9]+)*$')`;
    expect(checks.sort()).toEqual(
      [
        `MaterialDetectionRun_status_check ("status" IN ('pending', 'succeeded', 'failed'))`,
        `MaterialCorrection_origin_check ("origin" IN ('user', 'legacy_attach'))`,
        `MaterialDetection_confidence_check ("confidence" BETWEEN 0 AND 100)`,
        `MaterialDetection_face_canonical_check ${FACE}`,
        `MaterialCorrection_face_canonical_check ${FACE}`,
      ].sort(),
    );
    expect(checks.join('\n')).not.toMatch(/valeur/);
  });

  it('the face pattern accepts canonical keys and refuses everything else', () => {
    const face = /^[a-z0-9]+(_[a-z0-9]+)*$/;
    for (const ok of ['toiture', 'facade_principale', 'rdc_2', '3d'])
      expect(face.test(ok), ok).toBe(true);
    for (const bad of [
      '',
      'Toiture',
      'façade',
      'facade principale',
      '_toiture',
      'toiture_',
      'a__b',
      'a-b',
    ])
      expect(face.test(bad), JSON.stringify(bad)).toBe(false);
  });

  it('is strictly additive: every statement is on the allow-list', () => {
    const allowed = [
      /^CREATE TABLE "(MaterialDetectionRun|MaterialDetection|MaterialCorrection)" \(/,
      /^CREATE (UNIQUE )?INDEX "\w+" ON "\w+"\("\w+"(, "\w+")*\)$/,
      /^ALTER TABLE "(Material|Generation)" ADD COLUMN "\w+" [A-Z0-9()]+(, ADD COLUMN "\w+" [A-Z0-9()]+)*$/,
      /^ALTER TABLE "\w+" ADD CONSTRAINT "\w+" (FOREIGN KEY|CHECK) /,
    ];
    for (const s of statements) {
      expect(
        allowed.some((re) => re.test(s)),
        `not on the allow-list: ${s}`,
      ).toBe(true);
    }
  });

  it('contains no destructive or data-changing operation', () => {
    const code = statements.join(';\n');
    for (const forbidden of [
      /\bDROP\b/i,
      /\bALTER COLUMN\b/i,
      /\bRENAME\b/i,
      /\bUPDATE\s+"/i,
      /\bDELETE\s+FROM\b/i,
      /\bINSERT\b/i,
      /\bTRUNCATE\b/i,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});
