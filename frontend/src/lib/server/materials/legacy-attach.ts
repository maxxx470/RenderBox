// Attaching rows of a project's OLD materials sheet (Material) to ONE image,
// on the user's explicit request (étape 3C.5, strategy C) — the plan only.
// This file decides, for each requested row, whether it can be attached and
// what that would write; the attach route (étape 3C.5.2) loads the rows, runs
// this, and writes the plan in one transaction. The panel's preview shows the
// same plan before the user confirms.
//
// Pure: no I/O, no Prisma, no clock; inputs are never mutated.
//
// The rules, validated by the owner (décisions D1–D8, étape 3C.5):
//   - Explicit only: nothing but the requested rows, onto the one image named;
//     never every image, never on an image's creation.
//   - One image per old row (D1): the schema holds one attachedNodeId per
//     Material and one correction per legacyMaterialId. A row attached to
//     another image is refused.
//   - A copy (D4): the row's value is copied into a MaterialCorrection of the
//     image (origin "legacy_attach"); a later change to the old sheet does not
//     reach it.
//   - An attached row is a correction like any other (D3): it beats the
//     image's detection of the same face — the plan says which detection it
//     replaces, so the preview can tell. resolveMaterials is not changed.
//   - Never overwrite (E): a face this image already corrects — with a value
//     or as a removal (Masquer) — blocks the row; the removal keeps its meaning.
//   - All or nothing (D2): one blocked row and nothing is written; the plan
//     lists every row's reason so the user can leave the blocked ones out.
//   - Asked twice (D6): a row already attached to this very image is "already
//     here" — not an error, nothing to write.
//   - Faces go through canonicalizeFace and values through
//     normalizeCorrectionText, the same rules as the per-face corrections
//     route; never truncated — a face or a value that does not fit is refused.
//
// What this cannot see — corrections of OTHER images holding the same old row,
// or a write landing between the read and the transaction — is left to the
// database: legacyMaterialId and (nodeId, face) are unique, and the route
// turns a lost race into a 409 with nothing written.
import { canonicalizeFace } from './canonical-face';
import { normalizeCorrectionText } from './correction-text';
import type { NodeMaterialCorrection, NodeMaterialDetection } from './resolve';

/** Same bound as the per-face corrections route (nodes/[nodeId]/materials/[face]). */
export const LEGACY_ATTACH_MAX_VALUE_LENGTH = 500;
/** Same bound as the per-face corrections route, for the label kept for display. */
export const LEGACY_ATTACH_MAX_LABEL_LENGTH = 200;
/** Rows one request may attach; the old sheet holds a handful per project. */
export const LEGACY_ATTACH_MAX_ROWS = 50;

/** A row of the old sheet, as the route reads it. */
export interface LegacyMaterialRow {
  id: string;
  projectId: string;
  /** As the old detector or the user wrote it — not necessarily canonical. */
  face: string;
  valeur: string;
  /** The image it is already attached to, if any. */
  attachedNodeId: string | null;
}

/** A correction of the target image, with the old row it came from, if any. */
export interface TargetCorrection extends NodeMaterialCorrection {
  legacyMaterialId: string | null;
}

export interface LegacyAttachInput {
  projectId: string;
  /** The image the user chose. */
  nodeId: string;
  /** The rows the user ticked, in the order shown. */
  requestedIds: readonly string[];
  /** The old sheet's rows (only this project's ever count). */
  legacy: readonly LegacyMaterialRow[];
  /** The target image's detections (another image's are ignored). */
  detections: readonly NodeMaterialDetection[];
  /** The target image's corrections (another image's are ignored). */
  corrections: readonly TargetCorrection[];
}

export type LegacyAttachLine =
  /** Will be written: a correction of the image, and the row marked attached. */
  | {
      materialId: string;
      status: 'attach';
      /** Canonical key. */
      face: string;
      /** Shown for the face; null when the old face already is the key. */
      faceLabel: string | null;
      valeur: string;
      /** The image's own detection of this face, which the row will replace. */
      replaces: { valeur: string; confidence: number } | null;
      /**
       * The row still says it is attached to this image, but the image holds
       * no correction from it (cancelled before étape 3C.5.3 cleared that):
       * the route may write over that stale mark.
       */
      reattach: boolean;
    }
  /** Already attached to this very image: nothing to write (D6). */
  | { materialId: string; status: 'already_here'; face: string | null }
  | {
      materialId: string;
      status: 'blocked';
      reason:
        | 'not_found'
        | 'attached_elsewhere'
        | 'invalid_face'
        | 'invalid_value'
        | 'face_corrected'
        | 'duplicate_face';
      /** The canonical key, when the row has one. */
      face: string | null;
      /** attached_elsewhere: the image holding it. */
      attachedNodeId?: string;
      /** face_corrected: what the image's correction does to the face. */
      correction?: 'value' | 'removed';
      /** invalid_face / invalid_value: why. */
      detail?: 'empty' | 'too_long';
      /** duplicate_face: the other requested rows with the same key. */
      withIds?: string[];
    };

