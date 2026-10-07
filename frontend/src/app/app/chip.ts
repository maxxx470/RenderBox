// Shared look for the command-bar attribute chips (ambiance, ratio, size,
// context, elements). White with a light outline on the white bar.
//
// 2026-10-06 — compacted (owner: "les trucs sont trop gros", the bar took too
// much room): 11.5px type, 28px tall.
//
// Full literal class strings on purpose — Tailwind's scanner only sees
// complete class tokens, so a constant holding just a colour would silently
// generate no CSS (see the JIT note in CLAUDE.md).
export const CHIP_BASE =
  'flex h-7 flex-shrink-0 items-center gap-1.5 rounded-full border border-[#ECECF2] bg-white px-2.5 text-[11.5px] font-medium text-[#3D3B49] transition-colors hover:border-[#DEDEE8] hover:bg-[#FBFBFD] disabled:cursor-not-allowed disabled:opacity-50';

/** Same shape, but read-only: no hover affordance, muted text. */
export const CHIP_STATIC =
  'flex h-7 flex-shrink-0 items-center gap-1.5 rounded-full border border-[#ECECF2] bg-white px-2.5 text-[11.5px] font-medium text-[#8A8896]';

/**
 * An empty slot waiting to be filled — "add a reference", "add an image".
 * Dashed: the solid chips beside it open a menu, this one performs an action.
 */
export const CHIP_SLOT =
  'flex h-7 flex-shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[#CDEBD6] bg-white px-2.5 text-[11.5px] font-medium text-[#6B6878] transition-colors hover:border-[#15803D] hover:text-[#17161F] disabled:cursor-not-allowed disabled:opacity-50';

/** Done / selected — the brand gradient, as Metrio fills its selected states. */
export const CHIP_ACTIVE =
  'flex h-7 flex-shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] px-2.5 text-[11.5px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50';
