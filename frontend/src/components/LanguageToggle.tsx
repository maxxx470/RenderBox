'use client';

import { useLocale } from '@/lib/i18n/LocaleContext';

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="fixed right-6 top-5 font-[family-name:var(--font-ibm-plex-mono)] text-xs text-[#7A6E71]">
      <button
        type="button"
        onClick={() => setLocale('fr')}
        className={locale === 'fr' ? 'font-medium text-[#170608]' : 'hover:text-[#170608]'}
      >
        FR
      </button>
      {' / '}
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={locale === 'en' ? 'font-medium text-[#170608]' : 'hover:text-[#170608]'}
      >
        EN
      </button>
    </div>
  );
}
