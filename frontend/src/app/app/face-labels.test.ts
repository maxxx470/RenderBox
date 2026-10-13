import { describe, it, expect } from 'vitest';
import { faceDisplayLabel, humanizeFaceKey } from './face-labels';

describe('faceDisplayLabel', () => {
  it.each([
    ['facade_principale', 'Façade principale', 'Main facade'],
    ['facade_arriere', 'Façade arrière', 'Rear facade'],
    ['toiture', 'Toiture', 'Roof'],
    ['menuiseries', 'Menuiseries', 'Joinery'],
    ['sol', 'Sol', 'Floor'],
  ])('names the known key %s in French and English', (key, fr, en) => {
    expect(faceDisplayLabel(key, null, 'fr')).toBe(fr);
    expect(faceDisplayLabel(key, null, 'en')).toBe(en);
  });

  it('makes an unknown key readable, whatever the detector named it', () => {
    expect(faceDisplayLabel('garde_corps', null, 'fr')).toBe('Garde corps');
    expect(faceDisplayLabel('pignon_ouest', undefined, 'en')).toBe('Pignon ouest');
    expect(faceDisplayLabel('x', null, 'fr')).toBe('X');
  });

  it('the label the user typed wins over the table and the key', () => {
    expect(faceDisplayLabel('facade_principale', 'Façade sur rue', 'en')).toBe('Façade sur rue');
    expect(faceDisplayLabel('mur_20a', 'Mur%20A', 'fr')).toBe('Mur%20A');
    expect(faceDisplayLabel('toiture', '  Toit  ', 'fr')).toBe('Toit');
  });

  it('an empty or blank label falls back to the key', () => {
    expect(faceDisplayLabel('toiture', '', 'fr')).toBe('Toiture');
    expect(faceDisplayLabel('garde_corps', '   ', 'fr')).toBe('Garde corps');
  });

  it('nothing to say: an empty name, never "undefined"', () => {
    expect(faceDisplayLabel('', null, 'fr')).toBe('');
    expect(faceDisplayLabel('___', '', 'en')).toBe('');
  });
});

describe('humanizeFaceKey', () => {
  it('turns runs of separators into one space and capitalises the first letter only', () => {
    expect(humanizeFaceKey('facade__laterale-est')).toBe('Facade laterale est');
    expect(humanizeFaceKey('sol')).toBe('Sol');
  });
});
