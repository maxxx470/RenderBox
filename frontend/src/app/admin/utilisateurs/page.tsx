'use client';

// /admin/utilisateurs — every account (2026-10-15: with what RenderPro needs to
// see at a glance — profession, country, plan, credits left, renders made),
// searchable by email or name, filtered by status; a row opens the file.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { TIER_NAME_KEY } from '../../PricingCard';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  generationsCount: number;
  profession: string | null;
  country: string | null;
  currentTier: string | null;
  tierPeriodStart: string | null;
  creditsBalance: number;
  onboardedAt: string | null;
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

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

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

const TH =
  'border-b border-[#ECECF2] px-3.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#8A8896]';
const TD = 'border-b border-[#ECECF2] px-3.5 py-3 text-[13px] text-[#17161F]';

export default function AdminUsersPage() {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
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

  const profession = (k: string | null) => {
    if (!k) return '—';
    const key = `onboarding.profession.${k}` as TranslationKey;
    const s = t(key);
    return s === key ? k : s;
  };
  // A plan counts only while its 30-day period runs.
  const plan = (u: UserRow) =>
    u.currentTier &&
    u.tierPeriodStart &&
    Date.now() - new Date(u.tierPeriodStart).getTime() < PERIOD_MS &&
    u.currentTier in TIER_NAME_KEY
      ? t(TIER_NAME_KEY[u.currentTier as PricingTierId])
      : null;

  return (
    <div>
      <p className="mb-4 text-[13px] text-[#6B6878]">
        {t('admin.users.subtitle', { count: items.length })}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('admin.users.searchPlaceholder')}
          className="h-10 w-full rounded-xl border border-[#ECECF2] bg-white px-3.5 text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896] focus:border-[#2948FC] min-[640px]:w-72"
        />
        <div className="flex gap-1 rounded-xl bg-white p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`h-8 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
                status === s ? 'bg-[#2948FC] text-white' : 'text-[#3D3B49] hover:bg-[#F2F2F5]'
              }`}
            >
              {t(FILTER_LABEL_KEY[s])}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[#B8710B]">{t('admin.users.loadError')}</p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] bg-white">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>{t('admin.users.colUser')}</th>
                <th className={TH}>{t('admin.users.colProfession')}</th>
                <th className={TH}>{t('admin.users.colCountry')}</th>
                <th className={TH}>{t('admin.users.colPlan')}</th>
                <th className={`${TH} text-right`}>{t('admin.users.colCredits')}</th>
                <th className={`${TH} text-right`}>{t('admin.users.colRenders')}</th>
                <th className={TH}>{t('admin.users.colStatus')}</th>
                <th className={TH}>{t('admin.users.colJoined')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const badge = rowStatusBadge(u, t);
                const p = plan(u);
                return (
                  <tr key={u.id} className="transition-colors hover:bg-[#F7F7FA]">
                    <td className={TD}>
                      <Link
                        href={`/admin/utilisateurs/${u.id}`}
                        className="flex items-center gap-2.5"
                      >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#F7F7FA] text-[12px] font-semibold text-[#2948FC]">
                          {(u.name || u.email).charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium hover:underline">
                              {u.name || u.email}
                            </span>
                            {u.role !== 'USER' && (
                              <span className="rounded-md bg-[#EEF1FF] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[9.5px] text-[#1E36D6]">
                                {u.role}
                              </span>
                            )}
                          </span>
                          {u.name && (
                            <span className="block truncate text-[11.5px] text-[#8A8896]">
                              {u.email}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className={TD}>
                      {u.onboardedAt ? (
                        profession(u.profession)
                      ) : (
                        <span className="text-[12px] text-[#B8710B]">
                          {t('admin.users.notOnboarded')}
                        </span>
                      )}
                    </td>
                    <td className={TD}>{u.country || '—'}</td>
                    <td className={TD}>
                      {p ? (
                        <span className="rounded-md bg-[#EEF1FF] px-2 py-0.5 text-[11.5px] font-semibold text-[#1E36D6]">
                          {p}
                        </span>
                      ) : (
                        <span className="text-[#8A8896]">—</span>
                      )}
                    </td>
                    <td
                      className={`${TD} text-right font-[family-name:var(--font-mono)] text-[12px]`}
                    >
                      {u.creditsBalance.toLocaleString(intl)}
                    </td>
                    <td
                      className={`${TD} text-right font-[family-name:var(--font-mono)] text-[12px]`}
                    >
                      {u.generationsCount}
                    </td>
                    <td className={TD}>
                      <span
                        className={`rounded-md px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td
                      className={`${TD} font-[family-name:var(--font-mono)] text-[11.5px] text-[#6B6878]`}
                    >
                      {new Date(u.createdAt).toLocaleDateString(intl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && items.length === 0 ? (
            <p className="p-6 text-sm text-[#8A8896]">{t('admin.users.empty')}</p>
          ) : null}
        </div>
      )}
      {nextCursor ? (
        <button
          type="button"
          onClick={() => void load({ cursor: nextCursor, append: true })}
          disabled={loading}
          className="mt-4 rounded-xl bg-white px-4 py-2 text-[13px] font-medium text-[#17161F] hover:bg-[#F2F2F5] disabled:opacity-50"
        >
          {t('admin.users.loadMore')}
        </button>
      ) : null}
    </div>
  );
}
