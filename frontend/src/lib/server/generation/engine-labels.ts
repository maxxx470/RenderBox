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

// Each engine's own colour (owner's choice, 2026-10-06: bright red and
// yellow), used wherever an engine is marked — the model chip, the Enhance
// toggle, the landing film. Red goes to Moteur 1 and yellow to Moteur 2 on
// purpose: a yellow Moteur 1 would point straight at the banana it runs on.
// The red is #DC2626, deliberately NOT the error red #E5484D (reserved for
// errors and destructive actions by the charter). Every value is a complete
// literal class name so Tailwind's scanner sees it.
export const ENGINE_COLORS: Record<
  EngineName,
  { mark: string; glyph: string; dot: string; chip: string }
> = {
  nanobanana: {
    // Gradient disc behind an icon, the colour of the glyph on it, a solid
    // dot, and a filled chip with its readable text colour.
    mark: 'bg-gradient-to-br from-[#EF4444] to-[#B91C1C]',
    glyph: '#ffffff',
    dot: 'bg-[#DC2626]',
    chip: 'bg-[#DC2626] text-white',
  },
  gpt_image: {
    mark: 'bg-gradient-to-br from-[#FDE047] to-[#EAB308]',
    glyph: '#17161F',
    dot: 'bg-[#EAB308]',
    chip: 'bg-[#FACC15] text-[#17161F]',
  },
};

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
