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
// Two rules, and the second one is the one that gets broken.
//
//  1. An entry must describe something that actually shipped, or, under
//     `kind: 'planned'`, something explicitly labelled as not yet available.
//     A dated entry for work that is not live turns this page into a page
//     nobody trusts.
//
//  2. An entry must be about the PRODUCT, not about the build. This list held
//     "every icon moved from the filled set to thin outlines" and "the app
//     moved to the violet charter: new fonts, new colours, same features".
//     Both were true and both were notes to the people writing the code. A
//     customer reading them learns that the thing they are paying for was
//     being restyled last week, and "same features" says out loud that the
//     release contained nothing for them. If an entry would not interest
//     someone who has never seen the repository, it does not belong here.

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
    id: 'dashboard-showcase',
    date: '2026-09-05',
    kind: 'shipped',
    title: {
      fr: 'Rendus en vitrine sur le tableau de bord',
      en: 'Showcase renders on the dashboard',
    },
    body: {
      fr: 'Le haut du tableau de bord présente une sélection de rendus RenderBox, une par ambiance, et rappelle les trois étapes d’un rendu — de la photo ou du croquis jusqu’à l’image finale.',
      en: 'The top of the dashboard now shows a selection of RenderBox renders, one per ambiance, alongside the three steps of a render — from photo or sketch to the finished image.',
    },
  },
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
    id: 'galerie-exemples',
    date: '2026-09-02',
    kind: 'shipped',
    title: { fr: 'Galerie d’exemples', en: 'Examples gallery' },
    body: {
      fr: 'Une page d’exemples regroupe des rendus réels par ambiance — extérieur et intérieur, jour et nuit, plus une esquisse — pour voir ce que chaque préréglage produit avant de lancer son premier rendu.',
      en: 'An examples page groups real renders by ambiance — exterior and interior, day and night, plus a sketch — so you can see what each preset produces before running your first render.',
    },
  },
];
