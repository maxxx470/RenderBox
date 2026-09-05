'use client';

// Hover-and-click popover behaviour, shared by every chip in the command bar.
//
// The reference bar this one is modelled on opens each control's panel when
// the pointer rests on the chip — you sweep along the row and the model list,
// the ratio grid and the resolution list each show themselves in turn,
// without a single click. Our chips were click-only, which meant the row read
// as five closed doors.
//
// Three timings make hover-opening usable rather than twitchy:
//
//   OPEN_DELAY  — a pointer crossing the row on its way somewhere else must
//                 not fire three panels behind it. 90ms is under the ~120ms
//                 it takes to register a panel appearing, so a deliberate
//                 hover still feels instant.
//   CLOSE_DELAY — the panel floats 10px above its chip, and that gap belongs
//                 to whatever is underneath. Crossing it fires mouseleave on
//                 the wrapper, so without a close delay the panel would shut
//                 in the pointer's face every time. 220ms is far longer than
//                 the crossing takes.
//   HANDOFF     — moving from one chip to the next should swap panels rather
//                 than close one and wait to open the other. A chip that
//                 opens while a sibling is still on screen skips its own
//                 open delay (see `handoff`), which is what makes sweeping
//                 the row feel like one continuous control.
//
// Click still works, and still toggles: touch has no hover at all, so the
// click path is the only one some users will ever take.
import { useCallback, useEffect, useRef, useState } from 'react';

const OPEN_DELAY_MS = 90;
const CLOSE_DELAY_MS = 220;

// Shared across every instance: "is any command-bar panel currently open?".
// Deliberately a module-level ref rather than context — the chips are
// siblings in half a dozen different parents, and the only thing they need to
// agree on is a single boolean that never triggers a re-render.
let openCount = 0;

export function useHoverPopover({ disabled = false }: { disabled?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counted = useRef(false);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Keeping the shared counter in sync from one place means a panel closed by
  // Escape, by an outside click, by a selection or by unmounting all decrement
  // it exactly once.
  const setOpenTracked = useCallback((next: boolean) => {
    setOpen(next);
    if (next && !counted.current) {
      counted.current = true;
      openCount += 1;
    } else if (!next && counted.current) {
      counted.current = false;
      openCount -= 1;
    }
  }, []);

  const openNow = useCallback(() => {
    clearTimer();
    setOpenTracked(true);
  }, [setOpenTracked]);

  const closeNow = useCallback(() => {
    clearTimer();
    setOpenTracked(false);
  }, [setOpenTracked]);

  const onPointerEnter = useCallback(() => {
    if (disabled) return;
    clearTimer();
    // Another panel is already up: swap immediately, no delay.
    const handoff = openCount > 0 && !counted.current;
    if (handoff) {
      setOpenTracked(true);
      return;
    }
    timer.current = setTimeout(() => setOpenTracked(true), OPEN_DELAY_MS);
  }, [disabled, setOpenTracked]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => setOpenTracked(false), CLOSE_DELAY_MS);
  }, [setOpenTracked]);

  const toggle = useCallback(() => {
    clearTimer();
    setOpenTracked(!open);
  }, [open, setOpenTracked]);

  // Unmounting with the panel open would leak a count and leave every later
  // chip in permanent handoff mode.
  useEffect(
    () => () => {
      clearTimer();
      if (counted.current) {
        counted.current = false;
        openCount -= 1;
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpenTracked(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenTracked(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpenTracked]);

  /** Spread on the `relative` wrapper that holds both the chip and the panel. */
  const hoverProps = { onMouseEnter: onPointerEnter, onMouseLeave: onPointerLeave };

  return { open, ref, openNow, closeNow, toggle, hoverProps };
}

/**
 * Panel geometry, so all six popovers share one shell instead of six
 * copy-pasted class strings that had already drifted (228px / 230px / 240px /
 * 260px / 268px, three different paddings).
 */
export function popoverPanelClass({
  placement = 'up',
  align = 'start',
}: { placement?: 'up' | 'down'; align?: 'start' | 'end' } = {}) {
  return [
    'absolute z-30 rounded-2xl border border-[#ECECF2] bg-white p-2 shadow-[0_20px_44px_-16px_rgba(23,22,31,0.28)]',
    align === 'end' ? 'right-0' : 'left-0',
    placement === 'up' ? 'bottom-[calc(100%+10px)]' : 'top-[calc(100%+10px)]',
    placement === 'up' ? 'rb-pop-up' : 'rb-pop-down',
    align === 'end' ? 'rb-pop-end' : '',
  ].join(' ');
}

/** The caption above a panel's options — "Model", "Resolution", "Ratio". */
export const POPOVER_HEADING =
  'px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-[#8A8896]';
