'use client';

import { useLocale } from '@/lib/i18n/LocaleContext';

// Shared FR/EN buttons — no positioning of its own, so callers with a header
// or nav bar can drop it inline without fighting a `fixed` sibling for the
// same top-right corner (see LanguageToggle below for why that matters).
export function LanguageInlineSwitch({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className={`inline-flex items-center gap-1 font-[family-name:var(--font-jetbrains-mono)] text-xs text-[#8A8896] ${className}`}
    >
      <button
        type="button"
        onClick={() => setLocale('fr')}
        className={locale === 'fr' ? 'font-medium text-[#17161F]' : 'hover:text-[#17161F]'}
      >
        FR
      </button>
      <span aria-hidden>/</span>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={locale === 'en' ? 'font-medium text-[#17161F]' : 'hover:text-[#17161F]'}
      >
        EN
      </button>
    </div>
  );
}

// Self-positioning variant for pages with no header/nav to dock into (simple
// centered layouts: /connexion, /parametres, /legal, /exemple,
// /paiement/retour). Wrapped in its own pill so it reads as a distinct
// floating control instead of bare text that can visually merge with
// whatever else sits in that corner — z-50 + compact offsets keep it clear
// of content and clickable at every viewport width.
export function LanguageToggle() {
  return (
    <div className="fixed right-3 top-3 z-50 min-[640px]:right-5 min-[640px]:top-4">
      <div className="rounded-full border border-[#ECECF2] bg-white/95 px-3 py-1.5 shadow-[0_4px_14px_-6px_rgba(23,22,31,0.18)] backdrop-blur">
        <LanguageInlineSwitch />
      </div>
    </div>
  );
}
