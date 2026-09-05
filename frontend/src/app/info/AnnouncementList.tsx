'use client';

// The changelog itself, without any page chrome around it.
//
// There are two Informations pages: the public one at /info, which wears the
// landing's header and is what a visitor reaches from the footer, and the
// in-app one at /app/info, which wears the workspace rail. They show the same
// announcements, so the list lives here and each page brings its own frame.
//
// Planned entries are pulled to the top and visibly separated from shipped
// ones: a reader scanning a changelog assumes everything dated is available,
// so "coming soon" has to be typographically impossible to mistake for
// "released".
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
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

export function AnnouncementList() {
  const t = useTranslations();

  const byDateDesc = (a: Announcement, b: Announcement) => b.date.localeCompare(a.date);
  const planned = ANNOUNCEMENTS.filter((e) => e.kind === 'planned').sort(byDateDesc);
  const shipped = ANNOUNCEMENTS.filter((e) => e.kind === 'shipped').sort(byDateDesc);

  return (
    <>
      {planned.length > 0 && (
        <section className="mb-9">
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

      <section>
        {/* The group caption only earns its line when there is a second group
            to tell it apart from. With nothing planned it repeats the page
            title word for word, one line below it. */}
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
    </>
  );
}
