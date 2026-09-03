'use client';

// The video mode, announced but not built.
//
// It is deliberately NOT a member of `AppMode`: that union drives the edit
// dispatch (EDIT_TYPE), the command bar and the generation call, and widening
// it would push an unhandled value through all of them for a feature that
// cannot run. This is a disabled button that shares the rails' shape, nothing
// more — it cannot be selected, so no code path downstream can ever receive
// 'video'. Wire it into AppMode on the day the backend can answer it.
import { Video } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';

export function VideoModeSoon({
  className,
  labelClassName,
  collapsed,
}: {
  /** Rail-specific layout classes; the two sidebars style their rows differently. */
  className: string;
  /** Applied to the text so a collapsed rail can hide it like its siblings. */
  labelClassName: string;
  collapsed: boolean;
}) {
  const t = useTranslations();
  const label = t('app.modeVideo');

  return (
    <button
      type="button"
      disabled
      title={collapsed ? `${label} — ${t('app.modeVideoSoon')}` : t('app.modeVideoSoon')}
      aria-label={`${label} — ${t('app.modeVideoSoon')}`}
      className={`flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-medium text-[#8A8896] ${className}`}
    >
      <Video set="light" size={16} primaryColor="#B4B2BE" />
      <span className={`flex flex-1 items-center justify-between gap-2 ${labelClassName}`}>
        {label}
        <span className="rounded-full bg-[#F1F0F6] px-1.5 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[9px] uppercase tracking-wide text-[#8A8896]">
          {t('app.modeSoonBadge')}
        </span>
      </span>
    </button>
  );
}
