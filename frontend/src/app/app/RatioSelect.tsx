'use client';

// Output-ratio chip for the command bar.
//
// It decides the shape of what the next generation or edit will produce, and
// the value is sent to the engine ('auto' keeps the image's own framing).
//
// The panel is the reference bar's own: a grid of tiles each drawn to its own
// proportion with the ratio written inside it, and a large preview beside
// them showing the shape currently chosen. The list it replaced named the
// ratios next to a 16px thumbnail too small to tell one from the other — so
// the control that decides the SHAPE of the output was read entirely off
// text.
//
// Every ratio is available on both engines since 2026-10-08 (owner: a paying
// user gets everything) — see generation/ratios.ts and output-shape.ts.
import { ChevronUp, ChevronDown } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { RATIO_KEYS, RATIOS, type RatioKey } from '@/lib/server/generation/ratios';
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
        className={`rounded-[2px] border border-[#2948FC] ${
          ratio === 'auto' ? 'border-dashed' : ''
        }`}
      />
    </span>
  );
}

export function RatioSelect({
  ratio,
  onChange,
  disabled,
  placement = 'up',
}: {
  ratio: RatioKey;
  onChange: (ratio: RatioKey) => void;
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
        <span className="font-[family-name:var(--font-mono)] text-[12px]">
          {ratio === 'auto' ? t('app.ratioAuto') : RATIOS[ratio].label}
        </span>
        <span className="flex-shrink-0">
          {open ? (
            <ChevronUp set="curved" size={12} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="curved" size={12} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        <div className={`${popoverPanelClass({ placement })} w-[318px]`} role="menu">
          <p className={POPOVER_HEADING}>{t('app.ratioLabel')}</p>
          <div className="flex items-stretch gap-2.5 p-1">
            {/* Tiles left, preview right — the reference's arrangement. Three
                columns, four rows for the eleven ratios (2026-10-08): wider,
                the panel ran under the side column. */}
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {RATIO_KEYS.map((key) => {
                const selected = key === ratio;
                const shape = proportions(key, 26);
                return (
                  <button
                    key={key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      onChange(key);
                      closeNow();
                    }}
                    className={`flex h-[52px] flex-col items-center justify-center gap-1 rounded-[10px] border transition-colors duration-150 ease-out ${
                      selected
                        ? 'border-[#2948FC] bg-[#F4F6FF]'
                        : 'border-transparent bg-[#F4F4F6] hover:bg-[#ECECF0]'
                    }`}
                  >
                    <span
                      aria-hidden
                      style={{ width: shape.width, height: shape.height }}
                      className={`rounded-[3px] border ${
                        selected ? 'border-[#2948FC]' : 'border-[#C9C7D1]'
                      } ${key === 'auto' ? 'border-dashed' : ''}`}
                    />
                    <span
                      className={`font-[family-name:var(--font-mono)] text-[9.5px] ${
                        selected ? 'text-[#1E36D6]' : 'text-[#6B6878]'
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
            <div className="flex w-[112px] flex-shrink-0 items-center justify-center rounded-[12px] bg-[#FBFBFD]">
              <div
                aria-hidden
                style={{ width: preview.width, height: preview.height }}
                className={`relative rounded-[6px] ${ratio === 'auto' ? 'border-dashed' : ''}`}
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
