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

/** The presentation film (with sound) and its poster for this language. */
export function presentationFilm(locale: string): { src: string; poster: string } {
  const base = `${MEDIA_ORIGIN}/motion/presentation-${locale}`;
  return { src: `${base}.mp4`, poster: `${base}.jpg` };
}

// The bucket's files are cached as immutable, so a remade film goes up under a
// new name: <film>-<FILMS_EDITION>-<lang>.mp4. Null = the first edition,
// <film>-<lang>.mp4. The six feature films are being remade on the current
// interface (2026-10-17, owner: « corrige le logo et juste l'interface du
// site »); once uploaded, FILMS_EDITION becomes '20261017'.
export const FILMS_EDITION: string | null = null;

/** The film's video and poster URLs for this language. */
export function motionFilm(film: string, locale: string): { src: string; poster: string } {
  const edition = FILMS_EDITION ? `-${FILMS_EDITION}` : '';
  const base = `${MEDIA_ORIGIN}/motion/${film}${edition}-${locale}`;
  return { src: `${base}.mp4`, poster: `${base}.jpg` };
}
