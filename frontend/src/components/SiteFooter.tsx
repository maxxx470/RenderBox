'use client';

// Shared footer for the landing and every public page around it (/info,
// /legal, /exemple).
//
// Green charter (2026-10-05): a rounded block in the brand gradient, inset
// from the page edges, carrying the brand, a small "start" box and the link
// columns — the reference's footer, which also absorbed the landing's old
// final CTA band so the page does not end on two green blocks in a row.
//
// Every entry here is live. Placeholder labels for pages that do not exist
// ("Guide", "Blog", "Contact"…) stay out until the pages do: on screen a grey
// label beside real links reads as a dead link, not as a page to come.
//
// The ground is the DEEP end of the gradient (#15803D → #14532D), not the
// bright #16A34A: white 13px text needs 4.5:1, which #16A34A (3.3:1) misses.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { TikTokMark } from '@/app/HeroProof';
import { SOCIAL } from '@/app/social';
import { BrandMark } from '@/components/BrandMark';

const BAND = 'bg-[linear-gradient(135deg,#15803D_0%,#166534_55%,#14532D_100%)]';
const LINK = 'mb-2.5 block text-[13px] text-white/85 transition-colors hover:text-white';
const HEADING = 'mb-3.5 text-[13px] font-semibold text-white';

export function SiteFooter({ ctaHref = '/app' }: { ctaHref?: string }) {
  const t = useTranslations();

  return (
    <footer className="mx-auto max-w-[1180px] px-4 pb-6 pt-6">
      <div
        className={`rounded-[32px] ${BAND} px-7 py-10 text-white min-[640px]:px-12 min-[640px]:py-12`}
      >
        <div className="flex flex-wrap justify-between gap-10 pb-10">
          <div className="max-w-[320px]">
            <Link href="/" className="flex items-center gap-2.5 text-[18px] font-bold text-white">
              <BrandMark size="md" inverse />
              RenderBox
            </Link>
            <p className="mt-3 text-[13px] leading-[1.55] text-white/85">
              {t('landing.footerTagline')}
            </p>

            {/* The reference's "start your trial" box — the landing's former
                final CTA band, folded in here. */}
            <div className="mt-6 rounded-2xl border border-white/20 bg-white/10 p-4">
              <p className="text-[13px] leading-[1.5] text-white">{t('landing.ctaBandTitle')}</p>
              <Link
                href={ctaHref}
                className="mt-3.5 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-[#166534] transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                {t('landing.ctaBandButton')}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-14">
            <div>
              <h2 className={HEADING}>{t('landing.footerProductHeading')}</h2>
              <Link href="/#fonctionnalites" className={LINK}>
                {t('landing.navFeatures')}
              </Link>
              <Link href="/#comment" className={LINK}>
                {t('landing.navHow')}
              </Link>
              <Link href="/#tarifs" className={LINK}>
                {t('landing.navPricing')}
              </Link>
              <Link href="/exemple" className={LINK}>
                {t('landing.navExamples')}
              </Link>
            </div>
            <div>
              <h2 className={HEADING}>{t('landing.footerResourcesHeading')}</h2>
              <Link href="/info" className={LINK}>
                {t('info.navLabel')}
              </Link>
              <Link href="/#faq" className={LINK}>
                {t('landing.navFaq')}
              </Link>
              <Link href="/legal" className={LINK}>
                {t('legal.title')}
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-6 text-xs text-white/80">
          <span>{t('landing.footerCopyright', { year: new Date().getFullYear() })}</span>
          <div className="flex items-center gap-4">
            <Link href="/legal" className="hover:text-white">
              {t('landing.footerLegalLinks')}
            </Link>
            {/* Rendered only when the handle is set — see app/social.ts. */}
            {SOCIAL.tiktok && (
              <a
                href={SOCIAL.tiktok}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="TikTok"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
              >
                <TikTokMark />
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
