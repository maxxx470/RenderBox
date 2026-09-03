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
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[#ECECF2] bg-[#F7F7FA] px-3.5 py-5">
      <div className="mb-6.5 flex items-center gap-2.5 px-1.5">
        <div className="h-6.5 w-6.5 rounded-[7px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]" />
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
              <Icon set="light" size={16} primaryColor={active ? '#716FFF' : 'currentColor'} />
              {t(LABEL_KEY[href])}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#8A8896]">
        <div>{t('admin.phaseTag')}</div>
        <div>{t('admin.roleLabel', { role })}</div>
        <Link href="/app" className="mt-3 inline-block hover:text-[#17161F]">
          {t('admin.backToApp')}
        </Link>
      </div>
    </aside>
  );
}
