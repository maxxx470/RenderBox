// The announcement of the per-image materials (étapes 3C.4-R, 3C.5.5): not
// live until a deployment is confirmed, so it stays "planned" and never
// speaks as if it already were.
import { describe, it, expect } from 'vitest';
import { ANNOUNCEMENTS } from './announcements';

describe('the per-image materials announcement', () => {
  const entry = ANNOUNCEMENTS.find((a) => a.id === 'materials-per-image');

  it('is still planned', () => {
    expect(entry?.kind).toBe('planned');
  });

  it('speaks of what will come, not of what is live', () => {
    expect(entry?.body.fr).not.toMatch(/désormais|dès maintenant|est disponible/i);
    expect(entry?.body.en).not.toMatch(/\bnow\b|is available/i);
  });

  it('says a row of the old sheet will have to be attached explicitly', () => {
    expect(entry?.body.fr).toContain('vous la rattacherez explicitement à une image');
    expect(entry?.body.en).toContain('you will attach it explicitly to an image');
  });
});
