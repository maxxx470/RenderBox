// What a reference image is allowed to do to a render (2026-10-29, owner:
// « en aucun cas la géométrie de l'image ne doit changer à cause de l'image
// de référence ajoutée »).
//
// Two defects were behind it, and this file pins both fixes.
//
//  1. The engine is handed several images in one call — the source first,
//     then the references — and the prompt never said WHICH was the source.
//     With nothing but order to go on, the model blends the two buildings.
//  2. Without an ambiance (C0), the references were not mentioned to the
//     engine AT ALL: two images in, no word about the second one.
//
// And the lock has to be the LAST thing read: it used to sit mid-prompt,
// with the user's own request after it.
import { describe, expect, it } from 'vitest';
import { buildGenerationPrompt } from './build-prompt';
import type { EngineName } from './engines/types';

const ENGINES: EngineName[] = ['nanobanana', 'gpt_image'];

function prompt(opts: {
  engine: EngineName;
  preset?: 'jour_ext' | null;
  locale?: 'fr' | 'en';
  referenceCount?: number;
  customPrompt?: string;
}): string {
  return buildGenerationPrompt({
    engine: opts.engine,
    materialsSnapshot: [],
    locale: opts.locale ?? 'fr',
    ...(opts.preset ? { preset: opts.preset } : {}),
    ...(opts.customPrompt ? { customPrompt: opts.customPrompt } : {}),
    referenceCount: opts.referenceCount ?? 0,
  });
}

describe('a reference image never reshapes the source', () => {
  for (const engine of ENGINES) {
    describe(engine, () => {
      for (const preset of [null, 'jour_ext'] as const) {
        const what = preset ? 'with an ambiance' : 'without an ambiance (C0)';

        it(`${what}: says which attached image is the source`, () => {
          const text = prompt({ engine, preset, referenceCount: 1 });
          expect(text).toMatch(/image\s*1/i);
          expect(text.toLowerCase()).toMatch(/source/);
        });

        it(`${what}: numbers every reference it was given`, () => {
          const one = prompt({ engine, preset, referenceCount: 1 });
          const three = prompt({ engine, preset, referenceCount: 3 });
          expect(one).toMatch(/image 2/i);
          // Three references are images 2 to 4 — never 2 to 3.
          expect(three).toMatch(/2\D{1,6}4/);
        });

        it(`${what}: forbids taking the shape, and says it LAST`, () => {
          const text = prompt({
            engine,
            preset,
            referenceCount: 2,
            customPrompt: 'façade en bois',
          });
          const lower = text.toLowerCase();
          // Geometry, volumes, roof and openings are each named: a model
          // that is only told « geometry » still moves a roof plane. An
          // ambiance speaks the visitor's language (French here); C0 is
          // written in English throughout, so it is checked in English.
          const words = preset
            ? ['géométrie', 'volumes', 'toit', 'ouvertures']
            : ['geometry', 'volumes', 'roof', 'openings'];
          for (const word of words) {
            expect(lower, word).toContain(word);
          }
          // The lock is the last block of the prompt — after the user's own
          // request, which is what it has to outrank.
          const lock = text.lastIndexOf('RÈGLE ABSOLUE');
          const lockEn = text.lastIndexOf('ABSOLUTE RULE');
          const at = Math.max(lock, lockEn);
          expect(at).toBeGreaterThan(-1);
          expect(text.indexOf('façade en bois')).toBeLessThan(at);
          expect(text.slice(at)).not.toContain('\n\n\n');
        });

        it(`${what}: says nothing about references when there are none`, () => {
          const text = prompt({ engine, preset, referenceCount: 0 });
          expect(text).not.toMatch(/RÈGLE ABSOLUE|ABSOLUTE RULE/);
          expect(text.toLowerCase()).not.toContain('image 2');
        });
      }
    });
  }

  it('speaks the ambiance’s own language', () => {
    const fr = prompt({
      engine: 'nanobanana',
      preset: 'jour_ext',
      referenceCount: 1,
      locale: 'fr',
    });
    const en = prompt({
      engine: 'nanobanana',
      preset: 'jour_ext',
      referenceCount: 1,
      locale: 'en',
    });
    expect(fr).toContain('RÈGLE ABSOLUE');
    expect(en).toContain('ABSOLUTE RULE');
  });

  it('still asks for the reference’s materials, vegetation and sky', () => {
    // The lock must not have swallowed the point of the feature.
    const text = prompt({
      engine: 'nanobanana',
      preset: 'jour_ext',
      referenceCount: 1,
    }).toLowerCase();
    expect(text).toContain('matériaux');
    expect(text).toContain('végétation');
    expect(text).toContain('ciel');
  });
});
