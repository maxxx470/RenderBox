'use client';

// The in-app message box to the RenderPro team (2026-10-17, owner: « on ne va
// pas le rendre fonctionnel avec l'IA automatiquement » — the AI help chat of
// 2026-10-06 is gone). A panel that slides in from the right (a bottom sheet
// on a phone) holding the user's one conversation with the team: they write,
// an admin answers from /admin/messages, and the answer shows here (with a
// notification in the bell). Data: /api/support/messages.
//
// It is opened from anywhere with openAssistant(): the rail's "Assistant" pill
// and the "Plus" menu of the mobile bar both call it. One instance per page,
// mounted by MobileNav, which every app frame already renders.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CloseSquare, Send } from 'react-iconly';
import { api, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { BrandMark } from '@/components/BrandMark';

const OPEN_EVENT = 'rb:open-assistant';
/** While the panel is open, new answers are looked for this often. */
const REFRESH_MS = 30_000;

/** Opens the message panel from any component. */
export function openAssistant() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface Message {
  id: string;
  fromAdmin: boolean;
  body: string;
  createdAt: string;
}

export function AssistantWidget() {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ messages: Message[] }>('/api/support/messages');
      setMessages(res.messages);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const focus = setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      clearTimeout(focus);
    };
  }, [open, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, open]);

  async function send() {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api<{ message: Message }>('/api/support/messages', {
        method: 'POST',
        body: { body },
      });
      setMessages((prev) => [...(prev ?? []), res.message]);
      setInput('');
    } catch (err) {
      setSendError(
        t(err instanceof ApiError && err.status === 429 ? 'assistant.limited' : 'assistant.error'),
      );
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  if (!open) return null;

  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const when = (iso: string) =>
    new Date(iso).toLocaleString(intl, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-end bg-black/30 min-[640px]:items-stretch">
      <div className="flex-1 self-stretch" onClick={() => setOpen(false)} aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('assistant.title')}
        className="rb-pop-up flex h-[88vh] w-full flex-col overflow-hidden rounded-t-[26px] border-[#ECECF2] bg-white shadow-[0_-12px_40px_rgba(23,22,31,0.18)] min-[640px]:h-full min-[640px]:w-[400px] min-[640px]:rounded-none min-[640px]:border-l"
      >
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[#ECECF2] px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#F4F6FF]">
              <BrandMark />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
                {t('assistant.title')}
              </h2>
              <p className="flex items-center gap-1.5 text-[11.5px] text-[#6B6878]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#435CFE]" aria-hidden />
                {t('assistant.status')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('assistant.close')}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[#F7F7FA]"
          >
            <CloseSquare set="curved" size={20} primaryColor="#8A8896" />
          </button>
        </header>

        {/* Conversation */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-[#FBFBFD] px-4 py-4" aria-live="polite">
          <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#17161F]">
            {t('assistant.welcome')}
          </div>

          {messages === null && !loadError && (
            <div className="flex items-center gap-2 px-1 text-[12.5px] text-[#6B6878]">
              <span className="rb-spin h-3.5 w-3.5 rounded-full border-2 border-[#D5DCFF] border-t-[#2948FC]" />
              {t('assistant.loading')}
            </div>
          )}
          {loadError && messages === null && (
            <p className="px-1 text-[12.5px] text-[#B8710B]">{t('assistant.loadError')}</p>
          )}

          {messages?.map((m) =>
            m.fromAdmin ? (
              <div key={m.id} className="flex flex-col items-start gap-1">
                <span className="px-1 text-[11px] font-semibold text-[#1E36D6]">
                  {t('assistant.team')}
                </span>
                <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#17161F] shadow-[0_0_0_1px_#ECECF2]">
                  {m.body}
                </div>
                <span className="px-1 font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
                  {when(m.createdAt)}
                </span>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-[#2948FC] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
                  {m.body}
                </div>
                <span className="px-1 font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
                  {when(m.createdAt)}
                </span>
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>

        {/* Input: Enter sends, Shift+Enter starts a new line. */}
        <form
          onSubmit={onSubmit}
          className="flex-shrink-0 border-t border-[#ECECF2] bg-white px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3"
        >
          {sendError && <p className="mb-2 px-1 text-[12px] text-[#E5484D]">{sendError}</p>}
          <div className="flex items-end gap-2 rounded-lg border border-[#ECECF2] bg-[#F7F7FA] py-1.5 pl-4 pr-1.5 focus-within:border-[#2948FC]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder={t('assistant.placeholder')}
              aria-label={t('assistant.placeholder')}
              className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14px] text-[#17161F] placeholder:text-[#8A8896] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label={t('assistant.send')}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] disabled:opacity-40"
            >
              {sending ? (
                <span className="rb-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Send set="curved" size={16} primaryColor="#ffffff" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10.5px] text-[#8A8896]">{t('assistant.foot')}</p>
        </form>
      </section>
    </div>
  );
}
