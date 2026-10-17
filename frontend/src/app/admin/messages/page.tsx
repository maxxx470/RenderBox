'use client';

// /admin/messages — the users' messages to the team (2026-10-17, owner: « je
// le recevrai dans l'espace admin, je pourrai leur répondre directement »).
// Left, every conversation, the latest first, unread ones marked; right, the
// chosen one with a reply box. Below 1000px one column: the list, then the
// conversation with a way back. The answer reaches the user in the app's
// message panel, with a notification. Data: /api/admin/support(/[userId]).
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, Send } from 'react-iconly';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Thread {
  userId: string;
  name: string | null;
  email: string;
  lastBody: string;
  lastFromAdmin: boolean;
  lastAt: string;
  unread: number;
}
interface Message {
  id: string;
  fromAdmin: boolean;
  body: string;
  createdAt: string;
}
interface Conversation {
  user: {
    id: string;
    name: string | null;
    email: string;
    profession: string | null;
    country: string | null;
  };
  messages: Message[];
}

const REFRESH_MS = 30_000;

// useSearchParams needs a Suspense boundary to prerender.
export default function AdminMessagesPage() {
  return (
    <Suspense>
      <Messages />
    </Suspense>
  );
}

function Messages() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get('u');
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const when = (iso: string) =>
    new Date(iso).toLocaleString(intl, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [listError, setListError] = useState(false);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [convError, setConvError] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await api<{ threads: Thread[] }>('/api/admin/support');
      setThreads(res.threads);
      setListError(false);
    } catch {
      setListError(true);
    }
  }, []);

  const loadConv = useCallback(async (userId: string) => {
    try {
      const res = await api<Conversation>(`/api/admin/support/${encodeURIComponent(userId)}`);
      setConv(res);
      setConvError(false);
      // Opening it read the user's messages: the list's mark goes.
      setThreads(
        (prev) => prev?.map((th) => (th.userId === userId ? { ...th, unread: 0 } : th)) ?? prev,
      );
    } catch {
      setConvError(true);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    const timer = setInterval(() => void loadThreads(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadThreads]);

  useEffect(() => {
    setConv(null);
    setReply('');
    setSendError(false);
    if (!selected) return;
    void loadConv(selected);
    const timer = setInterval(() => void loadConv(selected), REFRESH_MS);
    return () => clearInterval(timer);
  }, [selected, loadConv]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [conv?.messages.length]);

  async function send() {
    const body = reply.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    setSendError(false);
    try {
      const res = await api<{ message: Message }>(
        `/api/admin/support/${encodeURIComponent(selected)}`,
        {
          method: 'POST',
          body: { body },
        },
      );
      setConv((c) => (c ? { ...c, messages: [...c.messages, res.message] } : c));
      setReply('');
      void loadThreads();
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }

  // The CSV comes through fetch, not a plain link: api() first renews an
  // expired session, which a bare <a href> could not do.
  async function exportPending() {
    setExporting(true);
    setExportError(false);
    try {
      await api('/api/admin/me');
      const res = await fetch('/api/admin/support/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
        'renderpro-messages.csv';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  const pick = (userId: string | null) =>
    router.replace(userId ? `/admin/messages?u=${userId}` : '/admin/messages');

  const list = (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white ${selected ? 'max-[999px]:hidden' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#ECECF2] px-4 py-2.5 text-[12px] text-[#8A8896]">
        <span>{threads ? t('admin.msg.count', { n: String(threads.length) }) : ''}</span>
        <button
          type="button"
          onClick={() => void exportPending()}
          disabled={exporting}
          title={t('admin.msg.exportHint')}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#F2F2F5] px-2.5 text-[12px] font-medium text-[#17161F] transition-colors hover:bg-[#E9E9EE] disabled:opacity-50"
        >
          <Download set="curved" size={15} primaryColor="#2948FC" />
          {t('admin.msg.export')}
        </button>
      </div>
      {exportError && (
        <p className="border-b border-[#ECECF2] px-4 py-2 text-[12px] text-[#E5484D]">
          {t('admin.msg.exportError')}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {listError && <p className="p-4 text-[13px] text-[#B8710B]">{t('admin.msg.loadError')}</p>}
        {threads && threads.length === 0 && (
          <p className="p-6 text-center text-[13px] leading-relaxed text-[#6B6878]">
            {t('admin.msg.empty')}
          </p>
        )}
        {threads?.map((th) => {
          const on = th.userId === selected;
          return (
            <button
              key={th.userId}
              type="button"
              onClick={() => pick(th.userId)}
              className={`flex w-full items-start gap-3 border-b border-[#F2F2F5] px-4 py-3 text-left transition-colors ${
                on
                  ? 'bg-[#EEF1FF]'
                  : th.unread
                    ? 'bg-[#FBFBFD] hover:bg-[#F7F7FA]'
                    : 'hover:bg-[#F7F7FA]'
              }`}
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#F7F7FA] text-[12px] font-semibold text-[#2948FC]">
                {(th.name || th.email).charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={`truncate text-[13.5px] text-[#17161F] ${th.unread ? 'font-semibold' : 'font-medium'}`}
                  >
                    {th.name || th.email}
                  </span>
                  <span className="ml-auto flex-shrink-0 font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
                    {when(th.lastAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span
                    className={`line-clamp-1 text-[12.5px] ${th.unread ? 'text-[#17161F]' : 'text-[#6B6878]'}`}
                  >
                    {th.lastFromAdmin ? `${t('admin.msg.you')} : ` : ''}
                    {th.lastBody}
                  </span>
                  {th.unread > 0 && (
                    <span className="ml-auto flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-[#F34857] px-1 font-[family-name:var(--font-mono)] text-[10.5px] font-semibold text-white">
                      {th.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  const conversation = (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white ${selected ? '' : 'max-[999px]:hidden'}`}
    >
      {!selected && (
        <p className="m-auto max-w-[300px] p-6 text-center text-[13px] text-[#6B6878]">
          {t('admin.msg.pick')}
        </p>
      )}
      {selected && (
        <>
          <header className="flex items-center gap-3 border-b border-[#ECECF2] px-4 py-3">
            <button
              type="button"
              onClick={() => pick(null)}
              aria-label={t('admin.msg.back')}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F2F2F5] min-[1000px]:hidden"
            >
              <ArrowLeft set="curved" size={18} primaryColor="#3D3B49" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-[#17161F]">
                {conv?.user.name || conv?.user.email || '…'}
              </p>
              {conv && (
                <p className="truncate text-[12px] text-[#6B6878]">
                  {[conv.user.email, conv.user.country].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <Link
              href={`/admin/utilisateurs/${selected}`}
              className="flex-shrink-0 rounded-lg bg-[#F2F2F5] px-3 py-2 text-[12px] font-medium text-[#3D3B49] hover:bg-[#E9E9EE]"
            >
              {t('admin.msg.openFile')}
            </Link>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#FBFBFD] px-4 py-4">
            {convError && <p className="text-[13px] text-[#B8710B]">{t('admin.msg.loadError')}</p>}
            {conv?.messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1 ${m.fromAdmin ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    m.fromAdmin
                      ? 'rounded-tr-md bg-[#2948FC] text-white'
                      : 'rounded-tl-md bg-white text-[#17161F] shadow-[0_0_0_1px_#ECECF2]'
                  }`}
                >
                  {m.body}
                </div>
                <span className="px-1 font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
                  {m.fromAdmin ? `${t('admin.msg.you')} · ` : ''}
                  {when(m.createdAt)}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-t border-[#ECECF2] p-3"
          >
            {sendError && (
              <p className="mb-2 text-[12px] text-[#E5484D]">{t('admin.msg.sendError')}</p>
            )}
            <div className="flex items-end gap-2 rounded-lg border border-[#DEDEE8] bg-white py-1.5 pl-3.5 pr-1.5 focus-within:border-[#2948FC]">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder={t('admin.msg.placeholder')}
                aria-label={t('admin.msg.placeholder')}
                className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-[#17161F] placeholder:text-[#8A8896] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!reply.trim() || sending}
                className="flex h-9 flex-shrink-0 items-center gap-2 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-3.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                <Send set="curved" size={15} primaryColor="#ffffff" />
                {t('admin.msg.send')}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#6B6878]">{t('admin.msg.subtitle')}</p>
      <div className="grid h-[calc(100dvh-190px)] min-h-[420px] max-[899px]:h-[calc(100dvh-280px-env(safe-area-inset-bottom))] grid-cols-1 gap-3 min-[1000px]:grid-cols-[340px_1fr]">
        {list}
        {conversation}
      </div>
    </div>
  );
}
