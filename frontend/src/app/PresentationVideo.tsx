'use client';

// The landing's presentation video, right after the hero and the compatible
// tools (owner, 2026-10-06).
//
// The film (2026-10-16, FR 2 min 15, EN 2 min 12) is framed the way Metrio
// frames its hero video — a browser window (three dots, a file name) tilted
// back in perspective, which straightens and sharpens as it scrolls into view.
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { presentationFilm } from './motion-media';
import { Reveal } from './Reveal';

export function PresentationVideo() {
  const t = useTranslations();
  const { locale } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [straight, setStraight] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStraight(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStraight(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="pt-14 min-[860px]:pt-20" aria-labelledby="presentation-title">
      <div className="mx-auto mb-9 max-w-[640px] text-center">
        <Reveal>
          <p className="mb-3 inline-flex items-center gap-2 text-[13px] font-medium text-[#17161F]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#F34857]" />
            {t('landing.videoEyebrow')}
          </p>
        </Reveal>
        <Reveal delayMs={90}>
          <h2
            id="presentation-title"
            className="text-[30px] font-bold leading-[1.2] tracking-[-0.6px] text-[#17161F] min-[640px]:text-[36px]"
          >
            {t('landing.videoTitle')}
          </h2>
        </Reveal>
      </div>

      <div ref={ref} className="mx-auto max-w-[1040px] [perspective:1400px]">
        <div
          className={`overflow-hidden rounded-[18px] bg-white shadow-[0_30px_70px_-30px_rgba(23,22,31,0.35)] [transform-origin:50%_100%] transition-[transform,filter,opacity] duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
            straight
              ? '[transform:rotateX(0deg)_rotateY(0deg)_scale(1)] opacity-100'
              : '[transform:rotateX(12deg)_rotateY(-8deg)_scale(0.96)] opacity-60 blur-[6px]'
          }`}
        >
          {/* The window's title bar, as in Metrio. */}
          <div className="flex items-center justify-between border-b border-[#ECECF2] px-4 py-3">
            <div className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-[#F34857]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#435CFE]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#DEDEE8]" />
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[11.5px] text-[#8A8896]">
              presentation-renderpro.mp4
            </span>
            <span className="w-[42px]" aria-hidden />
          </div>

          {/* The film itself (2026-10-16): with its sound, so it never starts
              on its own — the visitor presses play. Served from R2 like the
              feature films (motion-media.ts), one file per language. */}
          <video
            {...presentationFilm(locale)}
            controls
            playsInline
            preload="none"
            aria-label={t('landing.videoLabel')}
            className="block aspect-video w-full bg-[#17161F] object-cover"
          />
        </div>
      </div>
    </section>
  );
}
