// Single source of truth for engine display names/descriptions shown in the
// CommandBar engine-selector dropdown. Deliberately NOT server-only — same
// reasoning as presets.ts: no secrets here, and the client component needs
// these strings at runtime.
import type { EngineName } from './engines/types';

interface EngineLabel {
  name: string;
  description: { fr: string; en: string };
}

export const ENGINE_LABELS: Record<EngineName, EngineLabel> = {
  nanobanana: {
    name: 'Nanobanana',
    description: { fr: 'Rapide, bon rapport qualité/coût', en: 'Fast, good price/quality ratio' },
  },
  gpt_image: {
    name: 'ChatGPT Image',
    description: {
      fr: "Meilleur suivi d'instructions précises",
      en: 'Best at following precise instructions',
    },
  },
};
