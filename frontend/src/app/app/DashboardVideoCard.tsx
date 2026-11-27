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
//   • No video is configured — the card shows the animation loop and its
//     « Générer une animation » button (owner, 2026-11-27; two tutorial
//     films before). It used to render a dead "video coming soon" pill,
//     which spent the best block on the first screen on a promise.
//
// Set DASHBOARD_VIDEO.url and the first state takes over — nothing else to
// change anywhere.
import { useState } from 'react';
import Link from 'next/link';
import { Play, ArrowRight } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { MotionFilm } from '@/app/MotionFilm';
import { DASHBOARD_ANIMATION, DASHBOARD_VIDEO, toEmbedUrl } from './dashboard-media';

const FRAME =
  'relative aspect-[16/9] overflow-hidden rounded-2xl min-[900px]:aspect-auto min-[900px]:h-[210px]';

// « Animation vidéo » (owner, 2026-11-27; « Premier pas sur RenderPro » and
// its two tutorial films from 2026-10-17 until then): one 16:9 animation loop
// cut from the owner's clip, muted and looping like the landing films
// (MotionFilm), under a header whose button opens the Vidéo page. The
// showcase carousel beside it carries « Générer une image » the same way, so
// the dashboard's two main actions sit on the first screen.
function AnimationCard() {
  const t = useTranslations();
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-4">
      <CardHeader
        title={t('dashboard.animTitle')}
        subtitle={t('dashboard.animSubtitle')}
        href="/app/video"
        cta={t('dashboard.animCta')}
      />
      <MotionFilm
        src={DASHBOARD_ANIMATION.src}
        poster={DASHBOARD_ANIMATION.poster}
        label={t('dashboard.animAlt')}
        expandLabel={t('info.filmExpand')}
        className="rounded-xl shadow-[0_0_0_1px_#ECECF2]"
      />
    </div>
  );
}

/** Title, one muted line and the blue action button, shared by both dashboard banners. */
export function CardHeader({
  title,
  subtitle,
  href,
  cta,
}: {
  title: string;
  subtitle: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
      <div className="min-w-0">
        <h3 className="font-[family-name:var(--font-display)] text-[15px] font-semibold leading-tight text-[#17161F]">
          {title}
        </h3>
        <p className="mt-0.5 text-[12px] text-[#6B6878]">{subtitle}</p>
      </div>
      <Link
        href={href}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-4 py-2.5 text-[13px] font-semibold text-white transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
      >
        {cta}
        <ArrowRight set="curved" size={14} primaryColor="#ffffff" />
      </Link>
    </div>
  );
}

export function DashboardVideoCard() {
  const t = useTranslations();
  const [playing, setPlaying] = useState(false);

  const url = DASHBOARD_VIDEO.url;
  if (!url) return <AnimationCard />;

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
