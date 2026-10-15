'use client';

// The frame of the sign-in (/connexion) and onboarding (/bienvenue) pages,
// after the owner's « Join Us » reference (2026-10-13) in RenderPro's charter:
// one white card on the grey ground; on the left a blue panel — the logo, a
// 3D picture, a pill, the title, one line, then the three steps of getting
// started with the current one in white —, on the right the form.
//
// The picture is /public/connexion/visuel.webp (a placeholder until the owner
// generates the real one: replace the file under the same name). Below
// 1024px the panel shrinks to the logo and the title above the form.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { TickSquare } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { BrandMark, Wordmark } from '@/components/BrandMark';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';

const PANEL = 'bg-[linear-gradient(160deg,#435CFE_0%,#2948FC_42%,#1E36D6_78%,#1A2BB0_100%)]';

const STEPS = ['connexion.step1', 'connexion.step2', 'connexion.step3'] as const;

export function AuthShell({ step, children }: { step: 1 | 2 | 3; children: ReactNode }) {
  const t = useTranslations();
  return (
    <main className="flex min-h-screen items-stretch justify-center bg-[#EEEEF1] p-0 min-[640px]:items-center min-[640px]:p-6 min-[1024px]:p-8">
      <div className="grid w-full max-w-[1160px] grid-cols-1 bg-white min-[640px]:rounded-[28px] min-[640px]:p-2.5 min-[640px]:shadow-[0_30px_80px_-40px_rgba(23,22,31,0.35)] min-[1024px]:grid-cols-[1.08fr_1fr] min-[1024px]:gap-2.5">
        <section
          className={`relative isolate flex flex-col overflow-hidden px-6 pb-7 pt-6 text-white min-[640px]:rounded-[22px] min-[1024px]:min-h-[660px] min-[1024px]:px-9 min-[1024px]:pb-9 min-[1024px]:pt-8 ${PANEL}`}
        >
          {/* Soft light, as in the reference: two blurred glows. */}
          <span
            aria-hidden
            className="absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-[#9DB0FF] opacity-45 blur-3xl"
          />
          <span
            aria-hidden
            className="absolute -bottom-32 right-0 -z-10 h-96 w-96 rounded-full bg-[#5EC8FF] opacity-30 blur-3xl"
          />

          <Link
            href="/"
            aria-label="RenderPro"
            className="flex w-fit items-center gap-2.5 text-[20px]"
          >
            <BrandMark size="md" inverse />
            <Wordmark inverse />
          </Link>

          <img
            src="/connexion/visuel.webp"
            alt=""
            aria-hidden
            className="pointer-events-none absolute right-[-4%] top-[6%] -z-10 hidden h-[52%] w-auto object-contain opacity-95 [mask-image:radial-gradient(closest-side,#000_62%,transparent)] min-[1024px]:block"
          />

          <div className="mt-6 min-[1024px]:mt-auto">
            <span className="inline-flex rounded-lg bg-white/15 px-3 py-1.5 text-[13px] font-medium backdrop-blur-sm">
              {t('connexion.panelPill')}
            </span>
            <h2 className="mt-4 max-w-[520px] font-[family-name:var(--font-display)] text-[28px] font-semibold leading-[1.12] tracking-[-0.5px] min-[1024px]:text-[40px]">
              {t('connexion.panelTitle')}
            </h2>
            <p className="mt-3 max-w-[460px] text-[14px] leading-relaxed text-white/80 min-[1024px]:text-[15px]">
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
                  className={`flex h-[124px] flex-col justify-between rounded-2xl p-4 ${
                    current
                      ? 'bg-white text-[#17161F]'
                      : 'bg-white/12 text-white/85 backdrop-blur-sm'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg font-[family-name:var(--font-mono)] text-[12px] font-semibold ${
                      current
                        ? 'bg-[#2948FC] text-white'
                        : done
                          ? 'bg-white text-[#2948FC]'
                          : 'border border-white/45'
                    }`}
                  >
                    {done ? <TickSquare set="curved" size={15} primaryColor="#2948FC" /> : n}
                  </span>
                  <span className="text-[13.5px] font-medium leading-snug">{t(key)}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="flex flex-col px-5 pb-10 pt-5 min-[640px]:px-10 min-[1024px]:px-14">
          <div className="flex justify-end">
            <LanguageInlineSwitch className="rounded-lg bg-[#F2F2F5] px-2.5 py-1.5" />
          </div>
          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-6">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
