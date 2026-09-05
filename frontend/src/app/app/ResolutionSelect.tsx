'use client';

// Output resolution — the "1K / 2K / 4K" chip, modelled on the reference
// command bar's own, down to the seconds-estimate trailing each row.
//
// See lib/server/generation/resolutions.ts for which entries an engine can
// actually honour. The ones it cannot are shown and disabled, the same
// treatment RatioSelect already gives a ratio an engine cannot produce — a
// row that accepted the click and quietly returned 1024px would be worse than
// no control at all.
import { ChevronUp, ChevronDown } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import {
  RESOLUTION_KEYS,
  RESOLUTIONS,
  isResolutionSupported,
  type ResolutionKey,
} from '@/lib/server/generation/resolutions';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { CHIP_BASE } from './chip';
import { Radio } from './Radio';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

/** A cut gem, seen from above — the reference's own mark for this control. */
function GemGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="#8A8896"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <path d="M6.2 4.5h11.6l3.4 5-9.2 10.2L2.8 9.5z" />
      <path d="M2.8 9.5h18.4" />
      <path d="M9.2 9.5 12 19.7l2.8-10.2-2.2-5h-1.2z" />
    </svg>
  );
}

export function ResolutionSelect({
  resolution,
  onChange,
  engine,
  disabled,
  placement = 'up',
}: {
  resolution: ResolutionKey;
  onChange: (resolution: ResolutionKey) => void;
  engine: EngineName;
  disabled?: boolean;
  placement?: 'up' | 'down';
}) {
  const { t } = useLocale();
  const { open, ref, toggle, closeNow, hoverProps } = useHoverPopover({
    disabled: Boolean(disabled),
  });

  return (
    <div className="relative" ref={ref} {...hoverProps}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('app.resolutionLabel')}
        title={t('app.resolutionLabel')}
        className={CHIP_BASE}
      >
        <GemGlyph />
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px]">
          {RESOLUTIONS[resolution].label}
        </span>
        <span className="flex-shrink-0">
          {open ? (
            <ChevronUp set="light" size={12} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="light" size={12} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        <div className={`${popoverPanelClass({ placement })} w-[212px]`} role="menu">
          <p className={POPOVER_HEADING}>{t('app.resolutionLabel')}</p>
          {RESOLUTION_KEYS.map((key) => {
            const selected = key === resolution;
            const available = isResolutionSupported(key, engine);
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={!available}
                title={available ? undefined : t('app.resolutionUnsupported')}
                onClick={() => {
                  onChange(key);
                  closeNow();
                }}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150 ease-out ${
                  available ? 'hover:bg-[#F7F7FA]' : 'cursor-not-allowed opacity-45'
                }`}
              >
                <Radio checked={selected && available} />
                <span className="flex-1 font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-medium text-[#17161F]">
                  {RESOLUTIONS[key].label}
                </span>
                {available ? (
                  // The reference prints the estimate in the same muted grey,
                  // right-aligned: it is the cost of the row, not a second
                  // label competing with the size.
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
                    ~{RESOLUTIONS[key].etaSeconds}s
                  </span>
                ) : (
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] uppercase tracking-wide text-[#8A8896]">
                    {t('app.ratioUnsupportedBadge')}
                  </span>
                )}
              </button>
            );
          })}
          {/* Why two of the three are greyed, said once rather than three
              times in three tooltips nobody opens. */}
          <div className="mx-1 my-1 h-px bg-[#ECECF2]" />
          <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] leading-relaxed text-[#8A8896]">
            {t('app.resolutionNote')}
          </p>
        </div>
      )}
    </div>
  );
}
