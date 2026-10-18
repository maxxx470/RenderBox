import type { Metadata } from 'next';
import { getAuthCta } from '@/lib/server/auth-disabled';
import { requestLocale } from '@/lib/i18n/request-locale';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';
import { PRICING_TIERS } from '@/lib/pricing-tiers';
import { TIKTOK_ACCOUNT, YOUTUBE_CHANNEL } from '@/lib/community-links';
import { localizedPath, pageMetadata, SEO_COPY, SITE_NAME, SITE_URL } from '@/lib/seo';
import { LandingClient } from './LandingClient';

// Thin server wrapper so getAuthCta() (reads the AUTH_DISABLED env var) can
// run server-side and hand the result down as a prop — the landing page
// itself is a Client Component (interactive pricing checkout, auth-aware
// nav) and can't read server env vars directly.

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLocale();
  return pageMetadata('home', locale);
}

const TIER_NAME = {
  decouverte: 'landing.pricingTierDecouverteName',
  standard: 'landing.pricingTierStandardName',
  pro: 'landing.pricingTierProName',
} as const;

/**
 * What search engines and AI assistants read about RenderPro (2026-10-18):
 * the organisation, the site, the product with its three plans in FCFA, and
 * the landing's own FAQ — all from the same sources as the page itself.
 */
function structuredData(locale: Locale) {
  const t = dictionaries[locale];
  const { description } = SEO_COPY.home[locale];
  const faq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
    '@type': 'Question',
    name: t[`landing.faq${n}Q` as 'landing.faq1Q'],
    acceptedAnswer: { '@type': 'Answer', text: t[`landing.faq${n}A` as 'landing.faq1A'] },
  }));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/brand/mark-1024.png`,
        sameAs: [YOUTUBE_CHANNEL, TIKTOK_ACCOUNT],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: ['fr', 'en'],
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        url: `${SITE_URL}${localizedPath('home', locale)}`,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web',
        description,
        inLanguage: locale,
        publisher: { '@id': `${SITE_URL}/#organization` },
        offers: PRICING_TIERS.map((tier) => ({
          '@type': 'Offer',
          name: t[TIER_NAME[tier.id]],
          price: tier.priceXof,
          priceCurrency: 'XOF',
          description:
            locale === 'fr'
              ? `${tier.creditsPerMonth.toLocaleString('fr-FR')} crédits pour 30 jours`
              : `${tier.creditsPerMonth.toLocaleString('en-US')} credits for 30 days`,
        })),
      },
      { '@type': 'FAQPage', inLanguage: locale, mainEntity: faq },
    ],
  };
}

export default async function LandingPage() {
  const { locale } = await requestLocale();
  return (
    <>
      <script
        type="application/ld+json"
        // JSON, not code: `<` escaped so no text in it can close the tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData(locale)).replace(/</g, '\\u003c'),
        }}
      />
      <LandingClient ctaHref={getAuthCta()} />
    </>
  );
}
