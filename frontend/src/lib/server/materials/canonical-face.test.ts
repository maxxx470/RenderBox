// canonicalFace: the one key every face is stored and compared under; it must
// produce exactly the shape the database CHECK constraints accept.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CANONICAL_FACE_MAX_LENGTH,
  CANONICAL_FACE_PATTERN,
  canonicalFace,
  canonicalizeFace,
  isCanonicalFace,
} from './canonical-face';

describe('canonicalFace', () => {
  it.each([
    ['facade_principale', 'facade_principale'],
    ['Façade principale', 'facade_principale'],
    ['  Façade   principale  ', 'facade_principale'],
    ['FACADE PRINCIPALE', 'facade_principale'],
    ['façade—principale', 'facade_principale'],
    ['Toiture / Zinc', 'toiture_zinc'],
    ['__toiture__', 'toiture'],
    ['menuiseries\textérieures\n', 'menuiseries_exterieures'],
    ['Élévation Nord-Est', 'elevation_nord_est'],
    ['rez-de-chaussée 2', 'rez_de_chaussee_2'],
    ['ＴＯＩＴＵＲＥ', 'toiture'], // full-width letters, NFKD
    ['ﬁnition', 'finition'], // ligature, NFKD
    ['İnci', 'inci'], // dotted capital I: no locale-dependent lowercase
    ['3D', '3d'],
  ])('%j → %j', (raw, expected) => {
    expect(canonicalFace(raw)).toBe(expected);
  });

  it.each(['', '   ', '___', '—', '東京', 'ÆØ', '***'])('refuses %j (nothing is left)', (raw) => {
    expect(canonicalizeFace(raw)).toEqual({ ok: false, reason: 'empty' });
    expect(canonicalFace(raw)).toBeNull();
  });

  it('refuses a key longer than 64 characters instead of truncating it', () => {
    expect(canonicalFace('a'.repeat(CANONICAL_FACE_MAX_LENGTH))).toBe('a'.repeat(64));
    expect(canonicalizeFace('a'.repeat(65))).toEqual({ ok: false, reason: 'too_long' });
    // The limit applies after normalisation: separators collapse first.
    expect(canonicalFace(`${'a'.repeat(32)}     ${'b'.repeat(31)}`)).toHaveLength(64);
  });

  it('is idempotent and always produces what the database accepts', () => {
    const inputs = ['Façade principale', ' Toiture ', 'rez-de-chaussée 2', 'X', 'a_b_c', '9 9'];
    for (const raw of inputs) {
      const once = canonicalFace(raw)!;
      expect(canonicalFace(once)).toBe(once);
      expect(isCanonicalFace(once)).toBe(true);
      expect(CANONICAL_FACE_PATTERN.test(once)).toBe(true);
    }
  });

  it('isCanonicalFace refuses every non-canonical stored value', () => {
    for (const bad of ['', 'Toiture', 'façade', 'a b', '_a', 'a_', 'a__b', 'a-b', 'a'.repeat(65)]) {
      expect(isCanonicalFace(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('uses the same pattern as the migration CHECK constraints', () => {
    const sql = readFileSync(
      join(
        resolve(__dirname, '../../../..'),
        'prisma/migrations/9_phase7_materials_per_node/migration.sql',
      ),
      'utf8',
    );
    const checks = sql.match(/CHECK \(\("face" COLLATE "C"\) ~ '([^']+)'\)/g) ?? [];
    expect(checks).toHaveLength(2);
    for (const check of checks) expect(check).toContain(`'${CANONICAL_FACE_PATTERN.source}'`);
  });
});
