// Content of the two banners at the top of the dashboard.
//
// Both are configuration, not data: they are the same for every user, and
// they are filled by hand.

// ---------------------------------------------------------------------------
// Left banner — presentation / tutorial video
// ---------------------------------------------------------------------------

export interface DashboardVideo {
  /**
   * YouTube or Vimeo watch/share URL, or a direct file URL. Null until one is
   * supplied: the card then shows its "coming soon" state with the play
   * button disabled. Set this and the whole block goes live — nothing else to
   * change.
   */
  url: string | null;
  /** Still frame under /public, shown before playback. Null falls back to the brand gradient. */
  poster: string | null;
}

export const DASHBOARD_VIDEO: DashboardVideo = {
  url: null,
  poster: null,
};

/**
 * Builds the privacy-friendly embed URL for a YouTube/Vimeo link, or returns
 * null for anything else (treated as a direct video file).
 *
 * The player is only ever injected after a click — see DashboardVideoCard.
 * Embedding the iframe on load would pull YouTube's scripts and cookies into
 * every single dashboard visit for a video most users never start.
 */
export function toEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const id = parsed.searchParams.get('v') ?? parsed.pathname.replace(/^\/embed\//, '');
    return id && !id.startsWith('/')
      ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
      : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parsed.pathname.split('/').filter(Boolean).pop();
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Right banner — showcase carousel
// ---------------------------------------------------------------------------

export interface ShowcaseSlide {
  id: string;
  /** Path under /public, e.g. "/showcase/villa-jour.jpg". */
  src: string;
  /** Short caption drawn over the image, in both languages. */
  caption: { fr: string; en: string };
}

/**
 * Showcase renders, identical for every user.
 *
 * Six pictures, six things the product does (owner, 2026-10-17: the four
 * /galerie renders before): the sketch turned into a render, a day exterior,
 * a day interior, a night exterior, a furnished 3D plan (an ambiance of the
 * command bar) and Améliorer's before / after. The owner generated each one
 * from the prompts proposed with the dashboard layouts; they are 1200px WebP
 * in `frontend/public/vitrine/`, 4:3, the subject in the middle, no text in
 * the picture — the caption below is drawn over it by the site.
 *
 * The frame is wider or narrower than 4:3 depending on the screen, so the
 * pictures are centre-cropped; the two split pictures keep their seam in the
 * middle.
 *
 * To swap one: replace its file under the same name, or add a WebP in
 * `public/vitrine/` and point `src` at it.
 */
export const SHOWCASE_SLIDES: readonly ShowcaseSlide[] = [
  {
    id: 'esquisse-rendu',
    src: '/vitrine/esquisse-rendu.webp',
    caption: {
      fr: 'De l’esquisse au rendu — villa à Dakar',
      en: 'From sketch to render — villa in Dakar',
    },
  },
  {
    id: 'residence-abidjan',
    src: '/vitrine/residence-abidjan.webp',
    caption: {
      fr: 'Extérieur jour — résidence à Abidjan',
      en: 'Exterior day — residence in Abidjan',
    },
  },
  {
    id: 'sejour-lin',
    src: '/vitrine/sejour-lin.webp',
    caption: {
      fr: 'Intérieur jour — séjour bois et lin',
      en: 'Interior day — wood and linen living room',
    },
  },
  {
    id: 'immeuble-nuit',
    src: '/vitrine/immeuble-nuit.webp',
    caption: {
      fr: 'Extérieur nuit — immeuble à l’heure bleue',
      en: 'Exterior night — building at blue hour',
    },
  },
  {
    id: 'plan-3d',
    src: '/vitrine/plan-3d.webp',
    caption: {
      fr: 'Plan 3D aménagé — appartement',
      en: 'Furnished 3D plan — apartment',
    },
  },
  {
    id: 'ameliorer',
    src: '/vitrine/ameliorer.webp',
    caption: {
      fr: 'Améliorer — avant / après',
      en: 'Enhance — before / after',
    },
  },
];

export const SHOWCASE_INTERVAL_MS = 5000;
