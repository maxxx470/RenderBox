// Single source of truth for engine display names/descriptions shown in the
// CommandBar engine-selector dropdown. Deliberately NOT server-only — same
// reasoning as presets.ts: no secrets here, and the client component needs
// these strings at runtime.
//
// Since 2026-11-14 the engines carry their real names, Nano Banana and
// ChatGPT, with their own logos (owner: « on va garder les vrais noms
// d'origine des IA, on ne va plus masquer »); they were Visio and Pixel IA
// from 2026-10-08, chosen to hide the vendors. The engine *identifiers* below stay as they are — they are written on every
// RenderNode row in the database and read back by the dispatcher, so renaming
// them would orphan the renders already generated.
import type { EngineName } from './engines/types';

interface EngineLabel {
  name: { fr: string; en: string };
  description: { fr: string; en: string };
}

// Each engine's own colour (owner's choice, 2026-10-06: bright red and
// yellow), used wherever an engine is marked — the model chip, the Enhance
// toggle, the landing film: red for Nano Banana, yellow for ChatGPT (kept
// as they were when the engines were renamed, 2026-11-14).
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

// Each engine's original logo since 2026-11-14 (the banana, OpenAI's knot),
// SVG on a white tile in public/engines/; replace a file under the same name
// to change one. The owner's Visio / Pixel IA symbols stay beside them.
export const ENGINE_LOGOS: Record<EngineName, string> = {
  nanobanana: '/engines/nano-banana.svg',
  gpt_image: '/engines/chatgpt.svg',
};

export const ENGINE_LABELS: Record<EngineName, EngineLabel> = {
  nanobanana: {
    name: { fr: 'Nano Banana', en: 'Nano Banana' },
    description: { fr: 'Haute définition, jusqu’en 4K', en: 'High definition, up to 4K' },
  },
  gpt_image: {
    name: { fr: 'ChatGPT', en: 'ChatGPT' },
    description: {
      fr: "Meilleur suivi d'instructions précises",
      en: 'Best at following precise instructions',
    },
  },
};
