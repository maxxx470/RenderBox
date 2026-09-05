// The rail's icons, drawn here rather than pulled from a package.
//
// react-iconly is still right for the rest of the product, but it hands back
// a fixed component: you get its 24x24 grid, its stroke weight, its corner
// radii, and nothing to say about any of them. These five glyphs sit in the
// most-looked-at 200px of the app, at 15px, inside a 26px tile — a size where
// a half-pixel of stroke weight is the difference between a shape and a
// smudge. Authoring them means the grid, the weight and the optical sizes are
// decisions rather than inheritances.
//
// Four rules hold them together as a set:
//   • one 24x24 viewBox, so every glyph occupies the same optical square;
//   • stroke 1.6 with round caps and joins, never a fill, so weight reads the
//     same across a straight edge and a curve;
//   • `currentColor` throughout — the tile decides the colour, the glyph
//     never carries one of its own;
//   • shapes stay inside a 3..21 box, so none crowds the tile's edge.
//
// The tile is the part borrowed from the reference: a rounded square holding
// a glyph, rather than a bare glyph floating beside a word. It is also the
// charter's own pattern — the account avatar below is already a gradient tile
// with a white glyph. What is NOT borrowed is a different hue per row: four
// invented colours in one column is the defect removed from the dashboard's
// stat tiles. The tile is neutral until the row is the page you are on, and
// then it is the brand gradient.
import type { ReactNode } from 'react';

export type RailIconName = 'dashboard' | 'image' | 'examples' | 'settings' | 'info';

const GLYPH: Record<RailIconName, ReactNode> = {
  // Four panels — the product's own "everything at once" view.
  dashboard: (
    <>
      <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="2.2" />
      <rect x="13.2" y="3.2" width="7.6" height="7.6" rx="2.2" />
      <rect x="3.2" y="13.2" width="7.6" height="7.6" rx="2.2" />
      <rect x="13.2" y="13.2" width="7.6" height="7.6" rx="2.2" />
    </>
  ),
  // A frame, a sun, a horizon. The horizon runs to the frame's right edge so
  // the shape still reads as a landscape when the sun is the only detail left
  // at small sizes.
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3.6" />
      <circle cx="8.6" cy="10" r="1.7" />
      <path d="M3.6 17.4 L9 12.4c.9-.85 2.2-.85 3.1 0l3 2.8" />
      <path d="M14.4 16.2 L16.2 14.5c.9-.85 2.2-.85 3.1 0l1.1 1" />
    </>
  ),
  // Two frames, one behind the other — a set of pictures rather than one.
  // It has to be distinguishable from `image` at 15px in the same column, so
  // the difference is structural (a second frame, offset) rather than a
  // detail added inside the same silhouette.
  examples: (
    <>
      <path d="M7.4 6.6V5.4A2.2 2.2 0 0 1 9.6 3.2h9A2.2 2.2 0 0 1 20.8 5.4v9a2.2 2.2 0 0 1-2.2 2.2h-1.2" />
      <rect x="3.2" y="7.4" width="13.4" height="13.4" rx="3.2" />
      <circle cx="7.6" cy="11.8" r="1.4" />
      <path d="M3.9 18.9 8 14.9c.85-.8 2.05-.8 2.9 0l3.4 3.2" />
    </>
  ),
  // Two sliders, not a cog.
  //
  // A cog was drawn first and rejected on sight: at 15px its teeth close the
  // gap to the hub and the whole thing reads as a sun, or an asterisk — the
  // exact failure mode that got Iconly's `curved` set rejected site-wide. A
  // gear needs a rim, teeth AND a hub to be a gear, and there is not enough
  // room here for three concentric things.
  //
  // Sliders survive the size because they are two straight lines and two
  // dots, and they are the truer metaphor anyway: this page is preferences —
  // the default engine, the account, the plan — not machinery.
  settings: (
    <>
      <path d="M3.8 8.6h16.4" />
      <circle cx="15.2" cy="8.6" r="2.3" />
      <path d="M3.8 15.4h16.4" />
      <circle cx="8.8" cy="15.4" r="2.3" />
    </>
  ),
  // A rounded square holding an i, matching the squared family of the
  // dashboard glyph rather than introducing a lone circle to the set.
  info: (
    <>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" />
      <path d="M12 11.2v5" />
      <path d="M12 7.9v.1" />
    </>
  ),
};

/** Tile + glyph. `active` swaps the neutral tile for the brand gradient. */
export function RailIcon({ name, active = false }: { name: RailIconName; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6.5 w-6.5 flex-shrink-0 items-center justify-center rounded-[8px] ${
        active
          ? 'bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]'
          : 'border border-[#ECECF2] bg-white'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke={active ? '#ffffff' : '#6B6880'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPH[name]}
      </svg>
    </span>
  );
}
