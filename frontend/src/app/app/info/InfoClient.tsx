'use client';

import { useLocale } from '@/lib/i18n/LocaleContext';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { MotionFilm } from '@/app/MotionFilm';
import { motionFilm } from '@/app/motion-media';

/** The landing's feature films, shown here too so the features are explained
 *  inside the app, not only to visitors (owner's brief, 2026-10-06). Same
 *  files as the landing (see motion-media.ts). A new film is one
 *  more line here; the grid takes it in, two per row. */
const FILMS = [
  { id: 'etapes', title: 'info.filmEtapesTitle', alt: 'dashboard.filmAlt' },
  { id: 'commenter', title: 'info.filmCommenterTitle', alt: 'landing.commentAlt' },
  { id: 'arbre', title: 'info.filmArbreTitle', alt: 'landing.treeAlt' },
  { id: 'moteurs', title: 'info.filmMoteursTitle', alt: 'landing.enginesAlt' },
  { id: 'ajouter', title: 'info.filmAjouterTitle', alt: 'landing.addAlt' },
] as const;

/**
 * 2026-10-08 (owner): the films two per row, each introduced by a short
 * title saying what it shows — no paragraph under them and no written
 * changelog below ("les utilisateurs comprendront mieux que du texte
 * écrit"). The changelog still lives on the public /info page.
 */
export function InfoClient({ surface }: { surface: AppSurfaceProps }) {
  const { t, locale } = useLocale();

  return (
    <AppSurface
      {...surface}
      eyebrow={t('page.infoEyebrow')}
      title={t('app.railInfo')}
      subtitle={t('info.guideTitle')}
    >
      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2 min-[900px]:gap-5">
        {FILMS.map((f) => (
          <figure key={f.id} className="flex flex-col gap-2.5">
            <h2 className="px-1 font-[family-name:var(--font-display)] text-[16px] font-semibold text-[#17161F]">
              {t(f.title)}
            </h2>
            <MotionFilm {...motionFilm(f.id, locale)} label={t(f.alt)} className="rounded-[18px]" />
          </figure>
        ))}
      </div>
    </AppSurface>
  );
}
