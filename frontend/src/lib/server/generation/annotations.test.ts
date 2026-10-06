import { describe, it, expect } from 'vitest';
import { AnnotationsSchema, buildAnnotationPrompt, MAX_ANNOTATIONS, regionOf } from './annotations';

describe('AnnotationsSchema', () => {
  it('accepts points inside the frame with a comment', () => {
    expect(AnnotationsSchema.safeParse([{ x: 10, y: 90, comment: 'bois' }]).success).toBe(true);
  });

  it('rejects an empty list, a blank comment, an out-of-frame point and too many points', () => {
    expect(AnnotationsSchema.safeParse([]).success).toBe(false);
    expect(AnnotationsSchema.safeParse([{ x: 10, y: 10, comment: '   ' }]).success).toBe(false);
    expect(AnnotationsSchema.safeParse([{ x: 101, y: 10, comment: 'a' }]).success).toBe(false);
    const many = Array.from({ length: MAX_ANNOTATIONS + 1 }, () => ({ x: 1, y: 1, comment: 'a' }));
    expect(AnnotationsSchema.safeParse(many).success).toBe(false);
  });
});

describe('regionOf', () => {
  it('names the thirds of the frame', () => {
    expect(regionOf(50, 50)).toBe('the center');
    expect(regionOf(10, 10)).toBe('the top-left');
    expect(regionOf(90, 50)).toBe('the middle-right');
    expect(regionOf(50, 90)).toBe('the bottom-center');
  });
});

describe('buildAnnotationPrompt', () => {
  const annotations = [
    { x: 20, y: 40, comment: 'Façade en bardage bois' },
    { x: 75.4, y: 80, comment: '  Sol en pierre claire ' },
  ];

  it('numbers each comment with its point and region, in order', () => {
    const prompt = buildAnnotationPrompt({ annotations, withMarkedImage: true });
    expect(prompt).toContain(
      '1. At 20% from the left, 40% from the top (the middle-left): Façade en bardage bois',
    );
    expect(prompt).toContain(
      '2. At 75% from the left, 80% from the top (the bottom-right): Sol en pierre claire',
    );
    expect(prompt.indexOf('1. At')).toBeLessThan(prompt.indexOf('2. At'));
  });

  it('mentions the marked copy only when it is attached', () => {
    expect(buildAnnotationPrompt({ annotations, withMarkedImage: true })).toContain(
      'numbered markers',
    );
    expect(buildAnnotationPrompt({ annotations, withMarkedImage: false })).not.toContain(
      'numbered markers',
    );
  });

  it('always asks to keep everything else unchanged', () => {
    expect(buildAnnotationPrompt({ annotations, withMarkedImage: false })).toContain(
      'Keep everything else identical',
    );
  });

  it('appends the overall note last, and skips a blank one', () => {
    expect(
      buildAnnotationPrompt({ annotations, withMarkedImage: true, instruction: ' plus chaud ' }),
    ).toMatch(/\nOverall note: plus chaud$/);
    expect(
      buildAnnotationPrompt({ annotations, withMarkedImage: true, instruction: '  ' }),
    ).not.toContain('Overall note');
  });
});
