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
//     going to teach, in the space it was going to occupy: the three steps of
//     a render, and a live link to real output. It used to render a dead
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
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { DASHBOARD_VIDEO, toEmbedUrl } from './dashboard-media';

const FRAME =
  'relative aspect-[16/9] overflow-hidden rounded-2xl border border-[#DEDEE8] min-[900px]:aspect-auto min-[900px]:h-[210px]';

/** The three steps, as short as they can be while still naming a real action. */
const STEP_KEYS = ['dashboard.step1', 'dashboard.step2', 'dashboard.step3'] as const;

function HowItWorks() {
  const t = useTranslations();
  return (
    <div className={`${FRAME} bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]`}>
      <div className="flex h-full flex-col justify-between p-5">
        <h3 className="max-w-[280px] font-[family-name:var(--font-general-sans)] text-[19px] font-bold leading-[1.15] text-white">
          {t('dashboard.howTitle')}
        </h3>

        {/* Numbered because the steps are an order, not a list of features —
            you cannot pick an ambiance before there is a drawing to apply it
            to. Wraps rather than scrolls: three short labels always fit. */}
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {STEP_KEYS.map((key, i) => (
            <li key={key} className="flex items-center gap-2">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/25 font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] font-semibold text-white">
                {i + 1}
              </span>
              <span className="text-[12.5px] font-medium text-white">{t(key)}</span>
              {i < STEP_KEYS.length - 1 && (
                <span aria-hidden className="ml-0.5 h-px w-3 bg-white/35" />
              )}
            </li>
          ))}
        </ol>

        <Link
          href="/exemple"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-[12.5px] font-semibold text-[#17161F] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
        >
          {t('dashboard.howCta')}
          <ArrowRight set="light" size={14} primaryColor="#716FFF" />
        </Link>
      </div>
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
    <div className={`${FRAME} bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]`}>
      {DASHBOARD_VIDEO.poster && (
        <img src={DASHBOARD_VIDEO.poster} alt="" className="h-full w-full object-cover" />
      )}
      {/* Scrim only under the text, so a real still keeps its own contrast. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <h3 className="max-w-[260px] font-[family-name:var(--font-general-sans)] text-[21px] font-bold leading-[1.15] text-white">
          {t('dashboard.videoTitle')}
        </h3>
        <div className="mt-3.5">
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-[12.5px] font-semibold text-[#17161F] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Play set="light" size={14} primaryColor="#716FFF" />
            {t('dashboard.videoPlay')}
          </button>
        </div>
      </div>
    </div>
  );
}
