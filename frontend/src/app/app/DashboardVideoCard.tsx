'use client';

// Left banner of the dashboard: a short video about the product.
//
// Facade pattern — the card shows a still and a play button, and the actual
// player is only injected on click. Embedding an iframe on load would pull
// YouTube's scripts and cookies into every dashboard visit for a video most
// people never start.
//
// With no video configured (see dashboard-media.ts) the button is rendered
// but disabled, with a "soon" badge. A live-looking button that opens nothing
// is worse than an honest empty state.
import { useState } from 'react';
import { Play } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { DASHBOARD_VIDEO, toEmbedUrl } from './dashboard-media';

export function DashboardVideoCard() {
  const t = useTranslations();
  const [playing, setPlaying] = useState(false);

  const url = DASHBOARD_VIDEO.url;
  const embed = url ? toEmbedUrl(url) : null;

  if (playing && url) {
    return (
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-[#DEDEE8] bg-black min-[900px]:aspect-auto min-[900px]:h-[210px]">
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
    <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-[#DEDEE8] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] min-[900px]:aspect-auto min-[900px]:h-[210px]">
      {DASHBOARD_VIDEO.poster && (
        <img src={DASHBOARD_VIDEO.poster} alt="" className="h-full w-full object-cover" />
      )}
      {/* Scrim only under the text, so a real still keeps its own contrast. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

      <div className="absolute inset-0 flex flex-col justify-end p-5">
        <h3 className="max-w-[260px] font-[family-name:var(--font-general-sans)] text-[21px] font-bold leading-[1.15] text-white">
          {t('dashboard.videoTitle')}
        </h3>
        <div className="mt-3.5 flex items-center gap-2.5">
          <button
            type="button"
            disabled={!url}
            onClick={() => setPlaying(true)}
            className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 text-[12.5px] font-semibold text-[#17161F] transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play set="light" size={14} primaryColor="#716FFF" />
            {t('dashboard.videoPlay')}
          </button>
          {!url && (
            <span className="rounded-full bg-white/20 px-2 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-white">
              {t('app.modeSoonBadge')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
