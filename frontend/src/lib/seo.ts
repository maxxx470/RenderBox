// Search engines and AI assistants (2026-10-18, owner: « il faut qu'on
// travaille sur le SEO et le GEO »). One source for what the public pages
// tell them: the site's address, each page's title and description in both
// languages, and the metadata built from them.
//
// A page speaks the visitor's language on one URL (cookie, else country). A
// crawler would only ever see one language, so each language also has its own
// address, `?lang=fr` / `?lang=en` (the proxy turns it into the locale
// cookie): every page names both as alternates and the one it shows as
// canonical, and the sitemap lists both.
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

/** What a public page tells search engines, in the language it shows. */
export function pageMetadata(page: SeoPage, locale: Locale): Metadata {
  const { title, description } = SEO_COPY[page][locale];
  const url = localizedPath(page, locale);
  return {
    // The home title already carries the name; the others get « · RenderPro ».
    title: page === 'home' ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
      languages: {
        fr: localizedPath(page, 'fr'),
        en: localizedPath(page, 'en'),
        'x-default': SEO_PATHS[page],
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
