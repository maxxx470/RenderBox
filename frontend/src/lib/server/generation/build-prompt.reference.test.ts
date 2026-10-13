// Reference tests for the prompt builder: they freeze the EXACT text the
// engines receive today, block by block, before any prompt is improved.
//
// - Assembly rules (order, separators, what is dropped) are asserted with
//   exact strings built from the real constants.
// - Full prompts (C0, each ambiance, each template) are frozen in small,
//   readable text files under ./__prompts__/ — one scenario per file, so a
//   change shows up as a plain text diff. When a prompt is changed ON PURPOSE,
//   update its file (vitest -u) and review the diff.
//
// Known limits are documented here as descriptive tests, not fixed: an empty
// template text leaves the engine with no instruction (audit F7). C0's conflict
// with an explicit request (audit F1) was fixed in étape 3A, and the materials
// header's (audit F3, the header only — not the project-wide scope of the
// materials) in étape 3B — see the priority tests below. The scope itself
// became the source image's in étape 3C.3, and the header says so since 3C.3-R.
import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from './build-prompt';
import {
  AMBIANCE_KEYS,
  PHOTO_RENDER_MODIFIER,
  PRESETS,
  PRESET_KEYS,
  type PresetKey,
} from './presets';
import { TEMPLATES, TEMPLATE_KEYS } from './templates';

const HEADER =
  "Materials recorded for this source image. Preserve each listed material by default. If the user's request explicitly changes a listed material, apply the requested change only to that material; preserve every other listed material unchanged unless the user explicitly requests otherwise:";

/** Two rows as the database holds them: one detected, one typed by the user. */
const MATERIALS = [
  { face: 'facade_principale', valeur: 'Enduit blanc taloché', source: 'auto', confidence: 90 },
  { face: 'toiture', valeur: 'Tuile terre cuite', source: 'manuel', confidence: null },
];
const MATERIAL_LINES = [
  HEADER,
  '- facade_principale: Enduit blanc taloché',
  '- toiture: Tuile terre cuite',
];

const snap = (name: string) => `./__prompts__/${name}.txt`;

describe('buildGenerationPrompt — assembly rules (exact)', () => {
  it('materials only: the header then one "- face: valeur" line per row, nothing else', () => {
    expect(buildGenerationPrompt({ materialsSnapshot: MATERIALS, preset: null })).toBe(
      MATERIAL_LINES.join('\n'),
    );
  });

  it('never sends the source or the confidence of a material', () => {
    const prompt = buildGenerationPrompt({ materialsSnapshot: MATERIALS, preset: null });
    expect(prompt).not.toMatch(/manuel|auto\b|90/);
  });

  it('materials + ambiance: materials, then the modifier, joined by single newlines', () => {
    expect(buildGenerationPrompt({ materialsSnapshot: MATERIALS, preset: 'nuit_int' })).toBe(
      [...MATERIAL_LINES, PRESETS.nuit_int.promptModifier].join('\n'),
    );
  });

  it('materials + free text: materials, then the text', () => {
    expect(
      buildGenerationPrompt({
        materialsSnapshot: MATERIALS,
        preset: null,
        customPrompt: 'vue depuis la rue',
      }),
    ).toBe([...MATERIAL_LINES, 'vue depuis la rue'].join('\n'));
  });

  it('materials + ambiance + free text: always in that order', () => {
    expect(
      buildGenerationPrompt({
        materialsSnapshot: MATERIALS,
        preset: 'eclate',
        customPrompt: 'vue depuis la rue',
      }),
    ).toBe([...MATERIAL_LINES, PRESETS.eclate.promptModifier, 'vue depuis la rue'].join('\n'));
  });

  it('no materials: the header is left out entirely', () => {
    expect(buildGenerationPrompt({ materialsSnapshot: [], preset: 'jour_ext' })).toBe(
      PRESETS.jour_ext.promptModifier,
    );
  });

  it('no ambiance and photoRender off: nothing is added in its place', () => {
    expect(
      buildGenerationPrompt({ materialsSnapshot: [], preset: null, customPrompt: 'texte' }),
    ).toBe('texte');
  });

  it('trims the free text and keeps its inner line breaks', () => {
    expect(
      buildGenerationPrompt({
        materialsSnapshot: [],
        preset: null,
        customPrompt: '  ligne 1\nligne 2  ',
      }),
    ).toBe('ligne 1\nligne 2');
  });

  it.each(['', '   ', '\n\t '])('drops a free text made only of spaces (%j)', (customPrompt) => {
    expect(
      buildGenerationPrompt({ materialsSnapshot: MATERIALS, preset: 'jour_ext', customPrompt }),
    ).toBe([...MATERIAL_LINES, PRESETS.jour_ext.promptModifier].join('\n'));
  });

  it('returns an empty string when there is nothing at all (no materials, no ambiance, no text, photoRender off)', () => {
    expect(buildGenerationPrompt({ materialsSnapshot: [], preset: null })).toBe('');
  });
});

