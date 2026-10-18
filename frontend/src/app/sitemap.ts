import type { MetadataRoute } from 'next';
import { INDEXED_PAGES, localizedPath, SITE_URL } from '@/lib/seo';

// /sitemap.xml (2026-10-18): each public page in both languages, each entry
// naming its other language (lib/seo.ts explains the `?lang=` addresses).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return INDEXED_PAGES.flatMap((page) =>
    (['fr', 'en'] as const).map((locale) => ({
      url: `${SITE_URL}${localizedPath(page, locale)}`,
      lastModified,
      changeFrequency: page === 'legal' ? ('yearly' as const) : ('weekly' as const),
      priority: page === 'home' ? 1 : page === 'legal' ? 0.3 : 0.7,
      alternates: {
        languages: {
          fr: `${SITE_URL}${localizedPath(page, 'fr')}`,
          en: `${SITE_URL}${localizedPath(page, 'en')}`,
        },
      },
    })),
  );
}
