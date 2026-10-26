// Search engines and AI assistants (2026-10-18, owner: « il faut qu'on
// travaille sur le SEO et le GEO »). One source for what the public pages
// tell them: the site's address, each page's title and description in both
// languages, and the metadata built from them.
//
// A page speaks the visitor's language on one URL (cookie, else country). A
// crawler would only ever see one language, so each language also has its own
// address, `?lang=fr` / `?lang=en` (the proxy turns it into the locale
// cookie): every page names both as alternates, plus the bare path as
// `x-default`.
//
// **A page is canonical to the address it was asked for** (2026-10-26, after
// Search Console reported « Page en double : Google n'a pas choisi la même URL
// canonique que l'utilisateur »). Until then every rendering named a
// `?lang=` address as its canonical, so the bare `/` — the address every link
// points at and the one a crawler fetches — told Google « the canonical is
// somewhere else ». Google kept `/` and recorded the disagreement, and the
// page stayed out of the index. Now `/` is canonical to itself and
// `/?lang=fr` to itself: three addresses, one hreflang group, no
// contradiction. The bare path is the group's `x-default`, and it alone is
// listed in the sitemap.
import type { Metadata } from 'next';
import type { Locale } from '@/lib/i18n/dictionaries';

export const SITE_URL = 'https://www.renderpro.app';
export const SITE_NAME = 'RenderPro';

/** The picture a shared link shows (WhatsApp, LinkedIn, X…): the brand on the
 *  charter's blue beside the owner's sketch-to-render showcase picture. A
 *  JPEG under 100 kB — WhatsApp drops previews much heavier than 300 kB. To
 *  change it, replace public/og/renderpro.jpg (1200 × 630). */
export const OG_IMAGE = {
  url: '/og/renderpro.jpg',
  width: 1200,
  height: 630,
  alt: 'RenderPro — rendus architecturaux photoréalistes par IA',
};

export type SeoPage = 'home' | 'info' | 'legal' | 'exemple' | 'connexion';

export const SEO_PATHS: Record<SeoPage, string> = {
  home: '/',
  info: '/info',
  legal: '/legal',
  exemple: '/exemple',
  connexion: '/connexion',
};

/** Pages a search engine should list (the sign-in page is not one). */
export const INDEXED_PAGES: readonly SeoPage[] = ['home', 'info', 'exemple', 'legal'];

export const SEO_COPY: Record<SeoPage, Record<Locale, { title: string; description: string }>> = {
  home: {
    fr: {
      title: 'RenderPro — Rendus architecturaux photoréalistes par IA',
      description:
        'Transformez vos plans, esquisses et captures 3D en rendus architecturaux photoréalistes en quelques minutes. Deux moteurs IA, retouches par commentaires, ajout d’éléments et amélioration d’images. Formules en FCFA.',
    },
    en: {
      title: 'RenderPro — Photorealistic AI architectural renders',
      description:
        'Turn plans, sketches and 3D screenshots into photorealistic architectural renders in minutes. Two AI engines, point-and-comment edits, adding elements and image enhancement.',
    },
  },
  info: {
    fr: {
      title: 'Nouveautés',
      description:
        'Ce qui a changé dans RenderPro, du plus récent au plus ancien, et ses fonctionnalités en vidéo : générer, commenter, ajouter, améliorer.',
    },
    en: {
      title: 'What’s new',
      description:
        'What changed in RenderPro, newest first, and its features on video: generating, commenting, adding, enhancing.',
    },
  },
  legal: {
    fr: {
      title: 'Mentions légales et confidentialité',
      description:
        'Mentions légales, conditions d’utilisation et politique de confidentialité de RenderPro.',
    },
    en: {
      title: 'Legal notice and privacy',
      description: 'RenderPro’s legal notice, terms of use and privacy policy.',
    },
  },
  exemple: {
    fr: {
      title: 'Exemples de rendus',
      description:
        'Des rendus RenderPro sur plusieurs projets : plans 3D aménagés, axonométries éclatées, planches d’analyse, maquettes, esquisses, du croquis au rendu, de jour comme de nuit.',
    },
    en: {
      title: 'Render examples',
      description:
        'RenderPro renders across several projects: furnished 3D plans, exploded axonometrics, concept boards, models, sketches, from sketch to render, by day and by night.',
    },
  },
  connexion: {
    fr: {
      title: 'Connexion',
      description: 'Connectez-vous à RenderPro ou créez votre compte.',
    },
    en: {
      title: 'Sign in',
      description: 'Sign in to RenderPro or create your account.',
    },
  },
};

/** The address of a page in one language. */
export function localizedPath(page: SeoPage, locale: Locale): string {
  return `${SEO_PATHS[page]}?lang=${locale}`;
}

/** The bare address of a page, the group's `x-default` — absolute, because a
 *  relative `/` resolves against metadataBase to an origin with no trailing
 *  slash, which is not the address anyone links to. */
export function canonicalUrl(page: SeoPage): string {
  return page === 'home' ? `${SITE_URL}/` : `${SITE_URL}${SEO_PATHS[page]}`;
}

/** When each page's content last really changed, by hand — the sitemap used
 *  to stamp every page with the build's own date, which says « everything
 *  changed » at every deploy and is worth nothing to a crawler. Update the
 *  date of a page when you change what it says; `info` carries no date here,
 *  its newest announcement being the real one (see sitemap.ts). */
export const LAST_MODIFIED: Record<Exclude<SeoPage, 'info' | 'connexion'>, string> = {
  home: '2026-10-25',
  exemple: '2026-10-19',
  legal: '2026-10-13',
};

/**
 * What a public page tells search engines, in the language it shows.
 *
 * `explicitLang` is the `?lang=` the visitor actually asked for, or null when
 * the bare address was fetched (the proxy reports it — see request-locale.ts).
 * The canonical follows it, so no address ever points its canonical at
 * another one.
 */
export function pageMetadata(
  page: SeoPage,
  locale: Locale,
  explicitLang: Locale | null = null,
): Metadata {
  const { title, description } = SEO_COPY[page][locale];
  const url = explicitLang ? localizedPath(page, explicitLang) : canonicalUrl(page);
  return {
    // The home title already carries the name; the others get « · RenderPro ».
    title: page === 'home' ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
      languages: {
        fr: localizedPath(page, 'fr'),
        en: localizedPath(page, 'en'),
        'x-default': canonicalUrl(page),
      },
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url,
      title: page === 'home' ? title : `${title} · ${SITE_NAME}`,
      description,
      locale: locale === 'fr' ? 'fr_FR' : 'en_US',
      alternateLocale: locale === 'fr' ? 'en_US' : 'fr_FR',
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(INDEXED_PAGES.includes(page) ? {} : { robots: { index: false, follow: true } }),
  };
}
