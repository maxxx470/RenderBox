// The pair behind the landing's before/after slider (see BeforeAfterSlider.tsx
// and its use in LandingClient).
//
// The slider wipes one image over the other in place, so the pair only works if
// both frames share a camera: same viewpoint, same two-point perspective, same
// crop and the same proportions. A mismatched pair makes the building jump at
// the wiper and the whole demonstration collapses. These two were generated in
// that order on purpose — the sketch first, then the render *from* the sketch —
// which is exactly what RenderBox does, so the section demonstrates the real
// product rather than illustrating it.
//
// Supplied by the project owner on 2026-09-04:
//   croquis — hand-drawn two-point perspective of a contemporary house, pen on
//             off-white paper, no lettering
//   rendu   — the same house at dusk after rain, wood battens and fair-faced
//             concrete, wet paving reflecting the lit interiors
//
// Served from /public rather than hotlinked: the site's CSP is
// `img-src 'self' data: blob:`, so an external host would simply be blocked.
// Both re-encoded to 1440px wide, which is still ~1.75x the 820px the block
// ever renders at, so they stay sharp on retina without shipping the 2.3MB
// PNG originals. The sketch is kept at a higher JPEG quality than the render:
// it is fine pen line-work on flat paper, the case JPEG handles worst.
//
// To swap either one: drop a 16:10 JPG in `frontend/public/avant-apres/` and
// point the entry at it. Set an entry to null and the slider falls back to the
// drawn SketchVisual / RenderVisual placeholders — no other change needed.

//
// 2026-10-05 — the section shows TWO pairs side by side, exterior on the left,
// interior on the right (owner's request). The interior pair is a stand-in:
// its "croquis" was derived from the render by image processing (pencil-sketch
// filter over the same 16:10 crop of galerie/jour-int-1.jpg), so the two
// frames share every pixel of camera — but it runs render → sketch, the
// reverse of the product. Replace it with a real sketch → RenderBox render
// pair as soon as one exists; same two files, same 16:10 ratio.

export type BeforeAfterKind = 'exterior' | 'interior';

export interface BeforeAfterPair {
  kind: BeforeAfterKind;
  /** Path under /public, or null to fall back to the drawn placeholder. */
  before: string | null;
  after: string | null;
}

/** Left to right, as laid out on the landing. */
export const BEFORE_AFTER_PAIRS: BeforeAfterPair[] = [
  // Provisional stand-in built like the interior one (from exemples/maison-pierre.jpg).
  // The authentic sketch → render pair is still on disk: croquis.jpg / rendu.jpg.
  {
    kind: 'exterior',
    before: '/avant-apres/exterieur-croquis.jpg',
    after: '/avant-apres/exterieur-rendu.jpg',
  },
  {
    kind: 'interior',
    before: '/avant-apres/interieur-croquis.jpg',
    after: '/avant-apres/interieur-rendu.jpg',
  },
];
