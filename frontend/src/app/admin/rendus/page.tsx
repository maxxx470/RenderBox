'use client';

// /admin/rendus — every image generated on RenderPro, newest first (2026-10-15):
// the picture, who made it, with which engine, when. Filter by engine; from a
// user's file, ?userId= shows only theirs. The pictures go through the admin
// image route.
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { EngineLogo } from '@/components/EngineLogo';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';

interface RenderRow {
  id: string;
  createdAt: string;
  engine: string | null;
  editType: string | null;
  projectId: string;
  user: { id: string; name: string | null; email: string };
}

export default function AdminRendersPage() {
  return (
    <Suspense>
      <Renders />
    </Suspense>
  );
}

function Renders() {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const userId = useSearchParams().get('userId');
  const [engine, setEngine] = useState<EngineName | ''>('');
  const [items, setItems] = useState<RenderRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ limit: '48' });
        if (engine) params.set('engine', engine);
        if (userId) params.set('userId', userId);
        if (cursor) params.set('cursor', cursor);
        const res = await api<{ items: RenderRow[]; nextCursor: string | null }>(
          `/api/admin/renders?${params.toString()}`,
        );
        setItems((prev) => (cursor ? [...prev, ...res.items] : res.items));
        setNextCursor(res.nextCursor);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [engine, userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <p className="mb-4 text-[13px] text-[#6B6878]">{t('admin.renders.subtitle')}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1 rounded-xl bg-white p-1">
          {(['', ...ENGINE_NAMES] as const).map((e) => (
            <button
              key={e || 'all'}
              type="button"
              onClick={() => setEngine(e)}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
                engine === e ? 'bg-[#2948FC] text-white' : 'text-[#3D3B49] hover:bg-[#F2F2F5]'
              }`}
            >
              {e && <EngineLogo engine={e} size={16} />}
              {e ? ENGINE_LABELS[e].name[locale] : t('admin.renders.all')}
            </button>
          ))}
        </div>
        {userId && (
          <Link
            href="/admin/rendus"
            className="rounded-xl bg-white px-3 py-2 text-[12.5px] font-semibold text-[#2948FC]"
          >
            {t('admin.renders.clearUser')}
          </Link>
        )}
      </div>

      {error ? (
        <p className="text-sm text-[#B8710B]">{t('admin.renders.loadError')}</p>
      ) : !loading && items.length === 0 ? (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[#8A8896]">
          {t('admin.renders.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[1100px]:grid-cols-4">
          {items.map((r) => {
            const e = r.engine as EngineName | null;
            return (
              <figure key={r.id} className="overflow-hidden rounded-[18px] bg-white">
                <a
                  href={`/api/admin/render-nodes/${r.id}/image`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-[4/3] bg-[#F7F7FA]"
                >
                  <img
                    src={`/api/admin/render-nodes/${r.id}/image`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </a>
                <figcaption className="flex flex-col gap-1 p-3">
                  <Link
                    href={`/admin/utilisateurs/${r.user.id}`}
                    className="truncate text-[13px] font-medium text-[#17161F] hover:underline"
                  >
                    {r.user.name || r.user.email}
                  </Link>
                  <span className="flex items-center justify-between gap-2 text-[11.5px] text-[#6B6878]">
                    <span className="flex items-center gap-1.5">
                      {e && ENGINE_LABELS[e] && <EngineLogo engine={e} size={14} />}
                      {e && ENGINE_LABELS[e] ? ENGINE_LABELS[e].name[locale] : '—'}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[10.5px]">
                      {new Date(r.createdAt).toLocaleDateString(intl, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}

      {nextCursor && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(nextCursor)}
          className="mt-4 rounded-xl bg-white px-4 py-2 text-[13px] font-medium text-[#17161F] hover:bg-[#F2F2F5] disabled:opacity-50"
        >
          {t('admin.users.loadMore')}
        </button>
      )}
    </div>
  );
}
