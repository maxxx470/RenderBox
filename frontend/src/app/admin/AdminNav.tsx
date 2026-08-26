'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Category, User, Wallet, Document } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';

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
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[#ECE3E5] bg-[#F8F5F6] px-3.5 py-5">
      <div className="mb-6.5 flex items-center gap-2.5 px-1.5">
        <div className="h-6.5 w-6.5 rounded-[7px] bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
        <span className="font-[family-name:var(--font-poppins)] text-sm font-semibold text-[#170608]">
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
                  ? 'bg-white font-medium text-[#170608] shadow-[0_1px_4px_#17060814]'
                  : 'text-[#7A6E71] hover:text-[#170608]'
              }`}
            >
              <Icon set="bold" size={16} primaryColor={active ? '#C81120' : 'currentColor'} />
              {t(LABEL_KEY[href])}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-1.5 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#7A6E71]">
        <div>{t('admin.phaseTag')}</div>
        <div>{t('admin.roleLabel', { role })}</div>
        <Link href="/app" className="mt-3 inline-block hover:text-[#170608]">
          {t('admin.backToApp')}
        </Link>
      </div>
    </aside>
  );
}
