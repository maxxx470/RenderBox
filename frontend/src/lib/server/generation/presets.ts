// Single source of truth for the render ambiances — their keys, their order
// in the menu and their labels (fr/en, consumed by the command bar). No
// secrets here, so this file is safe to import from a client component; it
// deliberately has no I/O and no `server-only` tag.
//
// THEIR PROMPTS ARE NOT HERE any more. Since 2026-10-25 each ambiance has one
// prompt, the owner's own dictated text in each language, in
// [ambiance-prompts.ts](./ambiance-prompts.ts). The `modifier` strings this
// file used to carry — the texts of the six modules — were that ambiance's
// prompt until then; they are gone rather than left beside the new ones,
// because a second, stale prompt per ambiance is a prompt waiting to be sent
// by mistake. Older renders keep their key, so nothing in the history moves.
//
// 2026-10-10 (owner): the ambiance menu offers the kinds of picture — Plan 3D
// aménagé, Axonométrie éclatée, Planche d'analyse, Maquette isométrique —
// plus the drawings. The four lights (day and night, exterior and interior)
// are also the image generator page's fan templates (templates.ts).
// « Esquisse » is the pencil sketch (`croquis`); the labelled white diagram
// that carried that name since 2026-10-10 keeps its key, `esquisse`, and is
// called « Schéma d'accès » — older renders keep their key, so an edit never
// mistakes one for the other.
export const PRESET_KEYS = [
  'plan_3d',
  'eclate',
  'analyse',
  'isometrie',
  'esquisse',
  'croquis',
  'jour_ext',
  'jour_int',
  'nuit_ext',
  'nuit_int',
  'maquette_blanche',
  'aquarelle',
  'heure_doree',
  'pluie',
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

/**
 * What the ambiance menu offers, in order. The four lights joined the modules
 * on 2026-10-19 (owner: « ajoute 4 autres ambiances aux autres »): the fan's
 * templates leave the page as soon as an image is pinned, so the menu is
 * where a light is chosen for it. Four more the same evening (owner: « go »):
 * Maquette blanche, Aquarelle, Heure dorée, Temps de pluie — read in rows of
 * three, the modules, then the drawings, then the lights. This order is the
 * owner's and is not to be changed.
 */
export const AMBIANCE_KEYS = [
  'plan_3d',
  'eclate',
  'analyse',
  'isometrie',
  'maquette_blanche',
  'esquisse',
  'croquis',
  'aquarelle',
  'jour_ext',
  'jour_int',
  'nuit_ext',
  'nuit_int',
  'heure_doree',
  'pluie',
] as const satisfies readonly PresetKey[];

interface PresetDef {
  label: { fr: string; en: string };
}

/** The name each ambiance carries in the menu, the tree and the gallery. */
export const PRESETS: Record<PresetKey, PresetDef> = {
  plan_3d: { label: { fr: 'Plan 3D aménagé', en: 'Furnished 3D plan' } },
  eclate: { label: { fr: 'Axonométrie éclatée', en: 'Exploded axonometric' } },
  analyse: { label: { fr: 'Planche d’analyse', en: 'Concept board' } },
  isometrie: { label: { fr: 'Maquette isométrique', en: 'Isometric model' } },
  // The white axonometric diagram with labelled arrows of the menu's picture
  // (public/presets/thumb/esquisse.webp).
  esquisse: { label: { fr: 'Schéma d’accès', en: 'Access diagram' } },
  croquis: { label: { fr: 'Esquisse', en: 'Sketch' } },
  jour_ext: { label: { fr: 'Jour extérieur', en: 'Exterior day' } },
  jour_int: { label: { fr: 'Jour intérieur', en: 'Interior day' } },
  nuit_ext: { label: { fr: 'Nuit extérieur', en: 'Exterior night' } },
  nuit_int: { label: { fr: 'Nuit intérieur', en: 'Interior night' } },
  maquette_blanche: { label: { fr: 'Maquette blanche', en: 'White model' } },
  aquarelle: { label: { fr: 'Aquarelle', en: 'Watercolour' } },
  heure_doree: { label: { fr: 'Heure dorée', en: 'Golden hour' } },
  pluie: { label: { fr: 'Temps de pluie', en: 'Rainy day' } },
};

export function isPresetKey(value: string): value is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(value);
}
