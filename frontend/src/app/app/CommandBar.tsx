'use client';

// The command bar — one component, used by BOTH the workspace (AppShell) and
// the generation space (GenerationHome).
//
// Rebuilt on 2026-10-06 at the owner's request ("trop basique"): everything
// the product can do is reachable from here. Compacted the same day.
//
// 2026-10-08 — redrawn on the owner's "Aurora" reference (same features):
//   a frame holding — white since the same evening (owner: "en blanc et non
//   noir"; it was dark ink #17161F for a few hours) —
//   1. the composer, a lighter panel: pinned images as thumbnails (never a
//      filename), the prompt in large type (Enter sends), then the paperclip,
//      a hint, and both engines in their colours (Visio red, Pixel IA
//      yellow — "Commenter" exists on Pixel IA only, so it locks Visio);
//   2. beside it, a big square send button with the action's verb;
//   3. under it, the actions as chips with a coloured tile (Générer,
//      Commenter, Ajouter), then the settings (ambiance, ratio, size,
//      variants, context, elements) — on a phone behind a "Réglages" button,
//      while the send button shrinks into the composer.
//   Behind the frame, soft light columns in the charter's blue and red.
//
// Later the same day (owner): no Enhance tab any more — Enhance is its own
// page, reached from the rail; and the bar keeps one height whatever is
// pinned ("je ne veux pas que la commande bar bouge"): the thumbnails sit in
// the composer's bottom row beside the paperclip, and why the send button is
// off is said in that row too, instead of on lines that came and went.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TickSquare, Lock, Setting } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { PresetKey } from '@/lib/server/generation/presets';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_COLORS, ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import type { RatioKey } from '@/lib/server/generation/ratios';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { ACCEPTED_UPLOAD_TYPES } from './upload-types';
import { PresetSelect } from './PresetSelect';
import { RatioSelect } from './RatioSelect';
import { ResolutionSelect } from './ResolutionSelect';
import { ContextChip } from './ContextChip';
import { ElementsPicker } from './ElementsPicker';
import { Glyph, type RailIconName } from './RailIcon';
import type { MaterialRow } from './MaterialsPanel';
import { CHIP_ACTIVE, CHIP_BASE, CHIP_STATIC } from './chip';

export type AppMode = 'generate' | 'retouch' | 'add';

const MODES = [
  { key: 'generate', glyph: 'image', labelKey: 'app.modeGenerateAction' },
  { key: 'retouch', glyph: 'comment', labelKey: 'app.modeRetouch' },
  { key: 'add', glyph: 'add', labelKey: 'app.modeAdd' },
] as const satisfies readonly { key: AppMode; glyph: RailIconName; labelKey: string }[];

/** The engine toggle's frame, on the composer panel. */
const SEGMENT = 'flex items-center gap-0.5 rounded-[10px] bg-white p-0.5';
/** An action chip of the bottom row (Générer, Commenter, Ajouter). */
const TAB =
  'flex h-8 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg pl-1.5 pr-2.5 text-[12px] font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed';
/** One engine of the toggle. */
const ENGINE_TAB =
  'flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[11.5px] font-semibold transition-colors duration-150 ease-out disabled:cursor-not-allowed';
/** The small coloured square before each action's name, as in the reference. */
const MODE_TILE = 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[6px]';
const MODE_TILE_COLOR: Record<AppMode, string> = {
  generate: 'bg-[#2948FC]',
  // Comment pins are red in the app (AnnotationLayer): the action wears it.
  retouch: 'bg-[#F34857]',
  add: 'bg-[#17161F]',
};
/** Square icon buttons of the composer (paperclip, settings on a phone). */
export const ROUND =
  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-[#17161F] transition-colors hover:bg-[#E9E9EE] disabled:cursor-not-allowed disabled:opacity-40';
/** The glow behind the bar: soft light columns in the charter's blue and red. */
export const GLOW =
  'pointer-events-none absolute -inset-x-20 -bottom-10 -top-20 -z-10 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0)_0px,rgba(255,255,255,0.4)_26px,rgba(255,255,255,0)_52px),linear-gradient(90deg,#A3C2FB_0%,#435CFE_22%,#F88B98_50%,#2948FC_78%,#A3C2FB_100%)] opacity-90 blur-[16px] [mask-image:radial-gradient(ellipse_52%_58%_at_50%_55%,#000_40%,transparent_100%)]';

/** One image shown in the composer. */
export interface PinnedImage {
  key: string;
  src: string;
  caption: string;
  onRemove?: (() => void) | undefined;
}

/** A local file shown as a picture: the object URL lives as long as the file. */
export function useObjectUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? CHIP_ACTIVE : CHIP_STATIC}>
      {active && <TickSquare set="curved" size={12} primaryColor="#ffffff" />}
      {label}
    </span>
  );
}

