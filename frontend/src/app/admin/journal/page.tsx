'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';

interface ActionRow {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
interface JournalPage {
  items: ActionRow[];
  nextCursor: string | null;
}

const ACTION_KEY: Record<string, TranslationKey> = {
  'user.suspend': 'admin.journal.action.user_suspend',
  'user.restore': 'admin.journal.action.user_restore',
  'user.role_change': 'admin.journal.action.user_role_change',
  'user.soft_delete': 'admin.journal.action.user_soft_delete',
  'user.restore_deleted': 'admin.journal.action.user_restore_deleted',
};

function describe(
  row: ActionRow,
  t: (key: TranslationKey, params?: Record<string, string>) => string,
): string {
  const key = ACTION_KEY[row.action];
  const target = row.targetId ?? '';
  if (key) {
    const to = typeof row.metadata?.to === 'string' ? row.metadata.to : '';
    return t(key, { target, to });
  }
  return t('admin.journal.action.generic', {
    action: row.action,
    targetType: row.targetType ?? '',
    targetId: row.targetId ?? '',
  });
}

export default function AdminJournalPage() {
  const t = useTranslations();
  const [items, setItems] = useState<ActionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [error, setError] = useState(false);

  const load = useCallback(
    async (opts: { cursor?: string; append?: boolean } = {}) => {
      setError(false);
      try {
        const params = new URLSearchParams();
        if (actionFilter) params.set('action', actionFilter);
        if (opts.cursor) params.set('cursor', opts.cursor);
        const res = await api<JournalPage>(`/api/admin/audit-log?${params.toString()}`);
        setItems((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch {
        setError(true);
      }
    },
    [actionFilter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-poppins)] text-[19px] font-semibold text-[#170608]">
          {t('admin.journal.title')}
        </h1>
        <p className="mt-1 text-[12.5px] text-[#7A6E71]">{t('admin.journal.subtitle')}</p>
      </div>

      <input
        value={actionFilter}
        onChange={(e) => setActionFilter(e.target.value)}
        placeholder={t('admin.journal.filterActionPlaceholder')}
        className="mb-4 w-80 rounded-[10px] border border-[#ECE3E5] bg-[#F8F5F6] px-3 py-2 text-[13px] text-[#170608] outline-none placeholder:text-[#7A6E71]"
      />

      {error ? (
        <p className="text-sm text-[#B8710B]">{t('admin.journal.loadError')}</p>
      ) : (
        <div>
          {items.map((row) => (
            <div key={row.id} className="flex gap-3 border-b border-[#ECE3E5] py-3">
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#C81120]" />
              <div>
                <div className="text-[13px] text-[#170608]">
                  <b className="font-semibold">{row.actorId}</b> {describe(row, t)}
                </div>
                <div className="mt-0.5 font-[family-name:var(--font-ibm-plex-mono)] text-[10.5px] text-[#7A6E71]">
                  {new Date(row.createdAt).toLocaleString('fr-FR')}
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-[#7A6E71]">{t('admin.journal.empty')}</p>
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              onClick={() => void load({ cursor: nextCursor, append: true })}
              className="mt-4 rounded-[10px] border border-[#ECE3E5] px-4 py-2 text-[13px] font-medium text-[#170608] hover:bg-[#F8F5F6]"
            >
              {t('admin.users.loadMore')}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
