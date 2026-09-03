'use client';

// Shared footer for the landing and every public page around it (/info,
// /legal, /exemple).
//
// It used to live inline in LandingClient, which meant the landing was the
// only page that had one: /info and /legal simply stopped, with no way back
// into the product and no legal links. Extracted rather than copied, so the
// two can never drift apart the way the two sidebars did.
//
// Every entry here is live. Four unclickable <span>s used to stand in for
// pages that do not exist ("Guide", "Blog", "Contact", "Aide"). The intent
// was honest — they did not pretend to be links — but on screen a grey label
// beside black ones reads as a dead link, not as a page to come. They come
// back the day the pages do.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { TikTokMark } from '@/app/HeroProof';
import { SOCIAL } from '@/app/social';

const GRADIENT = 'bg-[linear-gradient(135deg,#6E6BFF_0%,#8B5CF6_48%,#A855F7_100%)]';
const LINK = 'mb-2.5 block text-[13px] text-[#17161F] transition-colors hover:text-[#716FFF]';
const HEADING = 'mb-3.5 text-xs uppercase tracking-wide text-[#8A8896]';

export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer className="border-t border-[#ECECF2]">
      <div className="mx-auto max-w-[1180px] px-6 py-12">
        <div className="flex flex-wrap justify-between gap-10 pb-10">
          <div className="max-w-[280px]">
            <Link href="/" className="flex items-center gap-2 text-[17px] font-bold text-[#17161F]">
              <div className={`h-6.5 w-6.5 rounded-[7px] ${GRADIENT}`} />
              RenderBox
            </Link>
            <p className="mt-3 text-[13px] leading-[1.55] text-[#6B6880]">
              {t('landing.footerTagline')}
            </p>
            {/* Rendered only when the handle is set — see app/social.ts. The
                landing states the TikTok following in its proof strip, so this
                is what lets a visitor go and check the figure themselves. */}
            {SOCIAL.tiktok && (
              <a
                href={SOCIAL.tiktok}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#ECECF2] px-3 py-1.5 text-[12.5px] font-medium text-[#17161F] transition-colors hover:border-[#DEDEE8]"
              >
                <TikTokMark />
                TikTok
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-15">
            <div>
              <h5 className={HEADING}>{t('landing.footerProductHeading')}</h5>
              <Link href="/#fonctionnalites" className={LINK}>
                {t('landing.navFeatures')}
              </Link>
              <Link href="/#tarifs" className={LINK}>
                {t('landing.navPricing')}
              </Link>
              <Link href="/exemple" className={LINK}>
                {t('landing.navExamples')}
              </Link>
            </div>
            <div>
              <h5 className={HEADING}>{t('landing.footerResourcesHeading')}</h5>
              <Link href="/info" className={LINK}>
                {t('info.navLabel')}
              </Link>
              <Link href="/legal" className={LINK}>
                {t('legal.title')}
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-[#ECECF2] pt-6 text-xs text-[#8A8896]">
          <span>{t('landing.footerCopyright', { year: new Date().getFullYear() })}</span>
          <Link href="/legal" className="hover:text-[#17161F]">
            {t('landing.footerLegalLinks')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
