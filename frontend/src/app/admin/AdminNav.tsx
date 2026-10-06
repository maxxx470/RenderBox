'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Category, User, Wallet, Document } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { BrandMark } from '@/components/BrandMark';

const NAV = [
  { href: '/admin', icon: Category },
  { href: '/admin/utilisateurs', icon: User },
  { href: '/admin/paiements', icon: Wallet },
  { href: '/admin/journal', icon: Document },
] as const;

const LABEL_KEY: Record<
  (typeof NAV)[number]['href'],
  'admin.navOverview' | 'admin.navUsers' | 'admin.navPayments' | 'admin.navJournal'
> = {
  '/admin': 'admin.navOverview',
  '/admin/utilisateurs': 'admin.navUsers',
  '/admin/paiements': 'admin.navPayments',
  '/admin/journal': 'admin.navJournal',
};

export function AdminNav({ role }: { role: string }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <aside className="hidden w-[210px] shrink-0 flex-col border-r border-[#ECECF2] bg-[#F7F7FA] px-3.5 py-5 min-[900px]:flex">
      <div className="mb-6.5 flex items-center gap-2.5 px-1.5">
        <BrandMark />
        <span className="font-[family-name:var(--font-general-sans)] text-sm font-semibold text-[#17161F]">
          RenderBox
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, icon: Icon }) => {
          const active =
            pathname === href || (href !== '/admin' && pathname?.startsWith(href + '/'));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px] ${
                active
                  ? 'bg-white font-medium text-[#17161F] shadow-[0_1px_4px_#17161F14]'
                  : 'text-[#8A8896] hover:text-[#17161F]'
              }`}
            >
              <Icon set="light" size={16} primaryColor={active ? '#16A34A' : 'currentColor'} />
              {t(LABEL_KEY[href])}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#8A8896]">
        <div>{t('admin.roleLabel', { role })}</div>
        <Link href="/app" className="mt-3 inline-block hover:text-[#17161F]">
          {t('admin.backToApp')}
        </Link>
      </div>
    </aside>
  );
}

/**
 * Below 900px the side column gives way to a floating pill at the bottom of
 * the screen, the same shape as the app's MobileNav: the four sections, the
 * current one on the green tint.
 */
export function AdminMobileNav() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 min-[900px]:hidden">
      <div className="pointer-events-auto flex justify-center px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-1 rounded-full border border-[#ECECF2] bg-white/95 p-1.5 shadow-[0_8px_30px_rgba(23,22,31,0.10)] backdrop-blur-md">
          {NAV.map(({ href, icon: Icon }) => {
            const active =
              pathname === href || (href !== '/admin' && pathname?.startsWith(href + '/'));
            return (
              <Link
                key={href}
                href={href}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                className={`flex h-[52px] w-[68px] flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-medium ${
                  active ? 'bg-[#E8F5EC] text-[#166534]' : 'text-[#3D3B49]'
                }`}
              >
                <Icon set="light" size={19} primaryColor="#15803D" />
                <span className="max-w-full truncate px-1">{t(LABEL_KEY[href])}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
