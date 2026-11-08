// Where the motion films live (2026-10-12, owner: keep them off Vercel's
// bandwidth). They are served from the Cloudflare R2 bucket "renderbox-media"
// (Western Europe), whose egress is free: a visitor scrolling the landing pulls
// ~55 MB of film, which on Vercel's 100 GB/month would cap the site at about
// 1 800 full visits a month.
//
// Files: motion/<film>-<fr|en>.mp4 and .jpg (the poster) — the same names as
// the copies still in public/motion/, which are no longer requested. To add or
// replace a film, upload it to the bucket under that name (wrangler r2 object
// put renderbox-media/motion/<name> --remote, cache-control immutable: give a
// changed film a new name rather than overwriting it).
//
// The r2.dev address is Cloudflare's public development URL: rate-limited and
// not meant for heavy production traffic. Once the site has its own domain on
// Cloudflare, connect it to the bucket (e.g. media.<domain>) and change
// MEDIA_ORIGIN below; csp.ts reads it too.

export const MEDIA_ORIGIN = 'https://pub-fc6020f1c90e413d8b091df39371afc2.r2.dev';

/**
 * The presentation film (with sound) and its poster for this language.
 *
 * Dated since 2026-11-08, like the films below and for the same reason: the
 * bucket caches as immutable, so a changed film goes up under a NEW name or
 * nobody ever sees it. That edition added a fourth beat to the closing
 * sequence — « Esquissez. / Générez. / Présentez. » became « … / Animez. »,
 * with a clip of a render in movement (owner: add the video animation to the
 * presentation film without redoing it).
 *
 * How it was done, because it constrains the next edit: the body of the film
 * is untouched and the AUDIO STREAM IS COPIED BIT FOR BIT. The beat fits in
 * the time taken back from the logo card's silent hold, so the total duration
 * is unchanged to within one frame and the music bed never had to be rebuilt
 * — which mattered, since neither the edit project nor the music track used
 * is anywhere in this repo. Keep that property: re-cut the tail, not the
 * middle.
 */
export const PRESENTATION_EDITION = '20261108';

export function presentationFilm(locale: string): { src: string; poster: string } {
  const base = `${MEDIA_ORIGIN}/motion/presentation-${PRESENTATION_EDITION}-${locale}`;
  return { src: `${base}.mp4`, poster: `${base}.jpg` };
}

// The bucket's files are cached as immutable, so a remade film goes up under a
// new name: <film>-<FILMS_EDITION>-<lang>.mp4. Null = the first edition,
// <film>-<lang>.mp4. The six feature films (commenter, arbre, moteurs,
// ajouter, ameliorer, etapes) were remade on the current interface on
// 2026-10-17 (owner: « corrige le logo et juste l'interface du site »).
export const FILMS_EDITION: string | null = '20261017';

// A film remade on its own after its edition keeps a later name here. The two
// dashboard tutorials were re-rendered the same day without the engine
// version (« Pixel IA 2 » became « Pixel IA » when the version choice went).
export const FILM_EDITIONS: Readonly<Record<string, string>> = {
  'tuto-generer': '20261017b',
  'tuto-ameliorer': '20261017b',
};

/**
 * The landing's « Animation vidéo » clips (2026-11-08) — the three 16:9 loops
 * that show a render in movement. They are NOT motion-design films: they are
 * product output, rendered in Flow from the owner's own images, and they carry
 * no text of their own (the title is HTML over the card, so it translates).
 *
 * On R2 like everything heavy, and for the same reason: three autoplaying
 * clips add roughly 7 MB to a landing visit that already pulls ~55 MB of film.
 * Served from Vercel they would cut the site's monthly visit budget by about
 * an eighth, for one section.
 *
 * Two files per clip because the brief asks for both and the saving is real:
 * VP9 in WebM where the browser takes it, H.264 in MP4 for Safari. The poster
 * is a WebP of the clip's FIRST frame, so the card does not jump when the loop
 * starts.
 *
 * Upload (the names are dated, since the bucket caches as immutable — a
 * remade clip gets a new date here rather than overwriting):
 *   wrangler r2 object put renderbox-media/landing/<name> --remote \
 *     --file <file> --cache-control "public, max-age=31536000, immutable"
 */
export const LANDING_VIDEO_EDITION = '20261108';

export function landingVideo(name: string): { webm: string; mp4: string; poster: string } {
  const base = `${MEDIA_ORIGIN}/landing/${name}-${LANDING_VIDEO_EDITION}`;
  return { webm: `${base}.webm`, mp4: `${base}.mp4`, poster: `${base}.webp` };
}

/** The film's video and poster URLs for this language. */
export function motionFilm(film: string, locale: string): { src: string; poster: string } {
  const own = FILM_EDITIONS[film] ?? FILMS_EDITION;
  const edition = own ? `-${own}` : '';
  const base = `${MEDIA_ORIGIN}/motion/${film}${edition}-${locale}`;
  return { src: `${base}.mp4`, poster: `${base}.jpg` };
}
