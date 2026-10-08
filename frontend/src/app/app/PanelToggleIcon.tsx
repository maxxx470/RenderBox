// The rail's fold / unfold glyph (owner, 2026-10-08, after Krea's sidebar
// toggle): a panel — a rounded square with its left column — drawn in the
// Iconly Curved style (1.5 stroke, soft squircle corners), since Iconly has
// no such icon. It is animated: open, the left column fills in; folded, it
// empties and the divider slides to the edge; on hover the divider leans the
// way a click will move it. The rail renders a new button on each fold, so
// the change itself plays from where the glyph was (`starting:`, CSS
// @starting-style): the column fills in or empties as it appears. Everything
// moves on `translate` / `scale` /
// `opacity` (see the Tailwind v4 transition note in CLAUDE.md), and not at all
// under reduced motion.
const MOVE =
  'transition-[translate,scale,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] [transform-box:fill-box] motion-reduce:transition-none';

export function PanelToggleIcon({
  open,
  size = 18,
  color = '#17161F',
}: {
  /** The rail is unfolded. */
  open: boolean;
  size?: number;
  color?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <path
        d="M7.4 3.25h9.2c3.15 0 4.15 1 4.15 4.15v9.2c0 3.15-1 4.15-4.15 4.15H7.4c-3.15 0-4.15-1-4.15-4.15V7.4c0-3.15 1-4.15 4.15-4.15Z"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* The left column, filled while the rail is open. */}
      <rect
        x="4.4"
        y="4.4"
        width="4.6"
        height="15.2"
        rx="2.4"
        fill={color}
        className={`origin-left ${MOVE} ${
          open
            ? 'scale-x-100 opacity-25 starting:scale-x-0 starting:opacity-0'
            : 'scale-x-0 opacity-0 starting:scale-x-100 starting:opacity-25'
        }`}
      />
      {/* The divider: at the column's edge when open, close to the side when
          folded; on hover it leans towards where the click takes it. */}
      <path
        d="M9.5 3.75v16.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        className={`${MOVE} ${
          open
            ? 'translate-x-0 group-hover:-translate-x-[1.5px] starting:-translate-x-[2px]'
            : '-translate-x-[2px] group-hover:translate-x-[1px] starting:translate-x-0'
        }`}
      />
    </svg>
  );
}
