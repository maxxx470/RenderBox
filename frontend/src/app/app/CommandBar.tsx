'use client';

// The command bar — one component, used by BOTH the workspace (AppShell) and
// the generation space (GenerationHome).
//
// It used to be two: this file, and a hand-assembled copy inside
// GenerationHome that had drifted into a different set of controls, so
// creating a project and working inside one presented two different tools.
// Everything specific to a screen now arrives as a prop, and the row itself
// is written once.
//
// ---------------------------------------------------------------------------
// The row, left to right
// ---------------------------------------------------------------------------
// The order is the reference bar's, with the two controls this product has
// and it does not slotted in where they belong:
//
//   Action      — ours. First, because it decides what everything after it
//                 means: generate a render, retouch a zone, add an element.
//   Model       — the engine. Everything downstream is conditioned on it:
//                 which ratios exist, which resolutions exist.
//   + Images    — the attachment.
//   Ratio       — the shape of the output.
//   Resolution  — its size.
//   Ambiance    — ours. The light in the render, which is the decision that
//                 matters most in an architectural render and has no
//                 counterpart in a general-purpose image tool.
//   Context     — what the engine already knows about this project.
//   @ Elements  — an image already in the project, reused as a reference.
//
// Then the send button, alone on the right.
import { useRef } from 'react';
import { Send, TickSquare, Plus, CloseSquare } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { PresetKey } from '@/lib/server/generation/presets';
import type { EngineName } from '@/lib/server/generation/engines/types';
import type { RatioKey } from '@/lib/server/generation/ratios';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { ACCEPTED_UPLOAD_TYPES } from './Dropzone';
import { EngineSelect } from './EngineSelect';
import { PresetSelect } from './PresetSelect';
import { RatioChip } from './RatioChip';
import { RatioSelect } from './RatioSelect';
import { ResolutionSelect } from './ResolutionSelect';
import { ModeSelect } from './ModeSelect';
import { ContextChip } from './ContextChip';
import { ElementsPicker } from './ElementsPicker';
import type { MaterialRow } from './MaterialsPanel';
import { CHIP_ACTIVE, CHIP_SLOT, CHIP_STATIC } from './chip';

export type AppMode = 'generate' | 'retouch' | 'add';

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? CHIP_ACTIVE : CHIP_STATIC}>
      {active && <TickSquare set="light" size={13} primaryColor="#ffffff" />}
      {label}
    </span>
  );
}

export function CommandBar({
  mode,
  onModeChange,
  editEnabled,
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
  onUploadFile,
  onAttachReference,
  uploading,
  attachmentName = null,
  onRemoveAttachment,
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
  /** What "+ images" does in generate mode — a new source image. */
  onUploadFile: (file: File) => void;
  /**
   * What it does in the edit modes — the reference for the retouch or the
   * added element. Without this the chip would have to disappear in two of
   * the three modes, and a control that comes and goes reads as a glitch;
   * with it, the same button means the same thing everywhere ("give the
   * engine another image") and is wired to the right slot in each mode.
   */
  onAttachReference?: ((file: File) => void) | undefined;
  uploading: boolean;
  /** Filled when the attachment is held in the bar rather than uploaded
      straight away — the generation space stages a photo before the project
      it will belong to exists. */
  attachmentName?: string | null;
  onRemoveAttachment?: (() => void) | undefined;
  /** Currently displayed render — the ratio chip reads its real dimensions. */
  imageSrc: string | null;
  /** What the engine has memorised about this project. */
  materials: MaterialRow[];
  /** Every image in the project, offered as a reusable element reference. */
  elementNodes: RenderTreeNode[];
  onPickElement: (nodeId: string) => void;
  pickingElement: boolean;
}) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);

  const attachmentHandler = mode === 'generate' ? onUploadFile : onAttachReference;

  return (
    // No separator line above: the bar carries its own outline now, and a
    // border-t on top of an outlined panel reads as a doubled rule.
    <div className="px-5.5 pb-4.5 pt-2">
      {/* One container: prompt on top, attributes and actions on the row
          below — the same shape on both screens, so the two read as one
          tool. */}
      <div className="rounded-[18px] border border-[#DEDEE8] bg-[#F7F7FA] px-3 pb-2.5 pt-2.5 shadow-[0_2px_10px_-6px_rgba(23,22,31,0.18)]">
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

        <input
          type="text"
          placeholder={
            mode === 'generate'
              ? t('app.cmdbarPlaceholder')
              : mode === 'retouch'
                ? t('edit.instructionPlaceholderRetouch')
                : t('edit.instructionPlaceholderAdd')
          }
          value={prompt}
          disabled={inputDisabled}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !sendDisabled) onSubmit();
          }}
          className="mb-2.5 w-full bg-transparent px-1 py-1.5 text-[13.5px] text-[#17161F] outline-none placeholder:text-[#8A8896] disabled:cursor-not-allowed"
        />

        {/* Chips grouped tight on the left, send alone on the right — not one
            control per option spread across the width. */}
        <div className="flex flex-wrap items-center gap-2">
          <ModeSelect
            mode={mode}
            onChange={onModeChange}
            editEnabled={editEnabled}
            disabled={inputDisabled}
          />

          <EngineSelect
            engine={engine}
            onChange={onEngineChange}
            placement="up"
            disabled={inputDisabled}
          />

          {/* "+ images". Staged attachments name the file and offer to drop
              it; an immediate upload has nothing to name, because the image
              is already in the project tree by the time this returns. */}
          {attachmentName ? (
            <button
              type="button"
              disabled={inputDisabled}
              onClick={() => (onRemoveAttachment ? onRemoveAttachment() : fileRef.current?.click())}
              title={attachmentName}
              className={CHIP_ACTIVE}
            >
              <TickSquare set="light" size={13} primaryColor="#ffffff" />
              <span className="max-w-[128px] truncate">{attachmentName}</span>
              <CloseSquare set="light" size={13} primaryColor="#ffffff" />
            </button>
          ) : (
            <button
              type="button"
              disabled={inputDisabled || uploading || !attachmentHandler}
              onClick={() => fileRef.current?.click()}
              className={CHIP_SLOT}
            >
              <Plus set="light" size={13} primaryColor="#8A8896" />
              {uploading ? t('app.commandBarUploading') : t('app.commandBarUpload')}
            </button>
          )}

          {/* Chosen in "generate", reported in the edit modes: a retouch or an
              added element keeps the framing of the render it works on, so
              offering a ratio there would be a control with no effect. */}
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

          {mode === 'generate' && (
            <PresetSelect preset={preset} onChange={onPresetChange} disabled={inputDisabled} />
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

          {/* The control that spends a generation. It was a 38px circle
              carrying only an icon, dimmed to 50% when disabled — the least
              visible thing on the screen doing the most important job, and
              indistinguishable from an enabled one at a glance. It now
              carries its own verb from 480px up. */}
          <button
            type="button"
            disabled={sendDisabled || generating}
            onClick={onSubmit}
            aria-label={submitLabel}
            className="ml-auto flex h-[38px] flex-shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(113,111,255,0.7)] transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none min-[480px]:px-4"
          >
            <Send set="light" size={17} primaryColor="#ffffff" />
            <span className="hidden min-[480px]:inline">{submitLabel}</span>
          </button>
        </div>

        {/* Why the button is off. Without this the bar is a dead end: you type
            a prompt, the button stays dim, and nothing on screen says what is
            missing. */}
        {sendHint && sendDisabled && !generating && (
          <p className="mt-2 px-1 text-[11.5px] text-[#6B6880]">{sendHint}</p>
        )}
      </div>
    </div>
  );
}
