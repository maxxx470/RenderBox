import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FILMS_EDITION,
  LANDING_VIDEO_EDITION,
  landingVideo,
  MEDIA_ORIGIN,
  motionFilm,
  PRESENTATION_EDITION,
  presentationFilm,
} from './motion-media';

describe('motion films — served from Cloudflare R2, not from Vercel', () => {
  it('builds the video and poster URLs on the media origin', () => {
    const edition = FILMS_EDITION ? `-${FILMS_EDITION}` : '';
    expect(motionFilm('ajouter', 'fr')).toEqual({
      src: `${MEDIA_ORIGIN}/motion/ajouter${edition}-fr.mp4`,
      poster: `${MEDIA_ORIGIN}/motion/ajouter${edition}-fr.jpg`,
    });
    // A film with its own later edition takes that name instead.
    expect(motionFilm('tuto-generer', 'en').src).toBe(
      `${MEDIA_ORIGIN}/motion/tuto-generer-20261017b-en.mp4`,
    );
    // Dated since 2026-11-08 (the « Animez. » beat): an undated name would
    // serve the old film for ever, the bucket caching as immutable.
    expect(presentationFilm('en')).toEqual({
      src: `${MEDIA_ORIGIN}/motion/presentation-${PRESENTATION_EDITION}-en.mp4`,
      poster: `${MEDIA_ORIGIN}/motion/presentation-${PRESENTATION_EDITION}-en.jpg`,
    });
  });

  // 2026-11-08: the landing's three « Animation vidéo » clips go the same
  // way, and for the same reason — three autoplaying clips add ~7 MB to a
  // visit that already pulls ~55 MB of film, so Vercel would serve them to
  // every visitor who scrolls that far.
  it('the landing animation clips are on the media origin too', () => {
    const e = LANDING_VIDEO_EDITION;
    expect(landingVideo('visite')).toEqual({
      webm: `${MEDIA_ORIGIN}/landing/visite-${e}.webm`,
      mp4: `${MEDIA_ORIGIN}/landing/visite-${e}.mp4`,
      poster: `${MEDIA_ORIGIN}/landing/visite-${e}.webp`,
    });
  });

  it('no page loads a film or a clip from public/ any more', () => {
    const src = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          if (/["'`]\/(motion|videos)\//.test(fs.readFileSync(p, 'utf8')))
            offenders.push(path.relative(src, p));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
