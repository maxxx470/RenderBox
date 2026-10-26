import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// /robots.txt (2026-10-18): the public pages are open to every crawler,
// search engines and AI assistants alike; the signed-in space, the
// back-office and the API are not.
//
// Blocking a path here only stops the crawl, never the indexing: Google may
// still list an address it was never allowed to read, and it can never see
// the « noindex » on it. So a page that must stay out of the index but has
// nothing to hide is NOT blocked here — it carries `noindex` instead and is
// left readable (2026-10-26: /auth/error and the old /settings were blocked
// AND unmarked, the one combination that cannot work). What stays blocked is
// what no crawler has any business fetching: the signed-in app, the
// back-office, the onboarding and the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app', '/admin', '/parametres', '/bienvenue', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
