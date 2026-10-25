// The text each ambiance writes in the command bar (2026-10-19, owner: « le
// prompt intégré dans cette ambiance s'écrit automatiquement dans la
// commande … l'utilisateur peut le lire, le changer avant de lancer »).
//
// Since 2026-10-25 that text IS the prompt, word for word: the owner's
// fourteen dictated prompts, in the language the site is being read in
// (ambiance-prompts.ts). The bar therefore shows exactly what will be sent —
// no summary of it, no second wording. Left as it is, it is sent as it is;
// changed, the user's version is sent in its place (spec-prompts.ts).
//
// Client-safe on purpose (no `server-only`): the browser shows it and lets
// the user edit it.
import type { Locale } from '@/lib/i18n/dictionaries';
import { ambiancePromptText } from './ambiance-prompts';
import type { PresetKey } from './presets';

/**
 * What picking this ambiance writes in the bar — the owner's prompt for it,
 * in this language; '' for no ambiance.
 *
 * Exterior day's sky chip no longer changes this text: the owner's « Jour
 * extérieur » states its own sky, and its prompt is definitive.
 */
export function ambianceText(preset: PresetKey | null, locale: Locale): string {
  return preset ? ambiancePromptText(preset, locale) : '';
}
