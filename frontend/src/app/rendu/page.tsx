import type { Metadata } from 'next';
import { getAuthCta } from '@/lib/server/auth-disabled';
import { requestLocale } from '@/lib/i18n/request-locale';
import { canonicalFor, documentMetadata, SITE_URL } from '@/lib/seo';
import { HUB, UC } from './copy';
import { USE_CASES, useCasePath } from './use-cases';
import { HubClient } from './HubClient';

// /rendu (2026-10-28) — the hub of the use-case pages. Server wrapper for the
// metadata and the structured data; the page is the Client Component beside.

export async function generateMetadata(): Promise<Metadata> {
  const { locale, explicitLang } = await requestLocale();
  return documentMetadata(
    { path: '/rendu', ...HUB.seo[locale], index: true },
    locale,
    explicitLang,
  );
}

export default async function RenduHubPage() {
  const { locale } = await requestLocale();

  // An ItemList tells a crawler these eleven addresses are one set, which is
  // what the page is: a hub, not a pile of links.
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: UC.home[locale], item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: HUB.h1[locale] },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': canonicalFor('/rendu'),
        url: canonicalFor('/rendu'),
        name: HUB.seo[locale].title,
        description: HUB.seo[locale].description,
        inLanguage: locale,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: USE_CASES.length,
          itemListElement: USE_CASES.map((uc, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: uc.h1[locale],
            url: canonicalFor(useCasePath(uc.slug)),
          })),
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON, not code: `<` escaped so no text in it can close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }}
      />
      <HubClient ctaHref={getAuthCta()} />
    </>
  );
}
