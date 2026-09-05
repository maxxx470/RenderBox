'use client';

// What the next action does: generate a new image, retouch a zone of the
// current one, or add an element to it.
//
// This used to live in the left rail as three top-level entries. The rail now
// carries only the output kind, and the three ways of getting an image are a
// choice made where the action is actually fired — the first chip in the
// command bar, because it decides what every chip after it means.
//
// Retouch and add both operate on an existing generated render, so they are
// disabled with an explanation when nothing is selected, rather than being
// selectable into a dead end.
import { ChevronUp, ChevronDown, Image as ImageIcon, Edit, PaperPlus } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { AppMode } from './CommandBar';
import { CHIP_BASE } from './chip';
import { Radio } from './Radio';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

const MODES = [
  { key: 'generate', icon: ImageIcon, labelKey: 'app.modeGenerateAction' },
  { key: 'retouch', icon: Edit, labelKey: 'app.modeRetouch' },
  { key: 'add', icon: PaperPlus, labelKey: 'app.modeAdd' },
] as const satisfies readonly { key: AppMode; icon: unknown; labelKey: string }[];

export function ModeSelect({
  mode,
  onChange,
  editEnabled,
  disabled,
  placement = 'up',
}: {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  /** False when no generated render is selected — retouch/add have no target. */
  editEnabled: boolean;
  disabled?: boolean;
  placement?: 'up' | 'down';
}) {
  const { t } = useLocale();
  const { open, ref, toggle, closeNow, hoverProps } = useHoverPopover({
    disabled: Boolean(disabled),
  });

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];
  const CurrentIcon = current.icon;

  return (
    <div className="relative" ref={ref} {...hoverProps}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('app.modesLabel')}
        className={CHIP_BASE}
      >
        <CurrentIcon set="light" size={13} primaryColor="#716FFF" />
        {t(current.labelKey)}
        <span className="flex-shrink-0">
          {open ? (
            <ChevronUp set="light" size={12} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="light" size={12} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        <div className={`${popoverPanelClass({ placement })} w-[248px]`} role="menu">
          <p className={POPOVER_HEADING}>{t('app.modesLabel')}</p>
          {MODES.map(({ key, icon: Icon, labelKey }) => {
            const selected = key === mode;
            const available = key === 'generate' || editEnabled;
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                disabled={!available}
                title={available ? undefined : t('app.modeSelectNodeHint')}
                onClick={() => {
                  onChange(key);
                  closeNow();
                }}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150 ease-out ${
                  available ? 'hover:bg-[#F7F7FA]' : 'cursor-not-allowed opacity-45'
                }`}
              >
                <Radio checked={selected && available} />
                <Icon set="light" size={15} primaryColor={selected ? '#716FFF' : '#8A8896'} />
                <span className="flex-1 text-[13px] font-medium text-[#17161F]">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
