'use client';

import { useRef } from 'react';
import { Send, TickSquare, Upload } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { PresetKey } from '@/lib/server/generation/presets';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ACCEPTED_UPLOAD_TYPES } from './Dropzone';
import { EngineSelect } from './EngineSelect';
import { PresetSelect } from './PresetSelect';
import { RatioChip } from './RatioChip';
import { RatioSelect } from './RatioSelect';
import { ModeSelect } from './ModeSelect';
import { CHIP_ACTIVE, CHIP_STATIC } from './chip';
import type { RatioKey } from '@/lib/server/generation/ratios';

export type AppMode = 'generate' | 'retouch' | 'add';

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? CHIP_ACTIVE : CHIP_STATIC}>
      {active && <TickSquare set="light" size={13} primaryColor="#ffffff" />}
      {label}
    </span>
  );
}

// Krea pattern: pills reflect the active mode's current state instead of a
// fixed list shared by every mode — presets in "generate", zone/reference
// status in "retouch"/"add".
export function CommandBar({
  mode,
  onModeChange,
  editEnabled,
  ratio,
  onRatioChange,
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
  uploading,
  imageSrc,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  /** False when no generated render is selected: retouch/add have no target. */
  editEnabled: boolean;
  ratio: RatioKey;
  onRatioChange: (ratio: RatioKey) => void;
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
  onUploadFile: (file: File) => void;
  uploading: boolean;
  /** Currently displayed render — the ratio chip reads its real dimensions. */
  imageSrc: string | null;
}) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    // No separator line above: the bar carries its own outline now, and a
    // border-t on top of an outlined panel reads as a doubled rule.
    <div className="px-5.5 pb-4.5 pt-2">
      {/* One container: prompt on top, attributes and actions on the row
          below — same shape as the /app quick-start bar, so the two screens
          read as one tool. */}
      <div className="rounded-[18px] border border-[#DEDEE8] bg-[#F7F7FA] px-3 pb-2.5 pt-2.5 shadow-[0_2px_10px_-6px_rgba(23,22,31,0.18)]">
        <div className="mb-2.5 flex items-center gap-2">
          {/* Only in "generate": the edit modes already have their own
              reference-image picker in EditPanel, and two upload affordances
              side by side would read as the same action. */}
          {mode === 'generate' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_UPLOAD_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadFile(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                aria-label={t('app.commandBarUpload')}
                title={t('app.commandBarUpload')}
                className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[10px] border border-[#ECECF2] bg-white transition-colors hover:border-[#DEDEE8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload set="light" size={15} primaryColor="#8A8896" />
              </button>
            </>
          )}
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
            className="w-full bg-transparent px-1 py-1.5 text-[13.5px] text-[#17161F] outline-none placeholder:text-[#8A8896] disabled:cursor-not-allowed"
          />
        </div>

        {/* Chips grouped tight on the left, generate alone on the right —
            not one control per option spread across the width. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode first: it decides what every chip after it means. */}
          <ModeSelect
            mode={mode}
            onChange={onModeChange}
            editEnabled={editEnabled}
            disabled={inputDisabled}
          />
          {mode === 'generate' && (
            <PresetSelect preset={preset} onChange={onPresetChange} disabled={inputDisabled} />
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
          {/* Engine and send pushed to the right of the attribute row; both
              wrap together rather than stranding the send button alone. */}
          <div className="ml-auto flex items-center gap-2">
            <EngineSelect engine={engine} onChange={onEngineChange} placement="up" />
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
              className="flex h-[38px] flex-shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(113,111,255,0.7)] transition-transform duration-150 ease-out enabled:hover:-translate-y-0.5 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none min-[480px]:px-4"
            >
              <Send set="light" size={17} primaryColor="#ffffff" />
              <span className="hidden min-[480px]:inline">{submitLabel}</span>
            </button>
          </div>
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
