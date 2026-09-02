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

const GRADIENT = 'bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]';

export interface SiteHeaderCta {
  href: string;
  label: string;
}

export function SiteHeader({
  links = false,
  cta,
}: {
  /** Marketing links (features / pricing / examples). Off on account pages,
      where they would pull the user out of what they came to do. */
  links?: boolean;
  cta?: SiteHeaderCta | undefined;
}) {
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-40 border-b border-[#ECECF2] bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-6 py-3.5">
        <Link
          href="/"
          className="flex flex-shrink-0 items-center gap-2 font-[family-name:var(--font-general-sans)] text-[15px] font-bold text-[#17161F]"
        >
          <span className={`h-6.5 w-6.5 rounded-[7px] ${GRADIENT}`} />
          RenderBox
        </Link>

        {links && (
          <nav className="hidden items-center gap-1 rounded-full bg-[#F7F7FA] p-1 text-sm font-medium text-[#6B6880] min-[860px]:flex">
            <Link
              href="/#fonctionnalites"
              className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#17161F]"
            >
              {t('landing.navFeatures')}
            </Link>
            <Link
              href="/#tarifs"
              className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#17161F]"
            >
              {t('landing.navPricing')}
            </Link>
            <Link
              href="/exemple"
              className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#17161F]"
            >
              {t('landing.navExamples')}
            </Link>
          </nav>
        )}

        <div className="flex flex-shrink-0 items-center gap-3">
          <LanguageInlineSwitch />
          {cta && (
            <Link
              href={cta.href}
              className="inline-flex items-center rounded-full bg-[#17161F] px-4.5 py-2 text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
