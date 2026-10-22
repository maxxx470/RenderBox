// The final prompts (2026-10-22 specification, phase 4 and the ambiances).
// The locked blocks must be the specification's text word for word (its
// acceptance test 3); full prompts are frozen in ./__prompts__/ with the
// specification's own example villa — a change shows up as a plain text diff
// (vitest -u, then review it).
import { describe, it, expect } from 'vitest';
import {
  accessPrompt,
  boardPrompt,
  enhancePrompt,
  explodedPrompt,
  exteriorPrompt,
  fixedPrompt,
  interiorPrompt,
  materialsText,
  planPrompt,
  upgradesText,
} from './assemble';
import {
  BEDROOM,
  BEDROOM_SECTIONS,
  PLAN,
  VILLA,
  VILLA_ACCESS,
  VILLA_ENHANCE,
  VILLA_LABELS,
  VILLA_SECTIONS,
} from './fixtures';

const snap = (n: string) => `./__prompts__/${n}.txt`;

describe('Full prompts, frozen (the 14 ambiances and Améliorer)', () => {
  for (const preset of ['jour_ext', 'heure_doree', 'pluie', 'nuit_ext'] as const) {
    it(preset, async () => {
      await expect(exteriorPrompt(preset, VILLA, VILLA_SECTIONS)).toMatchFileSnapshot(snap(preset));
    });
  }
  for (const preset of ['jour_int', 'nuit_int'] as const) {
    it(preset, async () => {
      await expect(interiorPrompt(preset, BEDROOM, BEDROOM_SECTIONS)).toMatchFileSnapshot(
        snap(preset),
      );
    });
  }
  it('plan_3d', async () => {
    await expect(planPrompt(PLAN, '')).toMatchFileSnapshot(snap('plan_3d'));
  });
  it('eclate', async () => {
    await expect(explodedPrompt(VILLA_LABELS, '')).toMatchFileSnapshot(snap('eclate'));
  });
  for (const preset of [
    'maquette_blanche',
    'croquis',
    'aquarelle',
    'isometrie',
    'analyse',
  ] as const) {
    it(preset, async () => {
      await expect(fixedPrompt(preset, VILLA, '')).toMatchFileSnapshot(snap(preset));
    });
  }
  it('esquisse (Schéma d’accès)', async () => {
    await expect(accessPrompt(VILLA_ACCESS, '')).toMatchFileSnapshot(snap('esquisse'));
  });
  it('Améliorer', async () => {
    await expect(
      enhancePrompt({ analysis: VILLA_ENHANCE, options: ['sharpness'], strength: 'medium' }),
    ).toMatchFileSnapshot(snap('ameliorer'));
  });
});

describe('The locked blocks, word for word (acceptance test 3)', () => {
  const ext = exteriorPrompt('jour_ext', VILLA, VILLA_SECTIONS);
  const int = interiorPrompt('jour_int', BEDROOM, BEDROOM_SECTIONS);

  it('exterior: Transform, Base Design Consistency, Camera, Render Specs, Negative Prompts', () => {
    for (const block of [
      'TRANSFORM:\nThis render image into an ultra-photorealistic architectural photograph, 8K, DSLR photo shot on location as if captured on Sony VENICE 2, Zeiss Otus 28mm lens.',
      'BASE DESIGN CONSISTENCY:\nDo not alter, redesign, or reinterpret the architectural form in any way. Strictly preserve the exact geometry, massing, proportions, window placement, roof profile, and facade composition exactly as shown in the reference image. No reinterpretation of form. Geometry to preserve: ',
      'CAMERA:\nPhotographed on Sony VENICE 2, Zeiss Otus 28mm lens, f/8, eye-level, shot for Architectural Digest, editorial architectural photography',
      'RENDER SPECS:\nUltra-photorealistic, 8K print quality, full dynamic range with rich detail in both deep shadows and bright highlights, color science warm, natural and cinematic with subtle richness without oversaturation, output must feel like a professional architectural photograph shot for a premium magazine like Architectural Digest.',
      'NEGATIVE PROMPTS:\nNo redesigning of architecture or facade, no cartoon style, no plastic-looking materials or CGI surfaces, no excessive glow, bloom, or vignette. No changes to materials, no added or removed windows, no change to the building shape.',
    ]) {
      expect(ext).toContain(block);
    }
  });

  it('interior: the same five blocks, from the interior sheet', () => {
    for (const block of [
      'TRANSFORM:\nThis SketchUp viewport image into an ultra-photorealistic interior photograph, 8K, DSLR photo shot on interior space as if captured on Sony VENICE 2, Zeiss Otus 35mm lens.',
      'CAMERA:\nPhotographed on Sony VENICE 2, Zeiss Otus 35mm lens, f/8, interior eye-level at 1.0 to 1.2 metres above floor, shot for Architectural Digest, editorial interior photography.',
      'NEGATIVE PROMPTS:\nNo redesigning of interior layout or spatial composition, no furniture substitution, no cartoon style, no plastic-looking materials or CGI surfaces, no excessive glow, bloom, or vignette, no floating objects, no distorted perspective, no unrealistic scale. No changes to materials, no added or removed doors or windows.',
    ]) {
      expect(int).toContain(block);
    }
    expect(int).toContain(
      'Furniture stays exactly as in the image. Styling adds only small accessories and plants; do not add, remove or replace furniture.',
    );
  });

  it('the analysis fills the geometry and the materials; Claude’s sections fill the rest', () => {
    expect(ext).toContain(`Geometry to preserve: ${VILLA.lock_summary}.`);
    expect(ext).toContain(
      'Finishes: ground floor walls: white rendered walls (white); upper floor cladding: iroko timber slats (warm brown); window frames: black aluminium (black). Keep every material exactly as identified',
    );
    expect(ext).toContain(`SITE LOCATION & NEIGHBOURHOOD CONTEXT:\n${VILLA_SECTIONS.site}`);
    expect(ext).toContain(`VEGETATION:\n${VILLA_SECTIONS.vegetation}`);
    expect(materialsText([{ element: 'roof', material: 'zinc', color: '' }])).toBe('roof: zinc');
  });
});

