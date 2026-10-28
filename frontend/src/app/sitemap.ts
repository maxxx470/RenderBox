import type { MetadataRoute } from 'next';
import { ANNOUNCEMENTS } from '@/app/info/announcements';
import {
  canonicalFor,
  canonicalUrl,
  INDEXED_PAGES,
  langPath,
  LAST_MODIFIED,
  SEO_PATHS,
  SITE_URL,
} from '@/lib/seo';
import type { SeoPage } from '@/lib/seo';
import { USE_CASES, useCasePath } from '@/app/rendu/use-cases';

// /sitemap.xml (2026-10-18): the public pages, one entry each.
//
// Each entry is the page's BARE address — the one it names as its own
// canonical — and names its two languages through hreflang, the bare address
// being the group's `x-default` (2026-10-26; until then the sitemap listed
// the two `?lang=` addresses and never the bare one, while the bare one was
// what every link and every crawler actually asked for).
//
// `lastmod` is a real date, by hand in lib/seo.ts, except for /info, whose
// newest announcement is its true date. It used to be the moment of the
// build, which told a crawler that every page changed at every deploy.
function lastModified(page: SeoPage): string {
  if (page === 'info') {
    const newest = ANNOUNCEMENTS.map((a) => a.date)
      .sort()
      .at(-1);
    return newest ?? '2026-10-18';
  }
  return LAST_MODIFIED[page as keyof typeof LAST_MODIFIED] ?? '2026-10-18';
}

/** The hreflang group of one bare path: its two languages, and itself as
 *  `x-default`. Same shape for every entry of the sitemap. */
function languages(path: string) {
  return {
    languages: {
      fr: `${SITE_URL}${langPath(path, 'fr')}`,
      en: `${SITE_URL}${langPath(path, 'en')}`,
      'x-default': canonicalFor(path),
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const fixed = INDEXED_PAGES.map((page) => ({
    url: canonicalUrl(page),
    lastModified: lastModified(page),
    changeFrequency: page === 'legal' ? ('yearly' as const) : ('weekly' as const),
    priority: page === 'home' ? 1 : page === 'legal' ? 0.3 : 0.7,
    alternates: languages(SEO_PATHS[page]),
  }));

  // The use-case hub and its pages (2026-10-28). They carry the terms the
  // trade actually searches, so they sit just under the landing in priority —
  // above /info and /legal, which exist for readers rather than for search.
  const hub = {
    url: canonicalFor('/rendu'),
    lastModified:
      USE_CASES.map((u) => u.lastModified)
        .sort()
        .at(-1) ?? '2026-10-28',
    changeFrequency: 'weekly' as const,
    priority: 0.9,
    alternates: languages('/rendu'),
  };

  const cases = USE_CASES.map((uc) => ({
    url: canonicalFor(useCasePath(uc.slug)),
    lastModified: uc.lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
    alternates: languages(useCasePath(uc.slug)),
  }));

  return [...fixed, hub, ...cases];
}
