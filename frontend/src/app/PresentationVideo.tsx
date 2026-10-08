'use client';

// The landing's presentation video, right after the hero and the compatible
// tools (owner, 2026-10-06).
//
// A PLACEHOLDER for now, on purpose: the film will be made once the site is
// finished, and a real video of an unfinished product would have to be
// re-shot. It is framed the way Metrio frames its hero video — a browser
// window (three dots, a file name) tilted back in perspective, which
// straightens and sharpens as it scrolls into view — so swapping in the film
// later is one <video> element inside `VIDEO_BODY`, nothing else.
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { Reveal } from './Reveal';

export function PresentationVideo() {
  const t = useTranslations();
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
              presentation-renderbox.mp4
            </span>
            <span className="w-[42px]" aria-hidden />
          </div>

          {/* VIDEO_BODY — the film goes here once it exists. */}
          <div className="relative flex aspect-[4/3] flex-col items-center justify-center gap-4 min-[640px]:aspect-video bg-[#FBFBFD] bg-[radial-gradient(circle,#DEDEE8_1px,transparent_1.2px)] [background-size:18px_18px] px-6 text-center">
            <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[#17161F] shadow-[0_14px_30px_-12px_rgba(23,22,31,0.6)] min-[640px]:h-20 min-[640px]:w-20">
              <span
                aria-hidden
                className="absolute inset-0 animate-ping rounded-2xl bg-[#F34857]/35 motion-reduce:animate-none"
              />
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden className="relative ml-1">
                <path
                  d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8Z"
                  fill="#F34857"
                />
              </svg>
            </span>
            <div>
              <p className="text-[15px] font-semibold text-[#17161F] min-[640px]:text-[17px]">
                {t('landing.videoSoon')}
              </p>
              <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-[#6B6878]">
                {t('landing.videoSoonBody')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
