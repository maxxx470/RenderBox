// One row shape for the app rail (HomeSidebar).
//
// 2026-10-05 — restyled after the owner's reference (Metrio's dashboard
// rail): grouped entries under small uppercase captions, bare line icons, and
// the page you are on as a FILLED pill — brand gradient, white label, white
// glyph — instead of a tinted row. Larger type (14.5px) to match.
//
// Full literal class strings — Tailwind's scanner only sees complete tokens
// (see the JIT note in CLAUDE.md).

/** Geometry and type, shared by every entry. */
export const ROW =
  'flex items-center gap-3 rounded-full px-4 py-2.5 text-[14.5px] transition-[background-color,color,box-shadow] duration-150 ease-out';

/**
 * Unselected: ink-2 label on the white rail (10.4:1), a faint green-grey
 * wash on hover.
 */
export const ROW_IDLE = 'font-medium text-[#3D3B49] hover:bg-[#EFF3F0] hover:text-[#17161F]';

/**
 * Selected: a solid green pill with a white label, flat like the reference.
 * #15803D carries white 14.5px text at 5.0:1 — the bright #16A34A would drop
 * it to 3.3:1.
 */
export const ROW_ACTIVE =
  'bg-[#15803D] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(21,128,61,0.65)]';

/** Small uppercase group caption ("Navigation", "Principal", "Compte"). */
export const RAIL_CAPTION =
  'px-4 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#5F6B64]';

/** The collapse toggle: a bordered circle, as in the reference. */
export const RAIL_TOGGLE =
  'hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#CDEBD6] bg-white transition-colors hover:border-[#CDEBD6] hover:bg-[#E8F5EC] min-[900px]:flex';
