'use client';

// The ambiance chip — RenderBox's own control: the light in the output is the
// single decision that matters most for an architectural render.
//
// 2026-10-06 — each ambiance is shown by a real render of it (the owner's own
// images, public/presets/thumb/*, 300x200), not by a colour swatch: a small
// round picture on the chip, and a grid of pictures in the menu, so the choice
// is made by looking at the result.
//
// 2026-10-10 (owner) — the menu offers the four kinds of picture (3D plan,
// exploded view, board, isometric model) and Esquisse, portrait pictures in
// three columns; the four lights became the image generator page's
// templates. Nothing is chosen by default: "Sans ambiance" asks for a
// faithful photo render of the user's image.
import { Camera, ChevronUp, ChevronDown } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { AMBIANCE_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import { CHIP_BASE } from './chip';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

/** One picture per ambiance. */
export const PRESET_THUMB: Record<PresetKey, string> = {
  plan_3d: '/presets/thumb/plan-3d.webp',
  eclate: '/presets/thumb/eclate.webp',
  analyse: '/presets/thumb/analyse.webp',
  isometrie: '/presets/thumb/isometrie.webp',
  esquisse: '/presets/thumb/esquisse.webp',
  jour_ext: '/presets/thumb/jour-ext.jpg',
  jour_int: '/presets/thumb/jour-int.jpg',
  nuit_ext: '/presets/thumb/nuit-ext.jpg',
  nuit_int: '/presets/thumb/nuit-int.jpg',
};

const NO_AMBIANCE_TILE = (
  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[#E9E9EE]">
    <Camera set="curved" size={12} primaryColor="#3D3B49" />
  </span>
);

export function PresetSelect({
  preset,
  onChange,
  disabled,
  placement = 'up',
}: {
  /** null: no ambiance — a faithful photo render. */
  preset: PresetKey | null;
  onChange: (preset: PresetKey | null) => void;
  disabled?: boolean;
  placement?: 'up' | 'down';
}) {
  const { locale, t } = useLocale();
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
        aria-label={t('app.presetLabel')}
        className={`${CHIP_BASE} pl-1`}
      >
        {preset ? (
          <img
            src={PRESET_THUMB[preset]}
            alt=""
            className="h-5 w-5 flex-shrink-0 rounded-md border border-white object-cover shadow-[0_0_0_1px_#ECECF2]"
          />
        ) : (
          NO_AMBIANCE_TILE
        )}
        {preset ? PRESETS[preset].label[locale] : t('app.presetNone')}
        <span className="flex-shrink-0">
          {open ? (
            <ChevronUp set="curved" size={12} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="curved" size={12} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        <div
          className={`${popoverPanelClass({ placement })} w-[320px] max-w-[calc(100vw-32px)]`}
          role="menu"
        >
          <p className={POPOVER_HEADING}>{t('app.presetLabel')}</p>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={preset === null}
            onClick={() => {
              onChange(null);
              closeNow();
            }}
            className={`mx-1 mb-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left transition-colors duration-150 ease-out ${
              preset === null
                ? 'border-[#435CFE] bg-[#F4F6FF]'
                : 'border-transparent bg-[#F2F2F5] hover:bg-[#E9E9EE]'
            }`}
          >
            {NO_AMBIANCE_TILE}
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-[#17161F]">
                {t('app.presetNone')}
              </span>
              <span className="block text-[11px] text-[#6B6878]">{t('app.presetNoneHint')}</span>
            </span>
          </button>
          <div className="grid grid-cols-3 gap-1.5 p-1">
            {AMBIANCE_KEYS.map((key) => {
              const selected = key === preset;
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
                  className={`group relative overflow-hidden rounded-xl border-2 text-left transition-colors duration-150 ease-out ${
                    selected ? 'border-[#435CFE]' : 'border-transparent hover:border-[#D5DCFF]'
                  }`}
                >
                  <img
                    src={PRESET_THUMB[key]}
                    alt=""
                    className="aspect-[3/4] w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1.5 pt-5 text-[11px] font-semibold leading-tight text-white">
                    {PRESETS[key].label[locale]}
                  </span>
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-[#2948FC]">
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
