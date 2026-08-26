import { describe, it, expect } from 'vitest';
import { describeZone, ZoneSchema } from './describe-zone';

describe('describeZone', () => {
  it('describes a top-left zone', () => {
    expect(describeZone({ x: 0, y: 0, width: 10, height: 10 })).toContain('top-left');
  });

  it('describes a top-right zone', () => {
    expect(describeZone({ x: 70, y: 0, width: 20, height: 10 })).toContain('top-right');
  });

  it('describes a bottom-left zone', () => {
    expect(describeZone({ x: 0, y: 80, width: 10, height: 10 })).toContain('bottom-left');
  });

  it('describes a bottom-right zone', () => {
    expect(describeZone({ x: 80, y: 80, width: 15, height: 15 })).toContain('bottom-right');
  });

  it('describes a dead-center zone as "the center"', () => {
    expect(describeZone({ x: 40, y: 40, width: 20, height: 20 })).toContain('the center');
  });

  it('describes a middle-left zone', () => {
    expect(describeZone({ x: 0, y: 40, width: 10, height: 20 })).toContain('middle-left');
  });

  it('describes a top-center zone', () => {
    expect(describeZone({ x: 35, y: 0, width: 30, height: 10 })).toContain('top-center');
  });

  it('always instructs to preserve the rest of the image', () => {
    expect(describeZone({ x: 0, y: 0, width: 10, height: 10 })).toContain('pixel-identical');
  });
});

describe('ZoneSchema', () => {
  it('accepts a valid in-bounds zone', () => {
    expect(ZoneSchema.safeParse({ x: 10, y: 10, width: 30, height: 30 }).success).toBe(true);
  });

  it('rejects a negative coordinate', () => {
    expect(ZoneSchema.safeParse({ x: -1, y: 10, width: 30, height: 30 }).success).toBe(false);
  });

  it('rejects a coordinate over 100', () => {
    expect(ZoneSchema.safeParse({ x: 10, y: 101, width: 30, height: 30 }).success).toBe(false);
  });

  it('rejects x + width exceeding 100', () => {
    expect(ZoneSchema.safeParse({ x: 90, y: 10, width: 20, height: 10 }).success).toBe(false);
  });

  it('rejects y + height exceeding 100', () => {
    expect(ZoneSchema.safeParse({ x: 10, y: 90, width: 10, height: 20 }).success).toBe(false);
  });

  it('accepts a zone touching the exact 100% boundary', () => {
    expect(ZoneSchema.safeParse({ x: 50, y: 50, width: 50, height: 50 }).success).toBe(true);
  });
});
