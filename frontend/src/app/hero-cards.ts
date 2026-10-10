// Cards for the hero fan (see HeroFan.tsx).
//
// Each card names one of the ambiances RenderBox actually offers — that claim
// is true today, with or without a photograph. `src` is the slot for a real
// render: fill it and the card shows the image instead of its gradient, with
// no other change anywhere.
//
// Filled in on 2026-09-03 with renders supplied by the project owner, one per
// ambiance, each matched to what it actually shows rather than to its position
// in the list:
//   jour_ext  — villa, clear blue sky, sharp cast shadows, pool
//   jour_int  — bedroom crossed by direct sunlight, window shadows on the wall
//   nuit_ext  — street facade at night, star sky, warm lit windows
//   nuit_int  — bedroom at night, single wall lamp, dark windows
//   esquisse  — annotated white axonometric, massing only, no photoreal material
//
// Served from /public rather than hotlinked: the site's CSP is
// `img-src 'self' data: blob:`, so an external host would simply be blocked.
// Downscaled to 880px wide (the cards render at 220x300) — the full-size
// originals were ~1170px and would have cost ~930KB on the first screen every
// visitor loads.
//
// To swap one: drop a portrait JPG/WebP in `frontend/public/hero/` and point
// `src` at it. Leave `src` null and the card falls back to its gradient — no
// other change needed anywhere.
import type { PresetKey } from '@/lib/server/generation/presets';

/** The ambiances the landing's hero shows — the lights and the sketch. */
type HeroPreset = Extract<
  PresetKey,
  'jour_ext' | 'jour_int' | 'nuit_ext' | 'nuit_int' | 'esquisse'
>;

export interface HeroCard {
  /** Drives the label and the fallback gradient. */
  preset: HeroPreset;
  /** Path under /public once a real render exists, null until then. */
  src: string | null;
}

/**
 * Fallback treatment per ambiance, in the blue-to-dark family of the
 * charter — daylight presets sit light, night and sketch go dark. Differences
 * carry meaning here rather than introducing new brand hues.
 *
 * Complete literal class strings: Tailwind's scanner never sees a class
 * assembled from a bare colour value (see the JIT note in CLAUDE.md).
 */
export const HERO_CARD_GRADIENT: Record<HeroPreset, string> = {
  jour_ext: 'bg-gradient-to-br from-[#8FA6FF] via-[#2948FC] to-[#1E36D6]',
  jour_int: 'bg-gradient-to-br from-[#1E36D6] via-[#2948FC] to-[#435CFE]',
  nuit_ext: 'bg-gradient-to-br from-[#1E36D6] via-[#1A2BB0] to-[#0E1866]',
  nuit_int: 'bg-gradient-to-br from-[#1A2BB0] via-[#13208A] to-[#0A1150]',
  esquisse: 'bg-gradient-to-br from-[#3D3D3D] to-[#0A0A0A]',
};

export const HERO_CARDS: readonly HeroCard[] = [
  { preset: 'jour_ext', src: '/hero/jour-exterieur.jpg' },
  { preset: 'jour_int', src: '/hero/jour-interieur.jpg' },
  { preset: 'nuit_ext', src: '/hero/nuit-exterieur.jpg' },
  { preset: 'nuit_int', src: '/hero/nuit-interieur.jpg' },
  { preset: 'esquisse', src: '/hero/esquisse.jpg' },
];
