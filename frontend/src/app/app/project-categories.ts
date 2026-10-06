// The categories the Projets page filters by (owner, 2026-10-06: "les projets
// seront classés par filtre de catégorie").
//
// A project has no category field: it is read from what the project holds,
// so it can never drift from the renders and needs no migration. A project
// sits in every category its renders put it in — a house rendered by day
// and by night is both "Jour" and "Nuit" — and a project with no render yet
// is "Sans rendu".
//
// Pure and client-safe: the page computes it on the server, the tests here.
export const PROJECT_CATEGORIES = [
  'exterior',
  'interior',
  'day',
  'night',
  'sketch',
  'enhance',
  'edited',
  'empty',
] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ProjectCategory, { fr: string; en: string }> = {
  exterior: { fr: 'Extérieur', en: 'Exterior' },
  interior: { fr: 'Intérieur', en: 'Interior' },
  day: { fr: 'Jour', en: 'Day' },
  night: { fr: 'Nuit', en: 'Night' },
  sketch: { fr: 'Esquisse', en: 'Sketch' },
  enhance: { fr: 'Enhance', en: 'Enhance' },
  edited: { fr: 'Modifiés', en: 'Edited' },
  empty: { fr: 'Sans rendu', en: 'No render yet' },
};

const BY_PRESET: Record<string, ProjectCategory[]> = {
  jour_ext: ['exterior', 'day'],
  nuit_ext: ['exterior', 'night'],
  jour_int: ['interior', 'day'],
  nuit_int: ['interior', 'night'],
  esquisse: ['sketch'],
};

const BY_EDIT: Record<string, ProjectCategory> = {
  enhance: 'enhance',
  annotate: 'edited',
  targeted_retouch: 'edited',
  add_element: 'edited',
};

/** The categories of one project, from its generated renders. */
export function categoriesOf(
  renders: readonly { preset: string | null; editType: string | null }[],
): ProjectCategory[] {
  if (renders.length === 0) return ['empty'];
  const found = new Set<ProjectCategory>();
  for (const r of renders) {
    for (const c of (r.preset && BY_PRESET[r.preset]) || []) found.add(c);
    const edit = r.editType ? BY_EDIT[r.editType] : undefined;
    if (edit) found.add(edit);
  }
  // Canonical order, so the chips on a card never shuffle.
  return PROJECT_CATEGORIES.filter((c) => found.has(c));
}
