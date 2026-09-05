// The lit-gradient ground shared by the landing's two card rows — the engine
// tiles and the audience columns.
//
// One file for both because they sit two sections apart on the same page: if
// they drifted, the page would read as two card species rather than one, which
// is the defect already removed from the rails and from the preset cards.
//
// Three layers make the "shine", and each does one job:
//   1. GROUND — a violet wash running down the card. Pale on purpose: the
//      body text is #6B6880, and #6B6880 on the darkest stop here measures
//      4.6:1, just over the 4.5:1 floor. A stop any deeper would push the
//      paragraph under it, and a card nobody can read is not a brighter card.
//   2. SHEEN — a soft white highlight in the top-left corner, which is what
//      actually reads as gloss. It is a separate absolutely-positioned layer
//      rather than a second background image, so it can brighten on hover
//      independently of the ground.
//   3. HOVER — growth, a violet-tinted shadow, and a firmer border. The
//      shadow is tinted rather than grey: a neutral drop shadow under a
//      violet card reads as dirt.
//
// Full literal class strings — Tailwind's scanner never sees a class built by
// interpolating a value (see the JIT note in CLAUDE.md).

/**
 * The card itself. Compose with padding at the call site.
 *
 * The gradient travels by HUE, not by darkness: near-white, then the pale
 * form of the charter's #6E6BFF, then the pale form of its #A855F7. A
 * single-hue wash at this lightness barely reads as a gradient at all — the
 * first attempt ran #FDFCFF to #F1EEFF and looked like a flat card with a
 * printing fault. Shifting indigo to purple across the diagonal reads as a
 * gradient while every stop stays light enough for the body text below.
 */
export const CARD_GRADIENT = 'bg-[linear-gradient(155deg,#FBFAFF_0%,#F0EDFF_46%,#F6EDFF_100%)]';

/**
 * Border, gloss and hover.
 *
 * The inset white hairline along the top edge is the detail that sells
 * "polished": it is the highlight a physical surface catches, and without it
 * the card is just a coloured rectangle. The outer shadow is violet-tinted
 * rather than grey — a neutral drop shadow under a violet card reads as dirt.
 */
export const CARD_GRADIENT_EDGE =
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_3px_rgba(23,22,31,0.04)] transition-[transform,box-shadow,border-color] duration-[220ms] ease-out hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_20px_38px_-18px_rgba(113,111,255,0.5)] motion-safe:hover:scale-[1.02]';

/**
 * The resting border, kept OUT of the edge token above.
 *
 * The engine tiles paint their own border while a generation is running or
 * has finished — those two colours are the tile reporting something. If the
 * shared token also set a border, the two rules would target the same
 * property at the same specificity and the winner would depend on the order
 * Tailwind happens to emit them in, not on the order they appear in the class
 * attribute. That is a coin flip, and it would land on the hover state too.
 * So the border is its own token, applied only where nothing else claims it.
 */
export const CARD_GRADIENT_BORDER = 'border border-[#E4DEFA] hover:border-[#C7BCFF]';

/**
 * The gloss layer. Render as the first child of a `relative overflow-hidden`
 * card; `pointer-events-none` keeps it out of the way of anything below.
 */
export const CARD_SHEEN =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(120%_82%_at_14%_0%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0)_58%)] transition-opacity duration-[220ms] ease-out';
