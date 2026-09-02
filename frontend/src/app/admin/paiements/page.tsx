'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';

interface OrderRow {
  id: string;
  userId: string | null;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string | null;
  provider: string;
  createdAt: string;
}
interface OrdersPage {
  items: OrderRow[];
  nextCursor: string | null;
}

const STATUS_FILTERS = ['', 'PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUNDED'] as const;

const STATUS_KEY: Record<string, TranslationKey> = {
  PENDING: 'admin.payments.statusPending',
  PAID: 'admin.payments.statusPaid',
  EXPIRED: 'admin.payments.statusExpired',
  FAILED: 'admin.payments.statusFailed',
  REFUNDED: 'admin.payments.statusRefunded',
};

const STATUS_CLS: Record<string, string> = {
  PENDING: 'bg-[#B8710B14] text-[#B8710B]',
  PAID: 'bg-[#1E7A3D14] text-[#1E7A3D]',
  EXPIRED: 'bg-[#8A889614] text-[#8A8896]',
  FAILED: 'bg-[#E5484D12] text-[#E5484D]',
  REFUNDED: 'bg-[#8A889614] text-[#8A8896]',
};

export default function AdminPaymentsPage() {
  const t = useTranslations();
  const [items, setItems] = useState<OrderRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('');
  const [error, setError] = useState(false);

  const load = useCallback(
    async (opts: { cursor?: string; append?: boolean } = {}) => {
      setError(false);
      try {
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (status) params.set('status', status);
        if (opts.cursor) params.set('cursor', opts.cursor);
        const res = await api<OrdersPage>(`/api/admin/orders?${params.toString()}`);
        setItems((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch {
        setError(true);
      }
    },
    [email, status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-general-sans)] text-[19px] font-semibold text-[#17161F]">
          {t('admin.payments.title')}
        </h1>
        <p className="mt-1 text-[12.5px] text-[#8A8896]">{t('admin.payments.subtitle')}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('admin.users.searchPlaceholder')}
          className="w-64 rounded-[10px] border border-[#ECECF2] bg-[#F7F7FA] px-3 py-2 text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUS_FILTERS)[number])}
          className="rounded-[10px] border border-[#ECECF2] bg-[#F7F7FA] px-3 py-2 text-[13px] text-[#17161F] outline-none"
        >
          <option value="">{t('admin.payments.filterAll')}</option>
          {STATUS_FILTERS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {t(STATUS_KEY[s]!)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="text-sm text-[#B8710B]">{t('admin.payments.loadError')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                {[
                  t('admin.payments.colId'),
                  t('admin.payments.colUser'),
                  t('admin.payments.colAmount'),
                  t('admin.payments.colStatus'),
                  t('admin.payments.colDate'),
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-[#ECECF2] px-3.5 py-2.5 text-left text-[10.5px] uppercase tracking-wide text-[#8A8896]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id} className="hover:bg-[#F7F7FA]">
                  <td className="border-b border-[#ECECF2] px-3.5 py-3 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
                    {o.id.slice(0, 10)}
                  </td>
                  <td className="border-b border-[#ECECF2] px-3.5 py-3 text-[13px] text-[#17161F]">
                    {o.customerEmail ?? '—'}
                  </td>
                  <td className="border-b border-[#ECECF2] px-3.5 py-3 text-[13px] text-[#17161F]">
                    {o.amount.toLocaleString('fr-FR')} {o.currency}
                  </td>
                  <td className="border-b border-[#ECECF2] px-3.5 py-3">
                    <span
                      className={`rounded-lg px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] ${STATUS_CLS[o.status] ?? ''}`}
                    >
                      {t(STATUS_KEY[o.status] ?? 'admin.payments.statusPending')}
                    </span>
                  </td>
                  <td className="border-b border-[#ECECF2] px-3.5 py-3 text-[13px] text-[#17161F]">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? (
            <p className="mt-6 text-sm text-[#8A8896]">{t('admin.payments.empty')}</p>
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              onClick={() => void load({ cursor: nextCursor, append: true })}
              className="mt-4 rounded-[10px] border border-[#ECECF2] px-4 py-2 text-[13px] font-medium text-[#17161F] hover:bg-[#F7F7FA]"
            >
              {t('admin.users.loadMore')}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
