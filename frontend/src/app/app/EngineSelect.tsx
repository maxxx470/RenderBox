'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, TickSquare } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';

const ENGINE_ICON_CLASS: Record<EngineName, string> = {
  nanobanana: 'bg-gradient-to-br from-[#FFC93D] to-[#E88A00]',
  gpt_image: 'bg-gradient-to-br from-[#3D8BFF] to-[#1B4FCC]',
};

export function EngineSelect({
  engine,
  onChange,
  disabled,
}: {
  engine: EngineName;
  onChange: (engine: EngineName) => void;
  disabled?: boolean;
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
        className="flex flex-shrink-0 items-center gap-2 rounded-full border border-[#ECE3E5] bg-[#F8F5F6] py-2 pl-2 pr-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`h-[22px] w-[22px] rounded-md ${ENGINE_ICON_CLASS[engine]}`} />
        <span className="text-[12.5px] font-medium text-[#170608]">
          {ENGINE_LABELS[engine].name}
        </span>
        <span className="ml-0.5 flex-shrink-0">
          {open ? (
            <ChevronUp set="bold" size={13} primaryColor="#7A6E71" />
          ) : (
            <ChevronDown set="bold" size={13} primaryColor="#7A6E71" />
          )}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-[56px] right-0 z-10 w-[260px] rounded-2xl border border-[#ECE3E5] bg-white p-2 shadow-[0_20px_40px_-16px_#17060830]">
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
                className={`flex w-full items-center gap-2.5 rounded-[10px] p-2.5 text-left hover:bg-[#F8F5F6] ${
                  selected ? 'bg-[#C8112012]' : ''
                }`}
              >
                <span
                  className={`h-[30px] w-[30px] flex-shrink-0 rounded-lg ${ENGINE_ICON_CLASS[key]}`}
                />
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-[#170608]">
                    {ENGINE_LABELS[key].name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#7A6E71]">
                    {ENGINE_LABELS[key].description[locale]}
                  </span>
                </span>
                {selected && <TickSquare set="bold" size={16} primaryColor="#C81120" />}
              </button>
            );
          })}
          <div className="mx-1 my-1.5 h-px bg-[#ECE3E5]" />
          <p className="px-2.5 pb-1 pt-2 text-[10.5px] leading-relaxed text-[#7A6E71]">
            {t('app.engineDropdownNote')}
          </p>
        </div>
      )}
    </div>
  );
}
