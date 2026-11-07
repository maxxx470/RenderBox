'use client';

// The video command bar (2026-11-07, owner: « Je t'ai bien demandé de mettre
// une commande bar … tu mettras sur la commande bar un drop down qui permet
// de choisir le modèle pour faire la vidéo », pointing at Krea's Seedance
// Studio; then « réajuste la commande » against the image generator).
//
// Same shape as the image generator's CommandBar, which is the reference:
// a WHITE frame on the grey ground (« en blanc et non noir »), a grey
// composer panel holding what is pinned and the words, the owner's sparkle
// tile beside it, and under them one row of soft-filled chips — each a
// DROPDOWN, not a line of toggles. Six size buttons and three duration
// buttons side by side read as a form; « 720p ⌄ » and « 4s ⌄ » read as a
// setting, which is what the generator does with Ambiance, Auto and 1K.
//
// THE RULE THAT DRIVES EVERY CONTROL, from the owner's brief: never show a
// capability the chosen engine does not really have. The end-frame slot, the
// sound switch, the durations and the sizes are all read from the engine's
// own catalogue, and what does not apply is not drawn.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHIP_BASE, CHIP_SLOT } from '../chip';
import { GLOW, SendButton } from '../CommandBar';
import { ACCEPTED_UPLOAD_TYPES } from '../upload-types';
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
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  wide?: boolean;
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
      className={`absolute bottom-[calc(100%+8px)] z-30 max-h-[320px] overflow-y-auto rounded-2xl bg-white p-2 shadow-[0_12px_32px_rgba(23,22,31,0.16)] ${
        wide ? 'w-[280px]' : 'w-[150px]'
      } ${align === 'right' ? 'right-0' : 'left-0'}`}
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

/**
 * One pinned image: the picture itself, with a cross to take it off again
 * (owner, 2026-11-07: « quand on les ajoute, on peut avoir la possibilité de
 * les supprimer et ajouter une autre image si on veut »). Clicking the
 * picture opens the file picker, so replacing one is a single click rather
 * than remove-then-add.
 */
function PinnedImage({
  nodeId,
  label,
  onReplace,
  onRemove,
}: {
  nodeId: string;
  label: string;
  onReplace: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <span className="relative inline-flex flex-shrink-0">
      <label className="cursor-pointer" title={label}>
        <img
          src={`/api/render-nodes/${nodeId}/image?size=thumb`}
          alt={label}
          className="h-9 w-12 rounded-md object-cover ring-1 ring-[#D5DCFF]"
        />
        <input
          type="file"
          className="hidden"
          accept={ACCEPTED_UPLOAD_TYPES.join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onReplace(file);
            e.target.value = '';
          }}
        />
      </label>
      <button
        type="button"
        onClick={onRemove}
        aria-label={label}
        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-md bg-[#17161F] text-[10px] leading-none text-white"
      >
        ×
      </button>
    </span>
  );
}

