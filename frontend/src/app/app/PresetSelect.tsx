'use client';

// Compact preset chip, modelled on EngineSelect.
//
// The five presets used to sit in the bar as five separate pills, which is
// what made the row read as scattered controls rather than one command bar.
// Collapsed into a single chip that names the current choice and opens the
// list, the row keeps the reference's density: a few equal-weight chips, then
// the generate button.
import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, TickSquare } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESET_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import { CHIP_BASE } from './chip';

// The light each preset produces, as a swatch. Same encoding as the landing's
// preset cards — it previews the result instead of naming a category, and it
// replaces a star icon that meant "favourite" everywhere else in the world.
//
// Full literal class strings: Tailwind's scanner cannot see a class built by
// interpolating a colour value (see the JIT note in CLAUDE.md).
const AMBIANCE_SWATCH: Record<PresetKey, string> = {
  jour_ext: 'bg-[linear-gradient(135deg,#7FC4FF_0%,#EAF6FF_100%)]',
  jour_int: 'bg-[linear-gradient(135deg,#FFD9A0_0%,#FFF8EE_100%)]',
  nuit_ext: 'bg-[linear-gradient(135deg,#141B3D_0%,#6E6BFF_100%)]',
  nuit_int: 'bg-[linear-gradient(135deg,#2A1D12_0%,#F5A94B_100%)]',
  esquisse: 'bg-[linear-gradient(135deg,#D9D9E2_0%,#F7F7FA_100%)]',
};

function Swatch({ preset }: { preset: PresetKey }) {
  return (
    <span
      aria-hidden
      className={`h-3 w-3 flex-shrink-0 rounded-full border border-[#DEDEE8] ${AMBIANCE_SWATCH[preset]}`}
    />
  );
}

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
        <Swatch preset={preset} />
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
                <Swatch preset={key} />
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
