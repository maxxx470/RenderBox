// Keyword answers for when no language model is reachable (no key, or the
// call failed) — the assistant still answers the questions people actually
// ask instead of showing an error. Same idea as Metrio's rule-based fallback.
//
// Topics are checked in order; the first whose keywords appear in the last
// user message wins. Keep the answers in step with knowledge.ts.
import 'server-only';
import { MAX_ANNOTATIONS } from '@/lib/server/generation/annotations';
import { PRICING_TIERS } from '@/lib/pricing-tiers';

type Locale = 'fr' | 'en';

const quotas = PRICING_TIERS.map((t) => t.generationsPerMonth).join(' / ');

const TOPICS: { keys: string[]; fr: string; en: string }[] = [
  {
    // Not a bare 'comment': it would catch every French « Comment … ? ».
    keys: [
      'commenter',
      'commentaire',
      'comment on',
      'comments',
      'pointer',
      'pastille',
      'bulle',
      'modifier',
      'retouch',
      'edit',
      'pin ',
    ],
    fr: `Pour modifier une partie d'un rendu : ouvrez le projet, choisissez le mode « Commenter », cliquez sur le rendu à l'endroit à changer et écrivez le changement dans la bulle (Entrée pour valider). Jusqu'à ${MAX_ANNOTATIONS} commentaires, puis « Appliquer ». Ce mode utilise toujours Pixel IA, et le résultat devient une nouvelle branche de l'arbre : l'original reste disponible.`,
    en: `To change part of a render: open the project, pick the "Comment" mode, click the render where it should change and type the change in the bubble (Enter to save). Up to ${MAX_ANNOTATIONS} comments, then "Apply". This mode always uses Pixel AI, and the result becomes a new branch of the tree: the original stays available.`,
  },
  {
    keys: [
      'enhance',
      'amélior',
      'ameliore',
      'netteté',
      'nettete',
      'qualité',
      'qualite',
      'improve',
      'sharp',
      'upscale',
    ],
    fr: "La page Enhance améliore un rendu existant sans changer le cadrage ni le bâtiment : joignez l'image avec le trombone de la barre, cochez ce qu'il faut améliorer (netteté, détail, lumière, matériaux, ciel, végétation, vie et ambiance) — le « + » de chaque élément ajoute une image de référence — ou décrivez-le vous-même dans la barre, choisissez l'intensité Léger ou Marqué, puis lancez.",
    en: 'The Enhance page improves an existing render without changing the framing or the building: attach the image with the paperclip in the bar, tick what to improve (sharpness, detail, lighting, materials, sky, planting, life and atmosphere) — the "+" of each item adds a reference image — or describe it yourself in the bar, pick Subtle or Strong, then run it.',
  },
  {
    keys: ['moteur', 'engine', 'rouge', 'jaune', 'red', 'yellow'],
    fr: "RenderBox a deux moteurs. Visio (pastille rouge) : rapide, bon rapport qualité/coût. Pixel IA (pastille jaune) : meilleur suivi d'instructions précises. Vous choisissez le moteur à chaque rendu dans la barre de commande ; le moteur par défaut se règle dans Paramètres. Les deux partagent les matériaux et l'historique du projet.",
    en: 'RenderBox has two engines. Visio (red dot): fast, good price/quality ratio. Pixel AI (yellow dot): best at following precise instructions. Pick the engine for each render in the command bar; set the default one in Settings. Both share the project’s materials and history.',
  },
  {
    keys: [
      'arbre',
      'variante',
      'branche',
      'historique',
      'version',
      'tree',
      'variant',
      'branch',
      'history',
    ],
    fr: "Dans un projet, l'« Arbre du projet » garde tous vos rendus. Cliquez sur n'importe lequel pour le rouvrir et en faire le point de départ d'une nouvelle variante (autre ambiance, autre moteur, commentaire…). Rien ne se perd. Sur téléphone, l'arbre s'ouvre avec le bouton en haut à droite.",
    en: 'Inside a project, the "Project tree" keeps every render. Click any of them to reopen it and use it as the starting point of a new variant (another ambiance, another engine, a comment…). Nothing gets lost. On a phone, open the tree with the button at the top left.',
  },
  {
    keys: ['matériau', 'materiau', 'material', 'mémoire', 'memoire', 'memory'],
    fr: 'RenderBox détecte les matériaux de votre projet (façades, sols, menuiseries…) et les réutilise pour que chaque nouveau rendu reste cohérent. Vous les retrouvez dans le panneau Matériaux du projet ; ils sont mis à jour après une modification par commentaire.',
    en: 'RenderBox detects your project’s materials (façades, floors, joinery…) and reuses them so every new render stays consistent. You find them in the project’s Materials panel; they are updated after an edit by comment.',
  },
  {
    keys: [
      'abonnement',
      'tarif',
      'prix',
      'quota',
      'génération',
      'generation',
      'restant',
      'payer',
      'plan',
      'price',
      'subscription',
      'pay',
    ],
    fr: `Trois formules : Découverte, Standard et Pro (${quotas} générations par mois). Chaque rendu, modification ou Enhance consomme une génération. Votre solde est dans la pastille bleue de l'en-tête et sur l'Accueil ; changez de formule depuis la page Abonnement.`,
    en: `Three plans: Découverte, Standard and Pro (${quotas} generations a month). Every render, edit or Enhance uses one generation. Your balance is in the blue pill of the header and on Home; change plan from the Subscription page.`,
  },
  {
    keys: ['ajout', 'ajouter', 'personnage', 'mobilier', 'add', 'person', 'furniture'],
    fr: "Pour ajouter un élément (personnage, mobilier, végétation…) : dans le projet, mode « Ajouter », décrivez où et comment, joignez si besoin une image de référence de l'élément, choisissez le nombre de variantes, puis générez.",
    en: 'To add an element (a person, furniture, planting…): in the project, "Add" mode, describe where and how, attach a reference image of the element if needed, choose how many variants, then generate.',
  },
  {
    keys: ['télécharg', 'telecharg', 'export', 'download'],
    fr: 'Pour télécharger un rendu : dans Mes images, survolez l’image et utilisez le bouton de téléchargement ; ou ouvrez-la, sélectionnez-la dans l’arbre et utilisez le bouton de téléchargement.',
    en: 'To download a render: open the project, select the render in the tree and use the download button.',
  },
  {
    keys: [
      'ambiance',
      'nuit',
      'jour',
      'esquisse',
      'intérieur',
      'interieur',
      'night',
      'day',
      'sketch',
      'interior',
      'preset',
    ],
    fr: 'Cinq ambiances : Jour extérieur, Jour intérieur, Nuit extérieur, Nuit intérieur et Esquisse (un rendu dessiné, volontairement pas photoréaliste). Choisissez-la dans la barre de commande avant de générer.',
    en: 'Five ambiances: Exterior day, Interior day, Exterior night, Interior night and Sketch (a drawn render, deliberately not photoreal). Pick it in the command bar before generating.',
  },
  {
    keys: [
      'commencer',
      'premier',
      'photo',
      'croquis',
      'importer',
      'upload',
      'start',
      'first',
      'nouveau',
      'new',
      'rendu',
      'render',
    ],
    fr: 'Pour un premier rendu : page Image (ou le bouton « + »), joignez une photo ou un croquis avec le trombone de la barre de commande, choisissez une ambiance et un moteur, ajoutez une description si vous voulez, puis « Générer ». Un projet est créé automatiquement.',
    en: 'For a first render: the Image page (or the "+" button), attach a photo or a sketch with the paperclip in the command bar, pick an ambiance and an engine, add a description if you like, then "Generate". A project is created automatically.',
  },
];

const DEFAULT = {
  fr: "Je suis l'assistant RenderBox. Je peux vous aider à générer un rendu, choisir un moteur ou une ambiance, modifier un rendu en le commentant, utiliser Enhance, naviguer dans l'arbre du projet ou comprendre votre abonnement. Que voulez-vous faire ?",
  en: 'I am the RenderBox assistant. I can help you generate a render, pick an engine or an ambiance, change a render by commenting on it, use Enhance, find your way in the project tree or understand your plan. What would you like to do?',
};

export function fallbackReply(lastUserMessage: string, locale: Locale): string {
  const text = lastUserMessage.toLowerCase();
  const topic = TOPICS.find((t) => t.keys.some((k) => text.includes(k)));
  return topic ? topic[locale] : DEFAULT[locale];
}
