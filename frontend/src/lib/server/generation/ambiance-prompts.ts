// The prompt of each of the fourteen ambiances, in French and in English
// (2026-10-25, owner: « les 28 textes ci-dessous sont DÉFINITIFS … intègre-les
// EXACTEMENT tels qu'ils sont écrits, caractère pour caractère »).
//
// THIS FILE IS DICTATED, NOT WRITTEN. Every string below is the owner's own
// text, copied character for character. No rule of this project applies to
// them — not the prompt conventions of CLAUDE.md, not a length limit, not a
// house style. Do not reword, correct, shorten, lengthen, re-translate or
// merge them with the prompts they replaced, and do not let a formatter touch
// their contents. A change here comes from the owner and from nobody else.
//
// The English texts are the owner's own translations, supplied with the
// French ones. Never translate one of these yourself.
//
// WHAT THEY REPLACED (2026-10-25) — the per-ambiance texts the code used to
// assemble: the specification's locked blocks of spec-prompts.ts (TRANSFORM,
// BASE DESIGN CONSISTENCY, SITE, LIGHTING, VEGETATION, CAMERA, RENDER SPECS,
// NEGATIVE PROMPTS) and the `modifier` of each module in presets.ts. Those
// are gone from the prompt: each ambiance is now the one text below. The
// prompts are generic by design — they work on any input image (sketch,
// SketchUp capture, model, photograph) — and each one carries its own
// fidelity clause (« Garder exactement … »), which is why the separate
// geometry lock went with them.
//
// Client-safe on purpose (no `server-only`): the command bar shows the text
// of the chosen ambiance so the user can read it and change it before
// launching, and the server sends it back as the prompt.
import type { Locale } from '@/lib/i18n/dictionaries';
import { AMBIANCE_KEYS, type PresetKey } from './presets';

