// The materials sheet of a render, as text (2026-10-19, owner: « un bouton
// Copier … il suffit de copier la fiche, d'ajouter la nouvelle image source et
// de coller »). Client-safe: the panel formats it for « Copier », the command
// bar recognises it when it is pasted under the prompt, and the server reads
// it back the same way (lib/server/materials/render-sheet.ts).
//
//   FICHE RENDERPRO · RP-7K4M2Q
//   Image source : RP-3D9F1A
//   Ambiance : Jour extérieur [jour_ext]
//   Ciel : Voilé [hazy]
//   Couleur → matériau :
//   - Brun-rouge des murs de clôture → brique rouge, joints creux
//   FIN DE LA FICHE
//
// The machine-readable parts are the codes and the keys in brackets; every
// other word is for the reader and follows the interface's language. Both
// languages are read back.

export type SheetLocale = 'fr' | 'en';

export interface SheetLine {
  color: string;
  material: string;
}

/** An image's code on the whole site: « RP- » and six characters. */
export const IMAGE_CODE_RE = /^RP-[0-9A-HJKMNP-TV-Z]{6}$/;
/** Crockford's base32: no I, L, O or U, so a code is never misread. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface SheetBlock {
  /** The code of the image the sheet was made for. */
  code: string | null;
  /** The code of the source image that render came from. */
  sourceCode: string | null;
  /** The ambiance's key and, for Exterior day, the sky. */
  ambianceKey: string | null;
  sky: 'hazy' | 'sun' | null;
  lines: SheetLine[];
}

const WORDS = {
  fr: {
    header: 'FICHE RENDERPRO',
    source: 'Image source',
    ambiance: 'Ambiance',
    sky: 'Ciel',
    lines: 'Couleur → matériau',
    end: 'FIN DE LA FICHE',
  },
  en: {
    header: 'RENDERPRO SHEET',
    source: 'Source image',
    ambiance: 'Ambiance',
    sky: 'Sky',
    lines: 'Colour → material',
    end: 'END OF SHEET',
  },
} as const;

const HEADER_RE = /^(?:FICHE RENDERPRO|RENDERPRO SHEET)\s*(?:[·:-]\s*)?(RP-[A-Z0-9]{6})?\s*$/i;
const END_RE = /^(?:FIN DE LA FICHE|END OF SHEET)\s*$/i;
const SOURCE_RE = /^(?:Image source|Source image)\s*:\s*(RP-[A-Z0-9]{6})\s*$/i;
const AMBIANCE_RE = /^Ambiance\s*:.*\[([a-z0-9_]+)\]\s*$/i;
const SKY_RE = /^(?:Ciel|Sky)\s*:.*\[(hazy|sun)\]\s*$/i;
const LINE_RE = /^[-•*]\s*(.+?)\s*(?:→|->)\s*(.+?)\s*$/;

/** The most lines one sheet carries, and the longest a line may be. */
export const MAX_SHEET_LINES = 20;
export const MAX_SHEET_FIELD = 200;

export function formatSheetBlock(
  input: {
    code: string | null;
    sourceCode: string | null;
    ambianceKey: string | null;
    ambianceLabel: string | null;
    sky: 'hazy' | 'sun' | null;
    skyLabel: string | null;
    lines: readonly SheetLine[];
  },
  locale: SheetLocale,
): string {
  const w = WORDS[locale];
  const out = [input.code ? `${w.header} · ${input.code}` : w.header];
  if (input.sourceCode) out.push(`${w.source} : ${input.sourceCode}`);
  if (input.ambianceKey)
    out.push(`${w.ambiance} : ${input.ambianceLabel ?? ''} [${input.ambianceKey}]`);
  if (input.sky) out.push(`${w.sky} : ${input.skyLabel ?? ''} [${input.sky}]`);
  out.push(`${w.lines} :`);
  for (const l of input.lines) out.push(`- ${l.color} → ${l.material}`);
  out.push(w.end);
  return out.join('\n');
}

/**
 * Finds a sheet in a text (a prompt with the sheet pasted under it). Returns
 * what it reads and the text without the sheet; null when there is none.
 */
export function extractSheetBlock(text: string): { sheet: SheetBlock; rest: string } | null {
  const rows = text.split(/\r\n|\r|\n/);
  const start = rows.findIndex((r) => HEADER_RE.test(r.trim()));
  if (start < 0) return null;

  const sheet: SheetBlock = {
    code: HEADER_RE.exec(rows[start]!.trim())?.[1]?.toUpperCase() ?? null,
    sourceCode: null,
    ambianceKey: null,
    sky: null,
    lines: [],
  };
  let end = start + 1;
  for (; end < rows.length; end++) {
    const row = rows[end]!.trim();
    if (END_RE.test(row)) {
      end++;
      break;
    }
    // Without its end marker the sheet stops at the first blank line.
    if (row === '') break;
    const source = SOURCE_RE.exec(row);
    if (source) sheet.sourceCode = source[1]!.toUpperCase();
    const ambiance = AMBIANCE_RE.exec(row);
    if (ambiance) sheet.ambianceKey = ambiance[1]!.toLowerCase();
    const sky = SKY_RE.exec(row);
    if (sky) sheet.sky = sky[1]!.toLowerCase() as 'hazy' | 'sun';
    const line = LINE_RE.exec(row);
    if (line && sheet.lines.length < MAX_SHEET_LINES) {
      sheet.lines.push({
        color: line[1]!.slice(0, MAX_SHEET_FIELD),
        material: line[2]!.slice(0, MAX_SHEET_FIELD),
      });
    }
  }
  // The gap the sheet leaves is closed: no run of blank lines.
  const rest = [...rows.slice(0, start), ...rows.slice(end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { sheet, rest };
}
