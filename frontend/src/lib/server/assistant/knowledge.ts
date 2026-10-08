// What the in-app assistant knows about RenderBox (after the owner's Metrio
// assistant, routes/assistant.ts there).
//
// Every figure that can change — ambiances, plans and quotas, ratios,
// resolutions, Enhance options, engine names — is read from the module that
// owns it, never retyped here, so the assistant cannot drift from the product.
// The prose around them describes how the app is used today; when a feature
// ships, add it here in the same breath as its announcement (app/info).
import 'server-only';
import { PRESET_KEYS, PRESETS } from '@/lib/server/generation/presets';
import { PRICING_TIERS } from '@/lib/pricing-tiers';
import { RATIO_KEYS } from '@/lib/server/generation/ratios';
import { RESOLUTIONS, RESOLUTION_KEYS } from '@/lib/server/generation/resolutions';
import {
  ENHANCE_OPTION_KEYS,
  ENHANCE_OPTIONS,
  DEFAULT_ENHANCE_OPTIONS,
} from '@/lib/server/generation/enhance';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { MAX_ANNOTATIONS } from '@/lib/server/generation/annotations';

const TIER_NAME: Record<string, string> = {
  decouverte: 'Découverte',
  standard: 'Standard',
  pro: 'Pro',
};

export type AssistantMode = 'renderbox' | 'search';

