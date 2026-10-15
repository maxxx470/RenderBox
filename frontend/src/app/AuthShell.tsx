'use client';

// The frame of the sign-in (/connexion) and onboarding (/bienvenue) pages,
// after the owner's « Join Us » reference (2026-10-13) in RenderPro's charter.
// Since 2026-10-15 it fills the whole window (owner: no card, no margin, no
// rounded corners): on the left, from 1024px, a blue panel the height of the
// screen — the logo, a 3D picture, a pill, the title, one line, then the
// three steps of getting started, each with its own 3D picture
// (/public/connexion/etape-1…3.webp, the owner's), the current one in white
// —; on the right the form on white.
//
// The pictures are the owner's, on a plain blue ground the panel is tinted
// to match (per picture, below), and their edges fade, so they melt into it: /public/connexion/visuel.webp on
// /connexion, /public/connexion/bienvenue.webp on /bienvenue. To swap one,
// replace the file under the same name. Below 1024px the panel shrinks to the
// logo and the title above the form, without the picture or the steps.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { TickSquare } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { BrandMark, Wordmark } from '@/components/BrandMark';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';

const STEPS = ['connexion.step1', 'connexion.step2', 'connexion.step3'] as const;

// Each picture with the panel tinted on its own ground (sampled from the
// files), darkening a little towards the steps.
const VILLA = {
  src: '/connexion/visuel.webp',
  panel: 'bg-[linear-gradient(180deg,#3358DE_0%,#3257DD_55%,#2B4DD2_100%)]',
};
const MODEL = {
  src: '/connexion/bienvenue.webp',
  panel: 'bg-[linear-gradient(180deg,#3260ED_0%,#2F5BE9_55%,#2A50DA_100%)]',
};
const PICTURE = { 1: VILLA, 2: MODEL, 3: MODEL } as const;

export function AuthShell({ step, children }: { step: 1 | 2 | 3; children: ReactNode }) {
  const t = useTranslations();
  return (
    <main className="grid min-h-screen grid-cols-1 bg-white min-[1024px]:grid-cols-[1.08fr_1fr]">
      <section
        className={`relative isolate flex flex-col overflow-hidden px-6 pb-7 pt-6 text-white min-[1024px]:sticky min-[1024px]:top-0 min-[1024px]:h-screen min-[1024px]:px-12 min-[1024px]:pb-10 min-[1024px]:pt-9 ${PICTURE[step].panel}`}
      >
        <Link
          href="/"
          aria-label="RenderPro"
          className="flex w-fit items-center gap-2.5 text-[20px]"
        >
          <BrandMark size="md" inverse />
          <Wordmark inverse />
        </Link>

        {/* The picture takes whatever height the text and steps leave. */}
        <div className="my-3 hidden min-h-0 flex-1 items-center justify-center min-[1024px]:flex">
          {/* Its edges fade out, so the picture's ground melts into the panel. */}
          <img
            src={PICTURE[step].src}
            alt=""
            aria-hidden
            className="pointer-events-none max-h-full max-w-full [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_9%,#000_91%,transparent),linear-gradient(to_bottom,transparent,#000_9%,#000_91%,transparent)]"
          />
        </div>

        <div className="mt-6 min-[1024px]:mt-0">
          <span className="inline-flex rounded-lg bg-white/15 px-3 py-1.5 text-[13px] font-medium backdrop-blur-sm">
            {t('connexion.panelPill')}
          </span>
          <h2 className="mt-4 max-w-[560px] font-[family-name:var(--font-display)] text-[28px] font-semibold leading-[1.12] tracking-[-0.5px] min-[1024px]:text-[40px]">
            {t('connexion.panelTitle')}
          </h2>
          <p className="mt-3 max-w-[480px] text-[14px] leading-relaxed text-white/80 min-[1024px]:text-[15px]">
            {t('connexion.panelSubtitle')}
          </p>
        </div>

        <ol className="mt-7 hidden grid-cols-3 gap-3 min-[1024px]:grid">
          {STEPS.map((key, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            const current = n === step;
            const done = n < step;
            return (
              <li
                key={key}
                aria-current={current ? 'step' : undefined}
                className={`flex flex-col gap-2.5 rounded-2xl p-2.5 ${
                  current ? 'bg-white text-[#17161F]' : 'bg-white/12 text-white/85 backdrop-blur-sm'
                }`}
              >
                <div className="relative overflow-hidden rounded-xl">
                  <img
                    src={`/connexion/etape-${n}.webp`}
                    alt=""
                    aria-hidden
                    className={`aspect-[16/10] w-full object-cover ${current || done ? '' : 'opacity-80'}`}
                  />
                  <span
                    className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg font-[family-name:var(--font-mono)] text-[12px] font-semibold ${
                      current
                        ? 'bg-[#2948FC] text-white'
                        : done
                          ? 'bg-white text-[#2948FC]'
                          : 'border border-white/60 bg-white/10 text-white backdrop-blur-sm'
                    }`}
                  >
                    {done ? <TickSquare set="curved" size={15} primaryColor="#2948FC" /> : n}
                  </span>
                </div>
                <span className="px-1.5 pb-1 text-[13.5px] font-medium leading-snug">{t(key)}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="flex flex-col px-5 min-[1024px]:min-h-screen pb-10 pt-5 min-[640px]:px-10 min-[1024px]:px-16">
        <div className="flex justify-end">
          <LanguageInlineSwitch className="rounded-lg bg-[#F2F2F5] px-2.5 py-1.5" />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-6">
          {children}
        </div>
      </section>
    </main>
  );
}