describe('C0 — Sans ambiance (full prompts)', () => {
  const c0 = (customPrompt?: string, materials = MATERIALS) =>
    buildGenerationPrompt({
      materialsSnapshot: materials,
      preset: null,
      customPrompt,
      photoRender: true,
    });

  it('C0 alone is exactly PHOTO_RENDER_MODIFIER', async () => {
    expect(c0(undefined, [])).toBe(PHOTO_RENDER_MODIFIER);
    await expect(PHOTO_RENDER_MODIFIER).toMatchFileSnapshot(snap('c0-modifier'));
  });

  it('C0 with materials: materials first, then C0', async () => {
    const prompt = c0();
    expect(prompt).toBe([...MATERIAL_LINES, PHOTO_RENDER_MODIFIER].join('\n'));
    await expect(prompt).toMatchFileSnapshot(snap('c0-avec-materiaux'));
  });

  // The user's request is appended AFTER C0; since étape 3A, C0 itself says
  // that an explicit request wins for the element it names (tests below).
  const SCENARIOS: [string, string][] = [
    ['changement-materiau', "Remplacez l'enduit de la façade par un bardage en bois."],
    ['changement-geometrie', 'Ajoutez un étage et une piscine devant la maison.'],
    ['geometrie-stricte', 'Ne changez rien à la géométrie, seulement la lumière du soir.'],
    ['contradictoire', 'Gardez tout identique mais passez la façade en béton brut.'],
  ];

  it.each(SCENARIOS)('C0 + request "%s": materials, C0, then the request', async (name, text) => {
    const prompt = c0(text);
    expect(prompt).toBe([...MATERIAL_LINES, PHOTO_RENDER_MODIFIER, text].join('\n'));
    await expect(prompt).toMatchFileSnapshot(snap(`c0-demande-${name}`));
  });

  it('is not added on top of an ambiance, even with photoRender on', () => {
    for (const preset of PRESET_KEYS) {
      const prompt = buildGenerationPrompt({ materialsSnapshot: [], preset, photoRender: true });
      expect(prompt).toBe(PRESETS[preset].promptModifier);
    }
  });
});

