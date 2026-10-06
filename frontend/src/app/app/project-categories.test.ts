import { describe, it, expect } from 'vitest';
import { categoriesOf } from './project-categories';

describe('categoriesOf', () => {
  it('puts a project with no render under "Sans rendu"', () => {
    expect(categoriesOf([])).toEqual(['empty']);
  });

  it('reads place and light from the ambiance', () => {
    expect(categoriesOf([{ preset: 'nuit_ext', editType: null }])).toEqual(['exterior', 'night']);
  });

  it('collects every category the renders cover, in a fixed order', () => {
    expect(
      categoriesOf([
        { preset: 'jour_int', editType: null },
        { preset: null, editType: 'annotate' },
        { preset: 'jour_ext', editType: null },
        { preset: null, editType: 'enhance' },
      ]),
    ).toEqual(['exterior', 'interior', 'day', 'enhance', 'edited']);
  });

  it('ignores values it does not know', () => {
    expect(categoriesOf([{ preset: 'mystery', editType: 'other' }])).toEqual([]);
  });
});
