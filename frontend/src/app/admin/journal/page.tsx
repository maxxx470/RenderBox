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
        <h1 className="font-[family-name:var(--font-general-sans)] text-[19px] font-semibold text-[#17161F]">
          {t('admin.journal.title')}
        </h1>
        <p className="mt-1 text-[12.5px] text-[#8A8896]">{t('admin.journal.subtitle')}</p>
      </div>

      <input
        value={actionFilter}
        onChange={(e) => setActionFilter(e.target.value)}
        placeholder={t('admin.journal.filterActionPlaceholder')}
        className="mb-4 w-80 rounded-[10px] border border-[#ECECF2] bg-[#F7F7FA] px-3 py-2 text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896]"
      />

      {error ? (
        <p className="text-sm text-[#B8710B]">{t('admin.journal.loadError')}</p>
      ) : (
        <div>
          {items.map((row) => (
            <div key={row.id} className="flex gap-3 border-b border-[#ECECF2] py-3">
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#716FFF]" />
              <div>
                <div className="text-[13px] text-[#17161F]">
                  <b className="font-semibold">{row.actorId}</b> {describe(row, t)}
                </div>
                <div className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] text-[#8A8896]">
                  {new Date(row.createdAt).toLocaleString('fr-FR')}
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-[#8A8896]">{t('admin.journal.empty')}</p>
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
