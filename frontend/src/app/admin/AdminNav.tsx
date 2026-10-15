'use client';

// The back-office's navigation (2026-10-15, owner: « crée l'espace admin »),
// drawn like the app's rail: white, full height against the left edge, a
// hairline on its right, the logo row 63px, the current page on the blue
// tint. Five sections — overview, users, renders, payments, journal — and
// the way back to the app at the bottom. Below 900px a floating bar at the
// bottom, the same shape as the app's MobileNav.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Category, Document, Image as ImageIcon, User, Wallet } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { BrandMark, Wordmark } from '@/components/BrandMark';

const NAV: { href: string; icon: typeof Category; label: TranslationKey; short: TranslationKey }[] =
  [
    { href: '/admin', icon: Category, label: 'admin.navOverview', short: 'admin.navOverviewShort' },
    { href: '/admin/utilisateurs', icon: User, label: 'admin.navUsers', short: 'admin.navUsers' },
    {
      href: '/admin/rendus',
      icon: ImageIcon,
      label: 'admin.navRenders',
      short: 'admin.navRenders',
    },
    {
      href: '/admin/paiements',
      icon: Wallet,
      label: 'admin.navPayments',
      short: 'admin.navPayments',
    },
    {
      href: '/admin/journal',
      icon: Document,
      label: 'admin.navJournal',
      short: 'admin.navJournalShort',
    },
  ];

const isActive = (pathname: string | null, href: string) =>
  pathname === href || (href !== '/admin' && !!pathname?.startsWith(href + '/'));

export function AdminNav({ role, email }: { role: string; email: string }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <aside className="hidden h-dvh w-[236px] shrink-0 flex-col border-r border-[#ECECF2] bg-white min-[900px]:flex">
      <div className="flex h-[63px] items-center gap-2.5 border-b border-[#ECECF2] px-5">
        <BrandMark />
        <Wordmark className="text-[16px]" />
      </div>

      <div className="px-3 pt-4">
        <p className="px-3 pb-2 text-[12px] text-[#8A8896]">{t('admin.sectionLabel')}</p>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors ${
                  active
                    ? 'bg-[#EEF1FF] font-semibold text-[#17161F]'
                    : 'text-[#3D3B49] hover:bg-[#F7F7FA]'
                }`}
              >
                <Icon set="curved" size={19} primaryColor={active ? '#2948FC' : '#3D3B49'} />
                {t(label)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-[#ECECF2] p-3">
        <Link
          href="/app"
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] text-[#3D3B49] transition-colors hover:bg-[#F7F7FA]"
        >
          <ArrowLeft set="curved" size={19} primaryColor="#3D3B49" />
          {t('admin.backToApp')}
        </Link>
        <div className="mt-2 flex items-center gap-2.5 px-3 py-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#F7F7FA] text-[12px] font-semibold text-[#2948FC]">
            {email.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium text-[#17161F]">{email}</span>
            <span className="block font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
              {role}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}

export function AdminMobileNav() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 min-[900px]:hidden">
      <div className="pointer-events-auto flex justify-center px-3 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-1 rounded-2xl bg-white/95 p-1.5 shadow-[0_8px_30px_rgba(23,22,31,0.10)] backdrop-blur-md">
          {NAV.map(({ href, icon: Icon, short }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={`flex h-[52px] w-[60px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[10.5px] font-medium ${
                  active ? 'bg-[#EEF1FF] text-[#1E36D6]' : 'text-[#3D3B49]'
                }`}
              >
                <Icon set="curved" size={19} primaryColor="#2948FC" />
                <span className="max-w-full truncate px-1">{t(short)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** The page title shown in the admin's header bar. */
export function adminTitleKey(pathname: string | null): TranslationKey {
  const hit = [...NAV].reverse().find((n) => isActive(pathname, n.href));
  return hit?.label ?? 'admin.navOverview';
}
