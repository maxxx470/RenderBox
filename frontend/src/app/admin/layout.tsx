// /admin/* layout — Phase 6. Client-side gate via GET /api/admin/me
// (mirrors examples/frontend-pages/admin/layout.tsx's pattern, restyled to
// RenderBox's charter). The real gate is server-side (every /api/admin/*
// route calls requireAdmin independently) — this is UX-only, so a client
// who lies about role cannot reach data, only a confusing redirect loop.
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { AdminMobileNav, AdminNav } from './AdminNav';

interface AdminMe {
  admin: { id: string; email: string; role: 'ADMIN' | 'SUPERADMIN' };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
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

  return (
    <div className="flex min-h-screen bg-[#EEEEF1]">
      <AdminNav role={admin.role} />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-[calc(104px+env(safe-area-inset-bottom))] pt-5 min-[640px]:px-8 min-[640px]:pt-6.5 min-[900px]:pb-6.5">
        {children}
      </main>
      <AdminMobileNav />
    </div>
  );
}