describe('Each ambiance’s own lines', () => {
  const COLORS =
    'Light affects brightness and tone only; the materials keep their identified colors.';

  it('day: glass dark and unreadable inside; no colour line', () => {
    const p = exteriorPrompt('jour_ext', VILLA, VILLA_SECTIONS);
    expect(p).toContain(
      'interior behind the glass dark and unreadable, no invented interior elements',
    );
    expect(p).not.toContain(COLORS);
  });

  it('golden hour, rain and night keep the materials’ colours; rain stays a drizzle', () => {
    for (const preset of ['heure_doree', 'pluie', 'nuit_ext'] as const) {
      expect(exteriorPrompt(preset, VILLA, VILLA_SECTIONS)).toContain(COLORS);
    }
    expect(exteriorPrompt('pluie', VILLA, VILLA_SECTIONS)).toContain(
      'Drizzle is fine and subtle, never a downpour hiding the building.',
    );
  });

  it('night: warm glass without invented furniture, plants softly lit', () => {
    const p = exteriorPrompt('nuit_ext', VILLA, VILLA_SECTIONS);
    expect(p).toContain(
      'Glazing: clear high performance glass; warm light glows behind it, interior kept soft and unreadable, no invented furniture or people.',
    );
    expect(p).not.toContain('reflecting the sky; interior behind the glass dark');
    expect(p).toContain('Vegetation is softly lit by the exterior lights, colors muted.');
  });

  it('interior night: only the fixtures in the image', () => {
    expect(interiorPrompt('nuit_int', BEDROOM, BEDROOM_SECTIONS)).toContain(
      'Light comes only from fixtures visible in the image; do not add or move fixtures.',
    );
    expect(interiorPrompt('jour_int', BEDROOM, BEDROOM_SECTIONS)).not.toContain('fixtures visible');
  });

  it('the plan: its spec, without the bookkeeping fields; furniture only from the spec', () => {
    const p = planPrompt(PLAN, '');
    expect(p).toContain('"name":"Séjour"');
    expect(p).not.toContain('same_building');
    expect(p).toContain(
      'Do not add furniture, appliances, TVs or any element that is not in the spec.',
    );
  });

  it('labels and access points come from the analysis, never invented', () => {
    expect(explodedPrompt(VILLA_LABELS, '')).toContain(
      'short labels in French, spelled correctly: Toiture, Étage, Rez-de-chaussée, Dalle.',
    );
    expect(accessPrompt(VILLA_ACCESS, '')).toContain(
      'ENTRÉE PRINCIPALE (centre of the ground floor), GARAGE (left side)',
    );
    expect(boardPrompt(VILLA, '')).toContain('showing 2 levels and the roof type: flat roof');
  });

  it('a white model and a sketch have no colour; the watercolour keeps the materials’ colours', () => {
    expect(fixedPrompt('maquette_blanche', VILLA, '')).toContain(
      'NEGATIVE: no redesign, no added or removed windows, no colour, no textures',
    );
    expect(fixedPrompt('croquis', VILLA, '')).toContain('never by colour');
    expect(fixedPrompt('aquarelle', VILLA, '')).toContain('keep their colors and placement');
  });

  it('the user’s words on a fixed ambiance never lift a lock', () => {
    const p = fixedPrompt('isometrie', VILLA, 'Vue depuis le nord');
    expect(p).toContain(
      'User request: Vue depuis le nord. It never changes the geometry, the openings or the materials above.',
    );
    expect(p.indexOf('User request')).toBeLessThan(p.indexOf('NEGATIVE'));
  });
});

describe('Améliorer', () => {
  it('upgrades element by element, never what is « keep as is »', () => {
    expect(upgradesText(VILLA_ENHANCE)).toBe(
      'ground floor walls: lime-based render, fine grain with subtle trowel marks, matte; upper floor cladding: clear-oiled iroko slats with visible grain and tight even joints, in the original wood tone',
    );
  });

  it('keeps the light locked (with the image’s own look) unless a light improvement is ticked', () => {
    const locked = enhancePrompt({
      analysis: VILLA_ENHANCE,
      options: ['detail'],
      strength: 'subtle',
    });
    expect(locked).toContain('camera, lighting and all elements identical');
    expect(locked).toContain(
      "Keep the image's own light, weather and grading: Soft overcast daylight",
    );
    expect(locked).toMatch(/no change of lighting or weather\.$/);

    const lit = enhancePrompt({
      analysis: VILLA_ENHANCE,
      options: ['lighting'],
      strength: 'strong',
      darkRoom: true,
      instruction: 'plus lumineux',
    });
    expect(lit).toContain('camera and all elements identical');
    expect(lit).not.toContain("Keep the image's own light");
    expect(lit).not.toContain('no change of lighting or weather');
    expect(lit).toContain("In the user's words: plus lumineux.");
    expect(lit).toContain('Raise exposure by about +1 to +1.5 stops');
  });

  it('the render specs follow the type of image', () => {
    expect(enhancePrompt({ analysis: VILLA_ENHANCE, options: [], strength: 'subtle' })).toContain(
      'professional architectural photograph',
    );
    expect(
      enhancePrompt({
        analysis: { ...VILLA_ENHANCE, type: 'interior' },
        options: [],
        strength: 'subtle',
      }),
    ).toContain('professional interior photograph');
  });
});
