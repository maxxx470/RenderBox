// The /exemple galleries, one small batch per ambiance.
//
// Every image was classified by looking at it, not by the order it arrived in:
// what the light actually does (direct sun / overcast / warm artificial) and
// where the camera stands (outside / inside). The batch an image sits in is
// therefore a claim about the image, and it has to stay true if you swap one.
//
// Esquisse reuses the hero's axonometric rather than duplicating the file —
// it is the same drawing, and one copy is enough.
//
// TO ADD MORE: drop a landscape-ish JPG in `frontend/public/galerie/` and add
// its path to the right batch. Served from /public because the site CSP is
// `img-src 'self' data: blob:` — an external host is silently blocked.
import type { PresetKey } from '@/lib/server/generation/presets';

export interface GalleryBatch {
  preset: PresetKey;
  images: readonly string[];
}

export const GALLERY: readonly GalleryBatch[] = [
  {
    preset: 'jour_ext',
    images: [
      '/galerie/jour-ext-1.jpg',
      '/galerie/jour-ext-2.jpg',
      '/galerie/jour-ext-3.jpg',
      '/galerie/jour-ext-4.jpg',
    ],
  },
  {
    preset: 'jour_int',
    images: [
      '/galerie/jour-int-1.jpg',
      '/galerie/jour-int-2.jpg',
      '/galerie/jour-int-3.jpg',
      '/galerie/jour-int-4.jpg',
    ],
  },
  {
    preset: 'nuit_ext',
    images: [
      '/galerie/nuit-ext-1.jpg',
      '/galerie/nuit-ext-2.jpg',
      '/galerie/nuit-ext-3.jpg',
      '/galerie/nuit-ext-4.jpg',
    ],
  },
  {
    preset: 'nuit_int',
    images: [
      '/galerie/nuit-int-1.jpg',
      '/galerie/nuit-int-2.jpg',
      '/galerie/nuit-int-3.jpg',
      '/galerie/nuit-int-4.jpg',
    ],
  },
  {
    preset: 'esquisse',
    images: ['/hero/esquisse.jpg'],
  },
];

/**
 * Every gallery image, flat, in the order the batches declare them.
 *
 * The in-app gallery at /app/exemple shows this list: someone already inside
 * the product is browsing for what the thing can look like, not studying a
 * taxonomy, and five headings over four images each turned a wall of renders
 * into five short rows. The public /exemple page keeps the batches, because a
 * visitor there IS being taught the vocabulary.
 *
 * Duplicates are dropped: the sketch batch reuses the hero's axonometric, and
 * the same file twice in one grid reads as a rendering bug.
 */
export const GALLERY_IMAGES: readonly string[] = [...new Set(GALLERY.flatMap((b) => b.images))];
