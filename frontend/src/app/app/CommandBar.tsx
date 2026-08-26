'use client';

import { Send } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESET_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { EngineSelect } from './EngineSelect';

export function CommandBar({
  prompt,
  onPromptChange,
  preset,
  onPresetChange,
  engine,
  onEngineChange,
  onSubmit,
  disabled,
  generating,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  preset: PresetKey;
  onPresetChange: (v: PresetKey) => void;
  engine: EngineName;
  onEngineChange: (v: EngineName) => void;
  onSubmit: () => void;
  disabled: boolean;
  generating: boolean;
}) {
  const { locale, t } = useLocale();

  return (
    <div className="border-t border-[#ECE3E5] px-5.5 pb-4.5 pt-3.5">
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESET_KEYS.map((key) => {
          const active = preset === key;
          const isSketch = key === 'esquisse';
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPresetChange(key)}
              className={[
                'flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                isSketch ? 'border-dashed' : '',
                active
                  ? isSketch
                    ? 'border-transparent bg-gradient-to-br from-[#3D3D3D] to-[#0A0A0A] text-white'
                    : 'border-transparent bg-gradient-to-br from-[#E8121F] to-[#7F0000] text-white'
                  : 'border-[#ECE3E5] bg-[#F8F5F6] text-[#7A6E71] hover:border-[#D9C4C6]',
              ].join(' ')}
            >
              {PRESETS[key].label[locale]}
              {isSketch && (
                <span className="rounded-md bg-white px-1.5 py-0.5 font-[family-name:var(--font-ibm-plex-mono)] text-[9px] text-[#C81120]">
                  {t('app.presetNewBadge')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5">
        <div className="flex flex-1 items-center gap-2.5 rounded-[14px] border border-[#ECE3E5] bg-[#F8F5F6] px-4 py-3">
          <input
            type="text"
            placeholder={t('app.cmdbarPlaceholder')}
            value={prompt}
            disabled={disabled}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !disabled) onSubmit();
            }}
            className="w-full bg-transparent text-[13px] text-[#170608] outline-none placeholder:text-[#7A6E71] disabled:cursor-not-allowed"
          />
        </div>
        <EngineSelect engine={engine} onChange={onEngineChange} disabled={disabled} />
        <button
          type="button"
          disabled={disabled || generating}
          onClick={onSubmit}
          className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] text-white disabled:opacity-50"
        >
          <Send set="bold" size={17} primaryColor="#ffffff" />
        </button>
      </div>
    </div>
  );
}
