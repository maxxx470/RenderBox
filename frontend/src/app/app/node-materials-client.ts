// The browser side of the per-image materials routes (étape 3C.4): list one
// image's faces, set a face's value, remove a face, cancel a correction. All
// through api() — CSRF on the mutations, never a retry of a PUT or a DELETE —
// and every failure is thrown as it came, an ApiError carrying the server's
// code (VALIDATION_FAILED, CONFLICT, MATERIALS_UNAVAILABLE…).
//
// The face in the path: the label the user typed when the face has one, so a
// correction keeps its name ("Façade sur rue"); the server turns it back into
// the same canonical key. Otherwise the canonical key itself. Never a name
// translated for display (face-labels.ts).
import { api, ApiError } from '@/lib/api';
import { canonicalizeFace } from '@/lib/server/materials/canonical-face';
import type { NodeFaceListItem, NodeFaceMaterial } from '@/lib/server/materials/node-materials';

export type { NodeFaceListItem, NodeFaceMaterial };

export function nodeMaterialsPath(projectId: string, nodeId: string, face?: string): string {
  const base = `/api/projects/${encodeURIComponent(projectId)}/nodes/${encodeURIComponent(nodeId)}/materials`;
  return face === undefined ? base : `${base}/${encodeURIComponent(face)}`;
}

/**
 * The attach route of one image (étape 3C.5.5): beside materials/, never
 * under it — a static segment there would take a face named "attach".
 */
export function legacyAttachPath(projectId: string, nodeId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/nodes/${encodeURIComponent(nodeId)}/legacy-attach`;
}

/**
 * What to put in the path for an existing face: its typed label when that
 * label still is this very face (the server would overwrite the label with
 * whatever the path says), else the canonical key.
 */
export function faceRef(item: Pick<NodeFaceMaterial, 'face' | 'faceLabel'>): string {
  const label = item.faceLabel?.trim();
  if (label) {
    const key = canonicalizeFace(label);
    if (key.ok && key.face === item.face) return label;
  }
  return item.face;
}

export async function listNodeMaterials(
  projectId: string,
  nodeId: string,
): Promise<NodeFaceListItem[]> {
  const res = await api<{ materials: NodeFaceListItem[] }>(nodeMaterialsPath(projectId, nodeId));
  if (!Array.isArray(res?.materials)) {
    // A 200 without the list is not "nothing known": say it failed.
    throw new ApiError(502, 'Malformed materials list', { error: 'MATERIALS_UNAVAILABLE' });
  }
  return res.materials;
}

/** Sets a face's value on this image; `face` is a faceRef() or a newly typed label. */
export async function setFaceValue(
  projectId: string,
  nodeId: string,
  face: string,
  valeur: string,
): Promise<NodeFaceMaterial> {
  const res = await api<{ material: NodeFaceMaterial }>(
    nodeMaterialsPath(projectId, nodeId, face),
    { method: 'PUT', body: { valeur } },
  );
  return res.material;
}

/** Removes a face from this image: the detection stays, it is just not sent. */
export async function removeFace(
  projectId: string,
  nodeId: string,
  face: string,
): Promise<NodeFaceMaterial> {
  const res = await api<{ material: NodeFaceMaterial }>(
    nodeMaterialsPath(projectId, nodeId, face),
    { method: 'PUT', body: { valeur: null } },
  );
  return res.material;
}

/** Cancels the correction: the detection, if any, applies again. */
export async function cancelCorrection(
  projectId: string,
  nodeId: string,
  face: string,
): Promise<{ deleted: boolean; material: NodeFaceMaterial }> {
  return api<{ deleted: boolean; material: NodeFaceMaterial }>(
    nodeMaterialsPath(projectId, nodeId, face),
    { method: 'DELETE' },
  );
}

/** What went wrong, as the panel tells it. */
export type MaterialsErrorKind =
  | 'validation'
  | 'session'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'network'
  | 'unknown';

export function materialsErrorKind(err: unknown): MaterialsErrorKind {
  if (!(err instanceof ApiError)) return 'unknown';
  if (err.status === 0) return 'network';
  if (err.status === 400) return 'validation';
  if (err.status === 401 || err.status === 403) return 'session';
  if (err.status === 404) return 'not_found';
  if (err.status === 409) return 'conflict';
  if (err.code === 'MATERIALS_UNAVAILABLE' || err.status === 503) return 'unavailable';
  return 'unknown';
}

/**
 * Attaches rows of the project's old sheet to this one image (étape 3C.5.4,
 * POST …/nodes/[nodeId]/legacy-attach): all of them or none, never retried (api() never
 * retries a POST). Resolves with what the server committed — the rows newly
 * attached, those already attached to this image, and the image's faces as
 * they now are. A refusal is thrown as it came: ATTACH_BLOCKED (409, with
 * the reason of every row, see attachBlockedLines), CONFLICT (409),
 * VALIDATION_FAILED, NODE_NOT_FOUND, MATERIALS_UNAVAILABLE…
 */
export interface AttachResult {
  attached: string[];
  alreadyAttached: string[];
  materials: NodeFaceListItem[];
}

export async function attachLegacyMaterials(
  projectId: string,
  nodeId: string,
  materialIds: readonly string[],
): Promise<AttachResult> {
  const res = await api<AttachResult>(legacyAttachPath(projectId, nodeId), {
    method: 'POST',
    body: { materialIds: [...materialIds] },
  });
  if (
    !Array.isArray(res?.attached) ||
    !Array.isArray(res?.alreadyAttached) ||
    !Array.isArray(res?.materials)
  ) {
    // A 200 the panel cannot read is not a success it may announce.
    throw new ApiError(502, 'Malformed attach answer', { error: 'MATERIALS_UNAVAILABLE' });
  }
  return res;
}

/** Why the server refused to attach one row (planLegacyAttach's reasons). */
export type AttachBlockReason =
  | 'not_found'
  | 'attached_elsewhere'
  | 'invalid_face'
  | 'invalid_value'
  | 'face_corrected'
  | 'face_masked'
  | 'duplicate_face';

const BLOCK_REASONS = new Set<string>([
  'not_found',
  'attached_elsewhere',
  'invalid_face',
  'invalid_value',
  'face_corrected',
  'duplicate_face',
]);

/**
 * The blocked rows of a 409 ATTACH_BLOCKED, by id; null for any other
 * failure. A face the image masks is told apart from a face it corrects
 * (the server's `correction: 'removed'`). A line the panel cannot read is
 * left out — the refusal itself still stands.
 */
export function attachBlockedLines(err: unknown): Record<string, AttachBlockReason> | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== 'ATTACH_BLOCKED') {
    return null;
  }
  const out: Record<string, AttachBlockReason> = {};
  const lines = Array.isArray(err.body.lines) ? (err.body.lines as unknown[]) : [];
  for (const line of lines) {
    if (typeof line !== 'object' || line === null) continue;
    const l = line as Record<string, unknown>;
    if (l.status !== 'blocked' || typeof l.materialId !== 'string') continue;
    if (typeof l.reason !== 'string' || !BLOCK_REASONS.has(l.reason)) continue;
    out[l.materialId] =
      l.reason === 'face_corrected' && l.correction === 'removed'
        ? 'face_masked'
        : (l.reason as AttachBlockReason);
  }
  return out;
}
