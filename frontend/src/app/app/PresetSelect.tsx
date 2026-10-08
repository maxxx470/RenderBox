'use client';

// The ambiance chip — RenderBox's own control: the light in the output is the
// single decision that matters most for an architectural render.
//
// 2026-10-06 — each ambiance is shown by a real render of it (the owner's own
// images, public/presets/thumb/*, 300x200), not by a colour swatch: a small
// round picture on the chip, and a grid of pictures in the menu, so the choice
// is made by looking at the result.
import { ChevronUp, ChevronDown } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESET_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import { CHIP_BASE } from './chip';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

/** One picture per ambiance. */
export const PRESET_THUMB: Record<PresetKey, string> = {
  jour_ext: '/presets/thumb/jour-ext.jpg',
  jour_int: '/presets/thumb/jour-int.jpg',
  nuit_ext: '/presets/thumb/nuit-ext.jpg',
  nuit_int: '/presets/thumb/nuit-int.jpg',
  esquisse: '/presets/thumb/esquisse.jpg',
};

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
        <img
          src={PRESET_THUMB[preset]}
          alt=""
          className="h-5 w-5 flex-shrink-0 rounded-md border border-white object-cover shadow-[0_0_0_1px_#ECECF2]"
        />
        {PRESETS[preset].label[locale]}
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
          className={`${popoverPanelClass({ placement })} w-[296px] max-w-[calc(100vw-32px)]`}
          role="menu"
        >
          <p className={POPOVER_HEADING}>{t('app.presetLabel')}</p>
          <div className="grid grid-cols-2 gap-1.5 p-1">
            {PRESET_KEYS.map((key) => {
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
                    className="aspect-[3/2] w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-4 text-[11.5px] font-semibold text-white">
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
