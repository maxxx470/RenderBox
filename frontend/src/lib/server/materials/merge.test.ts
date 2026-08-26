import { describe, it, expect } from 'vitest';
import { mergeMaterialDetection } from './merge';

describe('mergeMaterialDetection', () => {
  it('takes the detection when no existing row for this face', () => {
    const result = mergeMaterialDetection(null, {
      face: 'toiture',
      valeur: 'Tuile terre cuite',
      confidence: 89,
    });
    expect(result).toEqual({ valeur: 'Tuile terre cuite', source: 'auto', confidence: 89 });
  });

  it('never overwrites a manual correction, even with a much higher confidence', () => {
    const existing = { valeur: 'Bardage bois clair', source: 'manuel' as const, confidence: null };
    const result = mergeMaterialDetection(existing, {
      face: 'facade_arriere',
      valeur: 'Enduit gris',
      confidence: 99,
    });
    expect(result).toBe(existing);
  });

  it('overwrites an auto row when the new confidence is strictly higher', () => {
    const existing = { valeur: 'Enduit blanc', source: 'auto' as const, confidence: 71 };
    const result = mergeMaterialDetection(existing, {
      face: 'facade_principale',
      valeur: 'Enduit blanc taloché',
      confidence: 94,
    });
    expect(result).toEqual({ valeur: 'Enduit blanc taloché', source: 'auto', confidence: 94 });
  });

  it('keeps the existing auto row when the new confidence is lower', () => {
    const existing = { valeur: 'Aluminium noir mat', source: 'auto' as const, confidence: 98 };
    const result = mergeMaterialDetection(existing, {
      face: 'menuiseries',
      valeur: 'Aluminium gris',
      confidence: 60,
    });
    expect(result).toBe(existing);
  });

  it('keeps the existing auto row when the new confidence is exactly equal (strictly-higher rule)', () => {
    const existing = { valeur: 'Tuile terre cuite', source: 'auto' as const, confidence: 89 };
    const result = mergeMaterialDetection(existing, {
      face: 'toiture',
      valeur: 'Tuile terre cuite rouge',
      confidence: 89,
    });
    expect(result).toBe(existing);
  });

  it('treats a null existing confidence (auto, defensively) as lower than any positive detection', () => {
    const existing = { valeur: 'Inconnu', source: 'auto' as const, confidence: null };
    const result = mergeMaterialDetection(existing, {
      face: 'toiture',
      valeur: 'Tuile terre cuite',
      confidence: 0,
    });
    expect(result).toEqual({ valeur: 'Tuile terre cuite', source: 'auto', confidence: 0 });
  });
});
