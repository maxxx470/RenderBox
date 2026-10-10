// The four templates of the image generator page's fan (owner, 2026-10-10:
// "un peu comme des templates concrets"). Each is a picture and a prompt:
// "Utiliser ce modèle" puts that prompt in the command bar, then opens the
// paperclip for the user's own photo, sketch or 3D view.
//
// Since 2026-10-10 evening (owner) they are the four lights — day and night,
// exterior and interior — which were the first four ambiances of the command
// bar; the plan, exploded view, board and isometric model took their place in
// the ambiance menu (presets.ts). The keys are the old ambiance keys on
// purpose: the node keeps the template's key as its preset, so the tree and
// the gallery name it ("Jour extérieur") and an edit relights it the same way.
//
// A template's prompt says everything about the result, so the generation
// sends it WITHOUT any ambiance modifier (see build-prompt.ts and the generate
// route). The prompts borrow from the prompts the owner pointed at
// (aifordesigners.online): keep the exact point of view, proportions and
// materials — the geometry is right, the engine adds light and life — and
// add a few objects so a space feels lived-in. The engines read both
// languages. Client-safe: no I/O, no `server-only`.
export const TEMPLATE_KEYS = ['jour_ext', 'jour_int', 'nuit_ext', 'nuit_int'] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

interface TemplateDef {
  label: { fr: string; en: string };
  /** The example picture, under /public (portrait 3:4). */
  image: string;
  prompt: { fr: string; en: string };
}

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  jour_ext: {
    label: { fr: 'Jour extérieur', en: 'Exterior day' },
    image: '/modeles/jour-ext.webp',
    prompt: {
      en: 'Create a photorealistic exterior photograph of the building in the attached image, in full daylight: natural sunlight, crisp cast shadows, clear blue sky. Keep the exact point of view and the exact proportions. Do not alter the building shape, openings, architectural details or materials; match every material exactly. Bring the site to life: mature trees and planting, a few people walking, to scale, soft reflections in the glazing. High-end architectural photography.',
      fr: 'Créez une photographie extérieure photoréaliste du bâtiment de l’image jointe, en plein jour : soleil naturel, ombres portées nettes, ciel bleu dégagé. Gardez exactement le point de vue et les proportions. Ne modifiez ni la forme du bâtiment, ni ses ouvertures, ni ses détails d’architecture, ni ses matériaux ; respectez chaque matériau à l’identique. Donnez vie au site : arbres et plantations, quelques personnes qui marchent, à l’échelle, de légers reflets dans les vitrages. Photographie d’architecture haut de gamme.',
    },
  },
  jour_int: {
    label: { fr: 'Jour intérieur', en: 'Interior day' },
    image: '/modeles/jour-int.webp',
    prompt: {
      en: 'Create a photorealistic interior photograph of the space in the attached image, lit by natural daylight through the windows: soft ambient light, gentle shadows, no artificial lighting. Keep the exact point of view, the proportions, the walls, the openings and the materials. Keep the existing furniture; if the room is empty, furnish it in a warm contemporary style. Add a few objects so the space feels lived-in: a throw on the sofa, books, a plant, a vase. High-end interior photography.',
      fr: 'Créez une photographie intérieure photoréaliste de l’espace de l’image jointe, éclairé par la lumière du jour qui entre par les fenêtres : lumière douce, ombres légères, aucun éclairage artificiel. Gardez exactement le point de vue, les proportions, les murs, les ouvertures et les matériaux. Gardez le mobilier existant ; si la pièce est vide, meublez-la dans un style contemporain chaleureux. Ajoutez quelques objets pour que l’espace paraisse habité : un plaid sur le canapé, des livres, une plante, un vase. Photographie d’intérieur haut de gamme.',
    },
  },
  nuit_ext: {
    label: { fr: 'Nuit extérieur', en: 'Exterior night' },
    image: '/modeles/nuit-ext.webp',
    prompt: {
      en: 'Create a photorealistic exterior photograph of the building in the attached image at night: deep blue night sky, no sunlight, warm light glowing from every window, controlled architectural lighting with facade uplights and soft path lights, warm reflections on the ground. Keep the exact point of view and the exact proportions. Do not alter the building shape, openings, architectural details or materials. A few people to scale, planting softly lit. High-end architectural night photography.',
      fr: 'Créez une photographie extérieure photoréaliste du bâtiment de l’image jointe, de nuit : ciel bleu nuit profond, aucun soleil, lumière chaude à chaque fenêtre, éclairage architectural maîtrisé avec des projecteurs en pied de façade et de petites bornes le long des allées, reflets chauds au sol. Gardez exactement le point de vue et les proportions. Ne modifiez ni la forme du bâtiment, ni ses ouvertures, ni ses détails d’architecture, ni ses matériaux. Quelques personnes à l’échelle, une végétation doucement éclairée. Photographie d’architecture de nuit haut de gamme.',
    },
  },
  nuit_int: {
    label: { fr: 'Nuit intérieur', en: 'Interior night' },
    image: '/modeles/nuit-int.webp',
    prompt: {
      en: 'Create a photorealistic interior photograph of the space in the attached image at night: warm artificial lighting only (pendant lights, lamps, concealed LED strips), soft pools of light and deep shadows, dark windows with the night outside, no daylight. Keep the exact point of view, the proportions, the walls, the openings and the materials. Keep the existing furniture; if the room is empty, furnish it in a warm contemporary style, with a few objects so it feels lived-in. Cosy, high-end interior photography.',
      fr: 'Créez une photographie intérieure photoréaliste de l’espace de l’image jointe, de nuit : uniquement un éclairage artificiel chaud (suspensions, lampes, rubans LED dissimulés), des halos de lumière doux et des ombres profondes, des fenêtres sombres sur la nuit, aucune lumière du jour. Gardez exactement le point de vue, les proportions, les murs, les ouvertures et les matériaux. Gardez le mobilier existant ; si la pièce est vide, meublez-la dans un style contemporain chaleureux, avec quelques objets pour qu’elle paraisse habitée. Photographie d’intérieur chaleureuse et haut de gamme.',
    },
  },
};

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}
