'use client';

// What the next action does: generate a new image, retouch a zone of the
// current one, or add an element to it.
//
// This used to live in the left rail as three top-level entries. The rail now
// carries only the output kind (Image / Video), and the three ways of getting
// an image are a choice made where the action is actually fired — one chip
// among the others in the command bar.
//
// Retouch and add both operate on an existing generated render, so they are
// disabled with an explanation when nothing is selected, rather than being
// selectable into a dead end.
import { useState, useRef, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  TickSquare,
  Image as ImageIcon,
  Edit,
  PaperPlus,
} from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { AppMode } from './CommandBar';
import { CHIP_BASE } from './chip';

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

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];
  const CurrentIcon = current.icon;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
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
        <div
          className={`absolute left-0 z-10 w-[240px] rounded-2xl border border-[#ECECF2] bg-white p-2 shadow-[0_20px_40px_-16px_#17161F30] ${
            placement === 'up' ? 'bottom-[calc(100%+10px)]' : 'top-[calc(100%+10px)]'
          }`}
        >
          {MODES.map(({ key, icon: Icon, labelKey }) => {
            const selected = key === mode;
            const available = key === 'generate' || editEnabled;
            return (
              <button
                key={key}
                type="button"
                disabled={!available}
                title={available ? undefined : t('app.modeSelectNodeHint')}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-[10px] p-2.5 text-left ${
                  available
                    ? `hover:bg-[#F7F7FA] ${selected ? 'bg-[#716FFF12]' : ''}`
                    : 'cursor-not-allowed opacity-45'
                }`}
              >
                <Icon set="light" size={15} primaryColor={selected ? '#716FFF' : '#8A8896'} />
                <span className="flex-1 text-[13px] font-medium text-[#17161F]">{t(labelKey)}</span>
                {selected && available && (
                  <TickSquare set="light" size={15} primaryColor="#716FFF" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
