// Shared look for the command-bar attribute chips (preset, engine, ratio,
// reference). They sit ON the #F7F7FA band, so they are white with a light
// outline: enough separation to read as distinct controls, not so much that
// the row turns into a scattered set of buttons.
//
// Full literal class strings on purpose — Tailwind's scanner only sees
// complete class tokens, so a constant holding just a colour would silently
// generate no CSS (see the JIT note in CLAUDE.md).
export const CHIP_BASE =
  'flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[#ECECF2] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#3D3B49] transition-colors hover:border-[#DEDEE8] disabled:cursor-not-allowed disabled:opacity-50';

/** Same shape, but read-only: no hover affordance, muted text. */
export const CHIP_STATIC =
  'flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[#ECECF2] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#8A8896]';

/** Active/selected state — the violet brand accent. */
export const CHIP_ACTIVE =
  'flex flex-shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50';
