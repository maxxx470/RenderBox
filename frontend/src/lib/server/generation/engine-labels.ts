// Single source of truth for engine display names/descriptions shown in the
// CommandBar engine-selector dropdown. Deliberately NOT server-only — same
// reasoning as presets.ts: no secrets here, and the client component needs
// these strings at runtime.
//
// The names are deliberately generic. They used to be the vendors' own
// ("Nanobanana", "ChatGPT Image"), which told every visitor exactly which
// third-party product to go buy directly instead of paying for RenderBox. The
// engine *identifiers* below stay as they are — they are written on every
// RenderNode row in the database and read back by the dispatcher, so renaming
// them would orphan the renders already generated.
import type { EngineName } from './engines/types';

interface EngineLabel {
  name: { fr: string; en: string };
  description: { fr: string; en: string };
}

export const ENGINE_LABELS: Record<EngineName, EngineLabel> = {
  nanobanana: {
    name: { fr: 'Moteur 1', en: 'Engine 1' },
    description: { fr: 'Rapide, bon rapport qualité/coût', en: 'Fast, good price/quality ratio' },
  },
  gpt_image: {
    name: { fr: 'Moteur 2', en: 'Engine 2' },
    description: {
      fr: "Meilleur suivi d'instructions précises",
      en: 'Best at following precise instructions',
    },
  },
};
