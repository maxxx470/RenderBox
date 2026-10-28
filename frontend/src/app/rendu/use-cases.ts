// The use-case pages, /rendu/<slug> (2026-10-28, owner: « je veux qu'on
// optimise mon SEO et GEO … je veux être connu »).
//
// WHY THESE PAGES EXIST. Google ranks pages, not sites. Until today the site
// had four public addresses and two of them (/legal, /info) will never rank,
// so RenderPro could be found on its own name and on next to nothing else —
// which is exactly what Search Console reported: « render pro » and
// « render AI », nothing more. A page can seriously answer one or two search
// intentions, not thirty. So each thing the product really does gets its own
// address, its own title, its own first heading and its own pictures, and
// /rendu is the hub that links them.
//
// THE RULES THIS FILE OBEYS.
//  - Every claim here has to be true of the product as it ships. No invented
//    figure, no rating, no user count, no « gratuit » (the landing proof
//    policy applies to these pages too), and no promise of a delay nobody
//    measured. Prices and credit costs are NOT restated: they live in
//    pricing-tiers.ts and provider-cost.ts and they move — these pages link
//    to /#tarifs instead, so they can never contradict the checkout.
//  - French says « vous », as everywhere else on the site.
//  - Every picture is one the owner generated and that the repo already
//    serves from /public, with its real pixel size, so a row can lay out
//    without cropping (same discipline as exemple/gallery.ts). An image in a
//    `pair` is a claim about the image: swap one and the claim has to stay
//    true.
//  - `queries` is a note to ourselves — the searches a page is meant to
//    answer. It is rendered nowhere. It exists so that nobody later
//    « improves » a title into something nobody types. These were reasoned
//    from the trade, NOT measured against real search volumes (no keyword
//    tool is connected), so treat them as a hypothesis to check in Search
//    Console once the pages have been crawled.
//  - A page added here is indexed, listed in the sitemap and linked from the
//    hub, the footer and the landing automatically. Nothing else to wire.
import type { Locale } from '@/lib/i18n/dictionaries';
import type { GalleryImage } from '@/app/exemple/gallery';
import type { PresetKey } from '@/lib/server/generation/presets';

/** The same string in both languages — the shape gallery.ts already uses. */
export type Bilingual = Record<Locale, string>;

export interface UseCaseSection {
  heading: Bilingual;
  body: Bilingual;
}

export interface UseCaseFaq {
  q: Bilingual;
  a: Bilingual;
}

export interface UseCase {
  /** Last segment of the address: /rendu/<slug>. Never change a live one — a
   *  changed slug is a new page and loses whatever the old one had earned. */
  slug: string;
  /** The ambiance this page is about, when it is one: its name comes from
   *  presets.ts rather than being retyped, so the page can never drift from
   *  the vocabulary the app itself uses. */
  preset?: PresetKey;
  /** When this page's own content last really changed, by hand (the sitemap
   *  reads it — a build date would tell a crawler everything changed at
   *  every deploy). */
  lastModified: string;
  /** The title tag, under ~60 characters: the root layout appends
   *  « · RenderPro ». And the description, under ~155. */
  seo: Record<Locale, { title: string; description: string }>;
  /** The page's one first-level heading. Close to the title, not identical —
   *  the title is read in a result list, the heading on the page. */
  h1: Bilingual;
  /** Two sentences under the heading, saying what the visitor gets. */
  lede: Bilingual;
  /** The searches this page answers. Rendered nowhere — see the header. */
  queries: Record<Locale, readonly string[]>;
  /** The picture at the top: a before/after pair when one exists for this
   *  case, a single image otherwise. */
  hero: { before?: GalleryImage; after: GalleryImage };
  /** What the visitor actually does, in order. Four steps. */
  steps: Record<Locale, readonly string[]>;
  sections: readonly UseCaseSection[];
  /** Published as FAQPage structured data, so each answer has to stay true. */
  faq: readonly UseCaseFaq[];
  /** Shown in rows that share one height, uncropped (rowColumns). */
  gallery: readonly GalleryImage[];
}

/** The real pixel sizes of the pictures this file points at. */
const AB = (src: string): GalleryImage => ({ src, w: 1440, h: 900 });
const L = (src: string): GalleryImage => ({ src, w: 1200, h: 896 });
const P = (src: string): GalleryImage => ({ src, w: 760, h: 1013 });
const E = (src: string): GalleryImage => ({ src, w: 660, h: 884 });

