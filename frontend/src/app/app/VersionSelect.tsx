'use client';

// The engine's version, a chip of the command bar's settings row (owner,
// 2026-10-15: each vendor version becomes a numbered version under our name —
// Visio 1, Pro, 2, 2.1, 2 Lite; Pixel IA 1.5, 2, 2.5). The two engines stay
// the coloured toggle; this chip picks which version of the chosen one runs.
// The panel is the ratio chip's: a heading over a radio list.
import { ChevronUp, ChevronDown } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { EngineName } from '@/lib/server/generation/engines/types';
import {
  ENGINE_VERSIONS,
  versionsOf,
  type EngineVersionKey,
} from '@/lib/server/generation/engine-versions';
import { EngineLogo } from '@/components/EngineLogo';
import { CHIP_BASE } from './chip';
import { Radio } from './Radio';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

export function VersionSelect({
  engine,
  version,
  onChange,
  disabled,
  placement = 'up',
}: {
  engine: EngineName;
  version: EngineVersionKey;
  onChange: (version: EngineVersionKey) => void;
  disabled?: boolean;
  placement?: 'up' | 'down';
}) {
  const { t, locale } = useLocale();
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
        aria-label={t('app.versionLabel')}
        title={t('app.versionLabel')}
        className={`${CHIP_BASE} pl-1.5`}
      >
        <EngineLogo engine={engine} size={16} />
        <span>{ENGINE_VERSIONS[version].name[locale]}</span>
        <span className="flex-shrink-0">
          {open ? (
            <ChevronUp set="curved" size={12} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="curved" size={12} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        <div className={`${popoverPanelClass({ placement })} w-[260px]`} role="menu">
          <p className={POPOVER_HEADING}>{t('app.versionLabel')}</p>
          {versionsOf(engine).map((key) => {
            const selected = key === version;
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
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-[#17161F]">
                    {ENGINE_VERSIONS[key].name[locale]}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-[1.4] text-[#8A8896]">
                    {ENGINE_VERSIONS[key].description[locale]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
