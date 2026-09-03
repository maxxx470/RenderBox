// Announcements shown on /info.
//
// The copy lives here as {fr, en} pairs rather than as i18n dictionary keys:
// this list grows by one entry every release, and two dictionary keys per
// entry in two files would make writing an announcement a chore nobody does.
// Same shape as PRESETS in lib/server/generation/presets.ts, which already
// carries bilingual labels this way.
//
// To publish an announcement: add an entry at the TOP of the array, with a
// real ISO date. That is the whole procedure — the page renders whatever is
// here, newest first, and groups by kind on its own.
//
// One rule: an entry must describe something that actually shipped, or, under
// `kind: 'planned'`, something explicitly labelled as not yet available. A
// dated entry for work that is not live turns this page into a page nobody
// trusts.

export type AnnouncementKind = 'shipped' | 'planned';

export interface Announcement {
  id: string;
  /** ISO date (YYYY-MM-DD). Shipped entries carry the day they went live. */
  date: string;
  kind: AnnouncementKind;
  title: { fr: string; en: string };
  body: { fr: string; en: string };
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: 'dashboard',
    date: '2026-09-03',
    kind: 'shipped',
    title: { fr: 'Tableau de bord', en: 'Dashboard' },
    body: {
      fr: '« Mes projets » devient un tableau de bord : palier actif, générations restantes sur le mois avec la date de renouvellement, nombre de projets, nombre de rendus générés et dernière activité — puis la liste des projets juste en dessous.',
      en: '"My projects" is now a dashboard: active plan, generations left this month with the renewal date, project count, renders generated and last activity — with the project list right below.',
    },
  },
  {
    id: 'icons-light',
    date: '2026-09-03',
    kind: 'shipped',
    title: { fr: 'Icônes en traits fins', en: 'Thin-line icons' },
    body: {
      fr: "Toutes les icônes du site passent des pleins aux traits fins, sur l'ensemble des pages.",
      en: 'Every icon across the site moved from the filled set to thin outlines.',
    },
  },
  {
    id: 'modes-image',
    date: '2026-09-03',
    kind: 'shipped',
    title: { fr: 'Le mode « Générer » devient « Image »', en: '"Generate" mode is now "Image"' },
    body: {
      fr: 'Le mode est nommé par ce qu’il produit. Retouche et ajout d’élément ne changent pas.',
      en: 'The mode is named after what it produces. Retouch and add-element are unchanged.',
    },
  },
  {
    id: 'landing-v2',
    date: '2026-09-02',
    kind: 'shipped',
    title: { fr: 'Nouvelle page d’accueil', en: 'New home page' },
    body: {
      fr: 'Refonte complète de la page d’accueil et passage de toute l’application à la charte violette : nouvelles polices, nouvelles couleurs, mêmes fonctionnalités.',
      en: 'The home page was rebuilt and the whole app moved to the violet charter: new fonts, new colours, same features.',
    },
  },
  {
    id: 'video-mode',
    date: '2026-09-03',
    kind: 'planned',
    title: { fr: 'Génération vidéo', en: 'Video generation' },
    body: {
      fr: 'Un mode « Vidéo » apparaît désormais dans la barre latérale, désactivé. Il sera activé dans une prochaine mise à jour — aucune date n’est encore fixée.',
      en: 'A "Video" mode now appears in the sidebar, disabled. It will be switched on in a future update — no date is set yet.',
    },
  },
];
