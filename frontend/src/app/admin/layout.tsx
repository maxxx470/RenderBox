// /admin/* layout — Phase 6. Client-side gate via GET /api/admin/me
// (mirrors examples/frontend-pages/admin/layout.tsx's pattern, restyled to
// RenderBox's charter). The real gate is server-side (every /api/admin/*
// route calls requireAdmin independently) — this is UX-only, so a client
// who lies about role cannot reach data, only a confusing redirect loop.
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { BrandMark } from '@/components/BrandMark';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { AdminMobileNav, AdminNav, adminTitleKey } from './AdminNav';

interface AdminMe {
  admin: { id: string; email: string; role: 'ADMIN' | 'SUPERADMIN' };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminMe['admin'] | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AdminMe>('/api/admin/me');
        if (!cancelled) setAdmin(res.admin);
      } catch (err) {
        if (!cancelled) {
          router.replace(err instanceof ApiError && err.status === 401 ? '/connexion' : '/app');
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked || !admin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-sm text-[#8A8896]">
        {t('admin.checkingAccess')}
      </main>
    );
  }

  // The app's frame (2026-10-15): the rail flush left, a 63px header bar with
  // the page's name, the page scrolling in its own column.
  return (
    <div className="flex h-dvh overflow-hidden bg-[#EEEEF1]">
      <AdminNav role={admin.role} email={admin.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b border-[#ECECF2] bg-white px-4 min-[640px]:px-6 min-[900px]:h-[63px]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="min-[900px]:hidden">
              <BrandMark />
            </span>
            <h1 className="truncate font-[family-name:var(--font-display)] text-[16px] font-semibold text-[#17161F] min-[640px]:text-[19px]">
              {t(adminTitleKey(pathname))}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-lg bg-[#EEF1FF] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] font-semibold text-[#1E36D6] min-[480px]:inline">
              {t('admin.badge')}
            </span>
            <LanguageInlineSwitch className="rounded-lg bg-[#F2F2F5] px-2.5 py-1.5" />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-[calc(104px+env(safe-area-inset-bottom))] pt-5 min-[640px]:px-8 min-[640px]:pt-6.5 min-[900px]:pb-8">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
      </div>
      <AdminMobileNav />
    </div>
  );
}
