import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// /robots.txt (2026-10-18): the public pages are open to every crawler,
// search engines and AI assistants alike; the signed-in space, the
// back-office and the API are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app', '/admin', '/parametres', '/bienvenue', '/settings', '/api/', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