// The same 32px as the paperclip beside it, so pinning an image never changes
// the bar's height. Its role (photo, reference) is on the tooltip.
export function Pinned({ image, removeLabel }: { image: PinnedImage; removeLabel: string }) {
  return (
    <div className="rb-pop-up relative h-8 w-8 flex-shrink-0" title={image.caption}>
      <img
        src={image.src}
        alt={image.caption}
        className="h-full w-full rounded-lg object-cover shadow-[0_0_0_2px_#ffffff]"
      />
      {image.onRemove && (
        <button
          type="button"
          onClick={image.onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-[5px] border-[1.5px] border-white bg-[#17161F] text-white shadow-[0_2px_6px_rgba(23,22,31,0.3)] transition-transform hover:scale-110"
        >
          <svg
            viewBox="0 0 24 24"
            width="7"
            height="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * The send button, on this bar and on Enhance's (owner, 2026-10-08: one
 * button for both, no text): the owner's glossy sparkle tile
 * (/public/rail/envoyer.webp, 288px) filling the whole square. The tile's own
 * corners are clipped by the button's (22%, the tile's radius). The verb stays
 * as the accessible name and the tooltip.
 */
export function SendButton({
  big,
  label,
  disabled,
  busy,
  onClick,
}: {
  big: boolean;
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative flex-shrink-0 overflow-hidden rounded-[22%] transition-[filter,transform,opacity] duration-150 ease-out enabled:hover:brightness-110 enabled:active:scale-[0.97] disabled:cursor-not-allowed ${
        busy ? '' : 'disabled:opacity-45'
      } ${
        big
          ? 'hidden h-24 w-24 self-center shadow-[0_10px_22px_-10px_rgba(41,72,252,0.8)] disabled:shadow-none min-[640px]:block'
          : 'block h-9 w-9 min-[640px]:hidden'
      }`}
    >
      <img
        src="/rail/envoyer.webp"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center bg-[#17161F]/35">
          <span className="rb-spin h-5 w-5 rounded-full border-2 border-white/40 border-t-white" />
        </span>
      )}
    </button>
  );
}

export function CommandBar({
  mode,
  onModeChange,
  editEnabled,
  editDisabledHint,
  ratio,
  onRatioChange,
  resolution,
  onResolutionChange,
  prompt,
  onPromptChange,
  placeholder,
  preset,
  onPresetChange,
  zoneSelected,
  referenceAdded,
  onSubmit,
  inputDisabled,
  sendDisabled,
  sendHint,
  submitLabel,
  generating,
  engine,
  onEngineChange,
  engineLocked = false,
  onAttach,
  attachTitle,
  uploading,
  pinned,
  variantCount,
  onVariantCountChange,
  materials,
  elementNodes,
  onPickElement,
  pickingElement,
  template = null,
  fill = false,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  /** False when there is no image to work on: Commenter/Ajouter have no target. */
  editEnabled: boolean;
  /** Why Commenter/Ajouter are off, on their tooltip. */
  editDisabledHint?: string;
  ratio: RatioKey;
  onRatioChange: (ratio: RatioKey) => void;
  resolution: ResolutionKey;
  onResolutionChange: (resolution: ResolutionKey) => void;
  prompt: string;
  onPromptChange: (v: string) => void;
  /** Overrides the per-mode placeholder. */
  placeholder?: string | undefined;
  preset: PresetKey;
  onPresetChange: (v: PresetKey) => void;
  zoneSelected: boolean;
  referenceAdded: boolean;
  onSubmit: () => void;
  inputDisabled: boolean;
  sendDisabled: boolean;
  /** Why the send button is off, shown under the bar. */
  sendHint?: string | undefined;
  /** The verb on the send button — the action differs per mode. */
  submitLabel: string;
  generating: boolean;
  engine: EngineName;
  onEngineChange: (engine: EngineName) => void;
  /** The mode imposes its engine ("Commenter" → Pixel IA): shown, not choosable. */
  engineLocked?: boolean;
  /** What the paperclip does in the current mode; null turns it off. */
  onAttach: ((file: File) => void) | null;
  /** The paperclip's tooltip in the current mode. */
  attachTitle?: string | undefined;
  uploading: boolean;
  /** The images the action works with, as thumbnails. */
  pinned: PinnedImage[];
  /** How many versions an edit produces — the edit modes only. */
  variantCount?: number;
  onVariantCountChange?: (n: number) => void;
  /** What the engine has memorised about this project. */
  materials: MaterialRow[];
  /** Every image in the project, offered as a reusable element reference. */
  elementNodes: RenderTreeNode[];
  onPickElement: (nodeId: string) => void;
  pickingElement: boolean;
  /**
   * A template of the image generator page is on (owner, 2026-10-10): its
   * chip takes the ambiance's place — the template's prompt already says
   * what the image is, and no ambiance is sent with it.
   */
  template?: { label: string; image: string; onClear: () => void } | null;
  /**
   * Take the column's full width instead of the centred 920px — the project
   * editor lines the bar up with the canvas above it (owner, 2026-10-08).
   */
  fill?: boolean;
}) {
  const { t, locale } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // Phone only: the settings tray. From 640px the settings are always inline.
  const [settingsOpen, setSettingsOpen] = useState(false);

  // The prompt grows with its text, up to four lines, then scrolls.
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
  }, [prompt]);

  const modeTab = (key: AppMode, glyph: RailIconName, label: ReactNode, available: boolean) => {
    const selected = key === mode;
    return (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={selected}
        disabled={!available || inputDisabled}
        title={available ? undefined : editDisabledHint}
        onClick={() => onModeChange(key)}
        className={`${TAB} ${
          selected
            ? 'bg-[#EEF1FF] font-semibold text-[#1E36D6] shadow-[inset_0_0_0_1.5px_#2948FC]'
            : 'bg-[#F2F2F5] text-[#3D3B49] enabled:hover:bg-[#E9E9EE] disabled:opacity-40'
        }`}
      >
        <span className={`${MODE_TILE} ${MODE_TILE_COLOR[key]}`}>
          <Glyph name={glyph} size={12} color="#ffffff" />
        </span>
        {label}
      </button>
    );
  };

  const engines = (
    <div role="radiogroup" aria-label={t('app.engineLabel')} className={`${SEGMENT} flex-shrink-0`}>
      {ENGINE_NAMES.map((e) => {
        const selected = e === engine;
        const locked = engineLocked && !selected;
        return (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={inputDisabled || locked}
            onClick={() => onEngineChange(e)}
            title={locked ? t('annotate.engineLocked') : ENGINE_LABELS[e].description[locale]}
            className={`${ENGINE_TAB} ${
              selected
                ? `${ENGINE_COLORS[e].chip} shadow-[0_4px_10px_-6px_rgba(23,22,31,0.45)]`
                : 'text-[#3D3B49] enabled:hover:bg-[#F2F2F5] disabled:opacity-45'
            }`}
          >
            {locked ? (
              <Lock set="curved" size={12} primaryColor="#8A8896" />
            ) : (
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${
                  selected ? 'bg-current opacity-80' : ENGINE_COLORS[e].dot
                }`}
              />
            )}
            {ENGINE_LABELS[e].name[locale]}
          </button>
        );
      })}
    </div>
  );

  const settings: ReactNode[] = [];
  if (mode === 'generate' && template) {
    settings.push(
      <span key="template" className={`${CHIP_BASE} pl-1`} title={t('app.templateChip')}>
        <img
          src={template.image}
          alt=""
          className="h-5 w-5 flex-shrink-0 rounded-md border border-white object-cover shadow-[0_0_0_1px_#ECECF2]"
        />
        {template.label}
        <button
          type="button"
          onClick={template.onClear}
          disabled={inputDisabled}
          aria-label={t('app.templateRemove')}
          title={t('app.templateRemove')}
          className="-mr-1 flex h-5 w-5 items-center justify-center rounded-md text-[#8A8896] hover:bg-[#E9E9EE] hover:text-[#17161F]"
        >
          <svg
            viewBox="0 0 24 24"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </span>,
    );
  } else if (mode === 'generate') {
    settings.push(
      <PresetSelect
        key="preset"
        preset={preset}
        onChange={onPresetChange}
        disabled={inputDisabled}
      />,
    );
  }
  // Every mode chooses its ratio since 2026-10-08 (owner: every format, in
  // generation and in edits alike); 'auto' keeps the image's own framing.
  settings.push(
    <RatioSelect key="ratio" ratio={ratio} onChange={onRatioChange} disabled={inputDisabled} />,
  );
  settings.push(
    <ResolutionSelect
      key="res"
      resolution={resolution}
      onChange={onResolutionChange}
      disabled={inputDisabled}
    />,
  );
  if (mode !== 'generate' && variantCount !== undefined && onVariantCountChange) {
    settings.push(
      <span key="variants" className={CHIP_BASE} title={t('edit.variantSub')}>
        {t('app.cmdVariants')}
        <button
          type="button"
          disabled={inputDisabled || variantCount <= 1}
          onClick={() => onVariantCountChange(Math.max(1, variantCount - 1))}
          aria-label={t('app.cmdVariantsLess')}
          className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-[#F7F7FA] text-[12px] leading-none text-[#17161F] disabled:opacity-40"
        >
          −
        </button>
        <span className="w-3 text-center font-[family-name:var(--font-mono)] text-[11.5px] text-[#17161F]">
          {variantCount}
        </span>
        <button
          type="button"
          disabled={inputDisabled || variantCount >= 4}
          onClick={() => onVariantCountChange(Math.min(4, variantCount + 1))}
          aria-label={t('app.cmdVariantsMore')}
          className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-[#F7F7FA] text-[12px] leading-none text-[#17161F] disabled:opacity-40"
        >
          +
        </button>
      </span>,
    );
  }
  if (materials.length > 0) settings.push(<ContextChip key="ctx" materials={materials} />);
  if (elementNodes.length > 0) {
    settings.push(
      <ElementsPicker
        key="elements"
        nodes={elementNodes}
        onPick={onPickElement}
        disabled={inputDisabled}
        busy={pickingElement}
      />,
    );
  }
  if (mode === 'retouch') {
    settings.push(
      <StatusPill
        key="status"
        active={zoneSelected}
        label={t(zoneSelected ? 'app.pillZoneSelected' : 'app.pillZoneEmpty')}
      />,
    );
  } else if (mode === 'add') {
    settings.push(
      <StatusPill
        key="status"
        active={referenceAdded}
        label={t(referenceAdded ? 'app.pillReferenceAdded' : 'app.pillReferenceEmpty')}
      />,
    );
  }

  // Why the send button is off, said in the composer's row (and under the bar
  // on a phone). Without it the bar is a dead end.
  const showHint = Boolean(sendHint && sendDisabled && !generating);

  const sendButton = (big: boolean) => (
    <SendButton
      big={big}
      label={submitLabel}
      disabled={sendDisabled}
      busy={generating}
      onClick={onSubmit}
    />
  );

  return (
    // z-20: the menus open upwards over the page, whose cards (the fan) carry
    // their own z-index for the tilt and would otherwise cover them.
    <div className="relative isolate z-20 px-2.5 pb-2.5 pt-3 min-[640px]:px-5 min-[640px]:pb-4 min-[640px]:pt-5">
      <div className={`relative ${fill ? '' : 'mx-auto max-w-[920px]'}`}>
        <div aria-hidden className={GLOW} />
        <div className="rounded-[24px] bg-white p-2 shadow-[0_24px_60px_-28px_rgba(41,72,252,0.55),0_1px_2px_rgba(23,22,31,0.06)]">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_UPLOAD_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAttach?.(file);
              e.target.value = '';
            }}
          />

          <div className="flex gap-2">
            {/* 1 — the composer: pinned images, the prompt, then the paperclip,
                the hint and the engines. */}
            <div className="flex min-w-0 flex-1 flex-col rounded-[18px] bg-[#F4F4F7] px-3 pb-2.5 pt-3 min-[640px]:px-4">
              <textarea
                ref={promptRef}
                rows={1}
                placeholder={
                  placeholder ??
                  (mode === 'generate'
                    ? t('app.cmdbarPlaceholder')
                    : mode === 'retouch'
                      ? t('edit.instructionPlaceholderRetouch')
                      : t('edit.instructionPlaceholderAdd'))
                }
                value={prompt}
                disabled={inputDisabled}
                maxLength={2000}
                onChange={(e) => onPromptChange(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — as in a chat.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!sendDisabled) onSubmit();
                  }
                }}
                className="block w-full resize-none bg-transparent px-0.5 py-1 text-[15px] leading-[1.5] text-[#17161F] caret-[#2948FC] outline-none placeholder:text-[#8A8896] disabled:cursor-not-allowed min-[640px]:text-[17px]"
              />

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  // Not tied to inputDisabled: a project with no image yet has its
                  // whole bar off, and the paperclip is exactly how to fix that.
                  disabled={uploading || generating || !onAttach}
                  onClick={() => fileRef.current?.click()}
                  aria-label={t('app.cmdAttach')}
                  title={
                    uploading ? t('app.commandBarUploading') : (attachTitle ?? t('app.cmdAttach'))
                  }
                  className={ROUND}
                >
                  {uploading ? (
                    <span className="rb-spin h-3.5 w-3.5 rounded-full border-2 border-[#D5DCFF] border-t-[#2948FC]" />
                  ) : (
                    <Glyph name="clip" size={15} color="#3D3B49" />
                  )}
                </button>
                {pinned.map((p) => (
                  <Pinned key={p.key} image={p} removeLabel={t('app.cmdRemoveAttachment')} />
                ))}
                <span
                  className={`hidden min-w-0 flex-1 truncate text-[12px] min-[640px]:block ${
                    showHint ? 'text-[#6B6878]' : 'text-[#8A8896]'
                  }`}
                >
                  {uploading
                    ? t('app.commandBarUploading')
                    : showHint
                      ? sendHint
                      : pinned.length > 0
                        ? ''
                        : (attachTitle ?? t('app.cmdAttach'))}
                </span>
                {/* Phone: the settings fold behind a button. */}
                <button
                  type="button"
                  onClick={() => setSettingsOpen((v) => !v)}
                  aria-expanded={settingsOpen}
                  aria-label={t('app.cmdSettings')}
                  title={t('app.cmdSettings')}
                  className={`${ROUND} min-[640px]:hidden ${settingsOpen ? 'bg-[#EEF1FF]' : ''}`}
                >
                  <Setting
                    set="curved"
                    size={15}
                    primaryColor={settingsOpen ? '#1E36D6' : '#3D3B49'}
                  />
                </button>
                <div className="ml-auto flex min-w-0 items-center gap-2">
                  <span className="hidden text-[11.5px] text-[#8A8896] min-[900px]:inline">
                    {t('app.engineLabel')}
                  </span>
                  {engines}
                  {sendButton(false)}
                </div>
              </div>
            </div>

            {/* 2 — the big square send button (the verb is its name, not shown). */}
            {sendButton(true)}
          </div>

          {/* 3 — the actions, then the settings, as chips. On a phone the
              settings show only while their button is on. */}
          <div className="flex flex-wrap items-center gap-1.5 px-0.5 pb-0.5 pt-2">
            <div
              role="tablist"
              aria-label={t('app.modesLabel')}
              className="flex max-w-full items-center gap-1.5 overflow-x-auto [scrollbar-width:none]"
            >
              {MODES.map((m) =>
                modeTab(
                  m.key,
                  m.glyph,
                  m.key === 'retouch' ? (
                    <>
                      {t(m.labelKey)}
                      {/* Commenter exists on Pixel IA only: its colour, on the chip. */}
                      <span
                        aria-hidden
                        title={t('annotate.engineNote')}
                        className={`h-1.5 w-1.5 rounded-full ${ENGINE_COLORS.gpt_image.dot}`}
                      />
                    </>
                  ) : (
                    t(m.labelKey)
                  ),
                  m.key === 'generate' || editEnabled,
                ),
              )}
            </div>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-[#ECECF2] min-[640px]:block" />
            <div
              className={`${
                settingsOpen ? 'flex' : 'hidden'
              } w-full flex-wrap items-center gap-1.5 min-[640px]:flex min-[640px]:w-auto`}
            >
              {settings}
            </div>
          </div>

          {/* Why the button is off — a phone has no room for it in the
              composer's row. Without this the bar is a dead end. */}
          {showHint && (
            <p className="px-2 pb-1.5 pt-1 text-[11.5px] text-[#6B6878] min-[640px]:hidden">
              {sendHint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
