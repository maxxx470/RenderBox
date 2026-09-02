// Cards for the hero fan (see HeroFan.tsx).
//
// EMPTY ON PURPOSE. The fan is meant to show real RenderBox output; until
// actual renders are dropped into `frontend/public/hero/`, the landing keeps
// its existing preview block instead. Filling this array with invented or
// stock imagery would advertise renders the product never produced.
//
// To turn the fan on:
//   1. Put the images in `frontend/public/hero/` (JPG or WebP, ~880x1200,
//      portrait — the cards are 220x300).
//   2. Add one entry per image below.
//   3. Nothing else: HeroFan renders as soon as this array is non-empty, and
//      LandingClient swaps the preview block for it.
export interface HeroCard {
  /** Path under /public, e.g. "/hero/villa-jour.jpg". */
  src: string;
  /** Short name shown on the card. */
  title: string;
  /** Ambiance or engine used — keep it factual. */
  subtitle: string;
}

export const HERO_CARDS: readonly HeroCard[] = [];
