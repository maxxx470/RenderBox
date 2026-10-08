'use client';

// Shared header for every page outside the workspace (/exemple, /legal,
// /parametres, /paiement/retour, /connexion).
//
// Before this, each of those pages did its own thing: a bare "back" text link
// at best, no logo, and a floating LanguageToggle pinned to the corner. Two
// consequences worth naming — there was no way to reach the app from
// /parametres or /legal at all, and nothing on screen said which product you
// were looking at.
//
// Same pill language as the landing nav, and the language switch is docked
// inline rather than floating: the charter forbids a second fixed control
// competing with a header for the same corner.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { BrandMark } from '@/components/BrandMark';
import { PublicMobileMenu } from '@/components/PublicMobileMenu';

export interface SiteHeaderCta {
  href: string;
  label: string;
}

export function SiteHeader({
  links = false,
  cta,
  homeHref = '/',
}: {
  /** Where the logo goes. '/app' on pages a signed-in user reaches from
      inside the app, which must never drop them back on the landing. */
  homeHref?: string;
  /** Marketing links (features / pricing / examples). Off on account pages,
      where they would pull the user out of what they came to do. */
  links?: boolean;
  cta?: SiteHeaderCta | undefined;
}) {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-4 min-[640px]:px-6">
        <Link
          href={homeHref}
          className="flex flex-shrink-0 items-center gap-2 font-[family-name:var(--font-display)] text-[17px] font-bold text-[#17161F]"
        >
          <BrandMark size="md" />
          RenderBox
        </Link>

        {links && (
          <nav className="hidden items-center gap-1 text-[13.5px] font-medium text-[#3D3B49] min-[860px]:flex">
            <Link
              href="/#fonctionnalites"
              className="rounded-lg px-3 py-1.5 transition-colors hover:text-[#17161F]"
            >
              {t('landing.navFeatures')}
            </Link>
            <Link
              href="/#comment"
              className="rounded-lg px-3 py-1.5 transition-colors hover:text-[#17161F]"
            >
              {t('landing.navHow')}
            </Link>
            <Link
              href="/#tarifs"
              className="rounded-lg px-3 py-1.5 transition-colors hover:text-[#17161F]"
            >
              {t('landing.navPricing')}
            </Link>
            <Link
              href="/exemple"
              className="rounded-lg px-3 py-1.5 transition-colors hover:text-[#17161F]"
            >
              {t('landing.navExamples')}
            </Link>
            <Link
              href="/info"
              className="rounded-lg px-3 py-1.5 transition-colors hover:text-[#17161F]"
            >
              {t('info.navLabel')}
            </Link>
          </nav>
        )}

        <div className="flex flex-shrink-0 items-center gap-2.5 min-[640px]:gap-3">
          {/* With links, the language choice moves into the menu below 860px. */}
          <span className={links ? 'hidden min-[860px]:block' : ''}>
            <LanguageInlineSwitch />
          </span>
          {cta && (
            <Link
              href={cta.href}
              className="inline-flex items-center rounded-xl bg-[linear-gradient(135deg,#435CFE_0%,#2948FC_48%,#1E36D6_100%)] px-5 py-2.5 text-[13.5px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              {cta.label}
            </Link>
          )}
          {links && (
            <PublicMobileMenu
              className="min-[860px]:hidden"
              links={[
                { href: '/#fonctionnalites', label: t('landing.navFeatures') },
                { href: '/#comment', label: t('landing.navHow') },
                { href: '/#tarifs', label: t('landing.navPricing') },
                { href: '/exemple', label: t('landing.navExamples') },
                { href: '/info', label: t('info.navLabel') },
              ]}
              cta={cta}
            />
          )}
        </div>
      </div>
    </header>
  );
}
