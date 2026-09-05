'use client';

// The model chip — first control in the command bar, as in the reference,
// because it is the choice every other control is conditioned on: which
// ratios exist, which resolutions exist, how long a generation takes.
//
// The panel is the reference's own model popover: a "Model" caption over a
// radio list. Radios rather than a trailing tick — one of these is on, and a
// radio says so before a single label has been read.
import { ChevronUp, ChevronDown, Image } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { Radio } from './Radio';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

// Two marks that tell the engines apart without naming their vendors. The
// previous pair gave the game away on their own: a yellow-to-orange banana and
// an OpenAI blue. Both now sit inside the RenderBox violet range.
const ENGINE_ICON_CLASS: Record<EngineName, string> = {
  nanobanana: 'bg-gradient-to-br from-[#6E6BFF] to-[#A855F7]',
  gpt_image: 'bg-gradient-to-br from-[#3D3B49] to-[#17161F]',
};

export function EngineSelect({
  engine,
  onChange,
  disabled,
  placement = 'down',
  align = 'start',
}: {
  engine: EngineName;
  onChange: (engine: EngineName) => void;
  disabled?: boolean;
  // The panel is absolutely positioned, so it has to open away from the edge
  // it sits against: 'up' from the bottom command bar, 'down' from a header.
  placement?: 'up' | 'down';
  // Which edge the panel hangs from. 'start' now that the chip leads the
  // command-bar row; 'end' remains for a trigger sitting at the right of a
  // row, where a left-anchored panel would hang off the screen.
  align?: 'start' | 'end';
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
        className="flex flex-shrink-0 items-center gap-2 rounded-full border border-[#ECECF2] bg-white py-1.5 pl-1.5 pr-3 transition-colors hover:border-[#DEDEE8] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={`flex h-[22px] w-[22px] items-center justify-center rounded-md ${ENGINE_ICON_CLASS[engine]}`}
        >
          <Image set="light" size={12} primaryColor="#ffffff" />
        </span>
        <span className="text-[12.5px] font-medium text-[#17161F]">
          {ENGINE_LABELS[engine].name[locale]}
        </span>
        <span className="ml-0.5 flex-shrink-0">
          {open ? (
            <ChevronUp set="light" size={13} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="light" size={13} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        <div className={`${popoverPanelClass({ placement, align })} w-[268px]`} role="menu">
          <p className={POPOVER_HEADING}>{t('app.engineLabel')}</p>
          {ENGINE_NAMES.map((key) => {
            const selected = key === engine;
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
                className="flex w-full items-center gap-2.5 rounded-[10px] p-2.5 text-left transition-colors duration-150 ease-out hover:bg-[#F7F7FA]"
              >
                <Radio checked={selected} />
                <span
                  className={`flex h-[28px] w-[28px] flex-shrink-0 items-center justify-center rounded-lg ${ENGINE_ICON_CLASS[key]}`}
                >
                  <Image set="light" size={14} primaryColor="#ffffff" />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-[#17161F]">
                    {ENGINE_LABELS[key].name[locale]}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-[1.4] text-[#8A8896]">
                    {ENGINE_LABELS[key].description[locale]}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="mx-1 my-1.5 h-px bg-[#ECECF2]" />
          <p className="px-2.5 pb-1 pt-1 text-[10.5px] leading-relaxed text-[#8A8896]">
            {t('app.engineDropdownNote')}
          </p>
        </div>
      )}
    </div>
  );
}
