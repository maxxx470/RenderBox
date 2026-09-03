// Content of the two banners at the top of the dashboard.
//
// Both are configuration, not data: they are the same for every user, and
// they are filled by hand. Everything below is deliberately empty until real
// files exist — the blocks render an explicit waiting state rather than
// stock imagery or a play button that opens nothing.

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
 * Empty on purpose. The carousel shows a single waiting panel while this is
 * empty, and starts rotating as soon as there are at least two entries.
 *
 * To fill it: drop the images in `frontend/public/showcase/` (landscape,
 * ~1200x700, JPG or WebP) and add one entry each. Only real RenderBox output
 * belongs here — this block sits on the page of someone who is paying for the
 * product, and stock imagery would be advertising renders it never made.
 */
export const SHOWCASE_SLIDES: readonly ShowcaseSlide[] = [];

/** How long each slide holds before the next one fades in. */
export const SHOWCASE_INTERVAL_MS = 5000;
