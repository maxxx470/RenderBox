'use client';

// The command bar — one component, used by BOTH the workspace (AppShell) and
// the generation space (GenerationHome).
//
// Rebuilt on 2026-10-06 at the owner's request ("trop basique"): everything
// the product can do is reachable from here. Compacted the same day ("trop
// grande, trop surchargée, les trucs sont trop gros"): smaller type and
// controls, no help button (the assistant lives in the rail), and on a phone
// the settings fold behind one "Réglages" button.
//
// ---------------------------------------------------------------------------
// Three bands, top to bottom
// ---------------------------------------------------------------------------
//   1. What to do: Générer · Commenter · Ajouter · Enhance as tabs, and from
//      640px both engines beside them, each in its own colour (Moteur 1 red,
//      Moteur 2 yellow). "Commenter" exists on Moteur 2 only, so choosing it
//      locks Moteur 1 and says why.
//   2. The composer, as in a chat app: pinned images as thumbnails (never a
//      filename), then the prompt, which grows with what is typed.
//   3. How: the paperclip, the settings (ambiance, ratio, size, variants,
//      what the engine remembers, elements of the project) and the send
//      button alone on the right. Below 640px the engines sit here, and the
//      settings open in a tray under a "Réglages" button.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Send, TickSquare, Lock, Setting } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { PresetKey } from '@/lib/server/generation/presets';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_COLORS, ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import type { RatioKey } from '@/lib/server/generation/ratios';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { ACCEPTED_UPLOAD_TYPES } from './Dropzone';
import { PresetSelect } from './PresetSelect';
import { RatioChip } from './RatioChip';
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

/** The two segmented groups share one frame. */
const SEGMENT = 'flex items-center gap-0.5 rounded-full border border-[#ECECF2] bg-[#F7F7FA] p-0.5';
const TAB =
  'flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold transition-colors duration-150 ease-out disabled:cursor-not-allowed';
/** Round icon buttons of the bottom band (paperclip, settings). */
const ROUND =
  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[#ECECF2] bg-white text-[#17161F] transition-colors hover:border-[#CDEBD6] hover:bg-[#F0FAF3] disabled:cursor-not-allowed disabled:opacity-40';

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
      {active && <TickSquare set="light" size={12} primaryColor="#ffffff" />}
      {label}
    </span>
  );
}

