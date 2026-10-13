// Where the keyboard focus goes around the "Masquer" confirmation of the
// per-image materials panel (étape 3C.4-S) — the decisions, without the DOM,
// so they can be tested in Node. NodeMaterialsPanel applies them.
//
//   - While the confirmation is open, Tab and Shift+Tab cycle through its own
//     controls and never reach the page behind it (trapTabIndex).
//   - Closed without confirming (Annuler, Échap, a click outside): the focus
//     goes back to the button that opened it, if it is still there and
//     enabled (canTakeFocus).
//   - Confirmed: the button that opened it is disabled while the request runs
//     and gone once the face is masked, so the focus is first parked on the
//     face's row, then, once the server answered, moved to a control that
//     makes sense (hideFocusPlan) — unless the user has put it elsewhere in
//     the meantime, which is never undone.

/** Controls that take the focus inside the confirmation. */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The index to focus when Tab (or Shift+Tab) is pressed among `count`
 * controls, the focus being on `current` (-1: on none of them). It wraps
 * around at both ends; -1 when there is nothing to focus.
 */
export function trapTabIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

/** The little of an element this file needs; an HTMLElement fits. */
export interface FocusTarget {
  isConnected: boolean;
  disabled?: boolean;
  focus: () => void;
}

/** Whether an element can be given the focus: still on the page, not disabled. */
export function canTakeFocus(el: FocusTarget | null | undefined): el is FocusTarget {
  return Boolean(el && el.isConnected && el.disabled !== true);
}

/** Focuses the first element that can take it; false when none could. */
export function focusFirst(candidates: readonly (FocusTarget | null | undefined)[]): boolean {
  for (const el of candidates) {
    if (canTakeFocus(el)) {
      el.focus();
      return true;
    }
  }
  return false;
}

/** The actions of a face's row the focus may land on. */
export type RowAction = 'hide' | 'restore' | 'edit';

/** One place to try, in order: an action of a face's row, or the panel's title. */
export type HideFocusStep = { face: string; action: RowAction } | 'title';

export interface HideFocusInput {
  /**
   * success: the face is masked; failure: it is not (its Masquer is back);
   * stale: the answer is about an image the user has left.
   */
  outcome: 'success' | 'failure' | 'stale';
  /** The masked face (canonical key). */
  face: string;
  /** The faces listed when Masquer was confirmed, in order. */
  before: readonly string[];
  /** The faces listed now, in order. */
  after: readonly string[];
  /** The focus is no longer where the panel parked it: the user moved it. */
  userMovedFocus: boolean;
}

/**
 * Where the focus goes once the server answered a confirmed Masquer: the
 * places to try, in order (the first that exists and is enabled wins); empty
 * when the focus must be left where it is.
 *
 *   - the user moved the focus: leave it;
 *   - another image is now shown: the panel's title;
 *   - masked: "Revenir à la détection" (or "Annuler la correction") of the
 *     same row — the way back —, else its Modifier, else the title;
 *   - not masked: its Masquer again, else its Modifier, else the title;
 *   - the row is gone: the next face's Modifier, else the previous one's,
 *     else the title.
 */
export function hideFocusPlan(input: HideFocusInput): HideFocusStep[] {
  const { outcome, face, before, after } = input;
  if (input.userMovedFocus) return [];
  if (outcome === 'stale') return ['title'];
  if (after.includes(face)) {
    const first: RowAction = outcome === 'success' ? 'restore' : 'hide';
    return [{ face, action: first }, { face, action: 'edit' }, 'title'];
  }
  const at = before.indexOf(face);
  const later = at < 0 ? [] : before.slice(at + 1);
  const earlier = at < 0 ? [] : before.slice(0, at).reverse();
  const neighbour = [...later, ...earlier].find((f) => after.includes(f));
  return neighbour ? [{ face: neighbour, action: 'edit' }, 'title'] : ['title'];
}
