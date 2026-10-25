import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { createLogger } from '@/lib/server/logger';

// Reading the reference images of a render (2026-10-25, owner: « des images
// de référence … ces images-là permettront à Pixel IA et Visio de savoir quel
// matériau appliquer au nouveau croquis »).
//
// THE ACCESS RULE, and it is the only one that matters here: a reference is
// named by node id, and a node is loaded ONLY through `project.userId`. A
// client that guesses or steals another account's node id gets nothing back
// — the row does not match, so there is no image to send and nothing to
// learn from the answer. The bytes never travel from the browser either:
// the browser names an image it already owns, the server fetches it.
//
// A reference that cannot be read (deleted meanwhile, blob gone, a foreign
// id) is DROPPED, not fatal. The alternative is failing a render the user
// has already paid for because one of three pictures went missing. The
// caller is told how many were actually read, and the prompt only ever
// mentions the ones the engine really receives.

const logger = createLogger();

/** Owner's choice: enough for a building, its planting and its sky. */
export const MAX_REFERENCE_IMAGES = 3;

/** A reference image's bytes, ready for the engines' `referenceImages`. */
export interface LoadedReferenceImage {
  nodeId: string;
  buffer: Buffer;
  mimeType: string;
}

/**
 * The reference images this account owns, among the ids asked for, in the
 * order they were asked for.
 *
 * `excludeNodeId` is the render's own source: pointing an image at itself as
 * its own reference would send the same picture twice and say nothing.
 */
export async function loadReferenceImages(
  nodeIds: readonly string[],
  userId: string,
  excludeNodeId?: string,
): Promise<LoadedReferenceImage[]> {
  const wanted = [...new Set(nodeIds)]
    .filter((id) => id !== excludeNodeId)
    .slice(0, MAX_REFERENCE_IMAGES);
  if (wanted.length === 0) return [];

  const rows = await prisma.renderNode.findMany({
    where: { id: { in: wanted }, project: { userId } },
    select: { id: true, blobUrl: true, mimeType: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const loaded: LoadedReferenceImage[] = [];
  for (const id of wanted) {
    const row = byId.get(id);
    if (!row) {
      logger.warn('reference image not available to this account', { nodeId: id });
      continue;
    }
    try {
      const res = await fetch(row.blobUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loaded.push({
        nodeId: row.id,
        buffer: Buffer.from(await res.arrayBuffer()),
        mimeType: row.mimeType,
      });
    } catch (err) {
      logger.warn('reference image could not be read', {
        nodeId: id,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
  return loaded;
}