describe('C0 — an explicit request takes precedence, for that element only (étape 3A)', () => {
  const REQUEST = "Remplacez l'enduit de la façade par un bardage en bois.";
  // The prompt RenderBox actually builds for "Sans ambiance" + a request.
  const built = buildGenerationPrompt({
    materialsSnapshot: MATERIALS,
    preset: null,
    customPrompt: REQUEST,
    photoRender: true,
  });
  const lines = built.split('\n');
  const c0Line =
    lines.find((l) => l.startsWith('Create a photorealistic architectural photograph')) ?? '';
  const sentences = c0Line.split(/(?<=\.)\s+/);

  it('the C0 block sits between the materials and the request, and the request comes last', () => {
    expect(c0Line).toBe(PHOTO_RENDER_MODIFIER);
    expect(lines.indexOf(PHOTO_RENDER_MODIFIER)).toBe(MATERIAL_LINES.length);
    expect(lines[lines.length - 1]).toBe(REQUEST);
  });

  it('1. states that an explicit request takes precedence over the preservation rules for the element it names', () => {
    expect(c0Line).toContain("If the user's request explicitly asks to change an element");
    expect(c0Line).toContain(
      'for that element, the request takes precedence over these preservation rules',
    );
    // The rule comes after the preservation it overrides.
    expect(c0Line.indexOf('takes precedence')).toBeGreaterThan(
      c0Line.indexOf('Preserve the source by default.'),
    );
  });

  it('2. allows a material to be replaced when it is asked for', () => {
    expect(c0Line).toContain(
      "Keep the materials, colours and finishes shown unless the user's request explicitly changes them.",
    );
    expect(c0Line).toContain('replace a material, change a colour or a finish');
  });

  it('3. allows a geometric change when it is explicitly asked for, and adding or removing an element', () => {
    expect(c0Line).toContain('modify the geometry, or add or remove an element');
  });

  it('4. still protects the geometry and the view when nothing is asked', () => {
    expect(c0Line).toContain('Preserve the source by default.');
    for (const kept of [
      'Keep the exact point of view',
      'the exact proportions',
      'the composition',
      'the camera angle and the framing',
      'the geometry and volumes',
      'the openings',
      'the position of the building on its site',
      'every existing architectural element',
    ]) {
      expect(c0Line).toContain(kept);
    }
  });

  it('5. keeps everything the request does not mention', () => {
    expect(c0Line).toContain('apply that change to that element only');
    expect(c0Line).toContain('A requested change is not permission to redesign the image');
    expect(c0Line).toContain(
      'everything the request does not mention stays as faithful to the source as possible',
    );
  });

  it('6. adds no ambiance or style that was not asked for', () => {
    expect(c0Line).toContain(
      'Do not add an ambiance that was not asked for: no cinematic lighting, no sunset, no artistic style or aesthetic transformation.',
    );
    expect(c0Line).toContain('natural, believable light consistent with the source');
    for (const key of PRESET_KEYS) expect(built).not.toContain(PRESETS[key].promptModifier);
  });

  it('7. no longer holds an absolute order to keep the materials that would contradict a requested change', () => {
    expect(c0Line).not.toContain('match every material exactly');
    expect(c0Line).not.toMatch(/do not alter[^.]*materials/i);
    // Every sentence of C0 that tells the engine to keep the materials is conditional.
    const keepMaterials = sentences.filter(
      (s) => /material/i.test(s) && /\b(keep|preserve|do not alter|exactly)\b/i.test(s),
    );
    expect(keepMaterials.length).toBeGreaterThan(0);
    for (const s of keepMaterials) expect(s).toMatch(/\bunless\b/);
  });
});

