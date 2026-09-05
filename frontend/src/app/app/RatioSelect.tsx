'use client';

// Output-ratio chip for the command bar.
//
// Unlike RatioChip — which only *reports* the dimensions of the image already
// on screen — this one decides what the next generation will produce, and the
// value is sent to the engine.
//
// The panel is the reference bar's own: a grid of tiles each drawn to its own
// proportion with the ratio written inside it, and a large preview beside
// them showing the shape currently chosen. The list it replaced named the
// ratios next to a 16px thumbnail too small to tell one from the other — so
// the control that decides the SHAPE of the output was read entirely off
// text.
//
// Ratios the selected engine cannot produce are shown but disabled. Hiding
// them would leave the user wondering why the grid shrank when they switched
// engine; approximating them would be worse still (16:9 asked, 3:2 returned,
// no way to tell). AppShell resets an unsupported choice to 'auto' when the
// engine changes, so this can never submit a ratio the route would refuse.
import { ChevronUp, ChevronDown } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import {
  RATIO_KEYS,
  RATIOS,
  isRatioSupported,
  type RatioKey,
} from '@/lib/server/generation/ratios';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { CHIP_BASE } from './chip';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

/**
 * The proportions of a ratio, scaled to fit a box of `long` pixels on its
 * longest side. Derived from the key rather than tabulated per entry, so
 * adding a ratio to ratios.ts needs no change here.
 *
 * 'auto' has no proportion of its own — the engine keeps the source image's
 * framing — so it is drawn as a square, the shape that favours neither
 * orientation, and dashed, so it never passes for a real 1:1.
 */
function proportions(ratio: RatioKey, long: number) {
  if (ratio === 'auto') return { width: Math.round(long * 0.82), height: Math.round(long * 0.82) };
  const parts = ratio.split(':');
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  return {
    width: w >= h ? long : Math.round((w / h) * long),
    height: h >= w ? long : Math.round((h / w) * long),
  };
}

/** The miniature inside the chip itself, at the size of a piece of text. */
function RatioGlyph({ ratio }: { ratio: RatioKey }) {
  const { width, height } = proportions(ratio, 14);
  return (
    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
      <span
        aria-hidden
        style={{ width, height }}
        className={`rounded-[2px] border border-[#716FFF] ${
          ratio === 'auto' ? 'border-dashed' : ''
        }`}
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
  const { open, ref, toggle, closeNow, hoverProps } = useHoverPopover({
    disabled: Boolean(disabled),
  });

  const preview = proportions(ratio, 96);

  return (
    <div className="relative" ref={ref} {...hoverProps}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('app.ratioLabel')}
        title={t('app.ratioLabel')}
        className={CHIP_BASE}
      >
        <RatioGlyph ratio={ratio} />
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px]">
          {ratio === 'auto' ? t('app.ratioAuto') : RATIOS[ratio].label}
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
        <div className={`${popoverPanelClass({ placement })} w-[318px]`} role="menu">
          <p className={POPOVER_HEADING}>{t('app.ratioLabel')}</p>
          <div className="flex items-stretch gap-2.5 p-1">
            {/* Tiles left, preview right — the reference's arrangement. Three
                columns rather than its seven: we offer six ratios, not
                thirteen, and stretching six across that width would leave the
                grid mostly air. */}
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {RATIO_KEYS.map((key) => {
                const selected = key === ratio;
                const available = isRatioSupported(key, engine);
                const shape = proportions(key, 26);
                return (
                  <button
                    key={key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    disabled={!available}
                    title={available ? undefined : t('app.ratioUnsupported')}
                    onClick={() => {
                      onChange(key);
                      closeNow();
                    }}
                    className={`flex h-[52px] flex-col items-center justify-center gap-1 rounded-[10px] border transition-colors duration-150 ease-out ${
                      !available
                        ? 'cursor-not-allowed border-[#F1F0F6] opacity-40'
                        : selected
                          ? 'border-[#716FFF] bg-[#F5F3FF]'
                          : 'border-[#ECECF2] hover:border-[#DEDEE8] hover:bg-[#FBFBFD]'
                    }`}
                  >
                    <span
                      aria-hidden
                      style={{ width: shape.width, height: shape.height }}
                      className={`rounded-[3px] border ${
                        selected ? 'border-[#716FFF]' : 'border-[#B4B2C0]'
                      } ${key === 'auto' ? 'border-dashed' : ''}`}
                    />
                    <span
                      className={`font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] ${
                        selected ? 'text-[#5A57D6]' : 'text-[#6B6880]'
                      }`}
                    >
                      {key === 'auto' ? t('app.ratioAuto') : RATIOS[key].label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* The chosen shape at a size you can actually judge, with the
                thirds guides the reference draws inside it — this is a frame,
                and a frame is what you compose against. */}
            <div className="flex w-[112px] flex-shrink-0 items-center justify-center rounded-[12px] border border-[#ECECF2] bg-[#FBFBFD]">
              <div
                aria-hidden
                style={{ width: preview.width, height: preview.height }}
                className={`relative rounded-[6px] border-[1.5px] border-[#17161F] ${
                  ratio === 'auto' ? 'border-dashed' : ''
                }`}
              >
                <span className="absolute inset-y-0 left-1/3 w-px bg-[#ECECF2]" />
                <span className="absolute inset-y-0 left-2/3 w-px bg-[#ECECF2]" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-[#ECECF2]" />
                <span className="absolute inset-x-0 top-2/3 h-px bg-[#ECECF2]" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
