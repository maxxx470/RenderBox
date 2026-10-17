import { describe, it, expect } from 'vitest';
import { INFO_FILMS, isNewInfoFilm, newInfoCount } from './info-films';

describe('Info page news — the « Info » badge', () => {
  it('counts a film published after the last visit, not one published before', () => {
    expect(isNewInfoFilm('2026-10-20', '2026-10-17T15:00:00.000Z')).toBe(true);
    expect(isNewInfoFilm('2026-10-13', '2026-10-17T15:00:00.000Z')).toBe(false);
  });

  it('takes the deploy hour of a film published the same day as a visit', () => {
    expect(isNewInfoFilm('2026-10-20T14:00:00Z', '2026-10-20T09:00:00.000Z')).toBe(true);
    expect(isNewInfoFilm('2026-10-20T14:00:00Z', '2026-10-20T16:00:00.000Z')).toBe(false);
  });

  it('counts nothing for an unknown account, nor the films published before the badge', () => {
    expect(newInfoCount(null)).toBe(0);
    // An account older than every film still starts at zero.
    expect(newInfoCount(new Date('2020-01-01T00:00:00Z'))).toBe(0);
    expect(isNewInfoFilm('2026-10-13', '2020-01-01T00:00:00Z')).toBe(false);
  });

  it('gives every film a unique id and a parseable date', () => {
    const ids = new Set(INFO_FILMS.map((f) => f.id));
    expect(ids.size).toBe(INFO_FILMS.length);
    for (const f of INFO_FILMS) expect(Number.isNaN(new Date(f.addedAt).getTime())).toBe(false);
  });
});
