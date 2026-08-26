// Single source of truth for the 5 render-ambiance presets — labels (fr/en,
// consumed by CommandBar) and prompt modifiers (consumed by
// build-prompt.ts). No secrets here, so this file is safe to import from a
// client component; it deliberately has no I/O and no `server-only` tag.
export const PRESET_KEYS = ['jour_ext', 'jour_int', 'nuit_ext', 'nuit_int', 'esquisse'] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

interface PresetDef {
  label: { fr: string; en: string };
  promptModifier: string;
}

export const PRESETS: Record<PresetKey, PresetDef> = {
  jour_ext: {
    label: { fr: 'Jour extérieur', en: 'Exterior day' },
    promptModifier:
      'Render in full daylight: natural sunlight, crisp cast shadows, clear sky, exterior viewpoint.',
  },
  jour_int: {
    label: { fr: 'Jour intérieur', en: 'Interior day' },
    promptModifier:
      'Render an interior viewpoint lit by natural daylight through the windows, soft ambient fill, no artificial lighting.',
  },
  nuit_ext: {
    label: { fr: 'Nuit extérieur', en: 'Exterior night' },
    promptModifier:
      'Render at night, exterior viewpoint: controlled architectural lighting (facade spotlights, warm window glow), dark sky, no direct sunlight.',
  },
  nuit_int: {
    label: { fr: 'Nuit intérieur', en: 'Interior night' },
    promptModifier:
      'Render an interior viewpoint at night: warm artificial lighting (ceiling fixtures, lamps), dark windows, no daylight.',
  },
  esquisse: {
    label: { fr: 'Esquisse', en: 'Sketch' },
    promptModifier:
      'Render as a non-photorealistic concept sketch: visible pencil/ink strokes, loose massing, minimal shading — no photoreal materials or textures. Early-stage design-review style, deliberately not photorealistic.',
  },
};

export function isPresetKey(value: string): value is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(value);
}