export const USE_CASES: readonly UseCase[] = [
  {
    slug: 'croquis-en-rendu',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Transformer un croquis en rendu photoréaliste',
        description:
          'Photographiez votre croquis à la main, RenderPro en fait un rendu photoréaliste en gardant vos volumes, vos ouvertures et votre cadrage. Exemples avant / après.',
      },
      en: {
        title: 'Turn a hand sketch into a photorealistic render',
        description:
          'Photograph your hand sketch and RenderPro renders it photorealistically, keeping your volumes, your openings and your framing. Before and after examples.',
      },
    },
    h1: {
      fr: 'Transformer un croquis en rendu photoréaliste',
      en: 'Turn a hand sketch into a photorealistic render',
    },
    lede: {
      fr: 'Une photo de votre carnet suffit : pas d’export, pas de modèle 3D, pas de moteur de rendu à régler. Le rendu arrive en quelques minutes, sur la géométrie que vous avez dessinée.',
      en: 'A photo of your sketchbook is enough: no export, no 3D model, no render engine to set up. The render arrives in minutes, on the geometry you drew.',
    },
    queries: {
      fr: [
        'transformer un croquis en rendu',
        'croquis en rendu photoréaliste',
        'rendu à partir d’un dessin à la main',
        'esquisse en rendu 3D IA',
      ],
      en: [
        'sketch to render AI',
        'hand sketch to photorealistic render',
        'turn a drawing into a 3D render',
        'AI archviz from sketch',
      ],
    },
    hero: {
      before: AB('/avant-apres/exterieur-croquis.jpg'),
      after: AB('/avant-apres/exterieur-rendu.jpg'),
    },
    steps: {
      fr: [
        'Prenez votre croquis en photo, bien à plat et bien éclairé, ou scannez-le.',
        'Attachez l’image avec le trombone de la barre de commande.',
        'Choisissez une ambiance — ou aucune, pour un rendu photo fidèle au dessin.',
        'Lancez, puis téléchargez le rendu ou enchaînez une variante.',
      ],
      en: [
        'Photograph your sketch flat and well lit, or scan it.',
        'Attach the image with the paperclip in the command bar.',
        'Pick an ambiance — or none, for a photo render faithful to the drawing.',
        'Send, then download the render or run another variant.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Vos volumes ne bougent pas',
          en: 'Your volumes do not move',
        },
        body: {
          fr: 'C’est le point sur lequel les générateurs d’images généralistes échouent : ils redessinent le bâtiment. Chaque ambiance de RenderPro se termine sur une clause de fidélité qui interdit au moteur de changer la géométrie, les volumes, le cadrage et les ouvertures de votre image de départ. Ce que vous avez dessiné reste ce qui est rendu ; ce qui change, c’est la matière, la lumière et l’atmosphère.',
          en: 'This is where general-purpose image generators fail: they redraw the building. Every RenderPro ambiance ends on a fidelity clause forbidding the engine to change the geometry, the volumes, the framing and the openings of your input image. What you drew stays what is rendered; what changes is material, light and atmosphere.',
        },
      },
      {
        heading: {
          fr: 'Ce qui fait un bon croquis de départ',
          en: 'What makes a good starting sketch',
        },
        body: {
          fr: 'Un trait lisible compte plus qu’un beau dessin. Une perspective au stylo, même rapide, donne un meilleur résultat qu’un crayon très léger, parce que le moteur doit distinguer les arêtes. Photographiez à plat, sans ombre portée de votre main, et cadrez sur le dessin seul — la reliure du carnet et le bord de la table sont lus comme des éléments de l’image. Un plan, une coupe, une axonométrie ou une capture 3D marchent de la même façon.',
          en: 'A legible line matters more than a beautiful drawing. A quick pen perspective gives a better result than very light pencil, because the engine has to tell edges apart. Photograph it flat, without your hand casting a shadow, and frame the drawing alone — the sketchbook binding and the edge of the table get read as parts of the image. A plan, a section, an axonometric or a 3D screenshot all work the same way.',
        },
      },
      {
        heading: {
          fr: 'Dire les matériaux que le croquis ne montre pas',
          en: 'Naming the materials the sketch cannot show',
        },
        body: {
          fr: 'Un dessin au trait ne dit pas si la façade est en bois, en béton brut ou en enduit. Deux manières de le préciser : écrire votre demande dans la barre de commande, ou ajouter jusqu’à trois images de référence — des photographies dont le moteur reprend les matériaux, la végétation et le ciel, jamais la géométrie. Une référence reste épinglée d’un rendu au suivant, ce qui tient une série de croquis dans la même matière.',
          en: 'A line drawing does not say whether the façade is timber, fair-faced concrete or render. Two ways to settle it: write your request in the command bar, or add up to three reference images — photographs whose materials, planting and sky the engine takes, never their geometry. A reference stays pinned from one render to the next, which keeps a series of sketches in the same material.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Mes proportions sont-elles respectées ?',
          en: 'Are my proportions kept?',
        },
        a: {
          fr: 'Oui, c’est la contrainte principale envoyée au moteur : même point de vue, mêmes volumes, mêmes ouvertures. Si un rendu s’en écarte, relancez-le — chaque rendu est un tirage, et vous pouvez en demander plusieurs.',
          en: 'Yes — that is the main constraint sent to the engine: same viewpoint, same volumes, same openings. If a render drifts, run it again: each render is one draw, and you can ask for several.',
        },
      },
      {
        q: {
          fr: 'Faut-il un modèle 3D ?',
          en: 'Do I need a 3D model?',
        },
        a: {
          fr: 'Non. RenderPro part d’une image : photo de croquis, scan, capture d’écran de votre logiciel 3D ou photographie existante. Aucun format CAO n’est demandé.',
          en: 'No. RenderPro starts from an image: a photo of a sketch, a scan, a screenshot of your 3D software or an existing photograph. No CAD format is required.',
        },
      },
      {
        q: {
          fr: 'Combien de temps pour un rendu ?',
          en: 'How long does a render take?',
        },
        a: {
          fr: 'Quelques minutes selon la taille demandée — 1K, 2K ou 4K. Le coût en crédits s’affiche sur le bouton d’envoi avant que vous lanciez.',
          en: 'A few minutes depending on the size asked for — 1K, 2K or 4K. The cost in credits shows on the send button before you launch.',
        },
      },
    ],
    gallery: [
      { src: '/galerie/croquis-maison.jpg', w: 900, h: 1205 },
      { src: '/galerie/rendu-maison.jpg', w: 900, h: 1205 },
      { src: '/galerie/croquis-salon.jpg', w: 1200, h: 670 },
      { src: '/galerie/rendu-salon.jpg', w: 1200, h: 670 },
    ],
  },
  {
    slug: 'rendu-sketchup',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Rendu SketchUp avec l’IA, sans moteur de rendu',
        description:
          'Une capture d’écran de votre modèle SketchUp suffit pour obtenir un rendu photoréaliste. Marche aussi depuis Revit, Archicad, Rhino, 3ds Max et AutoCAD.',
      },
      en: {
        title: 'SketchUp AI rendering, without a render engine',
        description:
          'A screenshot of your SketchUp model is enough to get a photorealistic render. Works from Revit, Archicad, Rhino, 3ds Max and AutoCAD too.',
      },
    },
    h1: {
      fr: 'Rendu SketchUp avec l’IA, sans moteur de rendu',
      en: 'SketchUp AI rendering, without a render engine',
    },
    lede: {
      fr: 'Pas de plugin à installer, pas d’export, pas de matériaux à assigner : vous capturez votre vue, vous l’attachez, vous recevez un rendu. Le même chemin marche depuis n’importe quel logiciel 3D.',
      en: 'No plugin to install, no export, no materials to assign: capture your view, attach it, get a render. The same path works from any 3D software.',
    },
    queries: {
      fr: [
        'rendu SketchUp IA',
        'rendu SketchUp sans V-Ray',
        'rendu photoréaliste SketchUp rapide',
        'rendu Revit IA',
      ],
      en: [
        'SketchUp to render AI',
        'SketchUp AI rendering',
        'render SketchUp without V-Ray',
        'Revit AI rendering',
      ],
    },
    hero: { after: L('/vitrine/esquisse-rendu.webp') },
    steps: {
      fr: [
        'Cadrez votre vue dans SketchUp et faites une capture d’écran de la fenêtre 3D.',
        'Attachez l’image dans RenderPro avec le trombone.',
        'Choisissez l’ambiance : jour, nuit, intérieur, extérieur, heure dorée, temps de pluie.',
        'Lancez le rendu, puis améliorez-le ou retouchez une zone par commentaire.',
      ],
      en: [
        'Frame your view in SketchUp and screenshot the 3D window.',
        'Attach the image in RenderPro with the paperclip.',
        'Pick the ambiance: day, night, interior, exterior, golden hour, rainy weather.',
        'Send the render, then enhance it or edit one area by comment.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Une capture d’écran, pas un export',
          en: 'A screenshot, not an export',
        },
        body: {
          fr: 'RenderPro ne lit ni SKP, ni OBJ, ni FBX, ni DWG — il lit une image. C’est une limite assumée et c’est aussi ce qui le rend immédiat : aucune extension à installer dans SketchUp, rien à nettoyer dans le modèle, aucune texture à préparer. La vue filaire ou ombrée que vous avez à l’écran est déjà une entrée valable.',
          en: 'RenderPro reads neither SKP, OBJ, FBX nor DWG — it reads an image. That is a deliberate limit, and it is also what makes it immediate: no extension to install in SketchUp, nothing to clean up in the model, no textures to prepare. The wireframe or shaded view already on your screen is a valid input.',
        },
      },
      {
        heading: {
          fr: 'Ce que ça remplace, et ce que ça ne remplace pas',
          en: 'What it replaces, and what it does not',
        },
        body: {
          fr: 'Pour une image de concept, une variante d’ambiance, une planche de présentation ou un aller-retour avec un client, vous gagnez le temps du calage des matériaux et de l’éclairage. Pour un livrable final où chaque détail constructif doit être exact et contrôlé, un moteur classique garde l’avantage : il rend votre scène, pas une interprétation de votre image. Beaucoup d’agences utilisent les deux — l’IA en amont, le moteur pour l’image finale.',
          en: 'For a concept image, an ambiance variant, a presentation board or a round trip with a client, you save the time spent setting materials and lighting. For a final deliverable where every construction detail has to be exact and controlled, a traditional engine keeps the edge: it renders your scene, not an interpretation of your image. Many practices use both — AI early, the engine for the final image.',
        },
      },
      {
        heading: {
          fr: 'Revit, Archicad, Rhino, 3ds Max, AutoCAD, Blender',
          en: 'Revit, Archicad, Rhino, 3ds Max, AutoCAD, Blender',
        },
        body: {
          fr: 'Puisque l’entrée est une image, le logiciel d’origine n’a aucune importance. Une vue Revit, une fenêtre Archicad, un viewport Rhino, un aperçu 3ds Max, une élévation AutoCAD imprimée en PNG ou un viewport Blender suivent exactement le même chemin. Un plan 2D passe aussi, avec l’ambiance Plan 3D aménagé.',
          en: 'Since the input is an image, the originating software is irrelevant. A Revit view, an Archicad window, a Rhino viewport, a 3ds Max preview, an AutoCAD elevation printed to PNG or a Blender viewport all follow exactly the same path. A 2D plan works too, with the Furnished 3D plan ambiance.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Faut-il un plugin SketchUp ?',
          en: 'Do I need a SketchUp plugin?',
        },
        a: {
          fr: 'Non. RenderPro est un site : vous y déposez une image. Rien n’est installé dans SketchUp.',
          en: 'No. RenderPro is a website: you drop an image into it. Nothing is installed in SketchUp.',
        },
      },
      {
        q: {
          fr: 'Les textures de mon modèle sont-elles reprises ?',
          en: 'Are my model’s textures kept?',
        },
        a: {
          fr: 'Celles que la capture montre, oui — le moteur garde les matériaux visibles. Pour celles qui n’y sont pas, écrivez-les dans la demande ou ajoutez une image de référence.',
          en: 'Those the screenshot shows, yes — the engine keeps visible materials. For the ones it does not show, write them in the request or add a reference image.',
        },
      },
      {
        q: {
          fr: 'Quelle résolution de capture donner ?',
          en: 'What capture resolution should I use?',
        },
        a: {
          fr: 'La plus nette possible : le moteur lit les arêtes. Vous choisissez ensuite la taille du rendu, 1K, 2K ou 4K, indépendamment de celle de la capture.',
          en: 'As sharp as you can: the engine reads edges. You then choose the render size — 1K, 2K or 4K — independently of the capture’s own size.',
        },
      },
    ],
    gallery: [
      P('/galerie/jour-ext-1.jpg'),
      P('/galerie/jour-ext-2.jpg'),
      P('/galerie/nuit-ext-1.jpg'),
      P('/galerie/nuit-ext-2.jpg'),
    ],
  },
  {
    slug: 'plan-2d-en-3d',
    preset: 'plan_3d',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Transformer un plan 2D en plan 3D aménagé',
        description:
          'Déposez votre plan de niveau et recevez un plan 3D aménagé, meublé, lisible, avec les mêmes murs et les mêmes pièces. Exemples de plans rendus.',
      },
      en: {
        title: 'Turn a 2D floor plan into a furnished 3D plan',
        description:
          'Drop in your floor plan and get a furnished, legible 3D plan with the same walls and the same rooms. Examples of rendered plans.',
      },
    },
    h1: {
      fr: 'Transformer un plan 2D en plan 3D aménagé',
      en: 'Turn a 2D floor plan into a furnished 3D plan',
    },
    lede: {
      fr: 'Le plan que vous avez déjà — export DWG en image, scan, capture d’écran — devient une vue 3D meublée que votre client comprend sans explication. Les murs, les portes et les pièces restent les vôtres.',
      en: 'The plan you already have — a DWG exported to an image, a scan, a screenshot — becomes a furnished 3D view your client understands without explanation. The walls, the doors and the rooms stay yours.',
    },
    queries: {
      fr: [
        'transformer un plan 2D en 3D',
        'plan 3D aménagé IA',
        'plan de maison en 3D meublé',
        'plan architectural en 3D intelligence artificielle',
      ],
      en: [
        'floor plan to 3D render AI',
        '2D floor plan to 3D',
        'furnished 3D floor plan AI',
        'AI floor plan visualizer',
      ],
    },
    hero: { after: L('/vitrine/plan-3d.webp') },
    steps: {
      fr: [
        'Exportez ou capturez votre plan en image, au plus net.',
        'Attachez-le dans RenderPro et choisissez l’ambiance Plan 3D aménagé.',
        'Précisez si besoin l’usage des pièces ou le style du mobilier.',
        'Lancez, puis demandez une variante d’aménagement sur le même plan.',
      ],
      en: [
        'Export or capture your plan as an image, as sharp as possible.',
        'Attach it in RenderPro and pick the Furnished 3D plan ambiance.',
        'Add the use of the rooms or the furniture style if needed.',
        'Send, then ask for another furnishing variant on the same plan.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Les pièces sont lues, pas inventées',
          en: 'The rooms are read, not invented',
        },
        body: {
          fr: 'Le moteur lit le tracé : l’épaisseur des murs, les portes, les fenêtres, les escaliers, les noms de pièces quand ils sont écrits sur le plan. Il meuble ensuite chaque pièce selon son usage — lit dans une chambre, îlot dans une cuisine — sans déplacer une cloison. Un plan coté reste coté : les chiffres que vous avez écrits ne sont pas remplacés par d’autres.',
          en: 'The engine reads the drawing: wall thickness, doors, windows, stairs, and room names when they are written on the plan. It then furnishes each room according to its use — a bed in a bedroom, an island in a kitchen — without moving a partition. A dimensioned plan stays dimensioned: the figures you wrote are not swapped for others.',
        },
      },
      {
        heading: {
          fr: 'Quel plan donner',
          en: 'Which plan to give',
        },
        body: {
          fr: 'Un export PDF aplati en image, une capture AutoCAD, un plan dessiné à la main, un plan trouvé dans un dossier de permis : tout passe, du moment que le trait est lisible. Un plan très chargé en hachures et en annotations donne un résultat plus bruité qu’un plan nettoyé — si vous avez le calque, masquez les cotations et les hachures de coupe avant la capture.',
          en: 'A PDF flattened to an image, an AutoCAD capture, a hand-drawn plan, a plan from a permit file: anything works, as long as the line is legible. A plan heavy with hatching and annotation gives a noisier result than a cleaned one — if you have the layers, hide dimensions and section hatching before capturing.',
        },
      },
      {
        heading: {
          fr: 'Plusieurs aménagements du même plan',
          en: 'Several layouts of the same plan',
        },
        body: {
          fr: 'C’est l’usage qui fait gagner le plus de temps : le même plan, trois aménagements, pour que le client choisisse. Relancez le rendu en changeant seulement votre demande — le mobilier, la palette, l’usage d’une pièce. Chaque rendu part du même plan, donc les trois images restent comparables.',
          en: 'This is the use that saves the most time: the same plan, three layouts, so the client can choose. Run the render again changing only your request — the furniture, the palette, a room’s use. Every render starts from the same plan, so the three images stay comparable.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Les surfaces sont-elles exactes ?',
          en: 'Are the areas accurate?',
        },
        a: {
          fr: 'Le rendu est une image de présentation, pas un métré. Il garde votre tracé, mais ne recalcule aucune surface — gardez votre plan coté comme document de référence.',
          en: 'The render is a presentation image, not a measurement. It keeps your drawing but recalculates no area — keep your dimensioned plan as the reference document.',
        },
      },
      {
        q: {
          fr: 'Peut-on faire plusieurs niveaux ?',
          en: 'Can I do several floors?',
        },
        a: {
          fr: 'Oui, un niveau par rendu. Déposez chaque plan séparément pour garder une image nette par étage.',
          en: 'Yes, one floor per render. Drop each plan separately to keep one sharp image per level.',
        },
      },
      {
        q: {
          fr: 'Et un plan à la main ?',
          en: 'What about a hand-drawn plan?',
        },
        a: {
          fr: 'Il marche aussi, et c’est même un cas fréquent. Photographiez-le à plat, bien éclairé, cadré sur le dessin seul.',
          en: 'It works too, and it is a common case. Photograph it flat, well lit, framed on the drawing alone.',
        },
      },
    ],
    gallery: [L('/galerie/plan-3d-1.jpg'), L('/galerie/plan-3d-2.jpg')],
  },
  {
    slug: 'rendu-exterieur-jour',
    preset: 'jour_ext',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Rendu extérieur de jour par IA',
        description:
          'Perspective extérieure en lumière de jour : ciel, ombres portées, végétation et matériaux de façade, sur votre géométrie. Exemples de rendus extérieurs.',
      },
      en: {
        title: 'AI exterior daylight rendering',
        description:
          'Exterior perspective in daylight: sky, cast shadows, planting and façade materials, on your own geometry. Exterior render examples.',
      },
    },
    h1: {
      fr: 'Rendu extérieur de jour',
      en: 'Exterior daylight render',
    },
    lede: {
      fr: 'L’image que l’on demande le plus souvent : la façade en pleine lumière, avec un ciel, des ombres cohérentes et un sol planté. Vous choisissez entre un ciel voilé et un soleil franc.',
      en: 'The most requested image: the façade in full light, with a sky, coherent shadows and planted ground. You choose between a hazy sky and direct sun.',
    },
    queries: {
      fr: [
        'rendu extérieur architecture IA',
        'rendu de façade photoréaliste',
        'perspective extérieure rendu 3D IA',
        'rendu villa IA',
      ],
      en: [
        'exterior render AI',
        'AI facade rendering',
        'photorealistic exterior architectural render',
        'AI rendering house exterior',
      ],
    },
    hero: { after: L('/vitrine/residence-abidjan.webp') },
    steps: {
      fr: [
        'Attachez votre croquis, votre capture 3D ou votre photo de maquette.',
        'Choisissez l’ambiance Jour extérieur.',
        'Réglez le format et la taille — jusqu’au 4K.',
        'Lancez, puis ajoutez de la végétation ou des personnages si la scène en manque.',
      ],
      en: [
        'Attach your sketch, your 3D capture or your photo of a model.',
        'Pick the Exterior day ambiance.',
        'Set the ratio and the size — up to 4K.',
        'Send, then add planting or people if the scene lacks them.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'La lumière est décrite, pas improvisée',
          en: 'The light is described, not improvised',
        },
        body: {
          fr: 'L’ambiance Jour extérieur porte sa propre description de lumière : température de couleur, contraste, direction des ombres, ciel. C’est ce qui donne des ombres qui tombent du même côté sur toute l’image et une façade qui ne part pas en surexposition. Vous pouvez remplacer ce texte dans la barre de commande avant de lancer : ce que vous lisez est exactement ce qui est envoyé au moteur.',
          en: 'The Exterior day ambiance carries its own description of light: colour temperature, contrast, shadow direction, sky. That is what gives shadows falling the same way across the whole image and a façade that does not blow out. You can replace that text in the command bar before sending: what you read is exactly what goes to the engine.',
        },
      },
      {
        heading: {
          fr: 'Ciel voilé ou soleil franc',
          en: 'Hazy sky or direct sun',
        },
        body: {
          fr: 'Deux intentions différentes. Le ciel légèrement voilé, par défaut, éclaire la façade de manière douce et pardonne un dessin imprécis — c’est le bon choix pour montrer une volumétrie. Le soleil franc découpe les ombres et fait exister les reliefs, les brise-soleil et les débords de toiture : plus spectaculaire, plus exigeant sur la justesse du croquis.',
          en: 'Two different intentions. The lightly hazy sky, the default, lights the façade softly and forgives an imprecise drawing — the right choice to show massing. Direct sun cuts shadows and brings out relief, brise-soleil and roof overhangs: more striking, more demanding on the sketch being right.',
        },
      },
      {
        heading: {
          fr: 'Ajouter ce qui manque au terrain',
          en: 'Adding what the site lacks',
        },
        body: {
          fr: 'Un croquis montre rarement les arbres, les voitures ou les passants. L’action Ajouter place ces éléments à partir d’une photo de référence, sur le sol, les terrasses et les ouvertures que l’image a déjà — jamais un nouveau mur ni une nouvelle fenêtre. Et l’action Commenter permet de pointer une zone précise et de ne corriger que celle-là.',
          en: 'A sketch rarely shows trees, cars or passers-by. The Add action places such elements from a reference photo, on the ground, terraces and openings the image already has — never a new wall or a new window. And the Comment action lets you point at one area and fix only that one.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Peut-on choisir l’heure de la journée ?',
          en: 'Can I choose the time of day?',
        },
        a: {
          fr: 'Oui : Jour extérieur, Heure dorée et Temps de pluie sont trois ambiances distinctes, et la nuit en est une quatrième.',
          en: 'Yes: Exterior day, Golden hour and Rainy day are three separate ambiances, and night is a fourth.',
        },
      },
      {
        q: {
          fr: 'Quelle taille pour une impression ?',
          en: 'What size for printing?',
        },
        a: {
          fr: 'Le 4K est la taille la plus grande proposée. Au-delà, un agrandissement ajoute des pixels, pas du détail — nous le disons plutôt que de le vendre.',
          en: '4K is the largest size offered. Beyond that, an enlargement adds pixels, not detail — we say so rather than sell it.',
        },
      },
      {
        q: {
          fr: 'Et si le rendu change ma façade ?',
          en: 'What if the render changes my façade?',
        },
        a: {
          fr: 'Relancez : la fidélité est demandée à chaque rendu, et deux tirages du même croquis ne dérivent pas de la même manière.',
          en: 'Run it again: fidelity is asked for on every render, and two draws from the same sketch do not drift the same way.',
        },
      },
    ],
    gallery: [
      P('/galerie/jour-ext-1.jpg'),
      P('/galerie/jour-ext-2.jpg'),
      P('/galerie/jour-ext-3.jpg'),
      P('/galerie/jour-ext-4.jpg'),
    ],
  },
  {
    slug: 'rendu-interieur',
    preset: 'jour_int',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Rendu intérieur par IA',
        description:
          'Salon, chambre, cuisine, bureau : un rendu intérieur photoréaliste depuis un croquis, une capture 3D ou une photo, avec vos volumes et vos ouvertures.',
      },
      en: {
        title: 'AI interior rendering',
        description:
          'Living room, bedroom, kitchen, office: a photorealistic interior render from a sketch, a 3D capture or a photo, with your volumes and your openings.',
      },
    },
    h1: {
      fr: 'Rendu intérieur par IA',
      en: 'AI interior rendering',
    },
    lede: {
      fr: 'La lumière intérieure est le cas le plus difficile à régler dans un moteur classique : équilibrer la fenêtre et la pièce. Ici elle est décrite une fois et tenue sur toute l’image.',
      en: 'Interior light is the hardest thing to balance in a traditional engine: the window against the room. Here it is described once and held across the whole image.',
    },
    queries: {
      fr: [
        'rendu intérieur IA',
        'rendu 3D salon photoréaliste',
        'décoration intérieure rendu intelligence artificielle',
        'rendu intérieur depuis un croquis',
      ],
      en: [
        'interior render AI',
        'AI interior design render',
        'photorealistic interior rendering AI',
        'room render from sketch',
      ],
    },
    hero: {
      before: AB('/avant-apres/interieur-croquis.jpg'),
      after: AB('/avant-apres/interieur-rendu.jpg'),
    },
    steps: {
      fr: [
        'Attachez votre perspective intérieure : croquis, capture 3D ou photo de la pièce.',
        'Choisissez Jour intérieur ou Nuit intérieur.',
        'Décrivez les finitions si le dessin ne les montre pas — sol, murs, mobilier.',
        'Lancez, puis changez une seule chose à la fois pour comparer.',
      ],
      en: [
        'Attach your interior perspective: sketch, 3D capture or photo of the room.',
        'Pick Interior day or Interior night.',
        'Describe the finishes if the drawing does not show them — floor, walls, furniture.',
        'Send, then change one thing at a time to compare.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'La fenêtre et la pièce, ensemble',
          en: 'The window and the room, together',
        },
        body: {
          fr: 'Le réflexe des générateurs généralistes est de brûler la fenêtre ou de noyer la pièce. L’ambiance Jour intérieur porte des valeurs de contraste et d’exposition écrites pour ce cas précis, de sorte que l’extérieur reste lisible derrière la baie et que les angles de la pièce ne tombent pas dans le noir. Pour une pièce peu éclairée, l’option Pièce sombre d’Améliorer existe.',
          en: 'The reflex of general-purpose generators is to burn out the window or drown the room. The Interior day ambiance carries contrast and exposure values written for that exact case, so the outside stays legible behind the glazing and the corners of the room do not fall into black. For a poorly lit room, Enhance has a Dark room option.',
        },
      },
      {
        heading: {
          fr: 'Garder la pièce, changer la matière',
          en: 'Keep the room, change the material',
        },
        body: {
          fr: 'Les murs, les ouvertures et les hauteurs de votre dessin ne bougent pas. Ce que vous pouvez faire varier : le sol, les finitions, le mobilier, la palette, l’ambiance. Deux rendus du même croquis avec deux demandes différentes donnent deux propositions comparables — c’est la bonne manière de présenter un choix à un client plutôt que de lui décrire deux options à l’oral.',
          en: 'The walls, the openings and the heights of your drawing do not move. What you can vary: the floor, the finishes, the furniture, the palette, the ambiance. Two renders of the same sketch with two different requests give two comparable proposals — the right way to present a choice to a client rather than describing two options out loud.',
        },
      },
      {
        heading: {
          fr: 'Une référence pour la matière exacte',
          en: 'A reference for the exact material',
        },
        body: {
          fr: 'Quand le client a déjà choisi un parquet, un carrelage ou un tissu, décrire ne suffit pas. Ajoutez la photographie du matériau comme image de référence : le moteur en reprend la matière, pas la géométrie. Jusqu’à trois références, qui restent épinglées tant que vous ne les retirez pas.',
          en: 'When the client has already chosen a floor, a tile or a fabric, describing it is not enough. Add the photograph of the material as a reference image: the engine takes its material, not its geometry. Up to three references, which stay pinned until you remove them.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Puis-je partir d’une photo de la pièce existante ?',
          en: 'Can I start from a photo of the existing room?',
        },
        a: {
          fr: 'Oui. Une photographie est une image comme une autre, et c’est le cas type d’une rénovation : même pièce, autres finitions.',
          en: 'Yes. A photograph is an image like any other, and that is the typical refurbishment case: same room, different finishes.',
        },
      },
      {
        q: {
          fr: 'Le mobilier est-il réaliste ?',
          en: 'Is the furniture realistic?',
        },
        a: {
          fr: 'Il est plausible, pas catalogué : ce ne sont pas des références de fabricants. Pour un meuble précis, passez par une image de référence.',
          en: 'It is plausible, not catalogued: these are not manufacturer references. For a specific piece, use a reference image.',
        },
      },
      {
        q: {
          fr: 'Et un rendu de nuit à l’intérieur ?',
          en: 'What about an interior at night?',
        },
        a: {
          fr: 'C’est l’ambiance Nuit intérieur, avec son propre éclairage artificiel.',
          en: 'That is the Interior night ambiance, with its own artificial lighting.',
        },
      },
    ],
    gallery: [
      P('/galerie/jour-int-1.jpg'),
      P('/galerie/jour-int-2.jpg'),
      P('/galerie/jour-int-3.jpg'),
      P('/galerie/jour-int-4.jpg'),
    ],
  },
  {
    slug: 'rendu-nuit',
    preset: 'nuit_ext',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Rendu de nuit par IA',
        description:
          'Façade de nuit, fenêtres allumées, éclairage de voirie, ciel sombre : un rendu nocturne depuis le même croquis que votre vue de jour.',
      },
      en: {
        title: 'AI night rendering',
        description:
          'Façade at night, lit windows, street lighting, dark sky: a night render from the same sketch as your daytime view.',
      },
    },
    h1: { fr: 'Rendu de nuit par IA', en: 'AI night rendering' },
    lede: {
      fr: 'Un projet se vend souvent deux fois : une image de jour et une image de nuit. La seconde ne demande pas un nouveau dessin, seulement une autre ambiance sur le même croquis.',
      en: 'A project often sells twice: a daytime image and a night one. The second needs no new drawing, only a different ambiance on the same sketch.',
    },
    queries: {
      fr: [
        'rendu de nuit architecture IA',
        'rendu nocturne façade',
        'éclairage nocturne rendu 3D IA',
        'rendu immeuble la nuit',
      ],
      en: [
        'night render AI',
        'AI nighttime architectural rendering',
        'facade at night render',
        'exterior night rendering AI',
      ],
    },
    hero: { after: L('/vitrine/immeuble-nuit.webp') },
    steps: {
      fr: [
        'Reprenez le croquis ou la capture qui a servi à votre vue de jour.',
        'Choisissez Nuit extérieur — ou Nuit intérieur pour une pièce.',
        'Lancez le rendu, puis comparez les deux images côte à côte.',
        'Téléchargez les deux : même projet, deux ambiances.',
      ],
      en: [
        'Take the sketch or capture that produced your daytime view.',
        'Pick Exterior night — or Interior night for a room.',
        'Send the render, then compare the two images side by side.',
        'Download both: same project, two ambiances.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Ce que la nuit révèle du projet',
          en: 'What night reveals about the project',
        },
        body: {
          fr: 'De nuit, c’est la lumière intérieure qui dessine le bâtiment : les baies deviennent des surfaces claires, les retraits disparaissent, la silhouette compte plus que la matière. L’ambiance Nuit extérieur porte ses propres valeurs — ciel sombre, fenêtres chaudes, éclairage de voirie, reflets au sol — et garde la géométrie de votre image de départ comme toutes les autres.',
          en: 'At night it is interior light that draws the building: glazing becomes bright surfaces, setbacks disappear, the silhouette matters more than the material. The Exterior night ambiance carries its own values — dark sky, warm windows, street lighting, reflections on the ground — and keeps the geometry of your input image like every other one.',
        },
      },
      {
        heading: {
          fr: 'Le même projet, deux images comparables',
          en: 'The same project, two comparable images',
        },
        body: {
          fr: 'Parce que les deux rendus partent de la même image source, le point de vue et les volumes sont identiques d’une image à l’autre. C’est ce qui fait une planche crédible : la même maison, de jour puis de nuit, et non deux maisons qui se ressemblent. Pour une troisième intention, Heure dorée tient le milieu des deux.',
          en: 'Because both renders start from the same source image, the viewpoint and the volumes are identical from one to the other. That is what makes a credible board: the same house, by day then by night, rather than two houses that look alike. For a third intention, Golden hour sits between the two.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Faut-il redessiner pour la vue de nuit ?',
          en: 'Do I need to redraw for the night view?',
        },
        a: {
          fr: 'Non. Le même croquis, une autre ambiance. C’est tout l’intérêt de partir d’une image.',
          en: 'No. Same sketch, different ambiance. That is the whole point of starting from an image.',
        },
      },
      {
        q: {
          fr: 'Les fenêtres allumées sont-elles cohérentes ?',
          en: 'Is the lit glazing coherent?',
        },
        a: {
          fr: 'Elles suivent les ouvertures de votre image : le moteur n’a pas le droit d’en ajouter ni d’en supprimer.',
          en: 'It follows the openings of your image: the engine is not allowed to add or remove any.',
        },
      },
      {
        q: {
          fr: 'Et un rendu sous la pluie ?',
          en: 'What about a render in the rain?',
        },
        a: {
          fr: 'Temps de pluie est une ambiance à part, avec son ciel, ses sols mouillés et ses reflets.',
          en: 'Rainy day is a separate ambiance, with its own sky, wet ground and reflections.',
        },
      },
    ],
    gallery: [
      P('/galerie/nuit-ext-1.jpg'),
      P('/galerie/nuit-ext-2.jpg'),
      P('/galerie/nuit-int-1.jpg'),
      P('/galerie/nuit-int-2.jpg'),
    ],
  },
  {
    slug: 'axonometrie-eclatee',
    preset: 'eclate',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Axonométrie éclatée générée par IA',
        description:
          'Décomposer un bâtiment en couches — structure, enveloppe, niveaux — en une axonométrie éclatée lisible, depuis un plan ou une vue 3D.',
      },
      en: {
        title: 'AI-generated exploded axonometric',
        description:
          'Break a building into layers — structure, envelope, floors — as a legible exploded axonometric, from a plan or a 3D view.',
      },
    },
    h1: {
      fr: 'Axonométrie éclatée générée par IA',
      en: 'AI-generated exploded axonometric',
    },
    lede: {
      fr: 'Le dessin qui explique un projet mieux qu’un paragraphe : les couches séparées verticalement, chacune lisible. Deux heures d’Illustrator en quelques minutes.',
      en: 'The drawing that explains a project better than a paragraph: layers separated vertically, each one legible. Two hours of Illustrator in a few minutes.',
    },
    queries: {
      fr: [
        'axonométrie éclatée',
        'axonométrie éclatée IA',
        'schéma éclaté architecture',
        'vue explosée bâtiment',
      ],
      en: [
        'exploded axonometric AI',
        'exploded axonometric diagram architecture',
        'exploded isometric building',
        'AI architecture diagram',
      ],
    },
    hero: { after: L('/galerie/eclate-1.jpg') },
    steps: {
      fr: [
        'Attachez un plan, une coupe ou une vue 3D du projet.',
        'Choisissez l’ambiance Axonométrie éclatée.',
        'Précisez les couches à séparer si vous avez une idée précise.',
        'Lancez, puis demandez une variante si l’ordre des couches ne vous convient pas.',
      ],
      en: [
        'Attach a plan, a section or a 3D view of the project.',
        'Pick the Exploded axonometric ambiance.',
        'Name the layers to separate if you have something precise in mind.',
        'Send, then ask for a variant if the layer order does not suit you.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Une représentation, pas une photographie',
          en: 'A representation, not a photograph',
        },
        body: {
          fr: 'C’est une des ambiances qui transforment le mode de représentation : le résultat n’est pas une photo mais un dessin technique, avec sa propre palette et ses propres conventions. Elle garde le projet — les volumes, les niveaux, les proportions — et change la manière de le montrer. C’est le même mécanisme que la maquette isométrique ou la planche d’analyse.',
          en: 'This is one of the ambiances that change the mode of representation: the result is not a photo but a technical drawing, with its own palette and its own conventions. It keeps the project — volumes, levels, proportions — and changes how it is shown. The same mechanism as the isometric model or the concept board.',
        },
      },
      {
        heading: {
          fr: 'Ce qu’il faut vérifier sur le résultat',
          en: 'What to check on the result',
        },
        body: {
          fr: 'Une axonométrie éclatée est un dessin qui affirme quelque chose sur la construction, donc relisez-la comme vous reliriez un schéma fait à la main : l’ordre des couches, le nombre de niveaux, le sens de la structure. Si une couche est inventée ou mal placée, relancez ou pointez la zone avec l’action Commenter. Ne publiez pas un schéma que vous n’avez pas vérifié.',
          en: 'An exploded axonometric asserts something about construction, so read it back as you would a hand-made diagram: the order of the layers, the number of floors, the direction of the structure. If a layer is invented or misplaced, run it again or point at the area with the Comment action. Do not publish a diagram you have not checked.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Faut-il un modèle découpé en couches ?',
          en: 'Do I need a model split into layers?',
        },
        a: {
          fr: 'Non, une seule image suffit. La décomposition est produite par le rendu, pas lue dans un fichier.',
          en: 'No, one image is enough. The breakdown is produced by the render, not read from a file.',
        },
      },
      {
        q: {
          fr: 'Le dessin est-il exact techniquement ?',
          en: 'Is the drawing technically accurate?',
        },
        a: {
          fr: 'C’est un document de présentation. Vérifiez-le avant publication : il ne remplace pas vos plans d’exécution.',
          en: 'It is a presentation document. Check it before publishing: it does not replace your construction drawings.',
        },
      },
      {
        q: {
          fr: 'Peut-on l’avoir en noir et blanc ?',
          en: 'Can I get it in black and white?',
        },
        a: {
          fr: 'Écrivez-le dans la demande : le texte de l’ambiance est modifiable dans la barre de commande avant l’envoi.',
          en: 'Write it in the request: the ambiance text can be edited in the command bar before sending.',
        },
      },
    ],
    gallery: [L('/galerie/eclate-1.jpg'), L('/galerie/eclate-2.jpg')],
  },
  {
    slug: 'planche-analyse',
    preset: 'analyse',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Planche d’analyse architecturale par IA',
        description:
          'Site, orientation, flux, intentions : une planche d’analyse lisible générée depuis votre plan, pour un dossier de concours ou un rendu d’école.',
      },
      en: {
        title: 'AI architectural concept board',
        description:
          'Site, orientation, flows, intentions: a legible analysis board generated from your plan, for a competition file or a studio submission.',
      },
    },
    h1: {
      fr: 'Planche d’analyse architecturale',
      en: 'Architectural concept board',
    },
    lede: {
      fr: 'La planche que l’on fait la veille du rendu et qui prend la nuit entière. Elle part du même plan que le reste de votre dossier.',
      en: 'The board you make the night before the deadline and that takes the whole night. It starts from the same plan as the rest of your file.',
    },
    queries: {
      fr: [
        'planche d’analyse architecture',
        'planche de concours architecture IA',
        'diagramme d’analyse de site',
        'analyse de site architecture dessin',
      ],
      en: [
        'architecture concept board AI',
        'site analysis diagram AI',
        'architecture analysis board',
        'architecture competition board AI',
      ],
    },
    hero: { after: L('/galerie/analyse-1.jpg') },
    steps: {
      fr: [
        'Attachez votre plan masse, votre plan de niveau ou votre vue 3D.',
        'Choisissez l’ambiance Planche d’analyse.',
        'Écrivez les intentions à faire apparaître — orientation, flux, vues, vents.',
        'Lancez, puis relisez chaque annotation avant de l’intégrer au dossier.',
      ],
      en: [
        'Attach your site plan, your floor plan or your 3D view.',
        'Pick the Concept board ambiance.',
        'Write the intentions to show — orientation, flows, views, winds.',
        'Send, then read every annotation back before putting it in the file.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Dire les intentions, pas seulement le dessin',
          en: 'Stating the intentions, not just the drawing',
        },
        body: {
          fr: 'C’est l’ambiance où votre demande compte le plus. Le plan donne la géométrie ; vos mots donnent ce que la planche doit démontrer — l’orientation solaire, les vents dominants, les accès, les vues à cadrer, la hiérarchie des espaces. Une demande précise donne une planche utilisable ; une demande vague donne un joli dessin qui ne dit rien.',
          en: 'This is the ambiance where your request matters most. The plan gives the geometry; your words give what the board has to demonstrate — solar orientation, prevailing winds, access, views to frame, the hierarchy of spaces. A precise request gives a usable board; a vague one gives a pretty drawing that says nothing.',
        },
      },
      {
        heading: {
          fr: 'Relisez les annotations',
          en: 'Read the annotations back',
        },
        body: {
          fr: 'Une planche d’analyse porte du texte, des flèches et des légendes, et un rendu peut écrire une annotation à côté. Traitez-la comme un brouillon très avancé : la composition et le graphisme sont là, les mots sont à vérifier. Dans un dossier de concours ou un rendu noté, une flèche fausse coûte plus cher qu’une planche moins belle.',
          en: 'An analysis board carries text, arrows and captions, and a render can write an annotation slightly off. Treat it as a very advanced draft: the composition and the graphics are there, the words need checking. In a competition file or a graded submission, a wrong arrow costs more than a less beautiful board.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Puis-je l’utiliser pour un rendu d’école ?',
          en: 'Can I use it for a studio submission?',
        },
        a: {
          fr: 'C’est votre décision et celle de votre école : les règles sur l’usage de l’IA varient d’un établissement à l’autre. Vérifiez avant de rendre.',
          en: 'That is your call and your school’s: rules on AI use vary between institutions. Check before submitting.',
        },
      },
      {
        q: {
          fr: 'Le texte est-il dans ma langue ?',
          en: 'Is the text in my language?',
        },
        a: {
          fr: 'La demande est envoyée dans la langue dans laquelle vous lisez le site, et les annotations suivent généralement — à vérifier sur le résultat.',
          en: 'The request is sent in the language you read the site in, and annotations usually follow — check on the result.',
        },
      },
      {
        q: {
          fr: 'Et plusieurs planches cohérentes entre elles ?',
          en: 'What about several boards that match?',
        },
        a: {
          fr: 'Partez du même plan et gardez la même demande de base en ne changeant que l’intention : les planches restent de la même famille graphique.',
          en: 'Start from the same plan and keep the same base request, changing only the intention: the boards stay in the same graphic family.',
        },
      },
    ],
    gallery: [L('/galerie/analyse-1.jpg'), L('/galerie/analyse-2.jpg')],
  },
  {
    slug: 'maquette-isometrique',
    preset: 'isometrie',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Maquette isométrique générée par IA',
        description:
          'Transformer un plan ou une vue 3D en maquette isométrique propre, à la manière d’une maquette physique photographiée en studio.',
      },
      en: {
        title: 'AI-generated isometric model',
        description:
          'Turn a plan or a 3D view into a clean isometric model, like a physical model photographed in a studio.',
      },
    },
    h1: {
      fr: 'Maquette isométrique générée par IA',
      en: 'AI-generated isometric model',
    },
    lede: {
      fr: 'La vue qui fait comprendre un volume d’un seul regard, sans perspective trompeuse. Utile en couverture de dossier comme en vignette de projet.',
      en: 'The view that makes a volume legible at a glance, with no misleading perspective. Useful as a file cover or as a project thumbnail.',
    },
    queries: {
      fr: [
        'maquette isométrique architecture',
        'vue isométrique bâtiment IA',
        'maquette 3D depuis un plan',
        'maquette blanche architecture',
      ],
      en: [
        'isometric model render AI',
        'isometric architecture render',
        'architectural model from plan AI',
        'white model architecture render',
      ],
    },
    hero: { after: L('/galerie/isometrie-1.jpg') },
    steps: {
      fr: [
        'Attachez un plan, une élévation ou une vue 3D.',
        'Choisissez Maquette isométrique — ou Maquette blanche pour un modèle en carton et plâtre.',
        'Précisez le niveau de détail et le traitement du sol.',
        'Lancez, puis gardez la même ambiance pour toute une série de projets.',
      ],
      en: [
        'Attach a plan, an elevation or a 3D view.',
        'Pick Isometric model — or White model for a card-and-plaster mock-up.',
        'Set the level of detail and how the ground is treated.',
        'Send, then keep the same ambiance across a whole series of projects.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Isométrie ou maquette blanche',
          en: 'Isometric or white model',
        },
        body: {
          fr: 'Deux ambiances voisines et deux intentions différentes. La maquette isométrique est une représentation dessinée, lisible, souvent colorée, qui montre l’organisation. La maquette blanche est une photographie de maquette physique : carton, plâtre, lumière de studio, pas de matériau de façade — elle montre la volumétrie seule, ce qui est exactement ce qu’on veut en phase de concours.',
          en: 'Two neighbouring ambiances and two different intentions. The isometric model is a drawn, legible, often coloured representation showing organisation. The white model is a photograph of a physical model: card, plaster, studio light, no façade material — it shows massing alone, which is exactly what a competition phase calls for.',
        },
      },
      {
        heading: {
          fr: 'Une série qui tient ensemble',
          en: 'A series that holds together',
        },
        body: {
          fr: 'L’isométrie est l’ambiance la plus utile pour un portfolio : en passant tous vos projets par la même, les vignettes partagent un point de vue, une palette et un traitement de sol. Dix projets hétérogènes deviennent une série. Gardez la même demande d’un projet au suivant et ne changez que l’image source.',
          en: 'The isometric is the most useful ambiance for a portfolio: running every project through the same one gives thumbnails that share a viewpoint, a palette and a ground treatment. Ten mismatched projects become a series. Keep the same request from one project to the next and change only the source image.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'L’échelle est-elle respectée ?',
          en: 'Is the scale respected?',
        },
        a: {
          fr: 'Les proportions de votre image sont gardées, mais le rendu n’est pas un document coté. Ne le présentez pas comme tel.',
          en: 'Your image’s proportions are kept, but the render is not a dimensioned document. Do not present it as one.',
        },
      },
      {
        q: {
          fr: 'Le fond est-il transparent ?',
          en: 'Is the background transparent?',
        },
        a: {
          fr: 'Non, le rendu est un JPEG. Pour un fond détouré, demandez un fond uni et détourez-le ensuite.',
          en: 'No, the render is a JPEG. For a cut-out, ask for a plain background and cut it out afterwards.',
        },
      },
      {
        q: {
          fr: 'Peut-on montrer l’intérieur ?',
          en: 'Can it show the inside?',
        },
        a: {
          fr: 'Oui, en partant d’une coupe ou d’un plan plutôt que d’une façade, ou en passant par l’axonométrie éclatée.',
          en: 'Yes, by starting from a section or a plan rather than a façade, or by using the exploded axonometric.',
        },
      },
    ],
    gallery: [L('/galerie/isometrie-1.jpg'), L('/galerie/isometrie-2.jpg')],
  },
  {
    slug: 'schema-acces',
    preset: 'esquisse',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Schéma d’accès et de circulation par IA',
        description:
          'Un diagramme blanc annoté qui montre les entrées, les circulations et les niveaux de votre projet, généré depuis votre plan ou votre vue 3D.',
      },
      en: {
        title: 'AI access and circulation diagram',
        description:
          'A white annotated diagram showing the entrances, circulation and levels of your project, generated from your plan or 3D view.',
      },
    },
    h1: {
      fr: 'Schéma d’accès et de circulation',
      en: 'Access and circulation diagram',
    },
    lede: {
      fr: 'Le diagramme blanc, dépouillé et annoté, qu’on met en tête d’une notice pour expliquer comment on entre et comment on circule.',
      en: 'The stripped-back white annotated diagram you put at the head of a design statement to explain how you enter and how you move through.',
    },
    queries: {
      fr: [
        'schéma d’accès architecture',
        'schéma de circulation bâtiment',
        'diagramme axonométrique annoté',
        'schéma de principe architecture IA',
      ],
      en: [
        'access diagram architecture AI',
        'circulation diagram building',
        'annotated axonometric diagram',
        'architecture concept diagram AI',
      ],
    },
    hero: { after: { src: '/galerie/esquisse-1.jpg', w: 1200, h: 670 } },
    steps: {
      fr: [
        'Attachez le plan ou la vue 3D du projet.',
        'Choisissez l’ambiance Schéma d’accès.',
        'Nommez les entrées et les circulations à marquer.',
        'Lancez, puis vérifiez que chaque flèche tombe sur une ouverture réelle.',
      ],
      en: [
        'Attach the plan or 3D view of the project.',
        'Pick the Access diagram ambiance.',
        'Name the entrances and circulation to mark.',
        'Send, then check every arrow lands on a real opening.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Les flèches ne tombent que sur des ouvertures réelles',
          en: 'Arrows only land on real openings',
        },
        body: {
          fr: 'C’est la règle propre à cette ambiance : les flèches d’accès se posent sur les entrées que l’image montre, et nulle part ailleurs. Un schéma qui fait entrer par un mur aveugle est pire qu’une absence de schéma, parce qu’il sera lu comme une intention de projet. Vérifiez-le à chaque fois — c’est la seule chose à relire sur ce rendu.',
          en: 'This is the rule specific to this ambiance: access arrows land on the entrances the image shows, and nowhere else. A diagram that enters through a blank wall is worse than no diagram, because it will be read as a design intention. Check it every time — it is the one thing to proofread on this render.',
        },
      },
      {
        heading: {
          fr: 'Volumétrie seule, sans matière',
          en: 'Massing alone, no material',
        },
        body: {
          fr: 'Le schéma est volontairement blanc : pas de matériau de façade, pas de végétation photoréaliste, pas de ciel. Ce qui reste est la masse, les niveaux et les parcours. C’est ce qui le rend lisible imprimé en petit, dans une notice ou au coin d’une planche, là où une perspective photoréaliste devient illisible.',
          en: 'The diagram is deliberately white: no façade material, no photorealistic planting, no sky. What is left is massing, levels and routes. That is what keeps it legible printed small, in a statement or in the corner of a board, where a photorealistic perspective becomes unreadable.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Quelle différence avec Esquisse ?',
          en: 'How is it different from Sketch?',
        },
        a: {
          fr: 'Esquisse est un dessin au crayon ; Schéma d’accès est un diagramme blanc annoté. Deux ambiances distinctes.',
          en: 'Sketch is a pencil drawing; Access diagram is a white annotated diagram. Two separate ambiances.',
        },
      },
      {
        q: {
          fr: 'Peut-on choisir les textes des annotations ?',
          en: 'Can I choose the annotation text?',
        },
        a: {
          fr: 'Écrivez-les dans votre demande. Relisez ensuite ce que le rendu a écrit.',
          en: 'Write them in your request. Then read back what the render wrote.',
        },
      },
      {
        q: {
          fr: 'Et les niveaux ?',
          en: 'What about the levels?',
        },
        a: {
          fr: 'Ils sont lus sur l’image. Un plan de masse seul ne permet pas de les marquer : partez d’une vue 3D ou d’une coupe.',
          en: 'They are read from the image. A site plan alone cannot show them: start from a 3D view or a section.',
        },
      },
    ],
    gallery: [
      { src: '/galerie/esquisse-1.jpg', w: 1200, h: 670 },
      { src: '/galerie/esquisse-2.jpg', w: 900, h: 1205 },
    ],
  },
  {
    slug: 'ameliorer-un-rendu',
    lastModified: '2026-10-28',
    seo: {
      fr: {
        title: 'Améliorer la qualité d’un rendu 3D',
        description:
          'Netteté, détails, lumière, matériaux, ciel, végétation : reprendre un rendu flou ou plat et le rendre présentable, sans refaire la scène.',
      },
      en: {
        title: 'Improve the quality of a 3D render',
        description:
          'Sharpness, detail, light, materials, sky, planting: take a blurry or flat render and make it presentable, without rebuilding the scene.',
      },
    },
    h1: {
      fr: 'Améliorer la qualité d’un rendu 3D',
      en: 'Improve the quality of a 3D render',
    },
    lede: {
      fr: 'Un rendu trop plat, un aperçu basse qualité, une vieille image de projet : vous cochez ce qui doit changer et vous récupérez la même image, en mieux.',
      en: 'A render that falls flat, a low-quality preview, an old project image: tick what should change and get the same image back, better.',
    },
    queries: {
      fr: [
        'améliorer un rendu 3D',
        'améliorer la qualité d’une image de rendu',
        'rendu flou améliorer IA',
        'post-production rendu architecture',
      ],
      en: [
        'AI render enhancer',
        'improve 3D render quality AI',
        'enhance architectural render',
        'upscale architectural render AI',
      ],
    },
    hero: { after: L('/vitrine/ameliorer.webp') },
    steps: {
      fr: [
        'Ouvrez Améliorer et attachez l’image à reprendre.',
        'Cochez ce qui doit changer : netteté, détails, lumière, matériaux, ciel, végétation, vie et éléments de scène, ambiance.',
        'Choisissez l’intensité — Léger, Moyen ou Fort.',
        'Lancez, puis comparez avec le curseur avant / après.',
      ],
      en: [
        'Open Enhance and attach the image to rework.',
        'Tick what should change: sharpness, detail, light, materials, sky, planting, life and scene elements, ambiance.',
        'Choose the intensity — Light, Medium or Strong.',
        'Send, then compare with the before / after slider.',
      ],
    },
    sections: [
      {
        heading: {
          fr: 'Huit améliorations, cochées une par une',
          en: 'Eight improvements, ticked one by one',
        },
        body: {
          fr: 'Vous ne demandez pas « fais mieux » : vous désignez ce qui ne va pas. La netteté et les détails reprennent une image molle ou basse résolution ; la lumière rattrape une scène plate, avec une option Pièce sombre ; les matériaux, le ciel et la végétation remplacent ce qui fait amateur dans un rendu rapide ; Vie et éléments de scène ajoute des présences ; Ambiance change le moment de la journée. Rien n’est obligatoire : votre description seule suffit.',
          en: 'You do not ask it to "do better": you point at what is wrong. Sharpness and detail rework a soft or low-resolution image; light rescues a flat scene, with a Dark room option; materials, sky and planting replace what looks amateur in a quick render; Life and scene elements adds presences; Ambiance changes the time of day. Nothing is mandatory: your description alone is enough.',
        },
      },
      {
        heading: {
          fr: 'Trois intensités, parce que « plus » n’est pas toujours mieux',
          en: 'Three intensities, because "more" is not always better',
        },
        body: {
          fr: 'Léger garde la même image, simplement plus propre — c’est le bon réglage quand l’image est déjà validée par le client et qu’il ne faut rien changer d’autre. Moyen, par défaut, rend net sans que cela se voie. Fort pousse vers un rendu photo haut de gamme et s’éloigne davantage de l’original. Pas de curseur de 0 à 100 : trois choix nommés, chacun avec une phrase qui dit ce qu’il fait.',
          en: 'Light keeps the same image, simply cleaner — the right setting when the client has already signed off and nothing else should move. Medium, the default, sharpens without showing. Strong pushes towards a high-end photo render and departs further from the original. No 0-to-100 slider: three named choices, each with a sentence saying what it does.',
        },
      },
      {
        heading: {
          fr: 'Ce qu’un agrandissement ne fait pas',
          en: 'What an enlargement does not do',
        },
        body: {
          fr: 'Il faut le dire clairement : demander du 4K sur une petite image ajoute des pixels, pas du détail qui n’était pas là. L’amélioration peut reconstruire une matière plausible, elle ne retrouve pas une information absente de l’original. Partez de la plus grande version que vous avez, pas d’une vignette.',
          en: 'This has to be said plainly: asking for 4K on a small image adds pixels, not detail that was never there. Enhancement can rebuild a plausible material, it cannot recover information absent from the original. Start from the largest version you have, not from a thumbnail.',
        },
      },
    ],
    faq: [
      {
        q: {
          fr: 'Est-ce que ma géométrie change ?',
          en: 'Does my geometry change?',
        },
        a: {
          fr: 'Non : les volumes, le cadrage et les ouvertures sont gardés, comme pour un rendu. Seule l’ambiance, si vous la cochez, modifie la lumière.',
          en: 'No: volumes, framing and openings are kept, as in a render. Only Ambiance, if you tick it, changes the light.',
        },
      },
      {
        q: {
          fr: 'Puis-je améliorer une photo plutôt qu’un rendu ?',
          en: 'Can I enhance a photo rather than a render?',
        },
        a: {
          fr: 'Oui. Une photographie de bâtiment existant se reprend de la même manière.',
          en: 'Yes. A photograph of an existing building can be reworked the same way.',
        },
      },
      {
        q: {
          fr: 'Combien de fois peut-on améliorer la même image ?',
          en: 'How many times can I enhance the same image?',
        },
        a: {
          fr: 'Autant que vous voulez, chaque passage coûtant des crédits. En pratique, deux passages suffisent : au-delà l’image devient lisse.',
          en: 'As many times as you like, each pass costing credits. In practice two passes are enough: beyond that the image goes waxy.',
        },
      },
    ],
    gallery: [
      E('/ameliorer/villa-palmiers.jpg'),
      E('/ameliorer/maison-foret.jpg'),
      E('/ameliorer/tour-en-pierre.jpg'),
      E('/ameliorer/immeuble-blanc.jpg'),
    ],
  },
];

/** The slug of every use-case page, in page order. */
export const USE_CASE_SLUGS: readonly string[] = USE_CASES.map((u) => u.slug);

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((u) => u.slug === slug);
}

/** The address of a use-case page, relative to the site root. */
export function useCasePath(slug: string): string {
  return `/rendu/${slug}`;
}

/**
 * The other pages to offer at the bottom of one — a crawler follows them and
 * a reader uses them. Each page links to the next ones in order, wrapping
 * round, so every page is reachable from every other in a few hops and none
 * ends up an orphan.
 */
export function relatedUseCases(slug: string, count = 3): readonly UseCase[] {
  const i = USE_CASES.findIndex((u) => u.slug === slug);
  if (i < 0) return USE_CASES.slice(0, count);
  return Array.from({ length: Math.min(count, USE_CASES.length - 1) }, (_, k) => {
    const next = USE_CASES[(i + k + 1) % USE_CASES.length];
    // The modulo keeps the index in range, so this is never undefined.
    return next as UseCase;
  });
}
