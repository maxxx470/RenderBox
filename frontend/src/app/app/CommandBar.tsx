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
import { CHIP_ACTIVE, CHIP_STATIC } from './chip';

export type AppMode = 'generate' | 'retouch' | 'add';

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={active ? CHIP_ACTIVE : CHIP_STATIC}>
      {active && <TickSquare set="bold" size={13} primaryColor="#ffffff" />}
      {label}
    </span>
  );
}

// Krea pattern: pills reflect the active mode's current state instead of a
// fixed list shared by every mode — presets in "generate", zone/reference
// status in "retouch"/"add".
export function CommandBar({
  mode,
  prompt,
  onPromptChange,
  preset,
  onPresetChange,
  zoneSelected,
  referenceAdded,
  onSubmit,
  inputDisabled,
  sendDisabled,
  generating,
  engine,
  onEngineChange,
  onUploadFile,
  uploading,
  imageSrc,
}: {
  mode: AppMode;
  prompt: string;
  onPromptChange: (v: string) => void;
  preset: PresetKey;
  onPresetChange: (v: PresetKey) => void;
  zoneSelected: boolean;
  referenceAdded: boolean;
  onSubmit: () => void;
  inputDisabled: boolean;
  sendDisabled: boolean;
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
                <Upload set="bold" size={15} primaryColor="#8A8896" />
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
          {mode === 'generate' && (
            <PresetSelect preset={preset} onChange={onPresetChange} disabled={inputDisabled} />
          )}
          {imageSrc && <RatioChip src={imageSrc} />}
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
            <button
              type="button"
              disabled={sendDisabled || generating}
              onClick={onSubmit}
              className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] text-white disabled:opacity-50"
            >
              <Send set="bold" size={17} primaryColor="#ffffff" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
