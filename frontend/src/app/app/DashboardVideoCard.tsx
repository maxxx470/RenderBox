'use client';

// Left banner of the dashboard.
//
// Two states, and both of them are finished:
//
//   • A video is configured (see dashboard-media.ts) — facade pattern: the
//     card shows a still and a play button, and the player is only injected
//     on click. Embedding an iframe on load would pull YouTube's scripts and
//     cookies into every dashboard visit for a video most people never start.
//
//   • No video is configured — the card teaches the same thing the video was
//     going to teach, in the space it was going to occupy: a short film of the
//     three steps of a render, and a link straight to the generation space. It used to render a dead
//     "video coming soon" pill instead, which spent the best block on the
//     first screen after sign-in on a promise. A card that says nothing and
//     does nothing is worse than no card; a card that explains the product is
//     better than either.
//
// Set DASHBOARD_VIDEO.url and the first state takes over — nothing else to
// change anywhere.
import { useState } from 'react';
import Link from 'next/link';
import { Play, ArrowRight } from 'react-iconly';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { MotionFilm } from '@/app/MotionFilm';
import { DASHBOARD_VIDEO, toEmbedUrl } from './dashboard-media';

const FRAME =
  'relative aspect-[16/9] overflow-hidden rounded-2xl border border-[#DEDEE8] min-[900px]:aspect-auto min-[900px]:h-[210px]';

function HowItWorks() {
  const t = useTranslations();
  const { locale } = useLocale();
  return (
    // White, not the green gradient it used to sit on: the film is the
    // content now (owner, 2026-10-06), and it carries its own light ground.
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[#DEDEE8] bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="min-w-0 font-[family-name:var(--font-display)] text-[15px] font-semibold leading-tight text-[#17161F]">
          {t('dashboard.howTitle')}
        </h3>
        {/* Straight to the generation space: the in-app gallery this used to
            open was removed on 2026-10-06. */}
        <Link
          href="/app/generer"
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
        >
          {t('dashboard.howCta')}
          <ArrowRight set="light" size={14} primaryColor="#ffffff" />
        </Link>
      </div>
      {/* The three steps, shown rather than listed: a photo or a sketch, an
          ambiance (day, night, interior, exterior), the render. Rendered
          with HyperFrames like the landing films. */}
      <MotionFilm
        src={`/motion/etapes-${locale}.mp4`}
        poster={`/motion/etapes-${locale}.jpg`}
        label={t('dashboard.filmAlt')}
        className="border-t border-[#ECECF2]"
      />
    </div>
  );
}

export function DashboardVideoCard() {
  const t = useTranslations();
  const [playing, setPlaying] = useState(false);

  const url = DASHBOARD_VIDEO.url;
  if (!url) return <HowItWorks />;

  const embed = toEmbedUrl(url);

  if (playing) {
    return (
      <div className={`${FRAME} bg-black`}>
        {embed ? (
          <iframe
            src={embed}
            title={t('dashboard.videoTitle')}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          // Not a recognised YouTube/Vimeo link — treated as a direct file.
          <video src={url} controls autoPlay className="h-full w-full object-contain" />
        )}
      </div>
    );
  }

  return (
    <div className={`${FRAME} bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534]`}>
      {DASHBOARD_VIDEO.poster && (
        <img src={DASHBOARD_VIDEO.poster} alt="" className="h-full w-full object-cover" />
      )}
      {/* Scrim only under the text, so a real still keeps its own contrast. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <h3 className="max-w-[260px] font-[family-name:var(--font-display)] text-[21px] font-bold leading-[1.15] text-white">
          {t('dashboard.videoTitle')}
        </h3>
        <div className="mt-3.5">
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-[12.5px] font-semibold text-[#17161F] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Play set="light" size={14} primaryColor="#15803D" />
            {t('dashboard.videoPlay')}
          </button>
        </div>
      </div>
    </div>
  );
}
