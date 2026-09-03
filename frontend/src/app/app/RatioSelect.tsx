'use client';

// Output-ratio chip for the command bar, modelled on PresetSelect.
//
// Unlike RatioChip — which only *reports* the dimensions of the image already
// on screen — this one decides what the next generation will produce, and the
// value is sent to the engine.
//
// Ratios the selected engine cannot produce are shown but disabled. Hiding
// them would leave the user wondering why the list shrank when they switched
// engine; approximating them would be worse still (16:9 asked, 3:2 returned,
// no way to tell). AppShell resets an unsupported choice to 'auto' when the
// engine changes, so this can never submit a ratio the route would refuse.
import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, TickSquare, Scan } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import {
  RATIO_KEYS,
  RATIOS,
  isRatioSupported,
  type RatioKey,
} from '@/lib/server/generation/ratios';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { CHIP_BASE } from './chip';

// Miniature of each ratio, drawn from the numbers rather than hardcoded per
// entry, so adding a ratio to ratios.ts needs no change here.
function RatioGlyph({ ratio, active }: { ratio: RatioKey; active: boolean }) {
  if (ratio === 'auto') {
    return (
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
        <Scan set="light" size={14} primaryColor={active ? '#716FFF' : '#8A8896'} />
      </span>
    );
  }
  const parts = ratio.split(':');
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  const long = 16;
  const width = w >= h ? long : Math.round((w / h) * long);
  const height = h >= w ? long : Math.round((h / w) * long);

  return (
    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
      <span
        aria-hidden
        style={{ width, height }}
        className={`rounded-[2px] border ${active ? 'border-[#716FFF]' : 'border-[#8A8896]'}`}
      />
    </span>
  );
}

export function RatioSelect({
  ratio,
  onChange,
  engine,
  disabled,
  placement = 'up',
}: {
  ratio: RatioKey;
  onChange: (ratio: RatioKey) => void;
  engine: EngineName;
  disabled?: boolean;
  placement?: 'up' | 'down';
}) {
  const { t } = useLocale();
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
        aria-label={t('app.ratioLabel')}
        title={t('app.ratioLabel')}
        className={CHIP_BASE}
      >
        <RatioGlyph ratio={ratio} active />
        {ratio === 'auto' ? t('app.ratioAuto') : RATIOS[ratio].label}
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
          className={`absolute left-0 z-10 w-[228px] rounded-2xl border border-[#ECECF2] bg-white p-2 shadow-[0_20px_40px_-16px_#17161F30] ${
            placement === 'up' ? 'bottom-[calc(100%+10px)]' : 'top-[calc(100%+10px)]'
          }`}
        >
          {RATIO_KEYS.map((key) => {
            const selected = key === ratio;
            const available = isRatioSupported(key, engine);
            return (
              <button
                key={key}
                type="button"
                disabled={!available}
                title={available ? undefined : t('app.ratioUnsupported')}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-[10px] p-2.5 text-left ${
                  available
                    ? `hover:bg-[#F7F7FA] ${selected ? 'bg-[#716FFF12]' : ''}`
                    : 'cursor-not-allowed opacity-45'
                }`}
              >
                <RatioGlyph ratio={key} active={selected} />
                <span className="flex-1 text-[13px] font-medium text-[#17161F]">
                  {key === 'auto' ? t('app.ratioAuto') : RATIOS[key].label}
                </span>
                {!available && (
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] uppercase tracking-wide text-[#8A8896]">
                    {t('app.ratioUnsupportedBadge')}
                  </span>
                )}
                {selected && available && (
                  <TickSquare set="light" size={15} primaryColor="#716FFF" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
