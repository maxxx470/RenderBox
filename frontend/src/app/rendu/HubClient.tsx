'use client';

// /rendu — the hub. It holds the main term (« rendu architectural par IA »)
// and links every use-case page, which is what makes those pages findable at
// all: a page nothing links to is a page a crawler reaches only through the
// sitemap, and ranks accordingly.
import Link from 'next/link';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PRESETS } from '@/lib/server/generation/presets';
import { HUB, UC } from './copy';
import { USE_CASES, useCasePath } from './use-cases';

const MONO = 'font-[family-name:var(--font-mono)]';
const DISPLAY = 'font-[family-name:var(--font-display)]';

export function HubClient({ ctaHref }: { ctaHref: '/app' | '/connexion' }) {
  const t = useTranslations();
  const { locale } = useLocale();

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader links cta={{ href: ctaHref, label: t('landing.navStart') }} />

      <div className="mx-auto max-w-[1100px] px-6 py-10 min-[640px]:py-14">
        <p className={`text-[11px] font-bold uppercase tracking-[1.2px] text-[#2948FC] ${MONO}`}>
          {HUB.eyebrow[locale]}
        </p>
        <h1
          className={`mt-3 max-w-[24ch] ${DISPLAY} text-[32px] font-black leading-[1.1] tracking-[-0.8px] text-[#17161F] min-[640px]:text-[42px]`}
        >
          {HUB.h1[locale]}
        </h1>
        <p className="mt-4 max-w-[64ch] text-[16px] leading-[1.6] text-[#3D3B49]">
          {HUB.lede[locale]}
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 min-[960px]:grid-cols-3">
          {USE_CASES.map((uc, i) => (
            <Link
              key={uc.slug}
              href={useCasePath(uc.slug)}
              // The charter's one highlight per screen: the first card lifts
              // in the brand red, the rest stay on the grey band.
              className={`group flex flex-col overflow-hidden rounded-[18px] transition-transform duration-200 ease-out hover:-translate-y-0.5 ${
                i === 0 ? 'bg-[#FFE4E7]' : 'bg-[#F7F7FA] hover:bg-[#EEF1FF]'
              }`}
            >
              {/* One shared 4:3 for every thumbnail, cropped — the pictures
                  behind them range from 4:3 to portrait, and their own ratios
                  made a ragged grid. The page itself shows each one whole. */}
              <div className="aspect-[4/3] overflow-hidden bg-[#ECECF2]">
                <img
                  src={uc.hero.after.src}
                  alt={uc.h1[locale]}
                  width={uc.hero.after.w}
                  height={uc.hero.after.h}
                  loading={i < 3 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col px-4 py-4">
                <h2
                  className={`${DISPLAY} text-[15.5px] font-bold leading-[1.3] ${
                    i === 0 ? 'text-[#C21F33]' : 'text-[#17161F]'
                  }`}
                >
                  {uc.h1[locale]}
                </h2>
                <p className="mt-2 flex-1 text-[12.5px] leading-[1.55] text-[#6B6878]">
                  {uc.seo[locale].description}
                </p>
                {uc.preset && (
                  <span
                    className={`mt-3 self-start rounded-md bg-white px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#1E36D6] ${MONO}`}
                  >
                    {PRESETS[uc.preset].label[locale]}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-14 rounded-[20px] bg-[linear-gradient(135deg,#2948FC_0%,#1E36D6_55%,#1A2BB0_100%)] px-6 py-10 text-center min-[640px]:px-10">
          <h2 className={`${DISPLAY} text-[22px] font-bold text-white`}>{UC.ctaTitle[locale]}</h2>
          <p className="mx-auto mt-3 max-w-[52ch] text-[14.5px] leading-[1.6] text-white/85">
            {UC.ctaBody[locale]}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={ctaHref}
              className="rounded-xl bg-white px-6 py-3 text-[13.5px] font-semibold text-[#1E36D6] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
            >
              {UC.ctaButton[locale]}
            </Link>
            <Link
              href="/exemple"
              className="rounded-xl bg-white/15 px-6 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/25"
            >
              {t('landing.navExamples')}
            </Link>
          </div>
        </section>
      </div>

      <SiteFooter ctaHref={ctaHref} />
    </main>
  );
}
