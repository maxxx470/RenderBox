// The announcement of the per-image materials (étapes 3C.4-R, 3C.5.5). It
// stayed "planned" until the deployment was confirmed (2026-10-13); it is now
// shipped, and must still not promise the per-image detection, which is not
// switched on yet.
import { describe, it, expect } from 'vitest';
import { ANNOUNCEMENTS } from './announcements';

describe('the per-image materials announcement', () => {
  const entry = ANNOUNCEMENTS.find((a) => a.id === 'materials-per-image');

  it('is shipped, dated the day it went live', () => {
    expect(entry?.kind).toBe('shipped');
    expect(entry?.date).toBe('2026-10-13');
  });

  it('says a row of the old sheet must be attached explicitly', () => {
    expect(entry?.body.fr).toContain('rattachez-la explicitement à une image');
    expect(entry?.body.en).toContain('attach it explicitly to an image');
  });

  it('says the automatic detection per image is still to come', () => {
    expect(entry?.body.fr).toContain(
      'La détection automatique des matériaux de chaque image arrivera plus tard',
    );
    expect(entry?.body.en).toContain(
      'Automatic detection of each image’s materials will come later',
    );
  });
});
