import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PRESETS } from '@/lib/server/generation/presets';
import { GALLERY, GALLERY_IMAGES, rowColumns } from './gallery';

const PUBLIC = path.resolve(__dirname, '../../../public');

describe('/exemple gallery', () => {
  it('every image exists, at the size the page lays it out with', async () => {
    for (const img of GALLERY.flatMap((b) => b.rows.flat())) {
      const file = path.join(PUBLIC, img.src);
      expect(fs.existsSync(file), img.src).toBe(true);
      const meta = await sharp(file).metadata();
      expect({ src: img.src, w: meta.width, h: meta.height }).toEqual({
        src: img.src,
        w: img.w,
        h: img.h,
      });
    }
  });

  it('shows every ambiance of the command bar, two images at least', () => {
    for (const key of ['plan_3d', 'eclate', 'analyse', 'isometrie', 'esquisse'] as const) {
      const batch = GALLERY.find((b) => b.key === key);
      expect(batch?.rows.flat().length ?? 0, key).toBeGreaterThanOrEqual(2);
      expect(PRESETS[key].label.fr).toBeTruthy();
    }
  });

  it('names every batch that is not a preset, in both languages', () => {
    for (const b of GALLERY.filter((x) => x.key === 'croquis')) {
      expect(b.label?.fr).toBeTruthy();
      expect(b.label?.en).toBeTruthy();
    }
  });

  it('gives a row of images one height: columns follow their ratios', () => {
    expect(
      rowColumns([
        { src: 'a', w: 1200, h: 670 },
        { src: 'b', w: 900, h: 1205 },
      ]),
    ).toBe('1.7910fr 0.7469fr');
  });

  it('shows no image twice', () => {
    expect(GALLERY_IMAGES.length).toBe(GALLERY.flatMap((b) => b.rows.flat()).length);
  });
});
