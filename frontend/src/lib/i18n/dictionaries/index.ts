import fr from './fr';
import en from './en';

export const dictionaries = { fr, en };
export type Locale = keyof typeof dictionaries;
export type TranslationKey = keyof typeof fr;

export const DEFAULT_LOCALE: Locale = 'fr';