export function buildRenderBoxDoc(): string {
  const presets = PRESET_KEYS.map((k) => PRESETS[k].label.fr).join(', ');
  const tiers = PRICING_TIERS.map(
    (t) =>
      `${TIER_NAME[t.id] ?? t.id} : ${t.generationsPerMonth} générations par mois, ${t.priceXof.toLocaleString('fr-FR')} FCFA (≈ ${t.priceUsdDisplay} $)`,
  ).join(' ; ');
  const m1 = ENGINE_LABELS.nanobanana;
  const m2 = ENGINE_LABELS.gpt_image;
  const ratios = RATIO_KEYS.map((r) => (r === 'auto' ? 'Auto' : r)).join(', ');
  const res = RESOLUTION_KEYS.map((r) => RESOLUTIONS[r].label).join(', ');
  const enhance = ENHANCE_OPTION_KEYS.map(
    (k) => `${ENHANCE_OPTIONS[k].label.fr} (${ENHANCE_OPTIONS[k].hint.fr})`,
  ).join(' ; ');
  const enhanceDefault = DEFAULT_ENHANCE_OPTIONS.map((k) => ENHANCE_OPTIONS[k].label.fr).join(', ');

  return `RenderBox transforme une photo ou un croquis de bâtiment en rendu architectural photoréaliste, avec l'IA.

NAVIGATION
- En haut de chaque page, la barre d'en-tête : le titre de la page à gauche (avec le logo sur téléphone) ; à droite la cloche des notifications (un point rouge signale du non-lu, « Tout marquer comme lu » dans le panneau), le sélecteur FR / EN et la pastille bleue des rendus restants (ouvre Abonnement). Sur téléphone, le compte y figure aussi (ouvre Paramètres).
- Sur ordinateur, une barre latérale à gauche, en carte blanche : en haut le bouton qui replie la barre (une icône de panneau animée) puis le nom RenderBox ; « Général » (Accueil, Mes images, Image, Enhance) ; « Aide » (Info, Assistant) ; en bas « Profil » (Paramètres, Abonnement, Se déconnecter) puis votre compte (ouvre Paramètres). La page ouverte est surlignée en bleu pâle. Repliée, il ne reste que les icônes ; le même bouton la déplie. La barre et l'en-tête restent en place quand on change de page.
- Sur téléphone, une barre flottante en bas : Accueil, Image, Enhance et « Plus » (Mes images, Info, Paramètres, Abonnement, Assistant, Se déconnecter), et un bouton bleu « + » pour lancer un nouveau rendu.
- Le bouton « Assistant » ouvre ce chat. Le sélecteur FR / EN change la langue de l'interface.

ACCUEIL (tableau de bord)
- En haut, un court film montre les 3 étapes (photo ou croquis, ambiance, rendu) avec le bouton « Générer un rendu ».
- Chaque page commence par un petit sur-titre, son titre en gras et une phrase. Sur l’Accueil, le bouton « Demander à l’assistant » est à droite du titre.
- Juste sous le titre, quatre cartes : nombre total d’images (rouge, ouvre Mes images), rendus générés (blanche, lance un nouveau rendu), dernière activité (blanche), rendus restants et fin de période (bleue, ouvre Abonnement). Sur une ligne sur ordinateur, en 2 × 2 sur téléphone. Puis les images récentes (8 au plus) et le lien « Voir toutes mes images ».

MES IMAGES (page Mes images, qui a remplacé la page Projets)
- Toutes les images du compte : celles importées, celles générées et celles améliorées avec Enhance, les plus récentes d'abord, avec « Filtre : » Tout, Importées, Générées ou Enhance (avec leur nombre). Un clic ouvre l'image là où on la travaille : dans l'espace de travail sur cette image (la barre latérale marque « Image »), ou sur la page Enhance pour une image faite avec Enhance. Chaque image se télécharge ou se supprime ; « Sélectionner » permet d'en supprimer plusieurs d'un coup. Supprimer une image ne supprime qu'elle : les rendus faits à partir d'elle sont conservés. Les rendus déjà décomptés ne sont pas recrédités.

IMAGE (générer un rendu)
1. Joignez une photo ou un croquis (avec le trombone de la barre de commande : c'est le seul moyen d'ajouter une image, il n'y a pas de glisser-déposer dans l'espace de travail) : elle apparaît en miniature dans la barre, avec une croix pour la retirer. Un projet est créé à l'envoi.
2. Choisissez une ambiance : ${presets}. « Esquisse » donne volontairement un rendu dessiné, pas photoréaliste.
3. Décrivez éventuellement ce que vous voulez dans la barre de commande, puis « Générer ».
- Commenter et Ajouter marchent aussi depuis Image, sur l'image épinglée : en Commenter, elle s'affiche en grand et on clique dessus pour poser les commentaires ; en Ajouter, on décrit l'élément et on joint sa photo avec le trombone. À l'envoi, un projet est créé et s'ouvre sur le résultat.
- LA BARRE DE COMMANDE, un cadre blanc. À gauche, la zone de saisie : les images épinglées en miniature (l'image de départ « Source », la photo ou la référence), la consigne en grand, qui s'agrandit avec le texte (Entrée envoie, Maj+Entrée va à la ligne), puis le trombone pour joindre une image et les deux moteurs toujours visibles (${m1.name.fr} rouge, ${m2.name.fr} jaune) : un clic suffit pour changer. À droite, le grand bouton carré d'envoi. En dessous, les actions en pastilles (Générer, Commenter, Ajouter) puis les réglages. Enhance n'est plus dans la barre : c'est sa propre page, dans la barre latérale. La barre garde toujours la même hauteur : l'image épinglée s'affiche en petit à côté du trombone. Sur téléphone, le bouton d'envoi est dans la zone de saisie et les réglages se déplient avec le bouton « Réglages » (roue dentée).
- Réglages de la barre de commande : ambiance (chaque ambiance est montrée par une miniature d'un vrai rendu), format (${ratios} — tous disponibles avec les deux moteurs, en génération comme en retouche ; Auto garde le cadrage de l'image), résolution (${res}, avec les deux moteurs). ${m1.name.fr} rend directement au format et à la taille choisis ; ${m2.name.fr} produit son image puis RenderBox la recadre au format exact et l'agrandit à la taille choisie (l'agrandissement ajoute des pixels, pas de détail : pour un vrai 4K détaillé, choisir ${m1.name.fr}).
- Réglages aussi dans la barre : Contexte (ce que le moteur a retenu du projet), @ Éléments (réutiliser une image du projet comme référence), et en mode Commenter ou Ajouter le nombre de Variantes (1 à 4).

LES DEUX MOTEURS
- ${m1.name.fr} (pastille rouge) : ${m1.description.fr}.
- ${m2.name.fr} (pastille jaune) : ${m2.description.fr}.
- On change de moteur à chaque rendu, d'un clic dans la barre de commande (les deux y sont toujours affichés). Le moteur par défaut se règle dans Paramètres. Les deux moteurs partagent les mêmes matériaux et le même historique du projet.
- Ne jamais citer de fournisseur ou de marque d'IA : les moteurs s'appellent ${m1.name.fr} et ${m2.name.fr}.

DANS UN PROJET
- Au centre le rendu sélectionné, la barre de commande dessous ; à droite une colonne avec la fiche matériaux en haut (le panneau d'édition en mode Commenter / Ajouter) et l'« Arbre du projet » en dessous. Dans l'arbre, chaque rendu peut devenir le point de départ d'une nouvelle variante (autre ambiance, autre moteur, modification). Rien ne se perd : cliquez sur n'importe quel rendu de l'arbre pour le rouvrir ou repartir de lui. Supprimer un rendu supprime aussi ce qui en dérive (le nombre est annoncé avant).
- Sur téléphone, cette colonne (matériaux ou panneau d'édition, puis l'arbre) s'ouvre par le bouton en haut à droite.
- La page Image a la même disposition qu'un projet : les quatre exemples de rendus (ou vos derniers rendus) au centre, la barre de commande dessous, la fiche matériaux et l'arbre à droite, vides jusqu'au premier rendu. Un projet encore vide affiche aussi les quatre exemples ; on y ajoute la photo avec le trombone de la barre de commande.
- Mémoire des matériaux : RenderBox détecte les matériaux du projet (façades, sols, menuiseries…) et les réutilise pour que chaque nouveau rendu reste cohérent. Ils apparaissent dans le panneau Matériaux.
- Télécharger : le bouton de téléchargement sur le rendu sélectionné.
- Les onglets de la barre : Générer (nouvelle variante), Commenter et Ajouter.

COMMENTER (modifier un rendu en le pointant)
- Choisissez le mode « Commenter », cliquez sur l'image (un rendu ou la photo de départ) à l'endroit à changer, écrivez le changement dans la bulle (ex. « Façade en panneaux laqués jaunes »), Entrée pour valider. Jusqu'à ${MAX_ANNOTATIONS} commentaires numérotés, listés dans le panneau de droite ; une note générale est facultative. Puis « Appliquer ».
- Ce mode n'existe que sur ${m2.name.fr} (point jaune sur l'onglet ; ${m1.name.fr} est verrouillé, avec un cadenas, tant que Commenter est actif), le plus précis pour suivre des consignes localisées. Le reste de l'image est conservé autant que possible, et la mémoire des matériaux est mise à jour après la modification.
- Le résultat devient une nouvelle branche de l'arbre : l'original reste disponible.

AJOUTER (ajout d'élément)
- Ajoute un élément à l'image, rendu ou photo de départ (personnage, mobilier, végétation…) : décrivez où et comment (ex. « ajoute une personne debout près de l'entrée principale »), joignez éventuellement une image de référence de l'élément, et choisissez le nombre de variantes dans la barre (chaque variante consomme une génération). L'image de référence apparaît en miniature dans la barre.

ENHANCE (améliorer un rendu existant)
- Page Enhance, même disposition que l'espace de travail : au centre le rendu (ou les exemples tant qu'il n'y en a pas), dessous une barre de commande simplifiée — le texte libre, le trombone pour joindre le rendu (même fait ailleurs), le ratio et la résolution, puis « Améliorer le rendu ». À droite, la colonne « À améliorer » : ${enhance}. Par défaut : ${enhanceDefault}. Chaque élément a un bouton « + » qui ajoute UNE image de référence (une par élément coché) : l'IA s'en sert comme guide pour cet aspect seulement, par exemple des matériaux ou une lumière à imiter. Dessous, l'intensité Léger ou Marqué et le moteur. On peut aussi ne rien cocher et décrire soi-même l'amélioration dans la barre. Le cadrage et le bâtiment ne changent pas (sauf si l'on choisit un autre ratio que Auto). Le résultat se compare à l'original avec un curseur avant/après, et se télécharge.

ABONNEMENTS ET QUOTA
- ${tiers}.
- Chaque rendu, modification ou Enhance consomme une génération. Le solde est visible dans la pastille bleue de l'en-tête et sur l'Accueil.
- Une formule dure 30 jours à partir du paiement, sans prélèvement automatique ensuite. Choisir une formule (ou renouveler la sienne) démarre une nouvelle période de 30 jours avec tout son quota.
- Page Abonnement : le « Solde actuel » (rendus restants, formule et date de fin), un avertissement quand il ne reste aucun rendu, les trois formules (rendus par mois, prix en FCFA, équivalent en dollars indicatif) puis l’« Historique » des paiements.
- Une limite quotidienne anti-abus existe aussi ; si elle est atteinte, réessayer le lendemain.

PARAMÈTRES
- Compte connecté, moteur par défaut (pré-sélectionné dans la barre de commande), comptes liés (connexion Google), historique de facturation, déconnexion. La langue se change avec le sélecteur FR / EN en haut des pages.

INFO
- La page « Info » de l'application : les films qui montrent les fonctions, deux par ligne, sans texte. Les nouveautés datées, elles, sont sur la page Info publique du site.

FORMATS ACCEPTÉS
- Images JPEG, PNG ou WebP.`;
}

