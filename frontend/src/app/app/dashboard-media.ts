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
 * One entry per ambiance, in the order the presets are offered, so the block
 * doubles as a tour of what the four presets actually do rather than four
 * pretty pictures in a row. Every file is real RenderBox output and already
 * ships in /public/galerie for the /exemple page — no second copy.
 *
 * The captions name the ambiance first and the subject second, because the
 * ambiance is the part the reader can act on: it is a preset they can pick.
 *
 * Sources are portrait and the frame is 16/9, so they are centre-cropped.
 * Each one below was chosen with that crop in mind — the subject sits in the
 * middle band of all four.
 *
 * To swap one: drop a JPG/WebP in `frontend/public/galerie/` and point `src`
 * at it. Only real RenderBox output belongs here — this block sits on the
 * page of someone paying for the product, and stock imagery would be
 * advertising renders it never made.
 */
export const SHOWCASE_SLIDES: readonly ShowcaseSlide[] = [
  {
    id: 'jour-ext',
    src: '/galerie/jour-ext-2.jpg',
    caption: {
      fr: 'Extérieur jour — villa en pierre',
      en: 'Exterior day — stone villa',
    },
  },
  {
    id: 'jour-int',
    src: '/galerie/jour-int-2.jpg',
    caption: {
      fr: 'Intérieur jour — chambre sur la mer',
      en: 'Interior day — bedroom facing the sea',
    },
  },
  {
    id: 'nuit-ext',
    src: '/galerie/nuit-ext-1.jpg',
    caption: {
      fr: 'Extérieur nuit — façade éclairée',
      en: 'Exterior night — lit facade',
    },
  },
  {
    id: 'nuit-int',
    src: '/galerie/nuit-int-3.jpg',
    caption: {
      fr: 'Intérieur nuit — séjour en travertin',
      en: 'Interior night — travertine living room',
    },
  },
];

export const SHOWCASE_INTERVAL_MS = 5000;
