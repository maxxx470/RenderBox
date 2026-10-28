import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuthCta } from '@/lib/server/auth-disabled';
import { requestLocale } from '@/lib/i18n/request-locale';
import { canonicalFor, documentMetadata, SITE_URL } from '@/lib/seo';
import { getUseCase, USE_CASES, useCasePath } from '../use-cases';
import { UseCaseClient } from '../UseCaseClient';
import { UC } from '../copy';

// A use-case page, /rendu/<slug> (2026-10-28). Server wrapper: the metadata
// and the structured data are built here, where the request's language and
// its `?lang=` are known; the page itself is the Client Component beside it,
// so switching language needs no reload.

/** Every slug is known at build time — these pages are static. */
export function generateStaticParams(): { slug: string }[] {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) return {};
  const { locale, explicitLang } = await requestLocale();
  return documentMetadata(
    { path: useCasePath(slug), ...uc.seo[locale], index: true },
    locale,
    explicitLang,
  );
}

export default async function UseCasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) notFound();
  const { locale } = await requestLocale();

  // The trail back to the hub, and the page's own questions — the same ones
  // the page shows, so the answers published here stay true by construction.
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: UC.home[locale], item: `${SITE_URL}/` },
          {
            '@type': 'ListItem',
            position: 2,
            name: UC.backToHub[locale],
            item: canonicalFor('/rendu'),
          },
          { '@type': 'ListItem', position: 3, name: uc.h1[locale] },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': canonicalFor(useCasePath(slug)),
        url: canonicalFor(useCasePath(slug)),
        name: uc.seo[locale].title,
        description: uc.seo[locale].description,
        inLanguage: locale,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: `${SITE_URL}${uc.hero.after.src}`,
          width: uc.hero.after.w,
          height: uc.hero.after.h,
        },
      },
      {
        '@type': 'FAQPage',
        inLanguage: locale,
        mainEntity: uc.faq.map((item) => ({
          '@type': 'Question',
          name: item.q[locale],
          acceptedAnswer: { '@type': 'Answer', text: item.a[locale] },
        })),
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
      <UseCaseClient slug={slug} ctaHref={getAuthCta()} />
    </>
  );
}
