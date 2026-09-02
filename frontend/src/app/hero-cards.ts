// Cards for the hero fan (see HeroFan.tsx).
//
// Each card names one of the ambiances RenderBox actually offers — that claim
// is true today, with or without a photograph. `src` is the slot for a real
// render: fill it and the card shows the image instead of its gradient, with
// no other change anywhere.
//
// It stays null until real RenderBox output exists. Dropping stock or
// generated imagery in here would advertise renders the product never made,
// on the page where someone decides whether to pay for it.
//
// To show real renders:
//   1. Put the images in `frontend/public/hero/` (portrait, ~880x1200,
//      JPG or WebP — the cards are 220x300).
//   2. Set `src` on the matching entries, e.g. "/hero/villa-jour.jpg".
import type { PresetKey } from '@/lib/server/generation/presets';

export interface HeroCard {
  /** Drives the label and the fallback gradient. */
  preset: PresetKey;
  /** Path under /public once a real render exists, null until then. */
  src: string | null;
}

/**
 * Fallback treatment per ambiance, in the violet-to-dark family of the
 * charter — daylight presets sit light, night and sketch go dark. Differences
 * carry meaning here rather than introducing new brand hues.
 *
 * Complete literal class strings: Tailwind's scanner never sees a class
 * assembled from a bare colour value (see the JIT note in CLAUDE.md).
 */
export const HERO_CARD_GRADIENT: Record<PresetKey, string> = {
  jour_ext: 'bg-gradient-to-br from-[#8B8AFF] via-[#8B5CF6] to-[#A855F7]',
  jour_int: 'bg-gradient-to-br from-[#A855F7] via-[#8B5CF6] to-[#6E6BFF]',
  nuit_ext: 'bg-gradient-to-br from-[#4B49B8] via-[#332F7A] to-[#1B1940]',
  nuit_int: 'bg-gradient-to-br from-[#332F7A] via-[#231F52] to-[#141230]',
  esquisse: 'bg-gradient-to-br from-[#3D3D3D] to-[#0A0A0A]',
};

export const HERO_CARDS: readonly HeroCard[] = [
  { preset: 'jour_ext', src: null },
  { preset: 'jour_int', src: null },
  { preset: 'nuit_ext', src: null },
  { preset: 'nuit_int', src: null },
  { preset: 'esquisse', src: null },
];
