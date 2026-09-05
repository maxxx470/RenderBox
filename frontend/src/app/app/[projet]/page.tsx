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

  // Ownership check inline in the WHERE clause (not a separate exists-check)
  // so a project ID belonging to another user 404s exactly like one that
  // doesn't exist at all — same "don't leak existence" posture as
  // requireOrgRole's 404-not-403 (see CLAUDE.md).
  const project = await prisma.project.findFirst({
    where: { id: projet, userId: auth.user.sub },
    select: { id: true, name: true },
  });
  if (!project) {
    notFound();
  }

  const [nodes, quota] = await Promise.all([
    prisma.renderNode.findMany({
      where: { projectId: project.id },
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
    // count: 0 — read-only status check, same lazy-expiry semantics as
    // /app's home screen (see tier-quota.ts).
    checkTierQuota(prisma, auth.user.sub, 0),
  ]);

  return (
    <AppShell
      initialProjectId={project.id}
      initialProjectName={project.name}
      initialTree={buildRenderTree(nodes)}
      initialTier={quota.tier}
      initialMax={quota.max}
      initialRemaining={quota.remaining}
    />
  );
}
