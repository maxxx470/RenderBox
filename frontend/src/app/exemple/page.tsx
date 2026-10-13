'use client';

// Phase 6 — read-only static demo, no DB/API calls (D-06 spec 3: "aucune
// tentative de créer un vrai projet depuis cette page").
//
// The four CSS gradient placeholders are gone: this page is the one a visitor
// reaches from "Voir un exemple", and it showed no render at all. It now shows
// real ones, grouped into one batch per kind of render so the batch title says
// what it is — see gallery.ts for how each image was classified.
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PRESETS } from '@/lib/server/generation/presets';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { GALLERY, rowColumns } from './gallery';

const MONO = 'font-[family-name:var(--font-mono)]';

export default function ExemplePage() {
  const t = useTranslations();
  const { locale } = useLocale();

  const materialRows = [
    { label: t('exemple.materialsFacade'), value: t('exemple.materialsFacadeValue') },
    { label: t('exemple.materialsRoof'), value: t('exemple.materialsRoofValue') },
    { label: t('exemple.materialsJoinery'), value: t('exemple.materialsJoineryValue') },
    { label: t('exemple.materialsGround'), value: t('exemple.materialsGroundValue') },
  ];

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader links cta={{ href: '/app', label: t('landing.navStart') }} />

      <div className="mx-auto max-w-[1100px] px-6 py-12">
        <h1 className="font-[family-name:var(--font-display)] text-[30px] font-bold tracking-[-0.5px] text-[#17161F]">
          {t('exemple.title')}
        </h1>
        <p className="mt-2.5 max-w-[62ch] text-[15px] leading-[1.55] text-[#6B6878]">
          {t('exemple.subtitle')}
        </p>

        {/* One batch per kind of render. A preset's heading is its own name,
            taken from presets.ts rather than retyped, so the page can never
            drift from the vocabulary the app itself uses. */}
        {GALLERY.map((batch, batchIndex) => {
          const count = batch.rows.reduce((n, row) => n + row.length, 0);
          const title =
            batch.key === 'croquis' ? batch.label?.[locale] : PRESETS[batch.key].label[locale];
          return (
            <section key={batch.key} className="mt-12">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#ECECF2] pb-2.5">
                <h2 className="font-[family-name:var(--font-display)] text-[19px] font-bold text-[#17161F]">
                  {title}
                </h2>
                <span className={`text-[11px] uppercase tracking-wide text-[#8A8896] ${MONO}`}>
                  {count === 1
                    ? t('exemple.batchCountOne')
                    : t('exemple.batchCount', { n: String(count) })}
                </span>
              </div>
              <div className="flex flex-col gap-3.5">
                {batch.rows.map((row, rowIndex) => (
                  // One row, one height: each column is as wide as its image's
                  // ratio (rowColumns), so every image shows whole, uncropped.
                  // On a phone they stack, each at its own shape.
                  <div
                    key={rowIndex}
                    className="grid grid-cols-1 gap-3.5 min-[560px]:[grid-template-columns:var(--row-cols)]"
                    style={{ '--row-cols': rowColumns(row) } as CSSProperties}
                  >
                    {row.map((img) => (
                      <div
                        key={img.src}
                        className="overflow-hidden rounded-[14px] bg-[#F7F7FA]"
                        style={{ aspectRatio: `${img.w} / ${img.h}` }}
                      >
                        <img
                          src={img.src}
                          alt=""
                          width={img.w}
                          height={img.h}
                          // Only the first batch is above the fold; the rest cost
                          // nothing until scrolled to. Without this the page would
                          // pull every image on load.
                          loading={batchIndex === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {/* After the galleries, not before: the sheet explains how they hold
            together, which only means something once you have seen them. */}
        <section className="mt-14">
          <h2 className="font-[family-name:var(--font-display)] text-[19px] font-bold text-[#17161F]">
            {t('exemple.materialsTitle')}
          </h2>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.55] text-[#6B6878]">
            {t('exemple.materialsIntro')}
          </p>
          <div className="mt-4 rounded-[16px] bg-[#F7F7FA] p-5">
            <dl className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2">
              {materialRows.map((r) => (
                <div key={r.label}>
                  <dt className={`text-[10.5px] uppercase tracking-wide text-[#8A8896] ${MONO}`}>
                    {r.label}
                  </dt>
                  <dd className="mt-0.5 text-[14px] font-medium text-[#17161F]">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mt-14 rounded-[20px] bg-[linear-gradient(135deg,#435CFE_0%,#2948FC_48%,#1E36D6_100%)] px-6 py-10 text-center">
          <h2 className="mb-5 font-[family-name:var(--font-display)] text-[20px] font-semibold text-white">
            {t('exemple.ctaTitle')}
          </h2>
          <Link
            href="/connexion"
            className="inline-block rounded-xl bg-white px-6 py-3 text-[13.5px] font-semibold text-[#17161F] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
          >
            {t('exemple.ctaButton')}
          </Link>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
