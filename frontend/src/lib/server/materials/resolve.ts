// Which materials belong to ONE image, and which of them may reach the engine
// (F4 redesign, step 1 — pure logic only; nothing calls it yet).
//
// The rules, decided by the owner (étape 3F):
//   - Isolation: only the detections and corrections of the active node are
//     considered. Nothing from a parent, a child, a sibling or another root;
//     no fallback to another image, ever.
//   - A manual correction always beats the detection of the same face,
//     whatever the detector's confidence. A correction with no value (null,
//     or a blank string) REMOVES the face: the detection cannot bring it back.
//   - Detections are used only when the caller says so (`includeDetections`);
//     corrections are used either way.
//   - Order is deterministic and never depends on the order rows were read:
//     detected faces by `position`, a correction taking the place of the face
//     it replaces; then faces that exist only as corrections, by `createdAt`
//     then `id`.
//   - Every result says where it comes from (`detection` | `correction`);
//     a correction carries no confidence score.
//
// Faces are matched by their canonical key (canonical-face.ts, the same rule
// the detection service writes with): accents, case, spaces and separators
// do not matter ("Façade principale" = "facade_principale"); a result keeps
// the spelling of the row it comes from, trimmed. A row whose face has no
// canonical key (empty, or longer than 64 characters once normalised) is
// ignored, never truncated.
//
// Duplicates are not expected (one row per node and face is the intended
// contract) but are handled deterministically:
//   - two detections of one face: the lowest `position` wins, then the
//     smallest value in code-unit order;
//   - two corrections of one face: the latest `createdAt` wins, then the
//     greatest `id`.
// A detection with a blank value is ignored (it says nothing).
//
// Pure: no I/O, no Prisma, no network, no clock; inputs are never mutated.
import { canonicalFace } from './canonical-face';

export interface NodeMaterialDetection {
  /** The image (RenderNode) the detector looked at. */
  nodeId: string;
  face: string;
  valeur: string;
  /** 0-100, as returned by the detector. */
  confidence: number;
  /** Order the detector returned this face in. */
  position: number;
}

export interface NodeMaterialCorrection {
  id: string;
  /** The image (RenderNode) the user corrected. */
  nodeId: string;
  face: string;
  /** null (or a blank string) = the face is removed from this image. */
  valeur: string | null;
  createdAt: Date;
}

export type ResolvedMaterial =
  | {
      face: string;
      valeur: string;
      origin: 'detection';
      nodeId: string;
      confidence: number;
    }
  | {
      face: string;
      valeur: string;
      origin: 'correction';
      nodeId: string;
    };

export interface ResolveMaterialsInput {
  /** The active image: the source of the generation. */
  nodeId: string;
  detections: readonly NodeMaterialDetection[];
  corrections: readonly NodeMaterialCorrection[];
  /** Whether automatic detections may be used at all. */
  includeDetections: boolean;
}

/** The canonical key of a face already known to have one (filtered first). */
const faceKey = (face: string) => canonicalFace(face) ?? '';

/** A timestamp usable in a sort: an invalid date sorts last, never NaN. */
function time(d: Date): number {
  const t = d.getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Detections in their final order: by position, then face, then value. */
function compareDetections(a: NodeMaterialDetection, b: NodeMaterialDetection): number {
  return (
    a.position - b.position ||
    compareStrings(faceKey(a.face), faceKey(b.face)) ||
    compareStrings(a.valeur.trim(), b.valeur.trim())
  );
}

/** Corrections oldest first, then by id: the later one in this order wins a duplicate. */
function compareCorrections(a: NodeMaterialCorrection, b: NodeMaterialCorrection): number {
  return time(a.createdAt) - time(b.createdAt) || compareStrings(a.id, b.id);
}

export function resolveMaterials(input: ResolveMaterialsInput): ResolvedMaterial[] {
  const nodeId = input.nodeId;
  if (!nodeId.trim()) {
    throw new Error('resolveMaterials: nodeId is required');
  }

  // Corrections of this image only, one per face: the latest wins.
  const correctionByFace = new Map<string, NodeMaterialCorrection>();
  for (const c of [...input.corrections]
    .filter((c) => c.nodeId === nodeId && canonicalFace(c.face) !== null)
    .sort(compareCorrections)) {
    correctionByFace.set(faceKey(c.face), c);
  }

  // Detections of this image only, one per face (the first in order wins),
  // and only when the caller allows them.
  const detections: NodeMaterialDetection[] = [];
  if (input.includeDetections) {
    const seen = new Set<string>();
    for (const d of [...input.detections]
      .filter(
        (d) => d.nodeId === nodeId && d.valeur.trim() !== '' && canonicalFace(d.face) !== null,
      )
      .sort(compareDetections)) {
      const key = faceKey(d.face);
      if (seen.has(key)) continue;
      seen.add(key);
      detections.push(d);
    }
  }

  const result: ResolvedMaterial[] = [];
  const placed = new Set<string>();

  // 1. Detected faces, in order; a correction replaces or removes its face.
  for (const d of detections) {
    const key = faceKey(d.face);
    placed.add(key);
    const correction = correctionByFace.get(key);
    if (correction) {
      const valeur = correction.valeur?.trim() ?? '';
      if (valeur) {
        result.push({ face: correction.face.trim(), valeur, origin: 'correction', nodeId });
      }
      // A blank correction removes the face: nothing is pushed.
      continue;
    }
    result.push({
      face: d.face.trim(),
      valeur: d.valeur.trim(),
      origin: 'detection',
      nodeId,
      confidence: d.confidence,
    });
  }

  // 2. Faces that exist only as corrections, oldest first.
  const rest = [...correctionByFace.entries()]
    .filter(([key]) => !placed.has(key))
    .map(([, c]) => c)
    .sort(compareCorrections);
  for (const c of rest) {
    const valeur = c.valeur?.trim() ?? '';
    if (valeur) result.push({ face: c.face.trim(), valeur, origin: 'correction', nodeId });
  }

  return result;
}
