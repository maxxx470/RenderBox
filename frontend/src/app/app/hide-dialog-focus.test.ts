// The focus around the "Masquer" confirmation (étape 3C.4-S), without a DOM:
// the Tab cycle inside it, which elements may still take the focus, and where
// it goes once the server answered. NodeMaterialsPanel applies these on the
// real elements; that part, and the keyboard itself, has no test here (no
// jsdom in this repository).
import { describe, it, expect, vi } from 'vitest';
import { canTakeFocus, focusFirst, hideFocusPlan, trapTabIndex } from './hide-dialog-focus';

describe('trapTabIndex — Tab never leaves the confirmation', () => {
  it('Tab goes forward and wraps from the last control to the first', () => {
    expect(trapTabIndex(2, 0, false)).toBe(1);
    expect(trapTabIndex(2, 1, false)).toBe(0);
    expect(trapTabIndex(3, 1, false)).toBe(2);
  });

  it('Shift+Tab goes back and wraps from the first control to the last', () => {
    expect(trapTabIndex(2, 1, true)).toBe(0);
    expect(trapTabIndex(2, 0, true)).toBe(1);
    expect(trapTabIndex(3, 0, true)).toBe(2);
  });

  it('with the focus outside the confirmation, Tab brings it to the first, Shift+Tab to the last', () => {
    expect(trapTabIndex(2, -1, false)).toBe(0);
    expect(trapTabIndex(2, -1, true)).toBe(1);
    expect(trapTabIndex(2, 5, false)).toBe(0);
  });

  it('one control keeps the focus; none gives -1', () => {
    expect(trapTabIndex(1, 0, false)).toBe(0);
    expect(trapTabIndex(1, 0, true)).toBe(0);
    expect(trapTabIndex(0, -1, false)).toBe(-1);
  });
});

const el = (opts: { isConnected?: boolean; disabled?: boolean } = {}) => ({
  isConnected: opts.isConnected ?? true,
  ...(opts.disabled === undefined ? {} : { disabled: opts.disabled }),
  focus: vi.fn(),
});

describe('canTakeFocus / focusFirst — never a disabled or removed element', () => {
  it('an element on the page and enabled can take the focus', () => {
    expect(canTakeFocus(el())).toBe(true);
    expect(canTakeFocus(el({ disabled: false }))).toBe(true);
  });

  it('a disabled button (Masquer while its request runs) cannot', () => {
    expect(canTakeFocus(el({ disabled: true }))).toBe(false);
  });

  it('an element no longer on the page (Masquer once the face is masked) cannot', () => {
    expect(canTakeFocus(el({ isConnected: false }))).toBe(false);
    expect(canTakeFocus(null)).toBe(false);
    expect(canTakeFocus(undefined)).toBe(false);
  });

  it('focuses the first candidate that can take the focus, and only that one', () => {
    const gone = el({ isConnected: false });
    const disabled = el({ disabled: true });
    const ok = el();
    const after = el();
    expect(focusFirst([null, gone, disabled, ok, after])).toBe(true);
    expect(gone.focus).not.toHaveBeenCalled();
    expect(disabled.focus).not.toHaveBeenCalled();
    expect(ok.focus).toHaveBeenCalledTimes(1);
    expect(after.focus).not.toHaveBeenCalled();
  });

  it('says so when no candidate could take it', () => {
    expect(focusFirst([null, el({ disabled: true })])).toBe(false);
    expect(focusFirst([])).toBe(false);
  });
});

describe('hideFocusPlan — where the focus goes once Masquer was answered', () => {
  const base = {
    face: 'toiture',
    before: ['facade_principale', 'toiture', 'sol'],
    after: ['facade_principale', 'toiture', 'sol'],
    userMovedFocus: false,
  };

  it('masked, the row still listed: its way back first, then its Modifier, then the title', () => {
    expect(hideFocusPlan({ ...base, outcome: 'success' })).toEqual([
      { face: 'toiture', action: 'restore' },
      { face: 'toiture', action: 'edit' },
      'title',
    ]);
  });

  it('masked, a face with no detection under it: same plan — its button says "Annuler la correction"', () => {
    // The row's way back is the same control (data-row-action="restore"),
    // labelled by whether a detection exists; Modifier stays the fallback.
    expect(hideFocusPlan({ ...base, outcome: 'success' })[0]).toEqual({
      face: 'toiture',
      action: 'restore',
    });
  });

  it('not masked (the request failed): its Masquer again, enabled once more', () => {
    expect(hideFocusPlan({ ...base, outcome: 'failure' })).toEqual([
      { face: 'toiture', action: 'hide' },
      { face: 'toiture', action: 'edit' },
      'title',
    ]);
  });

  it('the row gone from the list: the next face’s Modifier', () => {
    expect(
      hideFocusPlan({ ...base, outcome: 'success', after: ['facade_principale', 'sol'] }),
    ).toEqual([{ face: 'sol', action: 'edit' }, 'title']);
  });

  it('the row gone and it was the last: the previous face’s Modifier', () => {
    expect(
      hideFocusPlan({
        ...base,
        face: 'sol',
        outcome: 'success',
        after: ['facade_principale', 'toiture'],
      }),
    ).toEqual([{ face: 'toiture', action: 'edit' }, 'title']);
  });

  it('the row gone and no other face listed: the title', () => {
    expect(hideFocusPlan({ ...base, before: ['toiture'], after: [], outcome: 'success' })).toEqual([
      'title',
    ]);
  });

  it('the neighbour must still be listed itself', () => {
    expect(hideFocusPlan({ ...base, outcome: 'success', after: ['facade_principale'] })).toEqual([
      { face: 'facade_principale', action: 'edit' },
      'title',
    ]);
  });

  it('another image is shown now: the title — never a row of that image with the same key', () => {
    expect(hideFocusPlan({ ...base, outcome: 'stale' })).toEqual(['title']);
  });

  it('the user moved the focus meanwhile: it is left where they put it', () => {
    expect(hideFocusPlan({ ...base, outcome: 'success', userMovedFocus: true })).toEqual([]);
    expect(hideFocusPlan({ ...base, outcome: 'failure', userMovedFocus: true })).toEqual([]);
    expect(hideFocusPlan({ ...base, outcome: 'stale', userMovedFocus: true })).toEqual([]);
  });
});
