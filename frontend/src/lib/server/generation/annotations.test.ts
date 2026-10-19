import { describe, it, expect } from 'vitest';
import { AnnotationsSchema, MAX_ANNOTATIONS, regionOf } from './annotations';

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
