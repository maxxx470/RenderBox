// Example renders shown in the /app/generer fan, for an account that has not
// generated anything yet.
//
// Why they need their own rules rather than just being dropped in as images:
// the four fan slots normally hold the USER'S four most recent renders, each
// one a link into the project it belongs to. So a fixed image sitting in that
// row would look exactly like the user's own work without being it.
//
// Two guarantees make them honest instead:
//   1. they only ever appear when the account has zero renders, and they all
//      disappear together on the first one — never eaten slot by slot, which
//      would read as the examples being deleted;
//   2. each card is visibly tagged as an example and links to /exemple, not to
//      a project that does not exist.
//
// Empty by default. With no entries here the fan keeps its previous empty
// state (one card carrying the instruction, the rest silent), so nothing
// pretends and nothing breaks.
//
// TO FILL IN:
//   1. Put portrait images in `frontend/public/exemples/` — the cards render
//      at 220x300, so ~660px wide is plenty. Serve them from /public: the
//      site CSP is `img-src 'self' data: blob:` and an external host is
//      silently blocked.
//   2. Add one entry per image below, with the ambiance it actually shows.
import type { PresetKey } from '@/lib/server/generation/presets';

export interface ExampleRender {
  /** Path under /public, e.g. "/exemples/villa-jour.jpg". */
  src: string;
  /**
   * The ambiance the image actually shows. Optional, and left unset when the
   * set does not span several — four cards all captioned "Jour extérieur"
   * would repeat one word four times without telling anyone anything, which
   * is the defect that was removed from the empty state of this very fan.
   * Set it only where the labels differ and therefore teach the vocabulary.
   */
  preset?: PresetKey;
}

// The current four are all daylight exteriors — a terraced building in full
// sun, a dark house under overcast light, a stone house in soft haze, a villa
// in late afternoon. They differ by building and by quality of light, not by
// ambiance, so none carries a preset caption.
export const EXAMPLE_RENDERS: readonly ExampleRender[] = [
  { src: '/exemples/terrasses.jpg' },
  { src: '/exemples/maison-foret.jpg' },
  { src: '/exemples/maison-pierre.jpg' },
  { src: '/exemples/villa-palmiers.jpg' },
];
