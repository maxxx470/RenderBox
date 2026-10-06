'use client';

// The command bar — one component, used by BOTH the workspace (AppShell) and
// the generation space (GenerationHome).
//
// Rebuilt on 2026-10-06 at the owner's request ("trop basique"): everything
// the product can do is reachable from here, without opening a menu first.
//
// ---------------------------------------------------------------------------
// Three bands, top to bottom
// ---------------------------------------------------------------------------
//   1. What to do, and with which engine. The four actions sit side by side
//      as tabs (Générer · Commenter · Ajouter · Enhance) and both engines are
//      always on show, each in its own colour (Moteur 1 red, Moteur 2 yellow)
//      — the owner preferred seeing both to opening a dropdown. "Commenter"
//      only exists on Moteur 2, so choosing it locks Moteur 1 and says why.
//   2. The composer, as in a chat app: pinned images as thumbnails (never a
//      filename — seeing the picture beats reading "IMG_4831.jpg"), then the
//      prompt, which grows with what is typed.
//   3. How: the paperclip, then the settings (ambiance, ratio, size,
//      variants, what the engine remembers, elements of the project), help,
//      and the send button alone on the right.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Send, TickSquare, Lock } from 'react-iconly';
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
import { openAssistant } from './AssistantWidget';
import type { MaterialRow } from './MaterialsPanel';
import { CHIP_ACTIVE, CHIP_BASE, CHIP_STATIC } from './chip';

export type AppMode = 'generate' | 'retouch' | 'add';

const MODES = [
  { key: 'generate', glyph: 'image', labelKey: 'app.modeGenerateAction' },
  { key: 'retouch', glyph: 'comment', labelKey: 'app.modeRetouch' },
  { key: 'add', glyph: 'add', labelKey: 'app.modeAdd' },
] as const satisfies readonly { key: AppMode; glyph: RailIconName; labelKey: string }[];

/** The two segmented groups of the top band share one frame. */
const SEGMENT = 'flex items-center gap-0.5 rounded-full border border-[#ECECF2] bg-[#F7F7FA] p-1';
const TAB =
  'flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-semibold min-[480px]:px-3 min-[480px]:text-[12.5px] transition-colors duration-150 ease-out disabled:cursor-not-allowed';

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? CHIP_ACTIVE : CHIP_STATIC}>
      {active && <TickSquare set="light" size={13} primaryColor="#ffffff" />}
      {label}
    </span>
  );
}

