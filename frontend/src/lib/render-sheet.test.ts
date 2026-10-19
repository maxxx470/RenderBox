import { describe, it, expect } from 'vitest';
import {
  CODE_ALPHABET,
  IMAGE_CODE_RE,
  MAX_SHEET_LINES,
  extractSheetBlock,
  formatSheetBlock,
} from './render-sheet';

const INPUT = {
  code: 'RP-7K4M2Q',
  sourceCode: 'RP-3D9F1A',
  ambianceKey: 'jour_ext',
  ambianceLabel: 'Jour extérieur',
  sky: 'hazy' as const,
  skyLabel: 'Voilé',
  lines: [
    { color: 'Brun-rouge des murs de clôture', material: 'brique rouge, joints creux' },
    { color: 'Gris foncé du garde-corps', material: 'métal noir mat' },
  ],
};

describe('the image code', () => {
  it('is RP- and six characters of a base32 with no I, L, O or U', () => {
    expect(IMAGE_CODE_RE.test('RP-7K4M2Q')).toBe(true);
    for (const bad of ['RP-7K4M2', 'RP-7K4M2QQ', 'RP-7K4MIL', 'rp-7k4m2q', 'XX-7K4M2Q']) {
      expect(IMAGE_CODE_RE.test(bad)).toBe(false);
    }
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });
});

describe('formatSheetBlock', () => {
  it('writes the sheet the way the owner described it, in French', () => {
    expect(formatSheetBlock(INPUT, 'fr')).toBe(
      [
        'FICHE RENDERPRO · RP-7K4M2Q',
        'Image source : RP-3D9F1A',
        'Ambiance : Jour extérieur [jour_ext]',
        'Ciel : Voilé [hazy]',
        'Couleur → matériau :',
        '- Brun-rouge des murs de clôture → brique rouge, joints creux',
        '- Gris foncé du garde-corps → métal noir mat',
        'FIN DE LA FICHE',
      ].join('\n'),
    );
  });

  it('writes it in English too, and leaves out what it does not have', () => {
    const text = formatSheetBlock(
      { ...INPUT, sourceCode: null, ambianceKey: null, ambianceLabel: null, sky: null },
      'en',
    );
    expect(text.split('\n')).toEqual([
      'RENDERPRO SHEET · RP-7K4M2Q',
      'Colour → material :',
      '- Brun-rouge des murs de clôture → brique rouge, joints creux',
      '- Gris foncé du garde-corps → métal noir mat',
      'END OF SHEET',
    ]);
  });
});

describe('extractSheetBlock', () => {
  it('reads back what formatSheetBlock wrote, in either language', () => {
    for (const locale of ['fr', 'en'] as const) {
      const found = extractSheetBlock(formatSheetBlock(INPUT, locale));
      expect(found?.sheet).toEqual({
        code: 'RP-7K4M2Q',
        sourceCode: 'RP-3D9F1A',
        ambianceKey: 'jour_ext',
        sky: 'hazy',
        lines: INPUT.lines,
      });
      expect(found?.rest).toBe('');
    }
  });

  it('takes the sheet out of the text pasted around it', () => {
    const text = `Ma précision\n\n${formatSheetBlock(INPUT, 'fr')}\n\nEt une autre ligne`;
    const found = extractSheetBlock(text);
    expect(found?.sheet.lines).toHaveLength(2);
    expect(found?.rest).toBe('Ma précision\n\nEt une autre ligne');
  });

  it('is null without a sheet, and tolerates a missing end marker (a blank line ends it)', () => {
    expect(extractSheetBlock('Natural daylight, no sheet here')).toBeNull();
    const found = extractSheetBlock('FICHE RENDERPRO\n- mur → brique\n\nla suite');
    expect(found?.sheet.lines).toEqual([{ color: 'mur', material: 'brique' }]);
    expect(found?.sheet.code).toBeNull();
    expect(found?.rest).toBe('la suite');
  });

  it('keeps no more than the allowed lines and field length', () => {
    const many = Array.from({ length: 40 }, (_, i) => `- couleur ${i} → matériau ${i}`).join('\n');
    const found = extractSheetBlock(`FICHE RENDERPRO · RP-7K4M2Q\n${many}\nFIN DE LA FICHE`);
    expect(found?.sheet.lines).toHaveLength(MAX_SHEET_LINES);
    const long = extractSheetBlock(`FICHE RENDERPRO\n- ${'a'.repeat(500)} → b\nFIN DE LA FICHE`);
    expect(long?.sheet.lines[0]?.color).toHaveLength(200);
  });

  it('reads an arrow typed as -> and a code in lower case', () => {
    const found = extractSheetBlock(
      'FICHE RENDERPRO · rp-7k4m2q\n- mur -> brique\nFIN DE LA FICHE',
    );
    expect(found?.sheet.code).toBe('RP-7K4M2Q');
    expect(found?.sheet.lines).toEqual([{ color: 'mur', material: 'brique' }]);
  });
});
