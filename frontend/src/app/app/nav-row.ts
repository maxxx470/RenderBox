// One row shape for the app rail (HomeSidebar).
//
// 2026-10-08 — rebuilt on the owner's "Shopall" sidebar reference: a floating
// white card, sections split by full-width hairlines, small sentence-case
// captions in grey, bare ink line icons, and the page you are on marked by a
// soft blue tint with a bold ink label and a blue glyph (the 2026-10-07 solid
// pill, after Metrio, is retired). Folded, every entry is a 44px square with
// rounded corners, centred in the 76px rail.
//
// Full literal class strings — Tailwind's scanner only sees complete tokens
// (see the JIT note in CLAUDE.md).

/** Geometry and type, shared by every entry. */
export const ROW =
  'flex items-center gap-3 rounded-xl text-[14.5px] transition-[background-color,color] duration-150 ease-out';

/** Expanded: a full-width row. */
export const ROW_WIDE = 'px-3 py-2.5';

/** Folded: a 44px square with rounded corners, centred in the rail. */
export const ROW_ROUND = 'mx-auto h-11 w-11 justify-center p-0';

/** Unselected: ink-2 label on white (10.4:1), a neutral grey wash on hover. */
export const ROW_IDLE = 'font-medium text-[#3D3B49] hover:bg-[#F7F7FA] hover:text-[#17161F]';

/** Selected: the blue tint, a bold ink label (the glyph turns blue, see RailIcon). */
export const ROW_ACTIVE = 'bg-[#EEF1FF] font-semibold text-[#17161F]';

/** Idle and selected glyph colours — ink-2 at rest, brand blue on the current page. */
export const ICON_IDLE = '#3D3B49';
export const ICON_ACTIVE = '#2948FC';

/** A section's caption ("Général", "Aide"…): small, sentence case, grey, as in the reference. */
export const RAIL_CAPTION = 'text-[13px] font-medium text-[#8A8896]';

/** The fold toggle: a grey square with rounded corners, as in the reference. */
export const RAIL_TOGGLE =
  'hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#F2F2F5] transition-colors hover:bg-[#E9E9EE] min-[900px]:flex';
