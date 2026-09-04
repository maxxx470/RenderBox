// One row shape for both rails.
//
// There are two sidebars in this product — HomeSidebar (dashboard and
// generation space) and ModeSidebar (inside an open project) — and they carry
// the same entries: a way back to the dashboard, the output kind, a link to
// Informations. They had drifted into two different looks for those same
// rows: 13px against 13.5px, ink labels against grey, `hover:bg-[#F1F0F6]`
// against `hover:bg-white`. Moving between the two screens read as moving
// between two products.
//
// Full literal class strings — Tailwind's scanner only sees complete tokens
// (see the JIT note in CLAUDE.md).

/** Geometry and type, shared by every entry in either rail. */
export const ROW =
  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors';

/**
 * Unselected. Grey, not ink: at ink weight every row shouted as loudly as the
 * selected one, leaving the white card to carry the whole "you are here"
 * signal by itself. #6B6880 sits at 5.4:1 on the #F7F7FA band — quieter than
 * the active row, still comfortably readable.
 */
export const ROW_IDLE =
  'border border-transparent font-medium text-[#6B6880] hover:border-[#DEDEE8] hover:bg-white hover:text-[#17161F]';

/** Selected: a raised white card, never a solid gradient fill. */
export const ROW_ACTIVE =
  'border border-[#DEDEE8] bg-white font-semibold text-[#17161F] shadow-[0_1px_4px_#17161F14]';

/**
 * The collapse toggle, in both rails. It used to be a bordered white chip
 * owning a row of its own — a control that read as dropped onto the rail
 * rather than belonging to it. Borderless, it recedes until hovered.
 */
export const RAIL_TOGGLE =
  'hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white min-[900px]:flex';
