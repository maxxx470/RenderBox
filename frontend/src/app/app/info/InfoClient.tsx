'use client';

import { useTranslations } from '@/lib/i18n/LocaleContext';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { AnnouncementList } from '@/app/info/AnnouncementList';

export function InfoClient({ surface }: { surface: AppSurfaceProps }) {
  const t = useTranslations();

  return (
    <AppSurface {...surface} title={t('info.title')} subtitle={t('info.subtitle')}>
      {/* Narrower than the frame's 1100px. A changelog is prose, and prose
          set across a full-width dashboard column runs to ~140 characters a
          line — roughly twice the distance an eye can carry a line break
          reliably. */}
      <div className="max-w-[760px]">
        <AnnouncementList />
      </div>
    </AppSurface>
  );
}
