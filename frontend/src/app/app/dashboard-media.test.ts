import { describe, it, expect } from 'vitest';
import { toEmbedUrl, DASHBOARD_VIDEO, SHOWCASE_SLIDES } from './dashboard-media';

describe('toEmbedUrl', () => {
  it('converts every common YouTube link shape', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(toEmbedUrl(url)).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
      );
    }
  });

  it('always uses the no-cookie host', () => {
    // The point of the facade is that nothing from YouTube loads until a
    // click; sending the click to the tracking host would give that back.
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123')).toContain('youtube-nocookie.com');
  });

  it('converts a Vimeo link', () => {
    expect(toEmbedUrl('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789?autoplay=1',
    );
  });

  it('returns null for a direct file or an unknown host', () => {
    // Null is meaningful: the card falls back to a <video> element.
    expect(toEmbedUrl('https://cdn.example.com/promo.mp4')).toBeNull();
    expect(toEmbedUrl('https://vimeo.com/channels/staffpicks')).toBeNull();
  });

  it('returns null rather than throwing on a malformed URL', () => {
    expect(toEmbedUrl('not a url')).toBeNull();
    expect(toEmbedUrl('')).toBeNull();
  });
});

describe('dashboard media configuration', () => {
  // These pass while the config is empty AND once it is filled — they guard
  // the shape, not the emptiness, so adding the real video and images is
  // never blocked by a test.
  it('keeps any configured video URL parseable', () => {
    if (DASHBOARD_VIDEO.url === null) return;
    expect(DASHBOARD_VIDEO.url.trim()).not.toBe('');
    expect(() => new URL(DASHBOARD_VIDEO.url as string)).not.toThrow();
  });

  it('gives every showcase slide a unique id, a source and both captions', () => {
    const ids = new Set<string>();
    for (const slide of SHOWCASE_SLIDES) {
      expect(slide.src.trim()).not.toBe('');
      expect(slide.caption.fr.trim()).not.toBe('');
      // A missing EN caption would silently render an empty overlay rather
      // than falling back, since captions bypass the i18n dictionaries.
      expect(slide.caption.en.trim()).not.toBe('');
      expect(ids.has(slide.id)).toBe(false);
      ids.add(slide.id);
    }
  });
});
