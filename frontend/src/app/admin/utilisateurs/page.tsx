'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  generationsCount: number;
}

interface UsersPage {
  items: UserRow[];
  nextCursor: string | null;
}

const STATUS_FILTERS = ['', 'ACTIVE', 'SUSPENDED', 'DELETED'] as const;

const FILTER_LABEL_KEY: Record<(typeof STATUS_FILTERS)[number], TranslationKey> = {
  '': 'admin.users.filterAll',
  ACTIVE: 'admin.users.filterActive',
  SUSPENDED: 'admin.users.filterSuspended',
  DELETED: 'admin.users.filterDeleted',
};

function rowStatusBadge(
  u: UserRow,
  t: (key: TranslationKey) => string,
): { label: string; cls: string } {
  if (u.deletedAt)
    return { label: t('admin.users.statusDeleted'), cls: 'bg-[#B8710B14] text-[#B8710B]' };
  if (u.status === 'SUSPENDED')
    return { label: t('admin.users.statusSuspended'), cls: 'bg-[#B8710B14] text-[#B8710B]' };
  return { label: t('admin.users.statusActive'), cls: 'bg-[#1E7A3D14] text-[#1E7A3D]' };
}

export default function AdminUsersPage() {
  const t = useTranslations();
  const [items, setItems] = useState<UserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (opts: { cursor?: string; append?: boolean } = {}) => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (status) params.set('status', status);
        if (opts.cursor) params.set('cursor', opts.cursor);
        const res = await api<UsersPage>(`/api/admin/users?${params.toString()}`);
        setItems((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [q, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-poppins)] text-[19px] font-semibold text-[#170608]">
            {t('admin.users.title')}
          </h1>
          <p className="mt-1 text-[12.5px] text-[#7A6E71]">
            {t('admin.users.subtitle', { count: items.length })}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.users.searchPlaceholder')}
          className="w-64 rounded-[10px] border border-[#ECE3E5] bg-[#F8F5F6] px-3 py-2 text-[13px] text-[#170608] outline-none placeholder:text-[#7A6E71]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUS_FILTERS)[number])}
          className="rounded-[10px] border border-[#ECE3E5] bg-[#F8F5F6] px-3 py-2 text-[13px] text-[#170608] outline-none"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {t(FILTER_LABEL_KEY[s])}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="text-sm text-[#B8710B]">{t('admin.users.loadError')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-[#ECE3E5] px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-wide text-[#7A6E71]">
                  {t('admin.users.colUser')}
                </th>
                <th className="border-b border-[#ECE3E5] px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-wide text-[#7A6E71]">
                  {t('admin.users.colRole')}
                </th>
                <th className="border-b border-[#ECE3E5] px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-wide text-[#7A6E71]">
                  {t('admin.users.colStatus')}
                </th>
                <th className="border-b border-[#ECE3E5] px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-wide text-[#7A6E71]">
                  {t('admin.overview.statGenerations')}
                </th>
                <th className="border-b border-[#ECE3E5] px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-wide text-[#7A6E71]">
                  {t('admin.users.colJoined')}
                </th>
                <th className="border-b border-[#ECE3E5] px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-wide text-[#7A6E71]" />
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const badge = rowStatusBadge(u, t);
                return (
                  <tr key={u.id} className="hover:bg-[#F8F5F6]">
                    <td className="border-b border-[#ECE3E5] px-3.5 py-3 text-[13px]">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#E8121F] to-[#7F0000] opacity-85" />
                        <span className="text-[#170608]">{u.name || u.email}</span>
                      </div>
                    </td>
                    <td className="border-b border-[#ECE3E5] px-3.5 py-3">
                      <span className="rounded-lg bg-[#C8112012] px-2 py-0.5 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#C81120]">
                        {u.role}
                      </span>
                    </td>
                    <td className="border-b border-[#ECE3E5] px-3.5 py-3">
                      <span
                        className={`rounded-lg px-2 py-0.5 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="border-b border-[#ECE3E5] px-3.5 py-3 text-[13px] text-[#170608]">
                      {u.generationsCount}
                    </td>
                    <td className="border-b border-[#ECE3E5] px-3.5 py-3 text-[13px] text-[#170608]">
                      {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="border-b border-[#ECE3E5] px-3.5 py-3">
                      <Link
                        href={`/admin/utilisateurs/${u.id}`}
                        className="text-[12px] font-medium text-[#C81120] hover:underline"
                      >
                        {t('admin.users.viewAction')}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && items.length === 0 ? (
            <p className="mt-6 text-sm text-[#7A6E71]">{t('admin.users.empty')}</p>
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              onClick={() => void load({ cursor: nextCursor, append: true })}
              disabled={loading}
              className="mt-4 rounded-[10px] border border-[#ECE3E5] px-4 py-2 text-[13px] font-medium text-[#170608] hover:bg-[#F8F5F6] disabled:opacity-50"
            >
              {t('admin.users.loadMore')}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
