// The four templates of the image generator page's fan (owner, 2026-10-10:
// "un peu comme des templates concrets"): the four lights — day and night,
// exterior and interior. "Utiliser ce modèle" puts the template's chip in the
// command bar, then opens the paperclip for the user's own photo, sketch or
// 3D view.
//
// The keys are the old ambiance keys on purpose: the node keeps the
// template's key as its preset, so the tree and the gallery name it
// ("Jour extérieur").
//
// Since 2026-10-19 (the owner's prompt audit, D1) a template is a key, a
// label and a picture — nothing else reaches the browser. The server builds
// its prompt from the key (render-profiles.ts: geometry lock, light with its
// figures, materials, photo look); the command bar stays free for the user's
// own note, sent as their request. Until then the template's prompt went
// into the bar, editable, and came back as free text — erased, the engine
// received no instruction at all. Nor does a template add anything any more
// (D3): no people, trees or furniture the source does not have.
// Client-safe: no I/O, no `server-only`.
export const TEMPLATE_KEYS = ['jour_ext', 'jour_int', 'nuit_ext', 'nuit_int'] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

interface TemplateDef {
  label: { fr: string; en: string };
  /** The example picture, under /public (portrait 3:4). */
  image: string;
}

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  jour_ext: {
    label: { fr: 'Jour extérieur', en: 'Exterior day' },
    image: '/modeles/jour-ext.webp',
  },
  jour_int: {
    label: { fr: 'Jour intérieur', en: 'Interior day' },
    image: '/modeles/jour-int.webp',
  },
  nuit_ext: {
    label: { fr: 'Nuit extérieur', en: 'Exterior night' },
    image: '/modeles/nuit-ext.webp',
  },
  nuit_int: {
    label: { fr: 'Nuit intérieur', en: 'Interior night' },
    image: '/modeles/nuit-int.webp',
  },
};

/** Exterior day's sky (D2): lightly hazy unless the user asks for sun. */
export const SKY_OPTIONS = ['hazy', 'sun'] as const;
export type SkyOption = (typeof SKY_OPTIONS)[number];

export function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}
