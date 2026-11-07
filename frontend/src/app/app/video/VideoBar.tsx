'use client';

// The video command bar (2026-11-07, owner: « Je t'ai bien demandé de mettre
// une commande bar … tu mettras sur la commande bar un drop down qui permet
// de choisir le modèle pour faire la vidéo », pointing at Krea's Seedance
// Studio).
//
// Same shape as Krea's — one bar holding the prompt, a row of small controls,
// and the model chooser on the right beside the send button — but drawn in
// RenderPro's own language, not Krea's: a WHITE frame on the grey ground, the
// grey composer panel, the soft-filled chips and the brand gradient, exactly
// as the image generator's CommandBar does. The owner's first instruction on
// that bar still stands: « en blanc et non noir ».
//
// THE ONE RULE THAT DRIVES EVERY CONTROL HERE, from the brief: never show a
// capability the chosen engine does not really have. So the end-frame slot,
// the sound switch, the durations and the sizes are all read from the
// engine's own catalogue, and a control that does not apply is not drawn.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHIP_ACTIVE, CHIP_BASE, CHIP_SLOT } from '../chip';
import { SendButton } from '../CommandBar';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { videoPrice } from '@/lib/provider-cost';
import {
  VIDEO_MODELS,
  VIDEO_MODEL_KEYS,
  videoResolutionsFor,
  type VideoModelKey,
} from '@/lib/server/generation/video-models';
import type {
  CameraMoveKey,
  EnvironmentKey,
  IntensityKey,
} from '@/lib/server/generation/video-moves';

/** A popover that opens UPWARD, because the bar sits at the bottom of the
 *  page. Outside click and Escape close it, like every other menu here. */
