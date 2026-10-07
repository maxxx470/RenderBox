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
    id: 'edit-from-image',
    date: '2026-10-06',
    kind: 'shipped',
    title: {
      fr: 'Commenter et Ajouter, dès la page Image',
      en: 'Comment and Add, straight from the Image page',
    },
    body: {
      fr: 'Plus besoin d’un rendu pour modifier une image : épinglez-la dans la barre de commande, choisissez Commenter et elle s’affiche en grand pour y poser vos commentaires, ou Ajouter pour y placer un élément d’après sa photo. Le projet s’ouvre sur le résultat. Les ambiances sont maintenant montrées par une miniature, et sur téléphone les réglages se replient derrière un seul bouton.',
      en: 'You no longer need a render to edit an image: pin it in the command bar, choose Comment and it opens large so you can place your comments, or Add to place an element from a photo of it. The project opens on the result. Ambiances are now shown as thumbnails, and on a phone the settings fold behind a single button.',
    },
  },
  {
    id: 'subscription-page',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'Une page Abonnement plus claire', en: 'A clearer Subscription page' },
    body: {
      fr: 'La page Abonnement montre votre solde de rendus et la fin de votre formule, les trois formules côte à côte, puis l’historique de vos paiements. Une formule dure 30 jours, sans prélèvement automatique.',
      en: 'The Subscription page shows your renders left and when your plan ends, the three plans side by side, then your payment history. A plan lasts 30 days, with no automatic charge.',
    },
  },
  {
    id: 'faster-navigation',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'Navigation plus rapide', en: 'Faster navigation' },
    body: {
      fr: 'La barre latérale et l’en-tête restent en place quand vous changez de page : la page choisie est marquée tout de suite et seul le contenu se recharge. Sur l’Accueil, vos chiffres sont regroupés en quatre cartes, juste sous le titre.',
      en: 'The sidebar and the header now stay put when you change page: the page you pick is marked at once and only the content reloads. On Home, your figures sit in four cards, right under the title.',
    },
  },
  {
    id: 'projects-page',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'Une page Projets, et un en-tête', en: 'A Projects page, and a header' },
    body: {
      fr: 'Tous vos projets sont réunis dans « Projets », avec recherche, tri et filtres par catégorie : extérieur, intérieur, jour, nuit, esquisse, Enhance, modifiés. En haut de chaque page, un en-tête regroupe les notifications, la langue, votre compte et les rendus qu’il vous reste.',
      en: 'All your projects are gathered under "Projects", with search, sorting and category filters: exterior, interior, day, night, sketch, Enhance, edited. At the top of every page, a header holds your notifications, the language, your account and the renders you have left.',
    },
  },
  {
    id: 'command-bar',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'Une barre de commande complète', en: 'A complete command bar' },
    body: {
      fr: 'Tout se fait depuis la barre : les actions Générer, Commenter, Ajouter et Enhance côte à côte, les deux moteurs toujours visibles (Moteur 1 rouge, Moteur 2 jaune), un trombone pour joindre une image, qui s’affiche en miniature, et le nombre de variantes. Le bouton « ? » ouvre l’assistant.',
      en: 'Everything happens in the bar: the Generate, Comment, Add and Enhance actions side by side, both engines always on show (Engine 1 red, Engine 2 yellow), a paperclip to attach an image, shown as a thumbnail, and the number of variants. The "?" button opens the assistant.',
    },
  },
  {
    id: 'dashboard-film',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'Les 3 étapes, en film', en: 'The 3 steps, on film' },
    body: {
      fr: 'L’Accueil montre en quelques secondes comment on passe d’une photo ou d’un croquis à un rendu : on joint l’image, on choisit l’ambiance (jour, nuit, intérieur, extérieur), on génère.',
      en: 'Home now shows in a few seconds how a photo or a sketch becomes a render: attach the image, pick the ambiance (day, night, interior, exterior), generate.',
    },
  },
  {
    id: 'assistant',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'Un assistant dans l’application', en: 'An assistant inside the app' },
    body: {
      fr: 'Le bouton « Assistant » (en bas de la barre latérale, ou dans « Plus » sur téléphone) ouvre un chat qui connaît tout RenderBox : comment générer, commenter un rendu, choisir un moteur, utiliser Enhance ou lire votre abonnement. Son mode « Recherche » répond aussi aux questions d’architecture et de matériaux, sources à l’appui.',
      en: 'The "Assistant" button (at the bottom of the sidebar, or under "More" on a phone) opens a chat that knows all of RenderBox: how to generate, comment on a render, pick an engine, use Enhance or read your plan. Its "Search" mode also answers architecture and materials questions, with sources.',
    },
  },
  {
    id: 'commenter',
    date: '2026-10-06',
    kind: 'shipped',
    title: {
      fr: 'Commenter : pointez, commentez, c’est modifié',
      en: 'Comment: point, comment, it’s changed',
    },
    body: {
      fr: 'Le mode « Retoucher » devient « Commenter ». Cliquez sur le rendu à l’endroit à changer, écrivez ce qui doit changer dans la bulle — jusqu’à 8 commentaires numérotés — puis « Appliquer ». Ce mode utilise toujours le Moteur 2, le plus précis pour suivre des consignes localisées, et la mémoire des matériaux est mise à jour après la modification.',
      en: '"Retouch" becomes "Comment". Click the render where it should change, type the change in the bubble — up to 8 numbered comments — then "Apply". This mode always uses Engine 2, the most precise at following localized instructions, and the material memory is updated after the edit.',
    },
  },
  {
    id: 'enhance',
    date: '2026-10-06',
    kind: 'shipped',
    title: {
      fr: 'Enhance : améliorer un rendu existant',
      en: 'Enhance: improve an existing render',
    },
    body: {
      fr: 'Une nouvelle page améliore n’importe quel rendu, même fait ailleurs, sans toucher au cadrage ni au bâtiment : netteté et détails, lumière, matériaux, ciel et végétation, vie et ambiance, en intensité Léger ou Marqué.',
      en: 'A new page improves any render, even one made elsewhere, without touching the framing or the building: sharpness and detail, lighting, materials, sky and planting, life and atmosphere, at Subtle or Strong strength.',
    },
  },
  {
    id: 'mobile',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'RenderBox sur téléphone', en: 'RenderBox on your phone' },
    body: {
      fr: 'Sur téléphone, la barre latérale laisse place à une barre flottante en bas de l’écran : Accueil, Image, Enhance et « Plus », et un bouton « + » pour lancer un nouveau rendu en un geste.',
      en: 'On a phone, the sidebar gives way to a floating bar at the bottom of the screen: Home, Image, Enhance and "More", plus a "+" button to start a new render in one tap.',
    },
  },
  {
    id: 'engine-colours',
    date: '2026-10-06',
    kind: 'shipped',
    title: { fr: 'Une couleur par moteur', en: 'One colour per engine' },
    body: {
      fr: 'Moteur 1 est rouge, Moteur 2 est jaune, partout où un moteur est indiqué : on voit d’un coup d’œil quel moteur a produit quel rendu.',
      en: 'Engine 1 is red, Engine 2 is yellow, wherever an engine is shown: you can tell at a glance which engine made which render.',
    },
  },
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