/** An empty slot: the « + » that takes an image from the computer. */
function AddSlot({ label, onPick }: { label: string; onPick: (file: File) => void }) {
  return (
    <label className={`cursor-pointer ${CHIP_SLOT}`} title={label}>
      + {label}
      <input
        type="file"
        className="hidden"
        accept={ACCEPTED_UPLOAD_TYPES.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />
    </label>
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
  onAttach,
  onClearSource,
  onClearEnd,
  onSend,
  busy,
}: {
  state: VideoBarState;
  onChange: (next: Partial<VideoBarState>) => void;
  sourceThumbId: string | null;
  endThumbId: string | null;
  onAttach: (file: File, slot: 'source' | 'end') => void;
  onClearSource: () => void;
  onClearEnd: () => void;
  onSend: () => void;
  busy: boolean;
}) {
  const { t, locale } = useLocale();
  const lang = locale === 'fr' ? 'fr' : 'en';
  const [menu, setMenu] = useState<'model' | 'size' | 'duration' | null>(null);
  const [query, setQuery] = useState('');

  const engine = VIDEO_MODELS[state.model];
  const caps = engine.capabilities;
  const resolutions = videoResolutionsFor(state.model, state.duration);
  const cost = videoPrice(state.model, state.duration, state.resolution);
  /** Does this engine's endpoint really accept a closing frame? Veo 3.1,
   *  Seedance 2.5, Kling 3.0 and Wan 2.7 do; Hailuo takes one image and
   *  Gemini Omni takes references only, so they get a single slot. */
  const takesEndFrame = caps.modes.includes('first_last');

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
    // The generator's own framing, measured from CommandBar rather than
    // guessed: the same outer padding, the same 920px ceiling so the bar
    // lines up with the stage above it, the same soft light behind the
    // frame, and z-20 so the menus open upwards over the page.
    <div className="relative isolate z-20 px-2.5 pb-2.5 pt-3 min-[640px]:px-5 min-[640px]:pb-4 min-[640px]:pt-5">
      <div className="relative mx-auto max-w-[920px]">
        <div aria-hidden className={GLOW} />
        <div className="rounded-[24px] bg-white p-2 shadow-[0_24px_60px_-28px_rgba(41,72,252,0.55),0_1px_2px_rgba(23,22,31,0.06)]">
          <div className="flex items-stretch gap-3">
            <div className="min-w-0 flex-1 rounded-2xl bg-[#F4F4F7] p-3">
              {/* What is pinned. An image that IS there shows itself — the « + »
              that put it there is gone, which is the whole point of pinning
              it (owner: « Quand on ajoute une image de départ, elle est là
              directement. Il n'y a plus encore ajout d'image au départ »). */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {sourceThumbId ? (
                  <PinnedImage
                    nodeId={sourceThumbId}
                    label={takesEndFrame ? t('video.startFrame') : t('video.source')}
                    onReplace={(file) => onAttach(file, 'source')}
                    onRemove={onClearSource}
                  />
                ) : (
                  <AddSlot
                    label={takesEndFrame ? t('video.startFrame') : t('video.addImage')}
                    onPick={(file) => onAttach(file, 'source')}
                  />
                )}

                {/* BOTH slots appear as soon as an engine that takes a last
                frame is chosen (owner, 2026-11-07: « pour les modèles qui
                font last frame et first frame, tu dois mettre ça quand on
                choisit le modèle : tu dois mettre les deux cases »). Waiting
                for a start image to reveal the second one hid the engine's
                whole point; whether to fill it stays the user's call. */}
                {takesEndFrame && (
                  <>
                    <span className="text-[13px] text-[#8A8896]">→</span>
                    {endThumbId ? (
                      <PinnedImage
                        nodeId={endThumbId}
                        label={t('video.endFrame')}
                        onReplace={(file) => onAttach(file, 'end')}
                        onRemove={onClearEnd}
                      />
                    ) : (
                      <AddSlot
                        label={t('video.endFrame')}
                        onPick={(file) => onAttach(file, 'end')}
                      />
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

            {/* The owner's own sparkle tile, the button the image generator
            sends with — not a second, invented one. It carries the cost. */}
            <SendButton
              big
              label={t('video.send')}
              {...(cost === null ? {} : { cost })}
              disabled={cost === null || !sourceThumbId}
              busy={busy}
              onClick={onSend}
            />
          </div>

          {/* ── One row of dropdown chips, as the generator has ──────────── */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === 'size' ? null : 'size')}
                className={`cursor-pointer ${CHIP_BASE}`}
              >
                {state.resolution}
                <Chevron />
              </button>
              <Popover open={menu === 'size'} onClose={close}>
                {resolutions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      onChange({ resolution: r });
                      close();
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#3D3B49] hover:bg-[#F4F6FF]"
                  >
                    {r}
                    {r === state.resolution && <Check />}
                  </button>
                ))}
              </Popover>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === 'duration' ? null : 'duration')}
                className={`cursor-pointer ${CHIP_BASE}`}
              >
                {state.duration}s
                <Chevron />
              </button>
              <Popover open={menu === 'duration'} onClose={close}>
                {caps.durations.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      onChange({ duration: d });
                      close();
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#3D3B49] hover:bg-[#F4F6FF]"
                  >
                    {d}s{d === state.duration && <Check />}
                  </button>
                ))}
              </Popover>
            </div>

            {/* A sound switch only where there is something to switch. */}
            {caps.audio === 'toggle' && (
              <button
                type="button"
                onClick={() => onChange({ audio: !state.audio })}
                className={`cursor-pointer ${CHIP_BASE} ${
                  state.audio ? 'bg-[#EEF1FF] text-[#1E36D6]' : ''
                }`}
              >
                {t('video.sound')}
              </button>
            )}

            {/* The model chooser, where Krea puts it: last before the send. */}
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
              <Popover open={menu === 'model'} onClose={close} align="right" wide>
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

            {/* The small twin of the send tile, for phones. */}
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
      </div>
    </div>
  );
}