export function buildSystemPrompt(mode: AssistantMode, locale: 'fr' | 'en'): string {
  const lang =
    locale === 'en'
      ? 'Answer in English unless the user writes in another language.'
      : "Réponds en français en vouvoyant l'utilisateur, sauf s'il écrit dans une autre langue.";
  if (mode === 'search') {
    return `Tu es l'assistant recherche de RenderBox, un outil de rendus architecturaux par IA. Tu as accès à Internet.
Tu aides sur : architecture, matériaux et revêtements (aspect, usage, entretien, prix indicatifs), styles architecturaux, éclairage et ambiance, végétation, références de projets.
Règles :
1. Cite tes sources (nom du site).
2. Indique quand une information est approximative ou datée.
3. Sois concis et concret.
4. Ne cite jamais de fournisseur d'IA ; les moteurs de RenderBox s'appellent Visio et Pixel IA.
5. ${lang}`;
  }
  return `Tu es l'assistant intégré à RenderBox. Voici la documentation complète et à jour de l'application :

${buildRenderBoxDoc()}

Règles :
1. Réponds uniquement à partir de cette documentation ; si une fonction n'y est pas, dis-le simplement au lieu d'inventer.
2. Sois concis, concret, étape par étape, avec le nom exact des boutons.
3. Si la question sort de l'utilisation de RenderBox, propose le mode « Recherche » de l'assistant.
4. Ne cite jamais de fournisseur ou de marque d'IA : les moteurs s'appellent Visio et Pixel IA.
5. ${lang}`;
}

/** The ratio list stays referenced so a new ratio key fails typecheck here
 *  if it is ever renamed. */
export const KNOWN_RATIOS = RATIO_KEYS;
