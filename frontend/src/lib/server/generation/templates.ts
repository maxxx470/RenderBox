// The four templates of the image generator page (owner, 2026-10-10: "un peu
// comme des templates concrets"). Each is a picture in the page's fan and a
// prompt: "Utiliser ce modèle" puts that prompt in the command bar, then opens
// the paperclip for the user's own plan or photo.
//
// A template is not an ambiance. Its prompt says everything about the result
// (a top-down plan, an exploded view, a board…), so the generation sends it
// WITHOUT the ambiance modifier ("full daylight, exterior viewpoint" would
// fight a top-down plan) and stores no preset on the node (see build-prompt.ts
// and the generate route).
//
// The example pictures in public/modeles/<key>.webp (portrait 3:4) were made
// by the owner from one-shot prompts describing the same kind of result; the
// prompts here work on the user's own image, in the interface's language —
// labels included, since an exploded view or a board without its labels says
// little (owner). The engines read both languages. Client-safe: no I/O, no
// `server-only`.
export const TEMPLATE_KEYS = ['plan_3d', 'eclate', 'analyse', 'isometrie'] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

interface TemplateDef {
  label: { fr: string; en: string };
  /** The example picture, under /public. */
  image: string;
  prompt: { fr: string; en: string };
}

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  plan_3d: {
    label: { fr: 'Plan 3D aménagé', en: 'Furnished 3D plan' },
    image: '/modeles/plan-3d.webp',
    prompt: {
      en: 'Turn the attached 2D floor plan into a photorealistic top-down 3D render of the furnished home, seen from directly above with the roof removed. Keep exactly the walls, doors, windows and room layout of the plan. Furnish every room in a warm, premium contemporary style: herringbone oak floors, a bedroom with a made bed and bedside lamps, a bathroom with a walk-in shower and a vanity, a kitchen with worktops, a dining table, a living room with a sofa, an armchair and a rug. Soft natural light with gentle shadows and warm accent lighting. Add three or four people seen from above, to scale and naturally placed (someone on the sofa, someone cooking, someone walking). Walls cut and shown in solid black. No text, no labels, no dimensions, no room names.',
      fr: 'Transformez le plan 2D joint en rendu 3D photoréaliste du logement meublé, vu exactement du dessus, toiture retirée. Gardez exactement les murs, les portes, les fenêtres et la distribution des pièces du plan. Meublez chaque pièce dans un style contemporain chaleureux et haut de gamme : parquet en chêne à bâtons rompus, une chambre avec un lit fait et des lampes de chevet, une salle de bains avec une douche à l’italienne et un meuble vasque, une cuisine avec ses plans de travail, une table à manger, un séjour avec un canapé, un fauteuil et un tapis. Lumière naturelle douce, ombres légères et éclairages d’appoint chaleureux. Ajoutez trois ou quatre personnes vues du dessus, à l’échelle et placées naturellement (quelqu’un sur le canapé, quelqu’un qui cuisine, quelqu’un qui marche). Murs coupés en noir plein. Aucun texte, aucune étiquette, aucune cote, aucun nom de pièce.',
    },
  },
  eclate: {
    label: { fr: 'Axonométrie éclatée', en: 'Exploded axonometric' },
    image: '/modeles/eclate.webp',
    prompt: {
      en: 'Turn the building in the attached image into a highly detailed exploded axonometric 3D illustration: a realistic 3D model, not a flat drawing, seen from a high 30-degree angle on a clean white background. Pull the building apart vertically into its construction layers, stacked one above another with even gaps and thin dashed alignment lines between them, from bottom to top: foundations and ground slab, structural frame (columns and beams), each floor slab with its interior walls, stairs and furniture, insulation, facade cladding, windows and glazing, roof structure, roof covering. Keep the building’s real shape, proportions, materials and colours, rendered realistically with soft shadows and ambient occlusion. Add clean architectural labels: thin black leader lines from each layer to a short uppercase label in a clean sans-serif font, aligned in a neat column on the right (for example ROOF, ROOF STRUCTURE, GLAZING, CLADDING, INSULATION, FIRST FLOOR, GROUND FLOOR, STRUCTURAL FRAME, FOUNDATIONS). Every label crisp, legible and correctly spelled. High-end technical cutaway illustration style.',
      fr: 'Transformez le bâtiment de l’image jointe en axonométrie éclatée 3D très détaillée : un vrai modèle 3D réaliste, pas un dessin à plat, vu en plongée à 30 degrés sur fond blanc. Écartez le bâtiment verticalement couche par couche, empilées les unes au-dessus des autres avec des écarts réguliers et de fines lignes pointillées d’alignement, de bas en haut : fondations et dallage, ossature (poteaux et poutres), chaque plancher avec ses cloisons, son escalier et son mobilier, isolation, bardage de façade, menuiseries et vitrages, charpente, couverture. Gardez la vraie forme, les proportions, les matériaux et les couleurs du bâtiment, rendus de façon réaliste avec des ombres douces. Ajoutez des étiquettes d’architecture nettes : de fines lignes de rappel noires de chaque couche vers une courte étiquette en majuscules, police sans empattement, alignées en colonne à droite (par exemple TOITURE, CHARPENTE, VITRAGES, BARDAGE, ISOLATION, ÉTAGE, REZ-DE-CHAUSSÉE, OSSATURE, FONDATIONS). Chaque étiquette nette, lisible et sans faute. Style d’écorché technique haut de gamme.',
    },
  },
  analyse: {
    label: { fr: 'Planche d’analyse', en: 'Concept board' },
    image: '/modeles/analyse.webp',
    prompt: {
      en: 'Create an architecture concept analysis board of the building in the attached image, on a clean white background, in the style of an international architecture competition presentation. Precise grid layout with generous white space: a bold title CONCEPT ANALYSIS with the project’s name under it; a large realistic 3D axonometric view of the building; its characteristic floor plan in fine black linework labelled FLOOR PLAN; a long section through the building and the ground labelled SECTION; a row of five small white 3D massing models showing step by step how the form evolved, each numbered with a one-word caption; a strip of five square samples of the building’s real materials, each with a small label. Thin hairline dividers, small annotations with arrows, a north arrow and a scale bar. All text crisp, legible and correctly spelled in a clean sans-serif font. Muted palette: white, light grey, concrete, warm wood, one soft accent colour. Professional, print-ready.',
      fr: 'Créez une planche d’analyse conceptuelle du bâtiment de l’image jointe, sur fond blanc, dans le style d’une planche de concours d’architecture international. Mise en page en grille précise et aérée : un titre fort ANALYSE CONCEPTUELLE avec le nom du projet dessous ; une grande vue axonométrique 3D réaliste du bâtiment ; son plan caractéristique au trait noir fin, titré PLAN ; une coupe longitudinale du bâtiment et du terrain, titrée COUPE ; une ligne de cinq petites maquettes de volumes blanches en 3D qui montrent étape par étape l’évolution de la forme, chacune numérotée avec une légende d’un mot ; une bande de cinq échantillons carrés des vrais matériaux du bâtiment, chacun avec une petite étiquette. Fins filets de séparation, petites annotations avec flèches, une flèche du nord et une échelle graphique. Tous les textes nets, lisibles et sans faute, police sans empattement. Palette sobre : blanc, gris clair, béton, bois chaud, une seule couleur d’accent douce. Rendu professionnel, prêt à imprimer.',
    },
  },
  isometrie: {
    label: { fr: 'Maquette isométrique', en: 'Isometric model' },
    image: '/modeles/isometrie.webp',
    prompt: {
      en: 'Turn the project in the attached image into a clean isometric 3D architectural model, seen from a high 30-degree isometric angle on a very light grey ground crossed by subtle dotted halftone bands. Keep the building’s real volumes, layout, stairs and terraces. Render it like a high-end physical competition model: light birch and pine timber for the structure and slats, smooth pale grey concrete for plinths, walkways and stairs, frosted white glass for roofs and glazing, crisp edges. About fifteen tiny white abstract human figures walking and standing, to scale. Soft even daylight from the top left, gentle ambient occlusion and soft shadows. Muted palette of warm wood, white and light grey only. No trees, no background scenery, no text.',
      fr: 'Transformez le projet de l’image jointe en maquette d’architecture isométrique 3D, vue en plongée isométrique à 30 degrés sur un sol gris très clair traversé de fines bandes de trame pointillée. Gardez les vrais volumes, l’organisation, les escaliers et les terrasses du bâtiment. Rendu de maquette de concours haut de gamme : bois clair (bouleau, pin) pour la structure et les lames, béton gris pâle lisse pour les socles, passerelles et escaliers, verre blanc dépoli pour les toitures et les vitrages, arêtes nettes. Une quinzaine de minuscules personnages blancs abstraits qui marchent ou se tiennent debout, à l’échelle. Lumière du jour douce et homogène venant du haut à gauche, ombres légères. Palette sobre de bois chaud, de blanc et de gris clair uniquement. Pas d’arbres, pas de décor, aucun texte.',
    },
  },
};

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}
