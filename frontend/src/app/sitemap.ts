import type { MetadataRoute } from 'next';
import { ANNOUNCEMENTS } from '@/app/info/announcements';
import { canonicalUrl, INDEXED_PAGES, LAST_MODIFIED, localizedPath, SITE_URL } from '@/lib/seo';
import type { SeoPage } from '@/lib/seo';

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

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXED_PAGES.map((page) => ({
    url: canonicalUrl(page),
    lastModified: lastModified(page),
    changeFrequency: page === 'legal' ? ('yearly' as const) : ('weekly' as const),
    priority: page === 'home' ? 1 : page === 'legal' ? 0.3 : 0.7,
    alternates: {
      languages: {
        fr: `${SITE_URL}${localizedPath(page, 'fr')}`,
        en: `${SITE_URL}${localizedPath(page, 'en')}`,
        'x-default': canonicalUrl(page),
      },
    },
  }));
}
