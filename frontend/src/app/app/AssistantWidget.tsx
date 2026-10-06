'use client';

// The in-app help chat, after the owner's Metrio assistant
// (Metrio 4.0, src/components/AssistantWidget.tsx): a panel that slides in
// from the right (a bottom sheet on a phone), two modes — RenderBox, which
// answers from the app's own documentation, and Recherche, which searches the
// web for architecture and materials questions — and the conversation.
//
// It is opened from anywhere with openAssistant(): the rail's "Assistant" pill
// and the "Plus" menu of the mobile bar both call it. One instance per page,
// mounted by MobileNav, which every app frame already renders.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Chat, CloseSquare, Discovery, Send } from 'react-iconly';
import { api, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

const OPEN_EVENT = 'rb:open-assistant';

/** Opens the assistant panel from any component. */
export function openAssistant() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Mode = 'renderbox' | 'search';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string }[];
}

interface Reply {
  reply: string;
  sources?: { title: string; url: string }[];
}

/** **bold** is the only markup the answers use; everything else stays text. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

export function AssistantWidget() {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('renderbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const id = setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(id);
    };
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading, open]);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const userMsg: Message = { id: nextId.current++, role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      const res = await api<Reply>('/api/assistant', {
        method: 'POST',
        body: {
          mode,
          locale,
          // The last 20 turns are plenty of context, and the route caps it.
          messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        },
      });
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: 'assistant',
          content: res.reply,
          ...(res.sources && res.sources.length ? { sources: res.sources } : {}),
        },
      ]);
    } catch (err) {
      const limited = err instanceof ApiError && err.status === 429;
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: 'assistant',
          content: t(limited ? 'assistant.limited' : 'assistant.error'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  if (!open) return null;

  const suggestions = [
    t('assistant.suggest1'),
    t('assistant.suggest2'),
    t('assistant.suggest3'),
    t('assistant.suggest4'),
  ];

  const modeButton = (m: Mode, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        mode === m ? 'bg-[#15803D] text-white' : 'bg-[#F7F7FA] text-[#3D3B49] hover:bg-[#ECECF2]'
      }`}
    >
      {icon}
      {label}
    </button>
  );

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
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534]">
              <Chat set="light" size={19} primaryColor="#ffffff" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
                {t('assistant.title')}
              </h2>
              <p className="flex items-center gap-1.5 text-[11.5px] text-[#5F6B64]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" aria-hidden />
                {t('assistant.status')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('assistant.close')}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F7F7FA]"
          >
            <CloseSquare set="light" size={20} primaryColor="#8A8896" />
          </button>
        </header>

        {/* Modes */}
        <div className="flex flex-shrink-0 gap-2 border-b border-[#ECECF2] px-4 py-2.5">
          {modeButton(
            'renderbox',
            'RenderBox',
            <Chat
              set="light"
              size={14}
              primaryColor={mode === 'renderbox' ? '#ffffff' : '#15803D'}
            />,
          )}
          {modeButton(
            'search',
            t('assistant.modeSearch'),
            <Discovery
              set="light"
              size={14}
              primaryColor={mode === 'search' ? '#ffffff' : '#15803D'}
            />,
          )}
        </div>

        {/* Conversation */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-[#FBFBFD] px-4 py-4">
          <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-[#ECECF2] bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#17161F]">
            {t(mode === 'search' ? 'assistant.welcomeSearch' : 'assistant.welcome')}
          </div>

          {messages.length === 0 && mode === 'renderbox' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-full border border-[#CDEBD6] bg-[#E8F5EC] px-3 py-1.5 text-left text-[12.5px] font-medium text-[#166534] transition-colors hover:border-[#16A34A]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-[#15803D] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-[#ECECF2] bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#17161F]">
                  <div className="whitespace-pre-wrap">{renderInline(m.content)}</div>
                  {m.sources && (
                    <div className="mt-2 border-t border-[#ECECF2] pt-2">
                      <span className="text-[11px] font-medium text-[#5F6B64]">
                        {t('assistant.sources')}
                      </span>
                      <ul className="mt-1 flex flex-col gap-1">
                        {m.sources.map((s) => (
                          <li key={s.url}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11.5px] text-[#15803D] underline-offset-2 hover:underline"
                            >
                              {s.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-[#ECECF2] bg-white px-3.5 py-2.5">
                <span className="rb-spin h-3.5 w-3.5 rounded-full border-2 border-[#CDEBD6] border-t-[#15803D]" />
                <span className="text-[12.5px] text-[#5F6B64]">{t('assistant.thinking')}</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={onSubmit}
          className="flex-shrink-0 border-t border-[#ECECF2] bg-white px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3"
        >
          <div className="flex items-center gap-2 rounded-full border border-[#ECECF2] bg-[#F7F7FA] py-1.5 pl-4 pr-1.5 focus-within:border-[#16A34A]">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              placeholder={t(
                mode === 'search' ? 'assistant.placeholderSearch' : 'assistant.placeholder',
              )}
              aria-label={t('assistant.placeholder')}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#17161F] placeholder:text-[#8A8896] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label={t('assistant.send')}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] disabled:opacity-40"
            >
              <Send set="light" size={16} primaryColor="#ffffff" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10.5px] text-[#8A8896]">
            {t(mode === 'search' ? 'assistant.footSearch' : 'assistant.foot')}
          </p>
        </form>
      </section>
    </div>
  );
}
