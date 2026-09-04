'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, TickSquare, Image } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';

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
  align = 'end',
}: {
  engine: EngineName;
  onChange: (engine: EngineName) => void;
  disabled?: boolean;
  // The panel is absolutely positioned, so it has to open away from the edge
  // it sits against: 'up' from the bottom command bar, 'down' from a header.
  placement?: 'up' | 'down';
  // Which edge the 260px panel hangs from. 'end' suits the command bar, where
  // the trigger sits at the right of the row. It does NOT suit a trigger at
  // the left of a card: on /parametres at 390px the panel hung 96px off the
  // left of the screen, taking both engine names with it.
  align?: 'start' | 'end';
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
        className="flex flex-shrink-0 items-center gap-2 rounded-full border border-[#ECECF2] bg-white py-2 pl-2 pr-3 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div
          className={`absolute z-10 w-[260px] rounded-2xl border border-[#ECECF2] bg-white p-2 shadow-[0_20px_40px_-16px_#17161F30] ${
            align === 'start' ? 'left-0' : 'right-0'
          } ${placement === 'up' ? 'bottom-[calc(100%+10px)]' : 'top-[calc(100%+10px)]'}`}
        >
          {ENGINE_NAMES.map((key) => {
            const selected = key === engine;
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
                <span
                  className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg ${ENGINE_ICON_CLASS[key]}`}
                >
                  <Image set="light" size={15} primaryColor="#ffffff" />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-[#17161F]">
                    {ENGINE_LABELS[key].name[locale]}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#8A8896]">
                    {ENGINE_LABELS[key].description[locale]}
                  </span>
                </span>
                {selected && <TickSquare set="light" size={16} primaryColor="#716FFF" />}
              </button>
            );
          })}
          <div className="mx-1 my-1.5 h-px bg-[#ECECF2]" />
          <p className="px-2.5 pb-1 pt-2 text-[10.5px] leading-relaxed text-[#8A8896]">
            {t('app.engineDropdownNote')}
          </p>
        </div>
      )}
    </div>
  );
}
