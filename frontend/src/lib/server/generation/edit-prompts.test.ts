// The prompts of Ajouter, the zone retouch and Commenter (2026-10-19).
import { describe, it, expect } from 'vitest';
import { buildAddElementPrompt, buildAnnotationPrompt, buildZonePrompt } from './edit-prompts';
import { GEOMETRY_LOCK, PROJECT_MATERIALS_HEADER } from './render-profiles';
import { ENGINE_NAMES } from './engines/types';
import { ANNOTATE_ENGINE } from './annotations';

const MATERIALS = [{ face: 'toiture', valeur: 'Tuile' }];

describe('Ajouter', () => {
  it.each(ENGINE_NAMES)('one path: lock first, only the element, the light kept (%s)', (engine) => {
    const p = buildAddElementPrompt({ engine, instruction: 'un olivier', materials: MATERIALS });
    expect(p.split('\n').slice(0, 3)).toContain(GEOMETRY_LOCK);
    expect(p.indexOf(GEOMETRY_LOCK)).toBeLessThan(p.indexOf('Only add: un olivier.'));
    expect(p).toContain("reference for that element's appearance only");
    expect(p).toContain('existing light, time of day and color balance unchanged');
    expect(p).toContain(`${PROJECT_MATERIALS_HEADER}\n- toiture: Tuile`);
    // No light profile is re-sent on an edit (audit R6, R7).
    expect(p).not.toMatch(/\d{4} K|EV\b|blue hour|hazy/);
  });

  it('Pixel IA ends with its final check', () => {
    const p = buildAddElementPrompt({ engine: 'gpt_image', instruction: 'x', materials: [] });
    expect(p.endsWith('nothing new except the requested element.')).toBe(true);
    expect(p).not.toContain(PROJECT_MATERIALS_HEADER);
  });

  it('the element is one line', () => {
    const p = buildAddElementPrompt({ engine: 'nanobanana', instruction: 'a\nb', materials: [] });
    expect(p).toContain('Only add: a b.');
  });

  it.each(ENGINE_NAMES)('frozen (%s)', async (engine) => {
    await expect(
      buildAddElementPrompt({ engine, instruction: 'un olivier en pot', materials: MATERIALS }),
    ).toMatchFileSnapshot(
      `./__prompts__/ajouter-${engine === 'nanobanana' ? 'visio' : 'pixel'}.txt`,
    );
  });
});

describe('Zone retouch', () => {
  it('names the region, keeps the rest, never promises pixel-identical', () => {
    const p = buildZonePrompt({
      engine: 'gpt_image',
      zone: { x: 0, y: 30, width: 20, height: 40 },
      instruction: 'moderniser',
      materials: [],
    });
    expect(p).toContain('Modify ONLY the middle-left of the image');
    expect(p).toContain('"moderniser"');
    expect(p).toContain('not permission to change the design');
    expect(p).not.toContain('pixel-identical');
    expect(p.indexOf(GEOMETRY_LOCK)).toBeLessThan(p.indexOf('Modify ONLY'));
  });
});

describe('Commenter', () => {
  const annotations = [
    { x: 20, y: 40, comment: 'enduit gris' },
    { x: 70, y: 85, comment: 'retirer\nla voiture' },
  ];

  it('runs on Pixel IA: sections, lock first, final check', () => {
    const p = buildAnnotationPrompt({
      engine: ANNOTATE_ENGINE,
      annotations,
      withMarkedImage: true,
    });
    const lines = p.split('\n');
    expect(lines[0]).toBe('1. LOCK');
    expect(lines[2]).toBe(GEOMETRY_LOCK);
    expect(lines).toContain(
      '- Marker 1, at 20% from the left, 40% from the top (the middle-left): enduit gris',
    );
    expect(lines).toContain(
      '- Marker 2, at 70% from the left, 85% from the top (the bottom-right): retirer la voiture',
    );
    expect(p).toContain('Do not reproduce the markers in the result.');
    expect(p.endsWith('no marker drawn in the result.')).toBe(true);
  });

  it('without the marked copy, places each change by its coordinates', () => {
    const p = buildAnnotationPrompt({ engine: 'gpt_image', annotations, withMarkedImage: false });
    expect(p).toContain('anchored to a point given in percent');
    expect(p).not.toContain('second attached image');
  });

  it('adds the overall note last among the changes, and skips a blank one', () => {
    const p = buildAnnotationPrompt({
      engine: 'gpt_image',
      annotations,
      instruction: ' plus chaud ',
      withMarkedImage: false,
    });
    expect(p).toContain('- Overall note: plus chaud\n3. KEEP');
    expect(
      buildAnnotationPrompt({
        engine: 'gpt_image',
        annotations,
        instruction: '  ',
        withMarkedImage: false,
      }),
    ).not.toContain('Overall note');
  });

  it('frozen', async () => {
    await expect(
      buildAnnotationPrompt({
        engine: ANNOTATE_ENGINE,
        annotations,
        instruction: 'plus chaud',
        withMarkedImage: true,
      }),
    ).toMatchFileSnapshot('./__prompts__/commenter-pixel.txt');
  });
});
