// How a material face is NAMED on screen (étape 3C.4) — display only. The API
// always gets the canonical key (or the label the user typed, which the
// server turns back into that same key); a translated name is never sent.
//
// In order: the label the user typed for the face (a correction keeps it),
// then a name for the keys the detector is asked for (vision-materials.ts
// gives these as examples), then the key itself made readable — the
// detector may name any face, so an unknown key must still read well.
import type { Locale } from '@/lib/i18n/dictionaries';

const KNOWN_FACES: Record<string, Record<Locale, string>> = {
  facade_principale: { fr: 'Façade principale', en: 'Main facade' },
  facade_arriere: { fr: 'Façade arrière', en: 'Rear facade' },
  toiture: { fr: 'Toiture', en: 'Roof' },
  menuiseries: { fr: 'Menuiseries', en: 'Joinery' },
  sol: { fr: 'Sol', en: 'Floor' },
};

/** "facade_laterale-est" → "Facade laterale est": separators become spaces, first letter up. */
export function humanizeFaceKey(face: string): string {
  const words = face
    .split(/[_\s-]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .join(' ');
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : '';
}

/** The name shown for a face; '' only when neither a label nor a key says anything. */
export function faceDisplayLabel(
  face: string,
  faceLabel: string | null | undefined,
  locale: Locale,
): string {
  const typed = faceLabel?.trim();
  if (typed) return typed;
  const known = KNOWN_FACES[face];
  if (known) return known[locale];
  return humanizeFaceKey(face);
}
