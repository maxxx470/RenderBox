// Image projects and Enhance projects (owner, 2026-10-08: "les projets
// Enhance diffèrent des projets images"), and where each image opens.
//
// A project has no kind field: it is read from what the project holds, so it
// can never drift from the renders and needs no migration. The Enhance page
// files each run into a project of its own — the uploaded photo and its
// enhanced versions — so a project whose renders are ALL enhancements is an
// Enhance project. Anything else is an image project: one born on the Image
// page, one with no render yet, and one that also has an Enhance run.
//
// Projects are no longer listed anywhere since the same day — Mes images
// lists every image instead — but they still decide where an image opens:
// the editor for an image project, the Enhance page for an Enhance one.
//
// Pure and client-safe: the pages compute it on the server, the tests here.
export type ProjectKind = 'image' | 'enhance';

/** The kind of one project, from its generated renders. */
export function kindOf(renders: readonly { editType: string | null }[]): ProjectKind {
  return renders.length > 0 && renders.every((r) => r.editType === 'enhance') ? 'enhance' : 'image';
}

/**
 * Where a project opens. An image project opens in the editor; an Enhance
 * project opens on the Enhance page, on its latest result compared with the
 * photo it improved (`latest` — the newest render and the node it came from).
 */
export function projectHref(
  projectId: string,
  kind: ProjectKind,
  latest?: { id: string; parentId: string | null } | null,
): string {
  if (kind === 'image') return `/app/${projectId}`;
  if (!latest?.parentId) return '/app/enhance';
  return `/app/enhance?projet=${projectId}&image=${latest.parentId}&resultat=${latest.id}`;
}

/** What Mes images files an image under (its filters, owner 2026-10-08). */
export type ImageType = 'uploaded' | 'generated' | 'enhance';

export const IMAGE_TYPES: readonly ImageType[] = ['uploaded', 'generated', 'enhance'];

export function imageTypeOf(node: { kind: string; editType: string | null }): ImageType {
  if (node.kind !== 'GENERATED') return 'uploaded';
  return node.editType === 'enhance' ? 'enhance' : 'generated';
}

/**
 * Where one image opens: in its project's editor, on that very image; or, in
 * an Enhance project, on the Enhance page — a result against the photo it
 * improved, the photo alone ready for another run.
 */
export function imageHref(
  node: { id: string; projectId: string; parentId: string | null; kind: string },
  projectKind: ProjectKind,
): string {
  if (projectKind === 'image') return `/app/${node.projectId}?node=${node.id}`;
  if (node.kind !== 'GENERATED') return `/app/enhance?projet=${node.projectId}&image=${node.id}`;
  return projectHref(node.projectId, 'enhance', node);
}
