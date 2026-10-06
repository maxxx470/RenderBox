import { NextResponse } from 'next/server';
import { redirect, notFound } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { buildRenderTree } from '@/lib/server/render-tree';
import { checkTierQuota } from '@/lib/server/generation/tier-quota';
import { AppShell } from '../AppShell';

export default async function AppProjectPage({ params }: { params: Promise<{ projet: string }> }) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

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
  const [project, nodes, materials, quota] = await Promise.all([
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
      },
    }),
    // Same shape and order as GET /api/projects/[projectId]/materials, which
    // the workspace still calls to refresh after a generation.
    prisma.material.findMany({
      where: owned,
      orderBy: { face: 'asc' },
      select: { id: true, face: true, valeur: true, source: true, confidence: true },
    }),
    // count: 0 — read-only status check, same lazy-expiry semantics as
    // /app's home screen (see tier-quota.ts).
    checkTierQuota(prisma, auth.user.sub, 0),
  ]);
  if (!project) {
    notFound();
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
