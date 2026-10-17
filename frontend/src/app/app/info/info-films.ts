import type { TranslationKey } from '@/lib/i18n/dictionaries';

/** The landing's feature films, shown on the in-app Info page too so the
 *  features are explained inside the app, not only to visitors (owner's
 *  brief, 2026-10-06). Same files as the landing (see motion-media.ts).
 *
 *  A new film is one more line here, with the day it is published: the
 *  « Info » entry of the rail (and « Plus » on a phone) then shows a badge
 *  to every account that has not opened the page since, and the film wears
 *  a « Nouveau » tag there (owner, 2026-10-17). */
export const INFO_FILMS: readonly {
  id: string;
  title: TranslationKey;
  alt: TranslationKey;
  /** When the film was published on the page, UTC: a day, or for a new film
   *  the deploy's hour ('2026-10-20T14:00:00Z') — otherwise an account that
   *  opened the page earlier that day would miss it. */
  addedAt: string;
}[] = [
  { id: 'etapes', title: 'info.filmEtapesTitle', alt: 'dashboard.filmAlt', addedAt: '2026-10-06' },
  {
    id: 'commenter',
    title: 'info.filmCommenterTitle',
    alt: 'landing.commentAlt',
    addedAt: '2026-10-06',
  },
  { id: 'arbre', title: 'info.filmArbreTitle', alt: 'landing.treeAlt', addedAt: '2026-10-06' },
  {
    id: 'moteurs',
    title: 'info.filmMoteursTitle',
    alt: 'landing.enginesAlt',
    addedAt: '2026-10-06',
  },
  { id: 'ajouter', title: 'info.filmAjouterTitle', alt: 'landing.addAlt', addedAt: '2026-10-09' },
  {
    id: 'ameliorer',
    title: 'info.filmAmeliorerTitle',
    alt: 'landing.enhanceAlt',
    addedAt: '2026-10-13',
  },
];

/** The badge went live then: a film published before it is never « new »,
 *  or every account older than the films would have seen « 6 » on day one. */
export const INFO_BADGE_SINCE = '2026-10-17T16:30:00Z';

/** Published after the account last opened the page (`since`: its
 *  User.infoSeenAt, or its creation date when it never did) and after the
 *  badge went live. No date at all — an unknown account — counts nothing. */
export function isNewInfoFilm(addedAt: string, since: Date | string | null): boolean {
  if (!since) return false;
  const at = new Date(addedAt.includes('T') ? addedAt : `${addedAt}T00:00:00.000Z`).getTime();
  return at > new Date(since).getTime() && at > new Date(INFO_BADGE_SINCE).getTime();
}

/** How many films are new for this account: the number on the badge. */
export function newInfoCount(since: Date | string | null): number {
  return INFO_FILMS.filter((f) => isNewInfoFilm(f.addedAt, since)).length;
}