function Pinned({ image, removeLabel }: { image: PinnedImage; removeLabel: string }) {
  return (
    <div className="rb-pop-up relative h-12 w-12 flex-shrink-0">
      <img
        src={image.src}
        alt=""
        className="h-full w-full rounded-[12px] border border-[#ECECF2] object-cover"
      />
      <span className="absolute inset-x-0.5 bottom-0.5 truncate rounded-full bg-white/90 px-1 text-center text-[8.5px] font-semibold text-[#17161F] backdrop-blur-sm">
        {image.caption}
      </span>
      {image.onRemove && (
        <button
          type="button"
          onClick={image.onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#17161F] text-white shadow-[0_2px_6px_rgba(23,22,31,0.3)] transition-transform hover:scale-110"
        >
          <svg
            viewBox="0 0 24 24"
            width="9"
            height="9"
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

export function CommandBar({
  mode,
  onModeChange,
  editEnabled,
  editDisabledHint,
  enhanceHref,
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
  imageSrc,
  materials,
  elementNodes,
  onPickElement,
  pickingElement,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  /** False when there is no image to work on: Commenter/Ajouter have no target. */
  editEnabled: boolean;
  /** Why Commenter/Ajouter are off, on their tooltip. */
  editDisabledHint?: string;
  /** Where the Enhance tab leads — the tool is its own page. */
  enhanceHref: string;
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
  /** The mode imposes its engine ("Commenter" → Moteur 2): shown, not choosable. */
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
  /** The image an edit works on — the ratio chip reads its real dimensions. */
  imageSrc: string | null;
  /** What the engine has memorised about this project. */
  materials: MaterialRow[];
  /** Every image in the project, offered as a reusable element reference. */
  elementNodes: RenderTreeNode[];
  onPickElement: (nodeId: string) => void;
  pickingElement: boolean;
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
            ? 'bg-[#15803D] text-white shadow-[0_4px_10px_-6px_rgba(21,128,61,0.8)]'
            : 'text-[#3D3B49] enabled:hover:bg-white disabled:opacity-45'
        }`}
      >
        <span className="hidden min-[640px]:inline-flex">
          <Glyph name={glyph} size={14} color={selected ? '#ffffff' : '#15803D'} />
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
            className={`${TAB} px-2 ${
              selected
                ? `${ENGINE_COLORS[e].chip} shadow-[0_4px_10px_-6px_rgba(23,22,31,0.45)]`
                : 'text-[#3D3B49] enabled:hover:bg-white disabled:opacity-45'
            }`}
          >
            {locked ? (
              <Lock set="light" size={12} primaryColor="#8A8896" />
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
  if (mode === 'generate') {
    settings.push(
      <PresetSelect
        key="preset"
        preset={preset}
        onChange={onPresetChange}
        disabled={inputDisabled}
      />,
      <RatioSelect
        key="ratio"
        ratio={ratio}
        onChange={onRatioChange}
        engine={engine}
        disabled={inputDisabled}
      />,
    );
  } else if (imageSrc) {
    // An edit keeps the framing of the image it works on: reported, not chosen.
    settings.push(<RatioChip key="ratio" src={imageSrc} />);
  }
  settings.push(
    <ResolutionSelect
      key="res"
      resolution={resolution}
      onChange={onResolutionChange}
      engine={engine}
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
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#F7F7FA] text-[12px] leading-none text-[#17161F] disabled:opacity-40"
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
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#F7F7FA] text-[12px] leading-none text-[#17161F] disabled:opacity-40"
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

  return (
    // No separator line above: the bar carries its own outline.
    <div className="px-2.5 pb-2.5 pt-1.5 min-[640px]:px-5 min-[640px]:pb-4">
      <div className="mx-auto max-w-[920px] rounded-[20px] border border-[#DEDEE8] bg-white shadow-[0_10px_30px_-18px_rgba(23,22,31,0.35)]">
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

        {/* 1 — what to do (and, from 640px, with which engine). */}
        <div className="flex items-center justify-between gap-2 border-b border-[#ECECF2] px-2 py-1.5">
          <div
            role="tablist"
            aria-label={t('app.modesLabel')}
            className={`${SEGMENT} max-w-full overflow-x-auto [scrollbar-width:none]`}
          >
            {MODES.map((m) =>
              modeTab(
                m.key,
                m.glyph,
                m.key === 'retouch' ? (
                  <>
                    {t(m.labelKey)}
                    {/* Commenter exists on Moteur 2 only: its colour, on the tab. */}
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
            <Link
              href={enhanceHref}
              className={`${TAB} text-[#3D3B49] hover:bg-white`}
              title={t('enhance.subtitle')}
            >
              <span className="hidden min-[640px]:inline-flex">
                <Glyph name="enhance" size={14} color="#15803D" />
              </span>
              {t('enhance.title')}
            </Link>
          </div>
          <div className="hidden min-[640px]:block">{engines}</div>
        </div>

        {/* 2 — the composer. */}
        <div className="px-3 pt-2">
          {pinned.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-2 pt-1.5">
              {pinned.map((p) => (
                <Pinned key={p.key} image={p} removeLabel={t('app.cmdRemoveAttachment')} />
              ))}
            </div>
          )}
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
            className="block w-full resize-none bg-transparent px-0.5 py-1 text-[13.5px] leading-[1.5] text-[#17161F] outline-none placeholder:text-[#8A8896] disabled:cursor-not-allowed"
          />
        </div>

        {/* 3 — how. */}
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1.5">
          <button
            type="button"
            // Not tied to inputDisabled: a project with no image yet has its
            // whole bar off, and the paperclip is exactly how to fix that.
            disabled={uploading || generating || !onAttach}
            onClick={() => fileRef.current?.click()}
            aria-label={t('app.cmdAttach')}
            title={uploading ? t('app.commandBarUploading') : (attachTitle ?? t('app.cmdAttach'))}
            className={ROUND}
          >
            {uploading ? (
              <span className="rb-spin h-3.5 w-3.5 rounded-full border-2 border-[#CDEBD6] border-t-[#15803D]" />
            ) : (
              <Glyph name="clip" size={15} />
            )}
          </button>

          {/* Phone: the engines live here, and the settings behind a button. */}
          <div className="min-[640px]:hidden">{engines}</div>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            aria-label={t('app.cmdSettings')}
            title={t('app.cmdSettings')}
            className={`${ROUND} min-[640px]:hidden ${
              settingsOpen ? 'border-[#16A34A] bg-[#E8F5EC]' : ''
            }`}
          >
            <Setting set="light" size={15} primaryColor={settingsOpen ? '#166534' : '#17161F'} />
          </button>

          {/* The settings: inline from 640px; on a phone, a full-width tray
              under this row while the button above is on. */}
          <div
            className={`${
              settingsOpen ? 'flex' : 'hidden'
            } order-last w-full flex-wrap items-center gap-1.5 border-t border-[#ECECF2] pt-2 min-[640px]:order-none min-[640px]:flex min-[640px]:w-auto min-[640px]:border-0 min-[640px]:pt-0`}
          >
            {settings}
          </div>

          {/* The control that spends a generation, with its verb from 640px. */}
          <button
            type="button"
            disabled={sendDisabled || generating}
            onClick={onSubmit}
            aria-label={submitLabel}
            className="ml-auto flex h-8 flex-shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] px-2.5 text-[12.5px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(22,163,74,0.7)] transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none min-[640px]:px-3.5"
          >
            {generating ? (
              <span className="rb-spin h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <Send set="light" size={15} primaryColor="#ffffff" />
            )}
            <span className="hidden min-[640px]:inline">{submitLabel}</span>
          </button>
        </div>

        {/* Why the button is off. Without this the bar is a dead end. */}
        {sendHint && sendDisabled && !generating && (
          <p className="-mt-1 px-3.5 pb-2.5 text-[11px] text-[#6B6878]">{sendHint}</p>
        )}
      </div>
    </div>
  );
}
