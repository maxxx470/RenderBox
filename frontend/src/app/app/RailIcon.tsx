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

export type RailIconName =
  | 'dashboard'
  | 'image'
  | 'enhance'
  | 'pricing'
  | 'settings'
  | 'info'
  | 'comment'
  | 'add'
  | 'clip';

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
  // One large four-point spark and a small one — "make it better", the
  // convention for enhancement. Strokes only, like the rest of the set; the
  // concave sides keep the large spark from reading as a diamond at 15px.
  enhance: (
    <>
      <path d="M10 4.2c.5 3.3 2.5 5.3 5.8 5.8-3.3.5-5.3 2.5-5.8 5.8-.5-3.3-2.5-5.3-5.8-5.8 3.3-.5 5.3-2.5 5.8-5.8Z" />
      <path d="M17.4 14.6c.25 1.6 1.2 2.55 2.8 2.8-1.6.25-2.55 1.2-2.8 2.8-.25-1.6-1.2-2.55-2.8-2.8 1.6-.25 2.55-1.2 2.8-2.8Z" />
    </>
  ),
  // A card with its magnetic stripe — the subscription.
  pricing: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="3.2" />
      <path d="M3 10h18" />
      <path d="M7 14.6h3.4" />
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
  // The command bar's glyphs, same rules. A speech bubble with a tail for
  // "Commenter" — the pins on the image are comments, not edits.
  comment: (
    <>
      <path d="M5.4 4h13.2A2.4 2.4 0 0 1 21 6.4v8.2a2.4 2.4 0 0 1-2.4 2.4H11l-4.6 3.4V17H5.4A2.4 2.4 0 0 1 3 14.6V6.4A2.4 2.4 0 0 1 5.4 4Z" />
      <path d="M7.8 9.4h8.4" />
      <path d="M7.8 12.6h5" />
    </>
  ),
  // "Ajouter": a frame with a plus — an element placed into the picture.
  add: (
    <>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  // The paperclip, the convention for "attach a file" in a composer.
  clip: (
    <path d="m19.6 11.4-7.3 7.3a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3.1 3.1 0 0 1 4.4 4.4l-7.5 7.5a1.55 1.55 0 0 1-2.2-2.2l6.8-6.8" />
  ),
};

/** A glyph from the set at any size and colour, outside the rail. */
export function Glyph({
  name,
  color = 'currentColor',
  size = 16,
}: {
  name: RailIconName;
  color?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      {GLYPH[name]}
    </svg>
  );
}

/**
 * Bare glyph (2026-10-05, after the Metrio reference): no tile, drawn in the
 * brand green (#15803D, 5.0:1 on white) — the active row is itself a filled
 * green pill, so there the glyph turns white.
 */
export function RailIcon({ name, active = false }: { name: RailIconName; active?: boolean }) {
  return (
    <span aria-hidden className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        width="19"
        height="19"
        fill="none"
        stroke={active ? '#ffffff' : '#15803D'}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPH[name]}
      </svg>
    </span>
  );
}