/** A local file shown as a picture: the object URL lives as long as the file. */
function useObjectUrl(file: File | null | undefined): string | null {
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

/** One pinned image in the composer: a thumbnail, a small caption, and × if removable. */
function Pinned({
  src,
  caption,
  onRemove,
  removeLabel,
}: {
  src: string;
  caption: string;
  onRemove?: (() => void) | undefined;
  removeLabel: string;
}) {
  return (
    <div className="rb-pop-up relative h-[64px] w-[64px] flex-shrink-0">
      <img
        src={src}
        alt=""
        className="h-full w-full rounded-[14px] border border-[#ECECF2] object-cover"
      />
      <span className="absolute inset-x-1 bottom-1 truncate rounded-full bg-white/90 px-1.5 text-center text-[9.5px] font-semibold text-[#17161F] backdrop-blur-sm">
        {caption}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-[#17161F] text-white shadow-[0_2px_6px_rgba(23,22,31,0.3)] transition-transform hover:scale-110"
        >
          <svg
            viewBox="0 0 24 24"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
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
  enhanceHref,
  ratio,
  onRatioChange,
  resolution,
  onResolutionChange,
  prompt,
  onPromptChange,
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
  onUploadFile,
  onAttachReference,
  uploading,
  attachment = null,
  onRemoveAttachment,
  sourceSrc = null,
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
  /** False when no generated render is selected: retouch/add have no target. */
  editEnabled: boolean;
  /** Where the Enhance tab leads — the tool is its own page. */
  enhanceHref: string;
  ratio: RatioKey;
  onRatioChange: (ratio: RatioKey) => void;
  resolution: ResolutionKey;
  onResolutionChange: (resolution: ResolutionKey) => void;
  prompt: string;
  onPromptChange: (v: string) => void;
  preset: PresetKey;
  onPresetChange: (v: PresetKey) => void;
  zoneSelected: boolean;
  referenceAdded: boolean;
  onSubmit: () => void;
  inputDisabled: boolean;
  sendDisabled: boolean;
  /** Why the send button is off, shown under the row. */
  sendHint?: string | undefined;
  /** The verb on the send button — the action differs per mode. */
  submitLabel: string;
  generating: boolean;
  engine: EngineName;
  onEngineChange: (engine: EngineName) => void;
  /** The mode imposes its engine ("Commenter" → Moteur 2): shown, not choosable. */
  engineLocked?: boolean;
  /** What the paperclip does in generate mode — a new source image. */
  onUploadFile: (file: File) => void;
  /** What it does in the edit modes — the reference for the added element. */
  onAttachReference?: ((file: File) => void) | undefined;
  uploading: boolean;
  /** A picture held in the bar, not uploaded yet (the generation space's
      photo, the workspace's reference), shown as a thumbnail. */
  attachment?: File | null;
  onRemoveAttachment?: (() => void) | undefined;
  /** The image the action starts from, pinned first (the selected render). */
  sourceSrc?: string | null;
  /** How many versions an edit produces — the edit modes only. */
  variantCount?: number;
  onVariantCountChange?: (n: number) => void;
  /** Currently displayed render — the ratio chip reads its real dimensions. */
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
  const attachmentUrl = useObjectUrl(attachment);

  const attachmentHandler = mode === 'generate' ? onUploadFile : onAttachReference;
  // In "Commenter" the image is commented on directly; nothing to attach.
  const canAttach = mode !== 'retouch' && Boolean(attachmentHandler);

  // The prompt grows with its text, up to five lines, then scrolls.
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
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
        title={available ? undefined : t('app.modeSelectNodeHint')}
        onClick={() => onModeChange(key)}
        className={`${TAB} ${
          selected
            ? 'bg-[#15803D] text-white shadow-[0_4px_12px_-6px_rgba(21,128,61,0.8)]'
            : 'text-[#3D3B49] enabled:hover:bg-white disabled:opacity-45'
        }`}
      >
        {/* Words only on a phone, so all four tabs fit on one line. */}
        <span className="hidden min-[480px]:inline-flex">
          <Glyph name={glyph} size={15} color={selected ? '#ffffff' : '#15803D'} />
        </span>
        {label}
      </button>
    );
  };

  return (
    // No separator line above: the bar carries its own outline, and a
    // border-t on top of an outlined panel reads as a doubled rule.
    <div className="px-3 pb-3 pt-2 min-[640px]:px-5.5 min-[640px]:pb-4.5">
      <div className="rounded-[22px] border border-[#DEDEE8] bg-white shadow-[0_10px_30px_-18px_rgba(23,22,31,0.35)]">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_UPLOAD_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) attachmentHandler?.(file);
            e.target.value = '';
          }}
        />

        {/* 1 — what to do, and with which engine. On a phone the engines
            take a line of their own: both must stay in view, never behind
            a sideways scroll. */}
        <div className="flex flex-col items-start gap-2 border-b border-[#ECECF2] px-2.5 py-2 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
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
                      className={`h-2 w-2 rounded-full ${ENGINE_COLORS.gpt_image.dot}`}
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
              <span className="hidden min-[480px]:inline-flex">
                <Glyph name="enhance" size={15} color="#15803D" />
              </span>
              {t('enhance.title')}
            </Link>
          </div>

          <div
            role="radiogroup"
            aria-label={t('app.engineLabel')}
            className={`${SEGMENT} flex-shrink-0`}
          >
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
                  className={`${TAB} ${
                    selected
                      ? `${ENGINE_COLORS[e].chip} shadow-[0_4px_12px_-6px_rgba(23,22,31,0.45)]`
                      : 'text-[#3D3B49] enabled:hover:bg-white disabled:opacity-45'
                  }`}
                >
                  {locked ? (
                    <Lock set="light" size={13} primaryColor="#8A8896" />
                  ) : (
                    <span
                      aria-hidden
                      className={`h-2.5 w-2.5 rounded-full ${
                        selected ? 'bg-current opacity-80' : ENGINE_COLORS[e].dot
                      }`}
                    />
                  )}
                  {ENGINE_LABELS[e].name[locale]}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2 — the composer. */}
        <div className="px-3.5 pt-3">
          {(sourceSrc || attachmentUrl) && (
            <div className="mb-2.5 flex flex-wrap gap-2.5 pt-1.5">
              {sourceSrc && (
                <Pinned
                  src={sourceSrc}
                  caption={t('app.cmdSourceTag')}
                  removeLabel={t('app.cmdRemoveAttachment')}
                />
              )}
              {attachmentUrl && (
                <Pinned
                  src={attachmentUrl}
                  caption={t(mode === 'generate' ? 'app.cmdPhotoTag' : 'app.cmdReferenceTag')}
                  onRemove={onRemoveAttachment}
                  removeLabel={t('app.cmdRemoveAttachment')}
                />
              )}
            </div>
          )}
          <textarea
            ref={promptRef}
            rows={1}
            placeholder={
              mode === 'generate'
                ? t('app.cmdbarPlaceholder')
                : mode === 'retouch'
                  ? t('edit.instructionPlaceholderRetouch')
                  : t('edit.instructionPlaceholderAdd')
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
            className="block w-full resize-none bg-transparent px-0.5 py-1 text-[14px] leading-[1.5] text-[#17161F] outline-none placeholder:text-[#8A8896] disabled:cursor-not-allowed"
          />
        </div>

        {/* 3 — how. */}
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2.5">
          <button
            type="button"
            disabled={inputDisabled || uploading || !canAttach}
            onClick={() => fileRef.current?.click()}
            aria-label={t('app.cmdAttach')}
            title={
              mode === 'retouch'
                ? t('app.cmdAttachRetouch')
                : uploading
                  ? t('app.commandBarUploading')
                  : t('app.cmdAttach')
            }
            className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-[#ECECF2] bg-white text-[#17161F] transition-colors hover:border-[#16A34A] hover:bg-[#E8F5EC] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? (
              <span className="rb-spin h-4 w-4 rounded-full border-2 border-[#CDEBD6] border-t-[#15803D]" />
            ) : (
              <Glyph name="clip" size={17} />
            )}
          </button>

          {mode === 'generate' && (
            <PresetSelect preset={preset} onChange={onPresetChange} disabled={inputDisabled} />
          )}

          {/* Chosen in "generate", reported in the edit modes: a comment or
              an added element keeps the framing of the render it works on. */}
          {mode === 'generate' ? (
            <RatioSelect
              ratio={ratio}
              onChange={onRatioChange}
              engine={engine}
              disabled={inputDisabled}
            />
          ) : (
            imageSrc && <RatioChip src={imageSrc} />
          )}

          <ResolutionSelect
            resolution={resolution}
            onChange={onResolutionChange}
            engine={engine}
            disabled={inputDisabled}
          />

          {mode !== 'generate' && variantCount !== undefined && onVariantCountChange && (
            <span className={CHIP_BASE} title={t('edit.variantSub')}>
              {t('app.cmdVariants')}
              <button
                type="button"
                disabled={inputDisabled || variantCount <= 1}
                onClick={() => onVariantCountChange(Math.max(1, variantCount - 1))}
                aria-label={t('app.cmdVariantsLess')}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#F7F7FA] text-[13px] leading-none text-[#17161F] disabled:opacity-40"
              >
                −
              </button>
              <span className="w-3 text-center font-[family-name:var(--font-mono)] text-[12px] text-[#17161F]">
                {variantCount}
              </span>
              <button
                type="button"
                disabled={inputDisabled || variantCount >= 4}
                onClick={() => onVariantCountChange(Math.min(4, variantCount + 1))}
                aria-label={t('app.cmdVariantsMore')}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#F7F7FA] text-[13px] leading-none text-[#17161F] disabled:opacity-40"
              >
                +
              </button>
            </span>
          )}

          <ContextChip materials={materials} />

          <ElementsPicker
            nodes={elementNodes}
            onPick={onPickElement}
            disabled={inputDisabled}
            busy={pickingElement}
          />

          {mode === 'retouch' && (
            <StatusPill
              active={zoneSelected}
              label={t(zoneSelected ? 'app.pillZoneSelected' : 'app.pillZoneEmpty')}
            />
          )}
          {mode === 'add' && (
            <StatusPill
              active={referenceAdded}
              label={t(referenceAdded ? 'app.pillReferenceAdded' : 'app.pillReferenceEmpty')}
            />
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Help is one click away from where the questions come up. */}
            <button
              type="button"
              onClick={openAssistant}
              aria-label={t('app.assistant')}
              title={t('app.assistant')}
              className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border border-[#ECECF2] bg-white font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#15803D] transition-colors hover:border-[#16A34A] hover:bg-[#E8F5EC]"
            >
              ?
            </button>
            {/* The control that spends a generation, carrying its own verb
                from 480px up. */}
            <button
              type="button"
              disabled={sendDisabled || generating}
              onClick={onSubmit}
              aria-label={submitLabel}
              className="flex h-[38px] flex-shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] px-3 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(22,163,74,0.7)] transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none min-[480px]:px-4"
            >
              {generating ? (
                <span className="rb-spin h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Send set="light" size={17} primaryColor="#ffffff" />
              )}
              <span className="hidden min-[480px]:inline">{submitLabel}</span>
            </button>
          </div>
        </div>

        {/* Why the button is off. Without this the bar is a dead end. */}
        {sendHint && sendDisabled && !generating && (
          <p className="-mt-1 px-4 pb-3 text-[11.5px] text-[#5F6B64]">{sendHint}</p>
        )}
      </div>
    </div>
  );
}
