'use client';

// /info — updates and announcements.
//
// Planned entries are pulled to the top and visibly separated from shipped
// ones: a reader scanning a changelog assumes everything dated is available,
// so "coming soon" has to be typographically impossible to mistake for
// "released".
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ANNOUNCEMENTS, type Announcement } from './announcements';

function EntryCard({ entry }: { entry: Announcement }) {
  const { locale } = useLocale();
  const t = useTranslations();
  const planned = entry.kind === 'planned';

  return (
    <li
      className={`rounded-2xl border p-5 ${
        planned ? 'border-dashed border-[#DEDEE8] bg-[#FBFBFD]' : 'border-[#ECECF2] bg-white'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <time
          dateTime={entry.date}
          className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]"
        >
          {new Date(entry.date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </time>
        {planned && (
          <span className="rounded-full bg-[#F1F0F6] px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wide text-[#8A8896]">
            {t('info.badgePlanned')}
          </span>
        )}
      </div>
      <h3 className="font-[family-name:var(--font-general-sans)] text-[15.5px] font-semibold text-[#17161F]">
        {entry.title[locale]}
      </h3>
      <p className="mt-1.5 text-[13.5px] leading-[1.6] text-[#3D3B49]">{entry.body[locale]}</p>
    </li>
  );
}

export default function InfoPage() {
  const t = useTranslations();

  const byDateDesc = (a: Announcement, b: Announcement) => b.date.localeCompare(a.date);
  const planned = ANNOUNCEMENTS.filter((e) => e.kind === 'planned').sort(byDateDesc);
  const shipped = ANNOUNCEMENTS.filter((e) => e.kind === 'shipped').sort(byDateDesc);

  return (
    <main className="min-h-screen">
      <SiteHeader links cta={{ href: '/app', label: t('landing.navStart') }} />
      <div className="mx-auto max-w-[720px] px-6 py-12">
        <h1 className="font-[family-name:var(--font-general-sans)] text-[28px] font-bold tracking-[-0.5px] text-[#17161F]">
          {t('info.title')}
        </h1>
        <p className="mt-2.5 text-[14px] leading-[1.6] text-[#6B6880]">{t('info.subtitle')}</p>

        {planned.length > 0 && (
          <section className="mt-9">
            <h2 className="mb-3.5 font-[family-name:var(--font-general-sans)] text-[13px] font-semibold text-[#8A8896]">
              {t('info.plannedHeading')}
            </h2>
            <ul className="flex flex-col gap-3">
              {planned.map((e) => (
                <EntryCard key={e.id} entry={e} />
              ))}
            </ul>
          </section>
        )}

        <section className="mt-9">
          {/* The group caption only earns its line when there is a second
              group to tell it apart from. With nothing planned it repeats the
              page title word for word, one line below it. */}
          {planned.length > 0 && (
            <h2 className="mb-3.5 font-[family-name:var(--font-general-sans)] text-[13px] font-semibold text-[#8A8896]">
              {t('info.shippedHeading')}
            </h2>
          )}
          {shipped.length === 0 ? (
            <p className="text-[13.5px] text-[#8A8896]">{t('info.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {shipped.map((e) => (
                <EntryCard key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