export interface LegacyAttachPlan {
  /** Whether the request may be written: a usable batch, no blocked row. */
  ok: boolean;
  /** A problem with the request as a whole, before any row is looked at. */
  batchError: 'empty' | 'too_many' | null;
  /** One line per requested row (duplicate ids counted once), in request order. */
  lines: LegacyAttachLine[];
  /** The lines to write when ok — possibly none (everything already here). */
  writes: Extract<LegacyAttachLine, { status: 'attach' }>[];
}

/** The image's detection of a face: the first by position, as resolveMaterials picks it. */
function detectionOf(
  detections: readonly NodeMaterialDetection[],
  nodeId: string,
  face: string,
): { valeur: string; confidence: number } | null {
  const match = detections
    .filter((d) => {
      if (d.nodeId !== nodeId || d.valeur.trim() === '') return false;
      const key = canonicalizeFace(d.face);
      return key.ok && key.face === face;
    })
    .sort((a, b) => {
      const va = a.valeur.trim();
      const vb = b.valeur.trim();
      return a.position - b.position || (va < vb ? -1 : va > vb ? 1 : 0);
    })[0];
  return match ? { valeur: match.valeur.trim(), confidence: match.confidence } : null;
}

export function planLegacyAttach(input: LegacyAttachInput): LegacyAttachPlan {
  const { projectId, nodeId } = input;
  const ids = [...new Set(input.requestedIds)];
  if (ids.length === 0) return { ok: false, batchError: 'empty', lines: [], writes: [] };
  if (ids.length > LEGACY_ATTACH_MAX_ROWS) {
    return { ok: false, batchError: 'too_many', lines: [], writes: [] };
  }

  const rowById = new Map(
    input.legacy.filter((r) => r.projectId === projectId).map((r) => [r.id, r] as const),
  );
  const corrections = input.corrections.filter((c) => c.nodeId === nodeId);
  const correctionByFace = new Map<string, TargetCorrection>();
  for (const c of corrections) {
    const key = canonicalizeFace(c.face);
    if (key.ok) correctionByFace.set(key.face, c);
  }

  const lines: LegacyAttachLine[] = ids.map((materialId): LegacyAttachLine => {
    const row = rowById.get(materialId);
    if (!row) return { materialId, status: 'blocked', reason: 'not_found', face: null };

    const key = canonicalizeFace(row.face);
    const face = key.ok ? key.face : null;

    // Already attached here: this image holds a correction from this row.
    if (corrections.some((c) => c.legacyMaterialId === materialId)) {
      return { materialId, status: 'already_here', face };
    }
    if (row.attachedNodeId !== null && row.attachedNodeId !== nodeId) {
      return {
        materialId,
        status: 'blocked',
        reason: 'attached_elsewhere',
        face,
        attachedNodeId: row.attachedNodeId,
      };
    }
    if (!key.ok) {
      return {
        materialId,
        status: 'blocked',
        reason: 'invalid_face',
        face: null,
        detail: key.reason,
      };
    }
    const valeur = normalizeCorrectionText(row.valeur);
    if (!valeur || valeur.length > LEGACY_ATTACH_MAX_VALUE_LENGTH) {
      return {
        materialId,
        status: 'blocked',
        reason: 'invalid_value',
        face: key.face,
        detail: valeur ? 'too_long' : 'empty',
      };
    }
    const existing = correctionByFace.get(key.face);
    if (existing) {
      const removed = existing.valeur === null || existing.valeur.trim() === '';
      return {
        materialId,
        status: 'blocked',
        reason: 'face_corrected',
        face: key.face,
        correction: removed ? 'removed' : 'value',
      };
    }

    const label = normalizeCorrectionText(row.face);
    return {
      materialId,
      status: 'attach',
      face: key.face,
      faceLabel: label === key.face || label.length > LEGACY_ATTACH_MAX_LABEL_LENGTH ? null : label,
      valeur,
      replaces: detectionOf(input.detections, nodeId, key.face),
      reattach: row.attachedNodeId === nodeId,
    };
  });

  // Two requested rows landing on one face of the image: neither is chosen
  // for the user — both are blocked, each naming the other.
  const byFace = new Map<string, string[]>();
  for (const line of lines) {
    if (line.status === 'attach')
      byFace.set(line.face, [...(byFace.get(line.face) ?? []), line.materialId]);
  }
  const resolved = lines.map((line): LegacyAttachLine => {
    if (line.status !== 'attach') return line;
    const same = byFace.get(line.face) ?? [];
    if (same.length < 2) return line;
    return {
      materialId: line.materialId,
      status: 'blocked',
      reason: 'duplicate_face',
      face: line.face,
      withIds: same.filter((id) => id !== line.materialId),
    };
  });

  const ok = resolved.every((l) => l.status !== 'blocked');
  return {
    ok,
    batchError: null,
    lines: resolved,
    writes: ok
      ? resolved.filter(
          (l): l is Extract<LegacyAttachLine, { status: 'attach' }> => l.status === 'attach',
        )
      : [],
  };
}
