'use client';

// Compact preset chip, modelled on EngineSelect.
//
// The five presets used to sit in the bar as five separate pills, which is
// what made the row read as scattered controls rather than one command bar.
// Collapsed into a single chip that names the current choice and opens the
// list, the row keeps the reference's density: a few equal-weight chips, then
// the generate button.
import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, TickSquare, Star } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESET_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import { CHIP_BASE } from './chip';

export function PresetSelect({
  preset,
  onChange,
  disabled,
  placement = 'up',
}: {
  preset: PresetKey;
  onChange: (preset: PresetKey) => void;
  disabled?: boolean;
  placement?: 'up' | 'down';
}) {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={CHIP_BASE}
      >
        <Star set="light" size={13} primaryColor="#716FFF" />
        {PRESETS[preset].label[locale]}
        <span className="flex-shrink-0">
          {open ? (
            <ChevronUp set="light" size={12} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="light" size={12} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 z-10 w-[230px] rounded-2xl border border-[#ECECF2] bg-white p-2 shadow-[0_20px_40px_-16px_#17161F30] ${
            placement === 'up' ? 'bottom-[calc(100%+10px)]' : 'top-[calc(100%+10px)]'
          }`}
        >
          {PRESET_KEYS.map((key) => {
            const selected = key === preset;
            const isSketch = key === 'esquisse';
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-[10px] p-2.5 text-left hover:bg-[#F7F7FA] ${
                  selected ? 'bg-[#716FFF12]' : ''
                }`}
              >
                <span className="flex-1 text-[13px] font-medium text-[#17161F]">
                  {PRESETS[key].label[locale]}
                </span>
                {isSketch && (
                  <span className="rounded-md bg-[#EFECFF] px-1.5 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[9px] text-[#716FFF]">
                    {t('app.presetNewBadge')}
                  </span>
                )}
                {selected && <TickSquare set="light" size={15} primaryColor="#716FFF" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
