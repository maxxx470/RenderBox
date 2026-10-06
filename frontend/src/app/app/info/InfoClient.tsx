'use client';

import { useLocale } from '@/lib/i18n/LocaleContext';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { AnnouncementList } from '@/app/info/AnnouncementList';
import { MotionFilm } from '@/app/MotionFilm';

/** The landing's three feature films, shown here too so the features are
 *  explained inside the app, not only to visitors (owner's brief,
 *  2026-10-06). Same files as the landing: public/motion/<id>-<locale>.mp4. */
const FILMS = [
  {
    id: 'etapes',
    title: 'dashboard.howTitle',
    body: 'info.filmEtapesBody',
    alt: 'dashboard.filmAlt',
  },
  {
    id: 'commenter',
    title: 'landing.commentTitle',
    body: 'landing.commentSubtitle',
    alt: 'landing.commentAlt',
  },
  { id: 'arbre', title: 'landing.treeTitle', body: 'landing.treeSubtitle', alt: 'landing.treeAlt' },
  {
    id: 'moteurs',
    title: 'landing.enginesTitle',
    body: 'landing.enginesSubtitle',
    alt: 'landing.enginesAlt',
  },
] as const;

export function InfoClient({ surface }: { surface: AppSurfaceProps }) {
  const { t, locale } = useLocale();

  return (
    <AppSurface {...surface} title={t('info.title')} subtitle={t('info.subtitle')}>
      {/* Narrower than the frame's 1100px. A changelog is prose, and prose
          set across a full-width dashboard column runs to ~140 characters a
          line — roughly twice the distance an eye can carry a line break
          reliably. */}
      <div className="max-w-[760px]">
        <section className="mb-10">
          <h2 className="mb-4 font-[family-name:var(--font-display)] text-[17px] font-semibold text-[#17161F]">
            {t('info.guideTitle')}
          </h2>
          <div className="flex flex-col gap-5">
            {FILMS.map((f) => (
              <article
                key={f.id}
                className="rounded-[20px] border border-[#ECECF2] bg-[#F7F7FA] p-3 min-[640px]:p-4"
              >
                <div className="mb-3 px-1">
                  <h3 className="font-[family-name:var(--font-display)] text-[16px] font-semibold text-[#17161F]">
                    {t(f.title)}
                  </h3>
                  <p className="mt-0.5 text-[13px] leading-[1.5] text-[#5F6B64]">{t(f.body)}</p>
                </div>
                <MotionFilm
                  src={`/motion/${f.id}-${locale}.mp4`}
                  poster={`/motion/${f.id}-${locale}.jpg`}
                  label={t(f.alt)}
                  className="rounded-[14px]"
                />
              </article>
            ))}
          </div>
        </section>
        <AnnouncementList />
      </div>
    </AppSurface>
  );
}
