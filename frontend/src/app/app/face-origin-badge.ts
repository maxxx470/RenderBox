// What the badge of one face of the materials panel says (étape 3C.5.5),
// read from the server's answer for that face alone: its correction (none, a
// value, a removal), where the resolved value comes from, and where the
// correction comes from as stored (correctionOrigin). Never from the old
// project sheet: an equal value, a matching face or a date there says nothing
// about where this image's correction came from.
import type { NodeFaceListItem } from './node-materials-client';

export type FaceBadge =
  /** Masked on this image: a removal, whoever made it. */
  | 'hidden'
  /** A row of the old sheet attached to this image, untouched since. */
  | 'legacy'
  /** A value the user typed — an attached row the user changed included. */
  | 'correction'
  /** What the detector saw, no correction over it. */
  | 'detection'
  | null;

type FaceOrigin = Pick<NodeFaceListItem, 'correction' | 'origin' | 'correctionOrigin'>;

export function faceBadge(item: FaceOrigin): FaceBadge {
  if (item.correction === 'removed') return 'hidden';
  if (item.origin === 'correction') {
    return item.correctionOrigin === 'legacy_attach' ? 'legacy' : 'correction';
  }
  if (item.origin === 'detection') return 'detection';
  return null;
}

/**
 * The face's correction is still an old sheet's row: changing it, masking it
 * or cancelling it releases that row (étape 3C.5.3), so the sheet must be
 * read again once it went through.
 */
export function holdsLegacyRow(item: Pick<NodeFaceListItem, 'correctionOrigin'> | undefined) {
  return item?.correctionOrigin === 'legacy_attach';
}
