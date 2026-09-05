'use client';

// Right banner of the dashboard: showcase renders, crossfading on their own.
//
// An auto-rotating carousel is easy to make hostile, so three rules are held
// here rather than left to chance:
//   1. It pauses while the pointer is over it or anything inside has focus —
//      otherwise a slide can move out from under a click.
//   2. It does not rotate at all under `prefers-reduced-motion`; the dots
//      still work, so nothing becomes unreachable.
//   3. The dots are real buttons with labels, so the later slides are
//      reachable without waiting (or seeing) the rotation.
//
// With a single slide configured there is nothing to rotate: it renders as a
// still, dots and all removed.
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { SHOWCASE_SLIDES, SHOWCASE_INTERVAL_MS } from './dashboard-media';

// Outlined like every other block on the dashboard, so the two banners sit in
// the same frame language as the cards below them.
const FRAME =
  'relative aspect-[16/9] overflow-hidden rounded-2xl border border-[#DEDEE8] min-[900px]:aspect-auto min-[900px]:h-[210px]';

export function DashboardCarousel() {
  const { locale } = useLocale();
  const t = useTranslations();
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const slides = SHOWCASE_SLIDES;
  const rotating = slides.length > 1 && !reducedMotion && !paused;

  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), SHOWCASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [rotating, slides.length]);

  // Nothing configured: render nothing at all rather than a panel that
  // announces an absence. See dashboard-media.ts — it ships four entries.
  if (slides.length === 0) return null;

  return (
    <div
      className={`${FRAME} bg-[#F7F7FA]`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      // Announced as a region so a screen reader user knows content changes
      // here on its own; `polite` never interrupts what is being read.
      aria-roledescription="carousel"
      aria-label={t('dashboard.showcaseLabel')}
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <img src={slide.src} alt="" className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
          <p className="absolute inset-x-5 bottom-11 max-w-[300px] font-[family-name:var(--font-general-sans)] text-[19px] font-bold leading-[1.2] text-white">
            {slide.caption[locale]}
          </p>
        </div>
      ))}

      {slides.length > 1 && (
        <div className="absolute inset-x-5 bottom-4 flex gap-1.5">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t('dashboard.showcaseGoTo', { n: String(i + 1) })}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/55 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
