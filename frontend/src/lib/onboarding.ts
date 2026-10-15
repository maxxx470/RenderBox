// The onboarding's choices (owner, 2026-10-13: « le SaaS fera connaissance
// avec l'utilisateur »), as stable keys — the account stores the key, the
// dictionaries hold the label (`onboarding.<group>.<key>`). Shared by the
// /bienvenue page and the route that saves it (api/users/me/profile), which
// refuses anything not listed here. Not `server-only`: the page enumerates
// them.

export const PROFESSIONS = [
  'architect',
  'interior',
  'developer',
  'builder',
  'decorator',
  'student',
  'other',
] as const;

export const TEAM_SIZES = ['solo', 'small', 'medium', 'large'] as const;

export const PROJECT_TYPES = [
  'houses',
  'buildings',
  'interiors',
  'commercial',
  'urban',
  'other',
] as const;

export const MAIN_USES = ['clients', 'permits', 'ideas', 'marketing'] as const;

export const REFERRAL_SOURCES = [
  'word',
  'facebook',
  'tiktok',
  'linkedin',
  'youtube',
  'search',
  'other',
] as const;

/** Suggested in the country field (free text is accepted too). */
export const COUNTRY_SUGGESTIONS_FR = [
  'Sénégal',
  'Côte d’Ivoire',
  'Mali',
  'Burkina Faso',
  'Bénin',
  'Togo',
  'Niger',
  'Guinée',
  'Cameroun',
  'Gabon',
  'Congo',
  'RD Congo',
  'Maroc',
  'Tunisie',
  'Algérie',
  'France',
  'Belgique',
  'Suisse',
  'Canada',
] as const;

/** What the onboarding must have before it counts as done. */
export const REQUIRED_FIELDS = ['name', 'profession', 'country'] as const;

export type Profession = (typeof PROFESSIONS)[number];
export type TeamSize = (typeof TEAM_SIZES)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];
export type MainUse = (typeof MAIN_USES)[number];
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];
