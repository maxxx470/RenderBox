import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/server/prisma';
import { buildRenderTree } from '@/lib/server/render-tree';
import { AppShell } from '../AppShell';
import { loadShell } from '../shell-data';
import { kindOf, projectHref } from '../project-kinds';

export default async function AppProjectPage({ params }: { params: Promise<{ projet: string }> }) {
  // Account and plan: shared with the app layout, see shell-data.ts.
  const { auth, quota } = await loadShell();

  const { projet } = await params;

  // All four reads go out at once — one database round trip for the page
  // instead of three in a row (project, then tree + quota, then the client
  // fetching materials after hydration).
  //
  // Ownership is in every WHERE clause rather than a separate exists-check
  // run first: the child queries filter on `project.userId`, so a project ID
  // belonging to another user returns nothing anywhere and 404s exactly like
  // one that doesn't exist — same "don't leak existence" posture as
  // requireOrgRole's 404-not-403 (see CLAUDE.md).
  const owned = { projectId: projet, project: { userId: auth.user.sub } };
  const [project, nodes, materials] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projet, userId: auth.user.sub },
      select: { id: true, name: true },
    }),
    prisma.renderNode.findMany({
      where: owned,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        parentId: true,
        kind: true,
        createdAt: true,
        preset: true,
        engine: true,
        editType: true,
      },
    }),
    // Same shape and order as GET /api/projects/[projectId]/materials, which
    // the workspace still calls to refresh after a generation.
    prisma.material.findMany({
      where: owned,
      orderBy: { face: 'asc' },
      select: { id: true, face: true, valeur: true, source: true, confidence: true },
    }),
  ]);
  if (!project) {
    notFound();
  }

  // An Enhance project is not edited here: it opens on the Enhance page, on
  // its latest result (owner, 2026-10-08) — whichever link led here, the
  // dashboard, a recent render or an old bookmark.
  const generated = nodes.filter((n) => n.kind === 'GENERATED');
  if (kindOf(generated) === 'enhance') {
    redirect(projectHref(project.id, 'enhance', generated.at(-1)));
  }

  return (
    <AppShell
      initialProjectId={project.id}
      initialProjectName={project.name}
      initialTree={buildRenderTree(nodes)}
      initialMaterials={materials.map((m) => ({
        ...m,
        source: m.source === 'manuel' ? 'manuel' : 'auto',
      }))}
      initialTier={quota.tier}
      initialMax={quota.max}
      initialRemaining={quota.remaining}
    />
  );
}
