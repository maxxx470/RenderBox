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
    id: 'install-app',
    date: '2026-10-20',
    kind: 'shipped',
    title: {
      fr: 'RenderPro s’installe comme une application',
      en: 'RenderPro installs like an app',
    },
    body: {
      fr: 'Sur téléphone, tablette et ordinateur, RenderPro peut maintenant s’installer : il s’ouvre dans sa propre fenêtre, avec son icône, et affiche une page claire quand la connexion est coupée. Ouvrez Paramètres, puis « Installer l’application » : un bouton sous Chrome, Edge et Samsung Internet ; sur iPhone et iPad, le bouton Partager de Safari puis « Sur l’écran d’accueil » ; sur Mac, Fichier puis « Ajouter au Dock » dans Safari. Vos images et vos crédits restent toujours lus depuis le serveur, jamais gardés sur l’appareil. Les prompts des 14 ambiances ont aussi été réécrits : chacun garde fidèlement votre image et ne change que l’ambiance choisie.',
      en: 'On phone, tablet and computer, RenderPro can now be installed: it opens in its own window, with its icon, and shows a clear page when the connection drops. Open Settings, then “Install the app”: a button in Chrome, Edge and Samsung Internet; on iPhone and iPad, Safari’s Share button then “Add to Home Screen”; on a Mac, File then “Add to Dock” in Safari. Your images and credits are always read from the server, never kept on the device. The prompts of the 14 ambiances were also rewritten: each one stays faithful to your image and changes only the ambiance you chose.',
    },
  },
  {
    id: 'material-sheet-ambiances',
    date: '2026-10-19',
    kind: 'shipped',
    title: {
      fr: 'Fiche de matériaux, code d’image et 14 ambiances',
      en: 'Materials sheet, image codes and 14 ambiances',
    },
    body: {
      fr: 'Chaque rendu a sa fiche de matériaux : quelle couleur de votre image source est devenue quel matériau, l’ambiance utilisée et le code de l’image, unique sur tout le site. L’analyse se lance quand vous copiez la fiche (8 crédits, rendus en cas d’échec) et une notification vous prévient quand elle est prête. Un bouton « Copier » la reprend : collée sous le prompt d’un nouveau rendu, elle garde les mêmes matériaux et la même ambiance pour tous les rendus d’un même bâtiment. Le menu compte 14 ambiances, chacune écrit son prompt dans la barre pour que vous puissiez le lire et le modifier, et un clic sur une image de la Galerie l’ouvre directement dans le Générateur. Source et rendu se comparent avec un curseur, y compris dans Améliorer.',
      en: 'Every render has its materials sheet: which colour of your source image became which material, the ambiance used and the image’s code, unique across the whole site. The analysis starts when you copy the sheet (8 credits, given back if it fails) and a notification tells you when it is ready. A “Copy” button takes it along: pasted under the prompt of a new render, it keeps the same materials and the same ambiance across all renders of a building. The menu now has 14 ambiances, each one writes its prompt in the bar so you can read and change it, and a click on a Gallery image opens it straight in the Generator. Source and render can be compared with a slider, in Enhance too.',
    },
  },
  {
    id: 'faithful-renders',
    date: '2026-10-19',
    kind: 'shipped',
    title: {
      fr: 'Des rendus plus fidèles à votre projet',
      en: 'Renders more faithful to your project',
    },
    body: {
      fr: 'Les modèles jour et nuit gardent la géométrie, les ouvertures et les matériaux de votre image, avec une lumière réglée comme par un photographe d’architecture, et n’ajoutent plus rien de leur propre chef. Jour extérieur propose un ciel voilé ou un soleil franc. Nouvelle ambiance Esquisse, un croquis au crayon ; l’ancien schéma blanc légendé s’appelle désormais Schéma d’accès. Améliorer compte huit améliorations, une option « Pièce sombre » et trois intensités.',
      en: 'The day and night templates keep your image’s geometry, openings and materials, with light set the way an architectural photographer would, and no longer add anything on their own. Exterior day offers a hazy sky or full sun. New Sketch ambiance, a pencil sketch; the former labelled white diagram is now called Access diagram. Enhance has eight improvements, a “Dark room” option and three intensities.',
    },
  },
  {
    id: 'tiktok-dashboard',
    date: '2026-10-17',
    kind: 'shipped',
    title: {
      fr: 'RenderPro sur TikTok, et un tableau de bord plus compact',
      en: 'RenderPro on TikTok, and a more compact dashboard',
    },
    body: {
      fr: 'La page Info mène aussi à notre compte TikTok. Sur le tableau de bord, les deux films « Premier pas » sont côte à côte, à côté de nouvelles images en vitrine, et « Lancer un rendu » se voit dès l’arrivée. Et quand un nouveau film arrive sur la page Info, un badge rouge vous le signale sur « Info ».',
      en: 'The Info page now also leads to our TikTok account. On the dashboard, the two “First steps” films sit side by side, next to new showcase pictures, and “Start a render” shows as soon as you arrive. And when a new film lands on the Info page, a red badge on “Info” tells you.',
    },
  },
  {
    id: 'engines-best-version',
    date: '2026-10-17',
    kind: 'shipped',
    title: {
      fr: 'Visio et Pixel IA sur leur meilleure version',
      en: 'Visio and Pixel AI on their best version',
    },
    body: {
      fr: 'Plus de version à choisir : chaque moteur tourne sur la version la plus performante pour l’architecture, choisie par l’équipe.',
      en: 'No version to pick any more: each engine runs on the version that performs best for architecture, chosen by the team.',
    },
  },
  {
    id: 'assistant-team-messages',
    date: '2026-10-17',
    kind: 'shipped',
    title: {
      fr: 'Écrivez directement à l’équipe RenderPro',
      en: 'Write straight to the RenderPro team',
    },
    body: {
      fr: 'Le bouton « Assistant » ouvre maintenant une conversation avec l’équipe : posez votre question, nous vous répondons dans la même fenêtre et une notification vous prévient.',
      en: 'The “Assistant” button now opens a conversation with the team: ask your question, we answer in the same window and a notification lets you know.',
    },
  },
  {
    id: 'settings-payments-currency',
    date: '2026-10-16',
    kind: 'shipped',
    title: {
      fr: 'Une page Paramètres complète, et vos prix dans votre devise',
      en: 'A complete Settings page, and prices in your currency',
    },
    body: {
      fr: 'La page Paramètres montre votre formule et vos crédits, vos informations d’inscription (modifiables), le moteur et la version à utiliser par défaut, la langue, vos modes de connexion et vos derniers paiements. La version choisie pour chaque moteur est désormais gardée sur votre compte, sur tous vos appareils. Sous chaque prix, un équivalent indicatif s’affiche dans la devise de votre pays ; le paiement reste en FCFA. Et le paiement d’une formule est confirmé même si vous fermez la page avant de revenir sur RenderPro.',
      en: 'The Settings page shows your plan and credits, your sign-up details (editable), the engine and version to use by default, the language, your sign-in methods and your latest payments. The version chosen for each engine is now kept on your account, on all your devices. Under each price, an approximate equivalent shows in your country’s currency; payment stays in FCFA. And a plan payment is confirmed even if you close the page before coming back to RenderPro.',
    },
  },
  {
    id: 'plans-dialog-channels',
    date: '2026-10-15',
    kind: 'shipped',
    title: {
      fr: 'Toute l’interface dès l’arrivée, et nos chaînes',
      en: 'The whole interface from the start, and our channels',
    },
    body: {
      fr: 'Sans formule ou sans assez de crédits, le Générateur, vos projets et Améliorer s’ouvrent désormais en entier : vous préparez votre rendu, et les formules s’affichent dans une petite fenêtre au moment de lancer. Visio et Pixel IA ont chacun leur symbole. Sur téléphone, la connexion et l’accueil tiennent sur un seul écran. Et la page Info mène à notre chaîne WhatsApp (en français ou en anglais selon votre langue) et à notre chaîne YouTube.',
      en: 'Without a plan or with too few credits, the Image generator, your projects and Enhance now open in full: you prepare your render, and the plans show in a small window when you launch it. Visio and Pixel AI each have their own symbol. On a phone, sign-in and onboarding fit on a single screen. And the Info page leads to our WhatsApp channel (in French or English, following your language) and to our YouTube channel.',
    },
  },
  {
    id: 'credits',
    date: '2026-10-13',
    kind: 'shipped',
    title: {
      fr: 'Les formules passent aux crédits',
      en: 'Plans now come with credits',
    },
    body: {
      fr: 'Chaque formule donne désormais des crédits pour 30 jours, au même prix (le détail est sur la page Tarifs et dans Abonnement). Une image se paie en crédits selon sa taille, un peu plus en 4K, qu’elle vienne d’un rendu, de Commenter, d’Ajouter ou d’Améliorer ; le coût s’affiche sur le bouton d’envoi avant le clic, et une génération qui échoue est remboursée. Votre solde est en haut de chaque page. Les rendus qu’il vous restait ont été convertis en crédits, sans rien perdre.',
      en: 'Each plan now gives credits for 30 days, at the same price (the details are on the Pricing page and in Subscription). An image is paid in credits according to its size, a little more at 4K, whether it comes from a render, Comment, Add or Enhance; the cost shows on the send button before you click, and a generation that fails is refunded. Your balance is at the top of every page. The renders you had left were converted into credits, with nothing lost.',
    },
  },
  {
    id: 'materials-per-image',
    date: '2026-10-13',
    kind: 'shipped',
    title: {
      fr: 'Des matériaux propres à chaque image',
      en: 'Materials for each image',
    },
    body: {
      fr: 'Chaque image a désormais ses propres matériaux, en haut de la colonne de droite d’un projet : ce sont eux qui guident le moteur pour les rendus faits à partir de cette image. Ajoutez une face et son matériau, modifiez-la ou masquez-la : une correction ne change que l’image où elle est faite. L’ancienne fiche du projet reste consultable, repliée, sans être appliquée aux rendus ; pour réutiliser une de ses lignes, rattachez-la explicitement à une image. La détection automatique des matériaux de chaque image arrivera plus tard.',
      en: 'Each image now has its own materials, at the top of a project’s right-hand column: they guide the engine for renders made from that image. Add a face and its material, edit it or hide it: a correction only changes the image it is made on. The old project sheet stays readable, folded away, without being applied to renders; to reuse one of its rows, attach it explicitly to an image. Automatic detection of each image’s materials will come later.',
    },
  },
  {
    id: 'templates-gallery',
    date: '2026-10-10',
    kind: 'shipped',
    title: {
      fr: 'Nouvelles ambiances, quatre modèles prêts à l’emploi, et la Galerie',
      en: 'New ambiances, four ready-made templates, and the Gallery',
    },
    body: {
      fr: 'Le menu Ambiance de la barre de commande propose désormais plan 3D aménagé, axonométrie éclatée légendée, planche d’analyse, maquette isométrique et esquisse ; sans ambiance, vous obtenez un rendu photo fidèle à votre image. Les lumières jour et nuit, extérieur et intérieur, deviennent quatre modèles du Générateur d’images : survolez-en un, cliquez sur « Utiliser ce modèle », joignez votre image et lancez. « Mes images » s’appelle désormais la Galerie, et Enhance s’appelle Améliorer en français.',
      en: 'The Ambiance menu of the command bar now offers furnished 3D plan, labelled exploded axonometric, concept board, isometric model and sketch; with no ambiance you get a faithful photo render of your image. The day and night lights, exterior and interior, become four templates on the Image generator: hover one, click "Use this template", attach your image and go. "My images" is now the Gallery.',
    },
  },
  {
    id: 'all-formats-sizes',
    date: '2026-10-08',
    kind: 'shipped',
    title: {
      fr: 'Tous les formats et toutes les tailles',
      en: 'Every format and every size',
    },
    body: {
      fr: 'Onze formats (dont 16:9, 9:16, 4:3, 4:5 et 21:9) et les résolutions 1K, 2K et 4K sont disponibles avec les deux moteurs, pour générer comme pour retoucher. Visio rend directement à la taille choisie.',
      en: 'Eleven formats (including 16:9, 9:16, 4:3, 4:5 and 21:9) and 1K, 2K and 4K output are available on both engines, for generating as well as editing. Visio renders straight at the chosen size.',
    },
  },
  {
    id: 'my-images-enhance',
    date: '2026-10-08',
    kind: 'shipped',
    title: {
      fr: 'Mes images et un nouvel Enhance',
      en: 'My images and a new Enhance',
    },
    body: {
      fr: 'La page Projets devient « Mes images » : toutes vos images importées, générées ou améliorées, filtrées en Tout, Importées, Générées ou Enhance, à télécharger ou supprimer. Enhance a sa propre barre de commande pour décrire l’amélioration, et chaque élément à améliorer accepte une image de référence. La page Image et un projet partagent la même disposition, avec la fiche matériaux et l’arbre à droite.',
      en: 'The Projects page becomes "My images": every image you uploaded, generated or enhanced, filtered by All, Uploaded, Generated or Enhance, to download or delete. Enhance has its own command bar to describe the improvement, and each item to improve takes a reference image. The Image page and a project share one layout, with the materials sheet and the tree on the right.',
    },
  },
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
      fr: 'Tout se fait depuis la barre : les actions Générer, Commenter, Ajouter et Enhance côte à côte, les deux moteurs toujours visibles (Visio rouge, Pixel IA jaune), un trombone pour joindre une image, qui s’affiche en miniature, et le nombre de variantes. Le bouton « ? » ouvre l’assistant.',
      en: 'Everything happens in the bar: the Generate, Comment, Add and Enhance actions side by side, both engines always on show (Visio red, Pixel AI yellow), a paperclip to attach an image, shown as a thumbnail, and the number of variants. The "?" button opens the assistant.',
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
      fr: 'Le bouton « Assistant » (en bas de la barre latérale, ou dans « Plus » sur téléphone) ouvre un chat qui connaît tout RenderPro : comment générer, commenter un rendu, choisir un moteur, utiliser Enhance ou lire votre abonnement. Son mode « Recherche » répond aussi aux questions d’architecture et de matériaux, sources à l’appui.',
      en: 'The "Assistant" button (at the bottom of the sidebar, or under "More" on a phone) opens a chat that knows all of RenderPro: how to generate, comment on a render, pick an engine, use Enhance or read your plan. Its "Search" mode also answers architecture and materials questions, with sources.',
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
      fr: 'Le mode « Retoucher » devient « Commenter ». Cliquez sur le rendu à l’endroit à changer, écrivez ce qui doit changer dans la bulle — jusqu’à 8 commentaires numérotés — puis « Appliquer ». Ce mode utilise toujours Pixel IA, le plus précis pour suivre des consignes localisées, et la mémoire des matériaux est mise à jour après la modification.',
      en: '"Retouch" becomes "Comment". Click the render where it should change, type the change in the bubble — up to 8 numbered comments — then "Apply". This mode always uses Pixel AI, the most precise at following localized instructions, and the material memory is updated after the edit.',
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
    title: { fr: 'RenderPro sur téléphone', en: 'RenderPro on your phone' },
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
      fr: 'Visio est rouge, Pixel IA est jaune, partout où un moteur est indiqué : on voit d’un coup d’œil quel moteur a produit quel rendu.',
      en: 'Visio is red, Pixel AI is yellow, wherever an engine is shown: you can tell at a glance which engine made which render.',
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
      fr: 'Le haut du tableau de bord présente une sélection de rendus RenderPro, une par ambiance, et rappelle les trois étapes d’un rendu — de la photo ou du croquis jusqu’à l’image finale.',
      en: 'The top of the dashboard now shows a selection of RenderPro renders, one per ambiance, alongside the three steps of a render — from photo or sketch to the finished image.',
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
