// The one canonical key of a material face (Phase 7, materials per image).
// Every face written to MaterialDetection / MaterialCorrection goes through
// here, and readers compare faces by this key. The database refuses any
// other shape (CHECK constraints *_face_canonical_check of migration
// 9_phase7_materials_per_node: ^[a-z0-9]+(_[a-z0-9]+)*$).
//
// The contract, in order:
//   1. Unicode NFKD;
//   2. combining marks (accents) removed;
//   3. lowercase — String#toLowerCase, which does not depend on the locale;
//   4. every run of characters other than ASCII a-z / 0-9 becomes one "_";
//   5. no "_" at either end;
//   6. empty → rejected;
//   7. longer than 64 characters → rejected, never truncated.
//
// "  Façade   principale " → "facade_principale"; "TOITURE-Zinc" → "toiture_zinc";
// "Æ" or "東" alone → rejected (nothing ASCII is left).
//
// Pure: no I/O, deterministic, the same result on every server.

export const CANONICAL_FACE_MAX_LENGTH = 64;

/** Same pattern as the database CHECK constraints. */
export const CANONICAL_FACE_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export type CanonicalFaceResult =
  | { ok: true; face: string }
  | { ok: false; reason: 'empty' | 'too_long' };

export function canonicalizeFace(raw: string): CanonicalFaceResult {
  const face = raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!face) return { ok: false, reason: 'empty' };
  if (face.length > CANONICAL_FACE_MAX_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, face };
}

/** The canonical key, or null when the face cannot have one. */
export function canonicalFace(raw: string): string | null {
  const result = canonicalizeFace(raw);
  return result.ok ? result.face : null;
}

/** Whether a stored value already is a canonical key. */
export function isCanonicalFace(face: string): boolean {
  return face.length <= CANONICAL_FACE_MAX_LENGTH && CANONICAL_FACE_PATTERN.test(face);
}
