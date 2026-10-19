import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/server/prisma';
import { loadShell } from '../shell-data';
import { kindOf, projectHref } from '../project-kinds';

// /app/[projet] — the project editor with its tree is gone (2026-10-19,
// owner: « l'arbre du projet ne devait plus exister »). Old links, bookmarks
// and notifications still land here, so the page only sends them on: an
// Enhance project to the Enhance page, an image project to the image
// generator with the asked image (`?node=`) or its latest one pinned.
export default async function AppProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projet: string }>;
  searchParams: Promise<{ node?: string }>;
}) {
  const { auth } = await loadShell();
  const { projet } = await params;
  const { node } = await searchParams;

  // Ownership in the WHERE clause: another account's project 404s exactly
  // like one that does not exist.
  const project = await prisma.project.findFirst({
    where: { id: projet, userId: auth.user.sub },
    select: {
      id: true,
      renderNodes: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, parentId: true, kind: true, editType: true },
      },
    },
  });
  if (!project) notFound();

  const generated = project.renderNodes.filter((n) => n.kind === 'GENERATED');
  const kind = kindOf(generated);
  if (kind === 'enhance') redirect(projectHref(project.id, 'enhance', generated.at(-1)));

  const asked = node ? project.renderNodes.find((n) => n.id === node) : null;
  const latest = asked ?? generated.at(-1) ?? project.renderNodes.at(-1) ?? null;
  redirect(projectHref(project.id, 'image', latest));
}