function Popover({
  open,
  onClose,
  children,
  align = 'left',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute bottom-[calc(100%+8px)] z-30 max-h-[340px] w-[280px] overflow-y-auto rounded-2xl bg-white p-2 shadow-[0_12px_32px_rgba(23,22,31,0.16)] ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {children}
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0" aria-hidden>
      <path
        d="M4 10.5l4 4 8-9"
        fill="none"
        stroke="#2948FC"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-shrink-0 opacity-60" aria-hidden>
      <path
        d="M6 8l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface VideoBarState {
  model: VideoModelKey;
  camera: CameraMoveKey;
  environment: EnvironmentKey[];
  intensity: IntensityKey;
  duration: number;
  resolution: string;
  audio: boolean;
  note: string;
}

export function VideoBar({
  state,
  onChange,
  sourceThumbId,
  endThumbId,
  onPickSource,
  onPickEnd,
  onClearEnd,
  onSend,
  busy,
}: {
  state: VideoBarState;
  onChange: (next: Partial<VideoBarState>) => void;
  sourceThumbId: string | null;
  endThumbId: string | null;
  onPickSource: () => void;
  onPickEnd: () => void;
  onClearEnd: () => void;
  onSend: () => void;
  busy: boolean;
}) {
  const { t, locale } = useLocale();
  const lang = locale === 'fr' ? 'fr' : 'en';
  const [menu, setMenu] = useState<'model' | null>(null);
  const [query, setQuery] = useState('');

  const engine = VIDEO_MODELS[state.model];
  const caps = engine.capabilities;
  const resolutions = videoResolutionsFor(state.model, state.duration);
  const cost = videoPrice(state.model, state.duration, state.resolution);

  const close = () => {
    setMenu(null);
    setQuery('');
  };

  const matching = VIDEO_MODEL_KEYS.filter((k) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const m = VIDEO_MODELS[k];
    return (
      m.label.toLowerCase().includes(q) ||
      m.vendor.toLowerCase().includes(q) ||
      m.positioning[lang].toLowerCase().includes(q)
    );
  });

  return (
    <div className="rounded-[24px] bg-white p-3 shadow-[0_8px_28px_rgba(23,22,31,0.08)]">
      {/* ── The composer: what is pinned, then the words ──────────────── */}
      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1 rounded-2xl bg-[#F4F4F7] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPickSource}
              className={sourceThumbId ? 'relative' : CHIP_SLOT}
              title={t('video.source')}
            >
              {sourceThumbId ? (
                <img
                  src={`/api/render-nodes/${sourceThumbId}/image?size=thumb`}
                  alt={t('video.source')}
                  className="h-8 w-11 cursor-pointer rounded-md object-cover ring-1 ring-[#D5DCFF]"
                />
              ) : (
                <>+ {t('video.source')}</>
              )}
            </button>

            {/* Drawn only where the endpoint really takes an end frame. */}
            {caps.modes.includes('first_last') && (
              <>
                <span className="text-[13px] text-[#8A8896]">→</span>
                {endThumbId ? (
                  <span className="relative inline-flex">
                    <img
                      src={`/api/render-nodes/${endThumbId}/image?size=thumb`}
                      alt={t('video.endFrame')}
                      className="h-8 w-11 rounded-md object-cover ring-1 ring-[#D5DCFF]"
                    />
                    <button
                      type="button"
                      onClick={onClearEnd}
                      aria-label={t('video.noEndFrame')}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-md bg-[#17161F] text-[10px] leading-none text-white"
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onPickEnd}
                    className={`cursor-pointer ${CHIP_SLOT}`}
                  >
                    + {t('video.endFrame')}
                  </button>
                )}
              </>
            )}
          </div>

          <textarea
            value={state.note}
            onChange={(e) => onChange({ note: e.target.value })}
            rows={2}
            placeholder={t('video.notePlaceholder')}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-[#17161F] outline-none placeholder:text-[#8A8896]"
          />
        </div>

        {/* The owner's own sparkle tile, the same button the image
            generator sends with — not a second, invented one. It carries the
            cost, and `big` hides it below 640px where the small twin in the
            controls row takes over. */}
        <SendButton
          big
          label={t('video.send')}
          {...(cost === null ? {} : { cost })}
          disabled={cost === null || !sourceThumbId}
          busy={busy}
          onClick={onSend}
        />
      </div>

      {/* ── The controls ─────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Size and duration, from the engine's own catalogue. */}
        {resolutions.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange({ resolution: r })}
            className={`cursor-pointer ${r === state.resolution ? CHIP_ACTIVE : CHIP_BASE}`}
          >
            {r}
          </button>
        ))}
        {caps.durations.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange({ duration: d })}
            className={`cursor-pointer ${d === state.duration ? CHIP_ACTIVE : CHIP_BASE}`}
          >
            {d}s
          </button>
        ))}

        {/* A sound switch only where there is something to switch. */}
        {caps.audio === 'toggle' && (
          <button
            type="button"
            onClick={() => onChange({ audio: !state.audio })}
            className={`cursor-pointer ${state.audio ? CHIP_ACTIVE : CHIP_BASE}`}
          >
            {t('video.sound')}
          </button>
        )}

        {/* ── The model chooser, where Krea puts it: last before send ── */}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMenu(menu === 'model' ? null : 'model')}
            className={`cursor-pointer ${CHIP_BASE}`}
          >
            <img src={engine.logo} alt="" aria-hidden className="h-4 w-4 rounded bg-white" />
            {engine.label}
            <Chevron />
          </button>
          <Popover open={menu === 'model'} onClose={close} align="right">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('video.searchModels')}
              className="mb-1 w-full rounded-lg bg-[#F4F4F7] px-2.5 py-2 text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896]"
            />
            <p className="px-2.5 pb-1 pt-1 font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-[0.14em] text-[#8A8896]">
              {t('video.title')}
            </p>
            {matching.map((key) => {
              const m = VIDEO_MODELS[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onChange({ model: key });
                    close();
                  }}
                  className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#F4F6FF]"
                >
                  <img
                    src={m.logo}
                    alt=""
                    aria-hidden
                    className="mt-0.5 h-5 w-5 flex-shrink-0 rounded bg-white"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#17161F]">
                      {m.label}
                    </span>
                    <span className="block text-[11.5px] leading-snug text-[#8A8896]">
                      {m.vendor} · {m.positioning[lang]}
                    </span>
                  </span>
                  {key === state.model && <Check />}
                </button>
              );
            })}
            {matching.length === 0 && (
              <p className="px-2.5 py-3 text-[12.5px] text-[#8A8896]">{t('video.noModel')}</p>
            )}
          </Popover>
        </div>

        {/* The price, read by the same function the server will debit with. */}
        <span className="font-[family-name:var(--font-mono)] text-[12px] text-[#6B6878]">
          {cost === null ? '—' : `${cost} ${t('video.credits')}`}
        </span>

        <SendButton
          big={false}
          label={t('video.send')}
          {...(cost === null ? {} : { cost })}
          disabled={cost === null || !sourceThumbId}
          busy={busy}
          onClick={onSend}
        />
      </div>
    </div>
  );
}
