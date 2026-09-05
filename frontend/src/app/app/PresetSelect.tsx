'use client';

// The ambiance chip — RenderBox's own control, with no counterpart in the
// reference bar, because the reference generates anything and this generates
// architectural renders: the light in the output is the single decision that
// matters most here.
//
// The five presets used to sit in the bar as five separate pills, which is
// what made the row read as scattered controls rather than one command bar.
// Collapsed into a single chip that names the current choice and opens the
// list, the row keeps the reference's density: a few equal-weight chips, then
// the generate button.
import { ChevronUp, ChevronDown } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESET_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import { CHIP_BASE } from './chip';
import { Radio } from './Radio';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

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

function Swatch({ preset, size = 'sm' }: { preset: PresetKey; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`flex-shrink-0 rounded-full border border-[#DEDEE8] ${
        size === 'sm' ? 'h-3 w-3' : 'h-5 w-5'
      } ${AMBIANCE_SWATCH[preset]}`}
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
        <div className={`${popoverPanelClass({ placement })} w-[244px]`} role="menu">
          <p className={POPOVER_HEADING}>{t('app.presetLabel')}</p>
          {PRESET_KEYS.map((key) => {
            const selected = key === preset;
            const isSketch = key === 'esquisse';
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
                className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150 ease-out hover:bg-[#F7F7FA]"
              >
                <Radio checked={selected} />
                <Swatch preset={key} size="md" />
                <span className="flex-1 text-[13px] font-medium text-[#17161F]">
                  {PRESETS[key].label[locale]}
                </span>
                {isSketch && (
                  <span className="rounded-md bg-[#EFECFF] px-1.5 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[9px] text-[#5A57D6]">
                    {t('app.presetNewBadge')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