describe('Materials header — kept by default, an explicit request wins for the material it names (étape 3B)', () => {
  // The owner's example: three recorded materials, one request aimed at one of them.
  const THREE = [
    { face: 'facade_principale', valeur: 'Enduit blanc', source: 'auto', confidence: 90 },
    { face: 'soubassement', valeur: 'Pierre naturelle', source: 'auto', confidence: 85 },
    { face: 'menuiseries', valeur: 'Menuiseries noires', source: 'manuel', confidence: null },
  ];
  const THREE_LINES = [
    '- facade_principale: Enduit blanc',
    '- soubassement: Pierre naturelle',
    '- menuiseries: Menuiseries noires',
  ];
  const REQUEST = "Remplacez l'enduit de la façade par un bardage en bois.";

  const c0With = (customPrompt?: string) =>
    buildGenerationPrompt({
      materialsSnapshot: THREE,
      preset: null,
      customPrompt,
      photoRender: true,
    });

  it('1. keeps every listed material by default: with no request, header, list, then C0', () => {
    expect(HEADER).toContain('Preserve each listed material by default.');
    expect(c0With()).toBe([HEADER, ...THREE_LINES, PHOTO_RENDER_MODIFIER].join('\n'));
  });

  it('2. lets an explicit request change the material it names, and the request comes last', () => {
    expect(HEADER).toContain(
      "If the user's request explicitly changes a listed material, apply the requested change only to that material",
    );
    const lines = c0With(REQUEST).split('\n');
    expect(lines[lines.length - 1]).toBe(REQUEST);
  });

  it('3. keeps the materials the request does not name, unless the request names them too', () => {
    expect(HEADER).toContain(
      'preserve every other listed material unchanged unless the user explicitly requests otherwise',
    );
  });

  it('4. sends every recorded material, intact, once, in order, right after the header', () => {
    const lines = c0With(REQUEST).split('\n');
    expect(lines.slice(0, 1 + THREE_LINES.length)).toEqual([HEADER, ...THREE_LINES]);
    for (const line of THREE_LINES) expect(lines.filter((l) => l === line)).toHaveLength(1);
  });

  it('5. header, C0 and the request now state one rule: preserved by default, the explicit request wins for what it names', () => {
    const prompt = c0With(REQUEST);
    // The orders that used to contradict a requested change are gone.
    expect(prompt).not.toContain('Keep these materials consistent');
    expect(prompt).not.toContain('consistent with the source photo');
    expect(prompt).not.toContain('match every material exactly');
    expect(prompt).not.toMatch(/do not alter[^.]*materials/i);
    // Both blocks keep by default and make the same exception, for the same request.
    expect(prompt).toContain('Preserve each listed material by default.');
    expect(prompt).toContain('Preserve the source by default.');
    expect(prompt).toContain("If the user's request explicitly changes a listed material");
    expect(prompt).toContain("If the user's request explicitly asks to change an element");
    // ...and both limit it to what is named.
    expect(prompt).toContain('apply the requested change only to that material');
    expect(prompt).toContain('apply that change to that element only');
  });

  it('6. names the source image the materials belong to, never the whole project (étape 3C.3-R)', () => {
    // Since étape 3C.3 the list is the source image's own (resolve.ts); the
    // 3B header said "for this project" while the list still was the
    // project's. The source may be a render, so not "photo".
    expect(HEADER.startsWith('Materials recorded for this source image. ')).toBe(true);
    expect(HEADER).not.toMatch(/project/i);
    expect(HEADER).not.toMatch(/source photo/i);
    const prompt = buildGenerationPrompt({ materialsSnapshot: MATERIALS, preset: null });
    expect(prompt).not.toMatch(/project/i);
    // Only the first sentence changed: the priority rule after it is the 3B one.
    expect(HEADER).toBe(
      "Materials recorded for this source image. Preserve each listed material by default. If the user's request explicitly changes a listed material, apply the requested change only to that material; preserve every other listed material unchanged unless the user explicitly requests otherwise:",
    );
  });

  it('7. is the same single header line on every path that sends materials (C0, ambiances, templates)', () => {
    const prompts = [
      c0With(REQUEST),
      ...PRESET_KEYS.map((preset) =>
        buildGenerationPrompt({ materialsSnapshot: THREE, preset, customPrompt: REQUEST }),
      ),
      ...TEMPLATE_KEYS.map((key) =>
        buildGenerationPrompt({
          materialsSnapshot: THREE,
          preset: null,
          customPrompt: TEMPLATES[key].prompt.en,
        }),
      ),
    ];
    for (const prompt of prompts) {
      expect(prompt.split('\n').slice(0, 1 + THREE_LINES.length)).toEqual([HEADER, ...THREE_LINES]);
      expect(prompt.split(HEADER)).toHaveLength(2);
    }
  });

  it('8. is still left out entirely when the project has no materials', () => {
    const prompt = buildGenerationPrompt({
      materialsSnapshot: [],
      preset: null,
      customPrompt: REQUEST,
      photoRender: true,
    });
    expect(prompt).toBe([PHOTO_RENDER_MODIFIER, REQUEST].join('\n'));
  });
});

