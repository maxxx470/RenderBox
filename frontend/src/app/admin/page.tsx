'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';

interface Stats {
  activeAccounts: number;
  suspendedAccounts: number;
  generationsThisMonth: number;
  maketouRevenueXof: number;
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-[14px] border border-[#ECE3E5] px-4.5 py-4">
      <div className="mb-2 text-[11px] text-[#7A6E71]">{label}</div>
      <div className="font-[family-name:var(--font-poppins)] text-[22px] font-bold text-[#170608]">
        {value}
        {suffix ? (
          <small className="ml-1.5 font-[family-name:var(--font-ibm-plex-mono)] text-[11px] font-medium text-[#7A6E71]">
            {suffix}
          </small>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const t = useTranslations();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<Stats>('/api/admin/stats');
        if (!cancelled) setStats(res);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-poppins)] text-[19px] font-semibold text-[#170608]">
          {t('admin.overview.title')}
        </h1>
        <p className="mt-1 text-[12.5px] text-[#7A6E71]">{t('admin.overview.subtitle')}</p>
      </div>

      {error ? (
        <p className="text-sm text-[#B8710B]">{t('admin.overview.loadError')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
          <StatCard
            label={t('admin.overview.statActiveAccounts')}
            value={stats ? String(stats.activeAccounts) : '—'}
          />
          <StatCard
            label={t('admin.overview.statGenerations')}
            value={stats ? String(stats.generationsThisMonth) : '—'}
          />
          <StatCard
            label={t('admin.overview.statRevenue')}
            value={stats ? stats.maketouRevenueXof.toLocaleString('fr-FR') : '—'}
            suffix="FCFA"
          />
          <StatCard
            label={t('admin.overview.statSuspended')}
            value={stats ? String(stats.suspendedAccounts) : '—'}
          />
        </div>
      )}

      <div className="mt-8">
        <Link
          href="/admin/journal"
          className="text-[13px] font-medium text-[#C81120] hover:underline"
        >
          {t('admin.overview.viewAllJournal')}
        </Link>
      </div>
    </div>
  );
}