/** The owner's text for each ambiance, in the order of the menu. */
export const AMBIANCE_PROMPTS: Record<PresetKey, Record<Locale, string>> = {
  // 1. Plan 3D aménagé / Furnished 3D floor plan
  plan_3d: {
    fr: `Plan 3D aménagé photoréaliste vu de dessus, à la verticale, en coupe horizontale à hauteur d'appui : murs coupés nets en blanc mat avec arase propre, toit retiré. Chaque pièce est meublée et décorée selon sa fonction : salon avec canapé, tapis et table basse, cuisine équipée avec plan de travail, chambres avec lits faits et linge clair, salle de bain avec douche à l'italienne, plantes vertes en pot. Sols réalistes : parquet chêne clair dans les pièces de vie, carrelage gris clair dans les pièces d'eau. Lumière naturelle douce venant des fenêtres, ombres de contact légères, rendu net et lumineux comme une image de promoteur immobilier. Ignorer les lignes de construction, les axes et les cotes. Garder exactement la disposition des murs, des portes et des fenêtres.`,
    en: `Photorealistic furnished 3D floor plan seen from directly above, horizontal section cut at sill height: walls cut cleanly in matte white with a clean top edge, roof removed. Every room is furnished and decorated according to its function: living room with sofa, rug and coffee table, fitted kitchen with countertop, bedrooms with made beds and light linen, bathroom with walk-in shower, green potted plants. Realistic floors: light oak parquet in the living areas, light grey tiles in the wet rooms. Soft natural light coming through the windows, light contact shadows, crisp and bright rendering like a real-estate developer's image. Ignore construction lines, axes and dimensions. Keep the exact layout of walls, doors and windows.`,
  },

  // 2. Axonométrie éclatée / Exploded axonometric
  eclate: {
    fr: `Axonométrie éclatée du bâtiment, vue isométrique en plongée, couches séparées verticalement et alignées : toiture, charpente ou dalle, étage avec ses cloisons, rez-de-chaussée, fondations. Rendu de maquette architecturale épuré : volumes blancs et gris clair, bois clair pour la structure, vitrages légèrement teintés, fines lignes pointillées verticales reliant les couches. Fond blanc uni, ombres douces au sol. Courtes étiquettes en anglais alignées à droite avec un trait fin (ROOF, STRUCTURE, FIRST FLOOR, GROUND FLOOR, FOUNDATION). Style planche de concours d'architecture, net, sans bruit. Garder exactement la forme, les proportions et les ouvertures du bâtiment.`,
    en: `Exploded axonometric of the building, high-angle isometric view, layers separated vertically and aligned: roof, roof structure or slab, upper floor with its partitions, ground floor, foundations. Clean architectural model rendering: white and light grey volumes, light wood for the structure, slightly tinted glazing, thin vertical dotted lines connecting the layers. Plain white background, soft shadows on the ground. Short English labels aligned on the right with a thin leader line (ROOF, STRUCTURE, FIRST FLOOR, GROUND FLOOR, FOUNDATION). Architecture competition board style, crisp, noise-free. Keep the exact shape, proportions and openings of the building.`,
  },

  // 3. Planche d'analyse / Analysis board
  analyse: {
    fr: `Planche de présentation d'architecture au format paysage, fond blanc cassé, mise en page éditoriale propre. En haut à gauche, un grand titre « CONCEPT ANALYSIS » en capitales noires fines avec un sous-titre. Image principale : rendu photoréaliste du bâtiment dans son site, lumière de jour douce, végétation naturelle. Autour : petits schémas monochromes gris et blancs (orientation et course du soleil, vents dominants, accès, zonage des espaces) avec flèches fines et courtes annotations en anglais. Typographie sans empattement, grille aérée, style revue d'architecture. Garder exactement la forme et les proportions du bâtiment.`,
    en: `Landscape-format architecture presentation board, off-white background, clean editorial layout. Top left, a large title "CONCEPT ANALYSIS" in thin black capitals with a subtitle. Main image: photorealistic rendering of the building on its site, soft daylight, natural vegetation. Around it: small grey and white monochrome diagrams (orientation and sun path, prevailing winds, access, space zoning) with thin arrows and short English annotations. Sans-serif typography, airy grid, architecture magazine style. Keep the exact shape and proportions of the building.`,
  },

  // 4. Maquette isométrique / Isometric model
  isometrie: {
    fr: `Maquette d'architecture physique vue en isométrie, en plongée à 45°, posée sur un socle. Volumes en carton plume blanc et bois de balsa clair, vitrages en plexiglas fumé, petits arbres en mousse vert sauge, minuscules personnages blancs à l'échelle. Photographie de studio, fond gris clair dégradé, éclairage doux venant du haut à gauche, ombres portées nettes et réalistes, légère profondeur de champ. Aspect fait main, arêtes propres, textures de matériaux visibles. Garder exactement les volumes, les niveaux et les ouvertures.`,
    en: `Physical architectural model seen in isometric view, 45° high angle, set on a base. Volumes in white foam board and light balsa wood, smoked plexiglass glazing, small sage-green foam trees, tiny white scale figures. Studio photograph, light grey gradient background, soft lighting from the top left, crisp and realistic cast shadows, slight depth of field. Handmade look, clean edges, visible material textures. Keep the exact volumes, levels and openings.`,
  },

  // 5. Maquette blanche / White model
  maquette_blanche: {
    fr: `Maquette blanche d'architecture, entièrement en plâtre et carton mousse blanc mat, sans aucune couleur, posée sur un socle blanc. Arbres stylisés en fil blanc, petits personnages blancs à l'échelle. Photographie de studio, fond gris très clair, lumière rasante douce venant d'un côté qui dessine les volumes, ombres longues et nettes, occlusion ambiante dans les angles. Rendu sculptural et minimaliste, comme une maquette de concours photographiée en agence. Garder exactement le cadrage, les volumes et les ouvertures.`,
    en: `White architectural model, made entirely of matte white plaster and foam board, with no color at all, set on a white base. Stylized white wire trees, small white scale figures. Studio photograph, very light grey background, soft raking light from one side that sculpts the volumes, long crisp shadows, ambient occlusion in the corners. Sculptural, minimalist rendering, like a competition model photographed in an architecture office. Keep the exact framing, volumes and openings.`,
  },

  // 6. Schéma d'accès / Access diagram
  esquisse: {
    fr: `Schéma d'architecture en volumétrie blanche, vue axonométrique en plongée. Bâtiment et terrain en blanc mat et gris très clair, végétation stylisée gris clair, fond blanc. Fines flèches noires courbes indiquant les circulations : accès principal, accès secondaire, parking, terrasse ou toit-jardin. Courtes annotations en anglais en capitales noires fines reliées par un trait (MAIN ENTRANCE, BACK YARD ENTRANCE, ROOF GARDEN, PARKING). Ombres douces, style diagramme de rendu de concours, lisible et épuré. Garder exactement la forme et l'implantation du bâtiment.`,
    en: `White massing architecture diagram, high-angle axonometric view. Building and site in matte white and very light grey, stylized light grey vegetation, white background. Thin curved black arrows showing circulation: main entrance, secondary entrance, parking, terrace or roof garden. Short English annotations in thin black capitals connected by a leader line (MAIN ENTRANCE, BACK YARD ENTRANCE, ROOF GARDEN, PARKING). Soft shadows, competition diagram style, clear and clean. Keep the exact shape and placement of the building.`,
  },

  // 7. Esquisse / Sketch
  croquis: {
    fr: `Esquisse d'architecte dessinée à la main au crayon graphite sur papier blanc légèrement texturé. Traits noirs assurés qui dépassent légèrement aux angles, lignes de construction et de fuite visibles, hachures pour les ombres et les matériaux (bois, pierre, vitrage), arbres et végétation esquissés en quelques traits, un ou deux personnages esquissés. Aucune couleur, rendu vivant de carnet de croquis. Garder exactement le cadrage, la perspective, les volumes et les ouvertures.`,
    en: `Architect's hand-drawn sketch in graphite pencil on slightly textured white paper. Confident black strokes that slightly overshoot at the corners, visible construction and vanishing lines, hatching for shadows and materials (wood, stone, glazing), trees and vegetation sketched in a few strokes, one or two sketched figures. No color, lively sketchbook rendering. Keep the exact framing, perspective, volumes and openings.`,
  },

  // 8. Aquarelle / Watercolor
  aquarelle: {
    fr: `Illustration d'architecture à l'aquarelle rehaussée d'un trait d'encre fin. Couleurs douces et lumineuses : verts tendres pour la végétation, ciel en lavis bleu pâle, bois chaud, enduits blancs laissés en réserve de papier. Coulures et bords irréguliers typiques de l'aquarelle, texture du papier visible, lumière de jour douce. Végétation abondante et naturelle autour du bâtiment, quelques personnages esquissés. Style carnet de voyage d'architecte. Garder exactement le cadrage, les volumes et les ouvertures.`,
    en: `Architectural watercolor illustration enhanced with a fine ink line. Soft, luminous colors: tender greens for the vegetation, sky in a pale blue wash, warm wood, white render left as untouched paper. Drips and irregular edges typical of watercolor, visible paper texture, soft daylight. Abundant, natural vegetation around the building, a few sketched figures. Architect's travel sketchbook style. Keep the exact framing, volumes and openings.`,
  },

  // 9. Jour extérieur / Exterior day
  jour_ext: {
    fr: `Photographie d'architecture extérieure photoréaliste, plein jour, ciel bleu profond avec quelques nuages, soleil franc qui dessine les volumes et projette des ombres nettes. Matériaux réalistes et détaillés (enduit, béton, bois, pierre, verre avec reflets du ciel), menuiseries fines. Aménagement extérieur soigné : pelouse verte, graminées, arbres matures, allée en dalles claires. Une ou deux personnes noires en mouvement, qui marchent vers l'entrée ou le long de la façade. Objectif grand angle sans déformation, verticales droites, netteté parfaite, qualité magazine. Ignorer les lignes de construction et les axes. Garder exactement le cadrage, les volumes et les ouvertures.`,
    en: `Photorealistic exterior architectural photograph, full daylight, deep blue sky with a few clouds, strong sunlight that sculpts the volumes and casts crisp shadows. Realistic, detailed materials (render, concrete, wood, stone, glass reflecting the sky), slim window frames. Carefully designed landscaping: green lawn, ornamental grasses, mature trees, light paved path. One or two Black people in motion, walking toward the entrance or along the facade. Wide-angle lens without distortion, straight verticals, perfect sharpness, magazine quality. Ignore construction lines and axes. Keep the exact framing, volumes and openings.`,
  },

  // 10. Jour intérieur / Interior day
  jour_int: {
    fr: `Photographie d'intérieur photoréaliste, lumière du jour douce entrant par les fenêtres, voilages blancs qui filtrent le soleil, ombres légères. Matériaux réalistes : parquet chêne clair, murs en enduit chaux beige, lin, bois, céramique, plantes vertes. Décoration chaleureuse et habitée : coussins, plaid, livres, vase. Une personne noire détendue, assise dans le canapé ou allongée, en tenue claire. Ambiance calme et lumineuse, tons crème et sable, profondeur de champ naturelle, qualité magazine de décoration. Ignorer les lignes de construction et les axes. Garder exactement le cadrage, les volumes, les ouvertures et la disposition du mobilier.`,
    en: `Photorealistic interior photograph, soft daylight coming through the windows, white sheer curtains filtering the sun, light shadows. Realistic materials: light oak parquet, beige lime-plaster walls, linen, wood, ceramics, green plants. Warm, lived-in decor: cushions, throw, books, vase. A relaxed Black person, sitting on the sofa or lying down, in light-colored clothing. Calm, bright atmosphere, cream and sand tones, natural depth of field, interior design magazine quality. Ignore construction lines and axes. Keep the exact framing, volumes, openings and furniture layout.`,
  },

  // 11. Nuit extérieur / Exterior night
  nuit_ext: {
    fr: `Photographie d'architecture extérieure photoréaliste à l'heure bleue, juste après le coucher du soleil, ciel bleu nuit profond. Toutes les fenêtres éclairées d'une lumière chaude ambrée, éclairage architectural : spots encastrés en façade, balises le long des allées, végétation éclairée par le bas, reflets dans les vitrages et sur les sols. Contraste fort entre le bleu du ciel et l'orange de la lumière intérieure. Une personne noire qui rentre chez elle en marchant vers l'entrée. Longue pose nette, sans bruit, verticales droites. Ignorer les lignes de construction et les axes. Garder exactement le cadrage, les volumes et les ouvertures.`,
    en: `Photorealistic exterior architectural photograph at blue hour, just after sunset, deep midnight-blue sky. All windows lit with a warm amber light, architectural lighting: recessed spotlights on the facade, bollard lights along the paths, vegetation uplit from below, reflections in the glazing and on the ground. Strong contrast between the blue of the sky and the orange of the interior light. A Black person coming home, walking toward the entrance. Sharp long exposure, noise-free, straight verticals. Ignore construction lines and axes. Keep the exact framing, volumes and openings.`,
  },

  // 12. Nuit intérieur / Interior night
  nuit_int: {
    fr: `Photographie d'intérieur photoréaliste la nuit, ambiance tamisée et chaleureuse. Éclairage d'appoint uniquement : lampes à poser, appliques, rubans LED indirects dans les plafonds et sous les meubles, halos de lumière ambrée sur les murs, zones d'ombre profondes. Fenêtres sombres avec reflets. Matériaux riches : bois foncé, tissus doux, pierre, laiton. Une personne noire assise dans un fauteuil, un livre ou une tasse à la main. Ambiance d'hôtel haut de gamme, couleurs chaudes, sans bruit numérique. Ignorer les lignes de construction et les axes. Garder exactement le cadrage, les volumes, les ouvertures et la disposition du mobilier.`,
    en: `Photorealistic interior photograph at night, dim and warm atmosphere. Accent lighting only: table lamps, wall sconces, indirect LED strips in the ceilings and under the furniture, halos of amber light on the walls, deep shadow areas. Dark windows with reflections. Rich materials: dark wood, soft fabrics, stone, brass. A Black person sitting in an armchair, holding a book or a cup. High-end hotel atmosphere, warm colors, no digital noise. Ignore construction lines and axes. Keep the exact framing, volumes, openings and furniture layout.`,
  },

  // 13. Heure dorée / Golden hour
  heure_doree: {
    fr: `Photographie d'architecture photoréaliste à l'heure dorée, soleil bas sur l'horizon, lumière chaude orangée rasante qui frappe la façade, ombres longues et douces, ciel dégradé du doré au bleu pâle. Les fenêtres commencent à s'allumer d'une lumière chaude. Matériaux réalistes qui accrochent la lumière (bois, enduit, pierre, verre avec reflets du couchant). Végétation dense et naturelle, légère brume dans le lointain. Une personne noire assise sur la terrasse ou marchant dans le jardin. Rendu cinématographique, qualité magazine. Ignorer les lignes de construction et les axes. Garder exactement le cadrage, les volumes et les ouvertures.`,
    en: `Photorealistic architectural photograph at golden hour, sun low on the horizon, warm orange raking light hitting the facade, long soft shadows, sky graded from gold to pale blue. The windows are starting to glow with warm light. Realistic materials catching the light (wood, render, stone, glass reflecting the sunset). Dense, natural vegetation, light haze in the distance. A Black person sitting on the terrace or walking in the garden. Cinematic rendering, magazine quality. Ignore construction lines and axes. Keep the exact framing, volumes and openings.`,
  },

  // 14. Temps de pluie / Rainy weather
  pluie: {
    fr: `Photographie d'architecture photoréaliste par temps de pluie, ciel gris chargé, lumière diffuse et douce, légère brume entre les arbres. Sols mouillés et brillants avec flaques et reflets du bâtiment, gouttes visibles, façades assombries par l'humidité, végétation luxuriante d'un vert profond. Fenêtres éclairées d'une lumière chaude qui contraste avec l'atmosphère froide. Une personne noire qui marche vers l'entrée sous un parapluie. Ambiance calme et cinématographique, tons froids gris-vert. Ignorer les lignes de construction et les axes. Garder exactement le cadrage, les volumes et les ouvertures.`,
    en: `Photorealistic architectural photograph in rainy weather, heavy grey sky, soft diffused light, light mist between the trees. Wet, glossy ground with puddles and reflections of the building, visible raindrops, facades darkened by moisture, lush deep-green vegetation. Windows lit with a warm light that contrasts with the cold atmosphere. A Black person walking toward the entrance under an umbrella. Calm, cinematic mood, cool grey-green tones. Ignore construction lines and axes. Keep the exact framing, volumes and openings.`,
  },
};

/**
 * The owner's prompt for this ambiance in this language, exactly as dictated.
 *
 * It is both what the command bar shows and what the server sends, so the
 * user reads the prompt they are about to run.
 */
export function ambiancePromptText(preset: PresetKey, locale: Locale): string {
  return AMBIANCE_PROMPTS[preset][locale];
}

/** Every ambiance of the menu has a text in both languages. A test checks it. */
export const AMBIANCES_WITH_PROMPT = AMBIANCE_KEYS;
