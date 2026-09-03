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
// With fewer than two slides configured there is nothing to rotate: the block
// shows a single waiting panel instead of animating between placeholders.
import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'react-iconly';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { SHOWCASE_SLIDES, SHOWCASE_INTERVAL_MS } from './dashboard-media';

const FRAME =
  'relative aspect-[16/9] overflow-hidden rounded-2xl min-[900px]:aspect-auto min-[900px]:h-[210px]';

function WaitingPanel() {
  const t = useTranslations();
  return (
    <div className={`${FRAME} border border-dashed border-[#DEDEE8] bg-[#FBFBFD]`}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-6 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1F0F6]">
          <ImageIcon set="light" size={20} primaryColor="#8A8896" />
        </span>
        <span className="text-[13px] font-medium text-[#17161F]">
          {t('dashboard.showcaseEmptyTitle')}
        </span>
        <span className="max-w-[280px] text-[12px] leading-[1.5] text-[#8A8896]">
          {t('dashboard.showcaseEmptyBody')}
        </span>
      </div>
    </div>
  );
}

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

  if (slides.length === 0) return <WaitingPanel />;

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
