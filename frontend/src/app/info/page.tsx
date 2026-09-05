'use client';

// /info — the PUBLIC Informations page: the landing's header, the landing's
// footer, and the changelog between them. This is the one a visitor reaches
// from the footer or the nav.
//
// Its in-app twin is /app/info, which shows the same announcements inside the
// workspace rail. Both render <AnnouncementList/>; only the frame differs.
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AnnouncementList } from './AnnouncementList';

export default function InfoPage() {
  const t = useTranslations();

  return (
    <main className="min-h-screen">
      <SiteHeader links cta={{ href: '/app', label: t('landing.navStart') }} />
      <div className="mx-auto max-w-[720px] px-6 py-12">
        <h1 className="font-[family-name:var(--font-general-sans)] text-[28px] font-bold tracking-[-0.5px] text-[#17161F]">
          {t('info.title')}
        </h1>
        <p className="mb-9 mt-2.5 text-[14px] leading-[1.6] text-[#6B6880]">{t('info.subtitle')}</p>
        <AnnouncementList />
      </div>
      <SiteFooter />
    </main>
  );
}
