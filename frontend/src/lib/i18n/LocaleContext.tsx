'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { COOKIE_PREFIX } from '@/lib/constants';
import { dictionaries, type Locale, type TranslationKey } from './dictionaries';

const LOCALE_COOKIE = `${COOKIE_PREFIX}-locale`;

type TranslationParams = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Non-httpOnly by design — the client reads it back on next paint to
    // avoid a flash of the wrong language (same readability posture as the
    // CSRF cookie elsewhere in this codebase). 1 year, path-wide.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => {
      const raw = dictionaries[locale][key] ?? key;
      if (!params) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      );
    },
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside a LocaleProvider');
  return ctx;
}

export function useTranslations(): (key: TranslationKey, params?: TranslationParams) => string {
  return useLocale().t;
}
