'use client';

import { useLocale } from '@/lib/i18n/LocaleContext';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { MotionFilm } from '@/app/MotionFilm';

/** The landing's feature films, shown here too so the features are explained
 *  inside the app, not only to visitors (owner's brief, 2026-10-06). Same
 *  files as the landing: public/motion/<id>-<locale>.mp4. A new film is one
 *  more line here; the grid takes it in, two per row. */
const FILMS = [
  { id: 'etapes', alt: 'dashboard.filmAlt' },
  { id: 'commenter', alt: 'landing.commentAlt' },
  { id: 'arbre', alt: 'landing.treeAlt' },
  { id: 'moteurs', alt: 'landing.enginesAlt' },
] as const;

/**
 * 2026-10-08 (owner): only the films, two per row — no caption under them and
 * no written changelog below ("les utilisateurs comprendront mieux que du
 * texte écrit"). The changelog still lives on the public /info page.
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
          <MotionFilm
            key={f.id}
            src={`/motion/${f.id}-${locale}.mp4`}
            poster={`/motion/${f.id}-${locale}.jpg`}
            label={t(f.alt)}
            className="rounded-[18px]"
          />
        ))}
      </div>
    </AppSurface>
  );
}
