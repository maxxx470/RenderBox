'use client';

// One use-case page, /rendu/<slug>. Its content comes from use-cases.ts; this
// file only lays it out, in the charter: white surface, ink headings in
// Poppins, the blue band for the call to action, the red accent once (the
// « Après » tag over the render). The page is a Client Component because the
// language can be switched without a reload — the server wrapper beside it
// does the metadata and the structured data.
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PRESETS } from '@/lib/server/generation/presets';
import { rowColumns, type GalleryImage } from '@/app/exemple/gallery';
import { UC } from './copy';
import { getUseCase, relatedUseCases, useCasePath } from './use-cases';

const MONO = 'font-[family-name:var(--font-mono)]';
const DISPLAY = 'font-[family-name:var(--font-display)]';

/** Two images per row, so a row of four portraits reads as two pairs. */
function rows(images: readonly GalleryImage[]): readonly (readonly GalleryImage[])[] {
  return images.reduce<GalleryImage[][]>((acc, img, i) => {
    if (i % 2 === 0) acc.push([img]);
    else acc[acc.length - 1]?.push(img);
    return acc;
  }, []);
}

function Picture({ img, alt, eager = false }: { img: GalleryImage; alt: string; eager?: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-[14px] bg-[#F7F7FA]"
      style={{ aspectRatio: `${img.w} / ${img.h}` }}
    >
      <img
        src={img.src}
        alt={alt}
        width={img.w}
        height={img.h}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

export function UseCaseClient({ slug, ctaHref }: { slug: string; ctaHref: '/app' | '/connexion' }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const uc = getUseCase(slug);
  // The route only ever renders a slug that exists (generateStaticParams +
  // notFound in the wrapper), so this is a type guard, not a code path.
  if (!uc) return null;

  const related = relatedUseCases(slug);

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader links cta={{ href: ctaHref, label: t('landing.navStart') }} />

      <div className="mx-auto max-w-[1100px] px-6 py-10 min-[640px]:py-14">
        {/* Breadcrumb — a reader uses it, and it is the page's own trail back
            to the hub, which is what keeps these pages out of orphan state. */}
        <nav
          aria-label={UC.related[locale]}
          className={`mb-6 flex flex-wrap items-center gap-1.5 text-[11.5px] uppercase tracking-wide text-[#8A8896] ${MONO}`}
        >
          <Link href="/" className="transition-colors hover:text-[#2948FC]">
            {UC.home[locale]}
          </Link>
          <span aria-hidden>/</span>
          <Link href="/rendu" className="transition-colors hover:text-[#2948FC]">
            {UC.backToHub[locale]}
          </Link>
        </nav>

        <h1
          className={`max-w-[22ch] ${DISPLAY} text-[32px] font-black leading-[1.1] tracking-[-0.8px] text-[#17161F] min-[640px]:text-[40px]`}
        >
          {uc.h1[locale]}
        </h1>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-[#3D3B49]">
          {uc.lede[locale]}
        </p>

        {uc.preset && (
          <div
            className={`mt-5 inline-flex items-center gap-2 rounded-lg bg-[#EEF1FF] px-3 py-1.5 text-[12px] font-semibold text-[#1E36D6] ${MONO}`}
          >
            <span className="text-[#435CFE]">{UC.ambiance[locale]}</span>
            <span>{PRESETS[uc.preset].label[locale]}</span>
          </div>
        )}

        {/* The picture, straight under the heading: a pair when one exists,
            a single render otherwise. The pair is laid out, never wiped — a
            slider hides half the demonstration from a crawler. */}
        <section className="mt-8">
          {uc.hero.before ? (
            <div className="grid grid-cols-1 gap-3.5 min-[560px]:grid-cols-2">
              <figure className="m-0">
                <Picture img={uc.hero.before} alt={uc.h1[locale]} eager />
                <figcaption
                  className={`mt-2 text-[11px] uppercase tracking-wide text-[#8A8896] ${MONO}`}
                >
                  {UC.before[locale]}
                </figcaption>
              </figure>
              <figure className="m-0">
                <Picture img={uc.hero.after} alt={uc.h1[locale]} eager />
                <figcaption
                  className={`mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#C21F33] ${MONO}`}
                >
                  {UC.after[locale]}
                </figcaption>
              </figure>
            </div>
          ) : (
            <Picture img={uc.hero.after} alt={uc.h1[locale]} eager />
          )}
        </section>

        {/* How it works */}
        <section className="mt-14">
          <h2 className={`${DISPLAY} text-[22px] font-bold text-[#17161F]`}>{UC.steps[locale]}</h2>
          <ol className="mt-5 grid grid-cols-1 gap-3 min-[860px]:grid-cols-2">
            {uc.steps[locale].map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-3 rounded-[14px] bg-[#F7F7FA] px-4 py-3.5"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] text-[12px] font-bold text-white ${MONO}`}
                >
                  {i + 1}
                </span>
                <span className="text-[14px] leading-[1.5] text-[#3D3B49]">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* The prose — what a reader came for, and what a search engine reads. */}
        <div className="mt-14 flex flex-col gap-10">
          {uc.sections.map((section) => (
            <section key={section.heading.en}>
              <h2
                className={`${DISPLAY} max-w-[30ch] text-[22px] font-bold leading-[1.25] text-[#17161F]`}
              >
                {section.heading[locale]}
              </h2>
              <p className="mt-3 max-w-[68ch] text-[15.5px] leading-[1.65] text-[#3D3B49]">
                {section.body[locale]}
              </p>
            </section>
          ))}
        </div>

        {uc.gallery.length > 0 && (
          <section className="mt-14">
            <h2 className={`${DISPLAY} text-[22px] font-bold text-[#17161F]`}>
              {UC.examples[locale]}
            </h2>
            <div className="mt-5 flex flex-col gap-3.5">
              {rows(uc.gallery).map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 gap-3.5 min-[560px]:[grid-template-columns:var(--row-cols)]"
                  style={{ '--row-cols': rowColumns(row) } as CSSProperties}
                >
                  {row.map((img) => (
                    <Picture key={img.src} img={img} alt={uc.h1[locale]} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* The same questions that go out as FAQPage structured data. */}
        <section className="mt-14">
          <h2 className={`${DISPLAY} text-[22px] font-bold text-[#17161F]`}>{UC.faq[locale]}</h2>
          <dl className="mt-5 border-t border-[#ECECF2]">
            {uc.faq.map((item) => (
              <div key={item.q.en} className="border-b border-[#ECECF2] py-5">
                <dt className="text-[15px] font-semibold text-[#17161F]">{item.q[locale]}</dt>
                <dd className="mt-2 max-w-[68ch] text-[14.5px] leading-[1.6] text-[#6B6878]">
                  {item.a[locale]}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Call to action, then the siblings — a crawler leaves this page
            towards three others rather than back where it came from. */}
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
              href="/#tarifs"
              className="rounded-xl bg-white/15 px-6 py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/25"
            >
              {UC.ctaPricing[locale]}
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <h2 className={`${DISPLAY} text-[19px] font-bold text-[#17161F]`}>
            {UC.related[locale]}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[640px]:grid-cols-3">
            {related.map((other) => (
              <Link
                key={other.slug}
                href={useCasePath(other.slug)}
                className="rounded-[14px] bg-[#F7F7FA] px-4 py-4 transition-colors hover:bg-[#EEF1FF]"
              >
                <span className={`${DISPLAY} block text-[14.5px] font-bold text-[#17161F]`}>
                  {other.h1[locale]}
                </span>
                <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-[#6B6878]">
                  {other.seo[locale].description}
                </span>
              </Link>
            ))}
          </div>
          <Link
            href="/rendu"
            className={`mt-5 inline-block text-[12.5px] font-semibold text-[#2948FC] ${MONO}`}
          >
            {UC.allCases[locale]} →
          </Link>
        </section>
      </div>

      <SiteFooter ctaHref={ctaHref} />
    </main>
  );
}
