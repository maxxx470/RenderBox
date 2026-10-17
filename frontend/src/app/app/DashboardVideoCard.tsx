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
//     going to teach, in the space it was going to occupy: « Premier pas sur
//     RenderPro », two short tutorial films (generate, enhance). It used to render a dead
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
import { motionFilm } from '@/app/motion-media';
import { DASHBOARD_VIDEO, toEmbedUrl } from './dashboard-media';

const FRAME =
  'relative aspect-[16/9] overflow-hidden rounded-2xl min-[900px]:aspect-auto min-[900px]:h-[210px]';

// « Premier pas sur RenderPro » (owner, 2026-10-17; « De la photo au rendu,
// en 3 étapes » with the etapes film before): two short tutorial films, one
// above the other in 16:9 — generating an image on the Générateur d'images,
// then enhancing one on Améliorer —, each step captioned in the film itself,
// muted and looping like the landing films (MotionFilm). Each opens its page.
// On a phone the films keep a « Plein écran » button, as on the Info page.
const TUTORIALS = [
  {
    film: 'tuto-generer',
    title: 'dashboard.tutoGenerate',
    cta: 'dashboard.tutoGenerateCta',
    href: '/app/generer',
  },
  {
    film: 'tuto-ameliorer',
    title: 'dashboard.tutoEnhance',
    cta: 'dashboard.tutoEnhanceCta',
    href: '/app/enhance',
  },
] as const;

function FirstSteps() {
  const t = useTranslations();
  const { locale } = useLocale();
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white">
      <h3 className="px-4 pb-1 pt-3.5 font-[family-name:var(--font-display)] text-[15px] font-semibold leading-tight text-[#17161F]">
        {t('dashboard.firstStepsTitle')}
      </h3>
      {TUTORIALS.map((tuto, i) => (
        <div key={tuto.film} className={i > 0 ? 'border-t border-[#ECECF2]' : ''}>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#3D3B49]">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#EEF1FF] font-[family-name:var(--font-mono)] text-[11px] font-semibold text-[#1E36D6]">
                {i + 1}
              </span>
              <span className="truncate">{t(tuto.title)}</span>
            </p>
            <Link
              href={tuto.href}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-3 py-1.5 text-[12px] font-semibold text-white transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
            >
              {t(tuto.cta)}
              <ArrowRight set="curved" size={13} primaryColor="#ffffff" />
            </Link>
          </div>
          <MotionFilm
            {...motionFilm(tuto.film, locale)}
            label={t(tuto.title)}
            expandLabel={t('info.filmExpand')}
            className="border-t border-[#ECECF2]"
          />
        </div>
      ))}
    </div>
  );
}

export function DashboardVideoCard() {
  const t = useTranslations();
  const [playing, setPlaying] = useState(false);

  const url = DASHBOARD_VIDEO.url;
  if (!url) return <FirstSteps />;

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
    <div className={`${FRAME} bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]`}>
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
            className="inline-flex items-center gap-2 rounded-xl bg-white/95 px-3.5 py-2 text-[12.5px] font-semibold text-[#17161F] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Play set="curved" size={14} primaryColor="#2948FC" />
            {t('dashboard.videoPlay')}
          </button>
        </div>
      </div>
    </div>
  );
}
