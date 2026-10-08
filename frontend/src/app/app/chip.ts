// Shared look for the command-bar attribute chips (ambiance, ratio, size,
// context, elements).
//
// 2026-10-06 — compacted (owner: "les trucs sont trop gros", the bar took too
// much room). 2026-10-08 — 32px tall, a soft grey fill on the white frame, no
// outline (the charter's no-stroke rule).
//
// Full literal class strings on purpose — Tailwind's scanner only sees
// complete class tokens, so a constant holding just a colour would silently
// generate no CSS (see the JIT note in CLAUDE.md).
export const CHIP_BASE =
  'flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#F2F2F5] px-2.5 text-[12px] font-medium text-[#3D3B49] transition-colors hover:bg-[#E9E9EE] disabled:cursor-not-allowed disabled:opacity-50';

/** Same shape, but read-only: no hover affordance, muted text. */
export const CHIP_STATIC =
  'flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#F2F2F5] px-2.5 text-[12px] font-medium text-[#8A8896]';

/**
 * An empty slot waiting to be filled — "add a reference", "add an image".
 * Dashed: the solid chips beside it open a menu, this one performs an action.
 */
export const CHIP_SLOT =
  'flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-[#D5DCFF] bg-white px-2.5 text-[12px] font-medium text-[#6B6878] transition-colors hover:border-[#2948FC] hover:text-[#17161F] disabled:cursor-not-allowed disabled:opacity-50';

/** Done / selected — the brand gradient. */
export const CHIP_ACTIVE =
  'flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border border-transparent bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-2.5 text-[12px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50';
