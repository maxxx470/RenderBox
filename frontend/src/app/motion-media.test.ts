import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FILMS_EDITION, MEDIA_ORIGIN, motionFilm, presentationFilm } from './motion-media';

describe('motion films — served from Cloudflare R2, not from Vercel', () => {
  it('builds the video and poster URLs on the media origin', () => {
    const edition = FILMS_EDITION ? `-${FILMS_EDITION}` : '';
    expect(motionFilm('ajouter', 'fr')).toEqual({
      src: `${MEDIA_ORIGIN}/motion/ajouter${edition}-fr.mp4`,
      poster: `${MEDIA_ORIGIN}/motion/ajouter${edition}-fr.jpg`,
    });
    expect(presentationFilm('en')).toEqual({
      src: `${MEDIA_ORIGIN}/motion/presentation-en.mp4`,
      poster: `${MEDIA_ORIGIN}/motion/presentation-en.jpg`,
    });
  });

  it('no page loads a film from public/motion/ any more', () => {
    const src = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          if (/["'`]\/motion\//.test(fs.readFileSync(p, 'utf8')))
            offenders.push(path.relative(src, p));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
