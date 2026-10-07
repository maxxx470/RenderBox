'use client';

// The header's bell, after Metrio's (src/layouts/AppLayout.tsx): a round
// button with a dot when something is unread. Metrio sends it to a page; here
// it opens a panel in place, since the list is short and a page would take
// the user away from what they were doing.
//
// It reads the existing notification API: GET /api/notifications/count for
// the dot, GET /api/notifications for the list, PATCH { ids: 'all' } to mark
// everything read. Nothing new on the server.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Notification } from 'react-iconly';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Item {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function relativeTime(iso: string, locale: 'fr' | 'en'): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 60) return rtf.format(0, 'minute');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

export function NotificationsBell() {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The dot, once on arrival. Failing quietly is right: a missing dot is not
  // worth an error toast on every page.
  useEffect(() => {
    api<{ count: number }>('/api/notifications/count')
      .then((r) => setUnread(r.count))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await api<{ items: Item[] }>('/api/notifications?limit=12');
      setItems(r.items);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, load]);

  async function markAllRead() {
    try {
      const r = await api<{ unreadCount: number }>('/api/notifications', {
        method: 'PATCH',
        body: { ids: 'all' },
      });
      setUnread(r.unreadCount);
      setItems((prev) =>
        prev ? prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev,
      );
    } catch {
      // The list stays as it is; the next opening tries again.
    }
  }

  const label =
    unread > 0 ? t('app.notificationsUnread', { n: String(unread) }) : t('app.notifications');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#F7F7FA] ${
          open ? 'bg-[#F7F7FA]' : ''
        }`}
      >
        <Notification set="curved" size={20} primaryColor="#15803D" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-[1.5px] border-white bg-[#DC2626]"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('app.notifications')}
          // Fixed under the header on a phone (full width, 12px gutters),
          // hung from the bell from 640px.
          className="rb-pop-up fixed inset-x-3 top-[64px] z-[70] overflow-hidden rounded-2xl border border-[#ECECF2] bg-white shadow-[0_18px_44px_-14px_rgba(23,22,31,0.28)] min-[640px]:absolute min-[640px]:inset-x-auto min-[640px]:right-0 min-[640px]:top-[calc(100%+10px)] min-[640px]:w-[360px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#ECECF2] px-4 py-3">
            <span className="font-[family-name:var(--font-display)] text-[14.5px] font-semibold text-[#17161F]">
              {t('app.notifications')}
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="rounded-full px-2 py-1 text-[12px] font-semibold text-[#166534] hover:bg-[#E8F5EC]"
              >
                {t('app.notificationsMarkAll')}
              </button>
            )}
          </div>

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {items === null && !failed ? (
              <div className="flex justify-center py-8">
                <span className="rb-spin h-5 w-5 rounded-full border-2 border-[#CDEBD6] border-t-[#15803D]" />
              </div>
            ) : failed ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#6B6878]">
                {t('app.notificationsError')}
              </p>
            ) : items && items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E8F5EC]">
                  <Notification set="curved" size={20} primaryColor="#15803D" />
                </span>
                <p className="text-[13.5px] font-medium text-[#17161F]">
                  {t('app.notificationsEmpty')}
                </p>
                <p className="text-[12.5px] leading-relaxed text-[#6B6878]">
                  {t('app.notificationsEmptyHint')}
                </p>
              </div>
            ) : (
              <ul>
                {items?.map((n) => (
                  <li
                    key={n.id}
                    className={`flex gap-3 border-b border-[#F2F2F6] px-4 py-3 last:border-b-0 ${
                      n.readAt ? '' : 'bg-[#F0FAF3]'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                        n.readAt ? 'bg-transparent' : 'bg-[#DC2626]'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#17161F]">{n.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-[#6B6878]">{n.body}</p>
                      <p className="mt-1 font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
                        {relativeTime(n.createdAt, locale)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* What changed in the product lives on the Informations page. */}
          <Link
            href="/app/info"
            onClick={() => setOpen(false)}
            className="block border-t border-[#ECECF2] px-4 py-3 text-center text-[12.5px] font-semibold text-[#166534] hover:bg-[#F0FAF3]"
          >
            {t('app.notificationsNews')}
          </Link>
        </div>
      )}
    </div>
  );
}
