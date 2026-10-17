'use client';

import type { ReactNode } from 'react';
import { ArrowRight } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { TIKTOK_ACCOUNT, WHATSAPP_CHANNEL, YOUTUBE_CHANNEL } from '@/lib/community-links';
import { TikTokMark } from '@/app/HeroProof';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { MotionFilm } from '@/app/MotionFilm';
import { motionFilm } from '@/app/motion-media';
import { INFO_FILMS, isNewInfoFilm } from './info-films';

/**
 * 2026-10-08 (owner): the films two per row, each introduced by a short
 * title saying what it shows — no paragraph under them and no written
 * changelog below ("les utilisateurs comprendront mieux que du texte
 * écrit"). The changelog still lives on the public /info page.
 */
export function InfoClient({
  surface,
  since,
}: {
  surface: AppSurfaceProps;
  /** Since when a film counts as new for this account (ISO), see info-films.ts. */
  since: string | null;
}) {
  const { t, locale } = useLocale();

  return (
    <AppSurface
      {...surface}
      eyebrow={t('page.infoEyebrow')}
      title={t('app.railInfo')}
      subtitle={t('info.guideTitle')}
    >
      {/* Where the news is announced (owner, 2026-10-15): the WhatsApp
          channel of the interface's language, the YouTube channel and, since
          2026-10-17, the TikTok account — three in a row on a wide screen. */}
      <section className="mb-6 rounded-[20px] bg-white p-4 min-[640px]:p-5">
        <h2 className="font-[family-name:var(--font-display)] text-[16px] font-semibold text-[#17161F]">
          {t('info.followTitle')}
        </h2>
        <p className="mt-0.5 text-[13px] text-[#6B6878]">{t('info.followSubtitle')}</p>
        <div className="mt-4 grid grid-cols-1 gap-2.5 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-3">
          <ChannelLink
            href={WHATSAPP_CHANNEL[locale]}
            title={t('info.whatsappTitle')}
            line={t('info.whatsappLine')}
            mark={<WhatsAppMark />}
          />
          <ChannelLink
            href={YOUTUBE_CHANNEL}
            title={t('info.youtubeTitle')}
            line={t('info.youtubeLine')}
            mark={<YouTubeMark />}
          />
          <ChannelLink
            href={TIKTOK_ACCOUNT}
            title={t('info.tiktokTitle')}
            line={t('info.tiktokLine')}
            mark={
              <span className="text-[#17161F]">
                <TikTokMark size={20} />
              </span>
            }
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2 min-[900px]:gap-5">
        {INFO_FILMS.map((f) => (
          <figure key={f.id} className="flex flex-col gap-2.5">
            <h2 className="flex items-center gap-2 px-1 font-[family-name:var(--font-display)] text-[16px] font-semibold text-[#17161F]">
              {t(f.title)}
              {/* Published since the last visit (owner, 2026-10-17). */}
              {isNewInfoFilm(f.addedAt, since) && (
                <span className="rounded-md bg-[#FFE4E7] px-1.5 py-0.5 font-[family-name:var(--font-sans)] text-[10.5px] font-bold uppercase tracking-wide text-[#C21F33]">
                  {t('info.filmNew')}
                </span>
              )}
            </h2>
            <MotionFilm
              {...motionFilm(f.id, locale)}
              label={t(f.alt)}
              className="rounded-[18px]"
              expandLabel={t('info.filmExpand')}
            />
          </figure>
        ))}
      </div>
    </AppSurface>
  );
}

function ChannelLink({
  href,
  title,
  line,
  mark,
}: {
  href: string;
  title: string;
  line: string;
  mark: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl bg-[#F7F7FA] p-3 transition-colors hover:bg-[#EEF1FF]"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white">
        {mark}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-[#17161F]">{title}</span>
        <span className="block truncate text-[12.5px] text-[#6B6878]">{line}</span>
      </span>
      <ArrowRight set="curved" size={16} primaryColor="#2948FC" />
    </a>
  );
}

// The two services' own marks, in their own colours (third-party marks keep
// theirs, as the charter says).
function WhatsAppMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#25D366"
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z"
      />
    </svg>
  );
}

function YouTubeMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#FF0000"
        d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8Z"
      />
      <path fill="#fff" d="m9.75 15.02 5.75-3.02-5.75-3.02v6.04Z" />
    </svg>
  );
}