describe('Ambiances', () => {
  it('the menu offers exactly these five, in this order', () => {
    expect([...AMBIANCE_KEYS]).toEqual(['plan_3d', 'eclate', 'analyse', 'isometrie', 'esquisse']);
  });

  it('the route accepts nine keys: the five of the menu and the four former lights', () => {
    expect([...PRESET_KEYS]).toEqual([
      'plan_3d',
      'eclate',
      'analyse',
      'isometrie',
      'esquisse',
      'jour_ext',
      'jour_int',
      'nuit_ext',
      'nuit_int',
    ]);
  });

  it('only the lights and Esquisse are re-applied on an edit', () => {
    const reapplied = PRESET_KEYS.filter((k) => PRESETS[k].reapplyOnEdit);
    expect(reapplied).toEqual(['esquisse', 'jour_ext', 'jour_int', 'nuit_ext', 'nuit_int']);
  });

  it.each(PRESET_KEYS.map((k) => [k] as [PresetKey]))(
    'ambiance %s: full prompt with materials and a free text',
    async (key) => {
      const prompt = buildGenerationPrompt({
        materialsSnapshot: MATERIALS,
        preset: key,
        customPrompt: 'vue depuis la rue',
        photoRender: true,
      });
      expect(prompt).toBe(
        [...MATERIAL_LINES, PRESETS[key].promptModifier, 'vue depuis la rue'].join('\n'),
      );
      await expect(prompt).toMatchFileSnapshot(snap(`ambiance-${key}`));
    },
  );
});

describe('Templates of the fan (assembled as the generate route does: no ambiance, no C0)', () => {
  const asRoute = (customPrompt: string | undefined, materials = MATERIALS) =>
    buildGenerationPrompt({
      materialsSnapshot: materials,
      preset: null,
      customPrompt,
      photoRender: false,
    });

  it('there are four templates: the four lights', () => {
    expect([...TEMPLATE_KEYS]).toEqual(['jour_ext', 'jour_int', 'nuit_ext', 'nuit_int']);
  });

  const CASES = TEMPLATE_KEYS.flatMap((k) => (['fr', 'en'] as const).map((l) => [k, l] as const));

  it.each(CASES)('template %s (%s): full prompt with materials', async (key, lang) => {
    const text = TEMPLATES[key].prompt[lang];
    const prompt = asRoute(text);
    expect(prompt).toBe([...MATERIAL_LINES, text].join('\n'));
    // The header appears once, the template text once: nothing is duplicated.
    expect(prompt.split(HEADER)).toHaveLength(2);
    expect(prompt.split(text)).toHaveLength(2);
    await expect(prompt).toMatchFileSnapshot(snap(`modele-${key}-${lang}`));
  });

  it.each(TEMPLATE_KEYS.map((k) => [k]))(
    'template %s: the French and English texts differ and each reads in its language',
    (key) => {
      const { fr, en } = TEMPLATES[key].prompt;
      expect(fr).not.toBe(en);
      expect(en).toContain('the attached image');
      expect(fr).toContain('l’image jointe');
    },
  );

  it.each(CASES)(
    'template %s (%s) fits the 2000-character limit of the generate route',
    (key, lang) => {
      expect(TEMPLATES[key].prompt[lang].length).toBeLessThanOrEqual(2000);
    },
  );

  it('a text edited by the user is sent as typed, not replaced by the template', () => {
    const edited = `${TEMPLATES.nuit_ext.prompt.fr} Ajoutez une piscine éclairée.`;
    expect(asRoute(edited)).toBe([...MATERIAL_LINES, edited].join('\n'));
  });

  it('documents an empty template text: the engine gets the materials only, or nothing at all (audit F7)', () => {
    expect(asRoute('')).toBe(MATERIAL_LINES.join('\n'));
    expect(asRoute(undefined, [])).toBe('');
  });
});
