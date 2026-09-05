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

/**
 * Geometry and type, shared by every entry in either rail.
 *
 * `origin-left` anchors the hover/selected growth at the icon, so a row
 * expands to the right instead of pushing outward from its middle — the icon
 * column stays a column. The rail is 240px wide with 14px of side padding, so
 * a 2% growth on a 212px row extends 4px into that padding and is never
 * clipped (the desktop rail is `overflow-visible`).
 */
export const ROW =
  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] origin-left transition-[transform,background-color,color] duration-150 ease-out';

/**
 * Unselected. Grey, not ink: at ink weight every row shouted as loudly as the
 * selected one. #6B6880 sits at 5.4:1 on the #F7F7FA band — quieter than the
 * active row, still comfortably readable.
 *
 * The hover border is gone. It made hovering an unselected row heavier than
 * the selected one now is, which inverted the hierarchy for as long as the
 * pointer rested there.
 */
export const ROW_IDLE =
  'border border-transparent font-medium text-[#6B6880] hover:bg-white hover:text-[#17161F] motion-safe:hover:scale-[1.02]';

/**
 * Selected: the page you are on, in the brand colour.
 *
 * This was a raised white card — a card on the grey band, borrowing the
 * workspace's own colour to say "here". It worked, but it said "here" in the
 * same voice as every other surface in the product, and it spent a border and
 * a shadow to do it.
 *
 * Two notes on the colour. The ground is the violet tint already used for the
 * tier pill, so no new token. And the label is #5A57D6 rather than the brand
 * #716FFF: the brand violet on this tint measures 3.35:1, under the 4.5:1
 * floor for 13.5px text. #5A57D6 is the same hue a shade deeper and measures
 * 4.81:1. The ICON keeps the exact brand #716FFF — a glyph is held to 3:1,
 * which it clears, so the brand colour lands where it is most visible.
 *
 * `motion-safe:` guards the growth rather than a `motion-reduce:transform-none`
 * override, so reduced motion removes it outright instead of relying on which
 * Tailwind variant happens to win the cascade.
 */
export const ROW_ACTIVE =
  'border border-transparent bg-[#EFECFF] font-semibold text-[#5A57D6] motion-safe:scale-[1.02]';

/**
 * The collapse toggle, in both rails. It used to be a bordered white chip
 * owning a row of its own — a control that read as dropped onto the rail
 * rather than belonging to it. Borderless, it recedes until hovered.
 */
export const RAIL_TOGGLE =
  'hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white min-[900px]:flex';
