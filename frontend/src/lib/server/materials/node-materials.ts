// Materials of ONE image (RenderNode), read from the Phase 7 tables — the
// per-image corrections API (étape 3C.2) and the generate / edit routes
// (étape 3C.3) read through here. Nothing from another image, nothing from
// the project's old Material sheet.
//
// Reading only: no detection is started, nothing is written, no AI call.
// Database errors are never caught here — the route turns them into a
// controlled answer; an unreadable correction must never look like "none".
//
// What a face resolves to is decided by resolveMaterials (resolve.ts), the
// one resolution logic: a correction beats the detection of its face, a
// correction with no value removes it, and only this node's rows count.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { toPromptLine, type MaterialSnapshotEntry } from '@/lib/server/generation/build-prompt';
import { canonicalFace } from './canonical-face';
import { normalizeCorrectionText } from './correction-text';
import {
  resolveMaterials,
  type NodeMaterialCorrection,
  type NodeMaterialDetection,
  type ResolvedMaterial,
} from './resolve';

/** A stored correction, with the label the user typed for its face. */
export interface NodeCorrectionRow extends NodeMaterialCorrection {
  faceLabel: string | null;
  updatedAt: Date;
  /**
   * Who wrote it, as stored (MaterialCorrection.origin): "user", or
   * "legacy_attach" for a row of the old sheet attached to this image and
   * not touched since (a PUT makes it "user", étape 3C.5.3).
   */
  origin: string;
}

export interface NodeMaterialRows {
  detections: NodeMaterialDetection[];
  corrections: NodeCorrectionRow[];
}

/** The detections and corrections of one node — and of that node only. */
export async function loadNodeMaterialRows(nodeId: string): Promise<NodeMaterialRows> {
  const [detections, corrections] = await Promise.all([
    prisma.materialDetection.findMany({
      where: { nodeId },
      select: { nodeId: true, face: true, valeur: true, confidence: true, position: true },
    }),
    prisma.materialCorrection.findMany({
      where: { nodeId },
      select: {
        id: true,
        nodeId: true,
        face: true,
        faceLabel: true,
        valeur: true,
        origin: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  return { detections, corrections };
}

/**
 * The materials of one image as a prompt lists them (étape 3C.3): that
 * node's detections and corrections, resolved by resolveMaterials — a
 * correction beats the detection of its face, a removal drops it. An entry
 * that says nothing once put on one prompt line is left out, the same filter
 * as buildGenerationPrompt, so this list is exactly what the prompt lists:
 * the snapshot stored in Generation.promptMaterials. A read error is left to
 * the caller — never a partial list, never the old project sheet instead.
 */
export async function loadPromptMaterials(nodeId: string): Promise<ResolvedMaterial[]> {
  const rows = await loadNodeMaterialRows(nodeId);
  return resolveMaterials({
    nodeId,
    detections: rows.detections,
    corrections: rows.corrections,
    includeDetections: true,
  }).filter((m) => toPromptLine(m.face) !== '' && toPromptLine(m.valeur) !== '');
}

/** Resolved materials in the shape buildGenerationPrompt takes. */
export function toPromptEntries(materials: readonly ResolvedMaterial[]): MaterialSnapshotEntry[] {
  return materials.map((m) => ({
    face: m.face,
    valeur: m.valeur,
    source: m.origin,
    confidence: m.origin === 'detection' ? m.confidence : null,
  }));
}

/** What one face of one image amounts to, for the materials panel. */
export interface NodeFaceMaterial {
  /** Canonical key. */
  face: string;
  /** The label the user typed, when a correction holds one. */
  faceLabel: string | null;
  /** The resolved value; null when the face is absent or removed. */
  valeur: string | null;
  /** Where the resolved value comes from; null when there is none. */
  origin: 'detection' | 'correction' | null;
  /** The detector's score, for a detected value only. */
  confidence: number | null;
  /** The user's correction on this face: none, a value, or a removal. */
  correction: 'none' | 'value' | 'removed';
  /**
   * Where that correction comes from, as stored — never guessed from the old
   * sheet (étape 3C.5.5): "legacy_attach", a row of the old sheet attached to
   * this image and untouched since; "user", typed (or removed) by the user,
   * including an attached row the user changed since; null, no correction.
   */
  correctionOrigin: CorrectionOrigin | null;
}

export type CorrectionOrigin = 'user' | 'legacy_attach';

/** A stored origin as the panel may show it: anything but an attach is the user's. */
export function correctionOriginOf(stored: string): CorrectionOrigin {
  return stored === 'legacy_attach' ? 'legacy_attach' : 'user';
}

/**
 * One face of one node, resolved by resolveMaterials over that node's rows
 * (detections included: they belong to the same image). `face` must be a
 * canonical key.
 */
export function describeNodeFace(
  nodeId: string,
  face: string,
  rows: NodeMaterialRows,
): NodeFaceMaterial {
  const resolved = resolveMaterials({
    nodeId,
    detections: rows.detections,
    corrections: rows.corrections,
    includeDetections: true,
  }).find((m) => canonicalFace(m.face) === face);

  const correction = rows.corrections.find(
    (c) => c.nodeId === nodeId && canonicalFace(c.face) === face,
  );
  const correctionState: NodeFaceMaterial['correction'] = !correction
    ? 'none'
    : correction.valeur?.trim()
      ? 'value'
      : 'removed';

  return {
    face,
    faceLabel: correction?.faceLabel ?? null,
    valeur: resolved?.valeur ?? null,
    origin: resolved?.origin ?? null,
    confidence: resolved?.origin === 'detection' ? resolved.confidence : null,
    correction: correctionState,
    correctionOrigin: correction ? correctionOriginOf(correction.origin) : null,
  };
}

/** One face of one image for the materials panel, with what the detector saw. */
export interface NodeFaceListItem extends NodeFaceMaterial {
  /**
   * The detection of this face on this image, even when a correction
   * replaces or removes it — what "Revenir à la détection" brings back.
   * null when the detector has nothing for this face.
   */
  detected: { valeur: string; confidence: number } | null;
}

/**
 * Every face one image knows of (étape 3C.4): detected faces in the
 * detector's order, then faces that exist only as corrections, oldest first
 * — the order resolveMaterials gives, with removed faces kept in their place
 * so the user can bring them back. Each face is resolved by describeNodeFace;
 * the detection under it comes from resolveMaterials run on the detections
 * alone. Only this node's rows count.
 */
export function describeNodeFaces(nodeId: string, rows: NodeMaterialRows): NodeFaceListItem[] {
  const detectedOnly = resolveMaterials({
    nodeId,
    detections: rows.detections,
    corrections: [],
    includeDetections: true,
  });
  const keys: string[] = [];
  for (const d of detectedOnly) {
    const key = canonicalFace(d.face);
    if (key && !keys.includes(key)) keys.push(key);
  }
  const corrections = rows.corrections
    .filter((c) => c.nodeId === nodeId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  for (const c of corrections) {
    const key = canonicalFace(c.face);
    if (key && !keys.includes(key)) keys.push(key);
  }

  return keys.map((face) => {
    const detection = detectedOnly.find((d) => canonicalFace(d.face) === face);
    return {
      ...describeNodeFace(nodeId, face, rows),
      detected:
        detection?.origin === 'detection'
          ? { valeur: detection.valeur, confidence: detection.confidence }
          : null,
    };
  });
}

// Re-exported for the callers that import it from here (étape 3C.2).
export { normalizeCorrectionText };
