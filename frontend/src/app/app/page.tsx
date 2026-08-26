import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { buildRenderTree } from '@/lib/server/render-tree';
import { isDevBypassActive } from '@/lib/server/dev-bypass';
import { AppShell } from './AppShell';

export default async function AppPage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  // Phase 1 has no project switcher — use the most recent project, or null
  // (AppShell creates one lazily on first upload) when the user has none yet.
  const project = await prisma.project.findFirst({
    where: { userId: auth.user.sub },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true },
  });

  const nodes = project
    ? await prisma.renderNode.findMany({
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
      })
    : [];

  return (
    <AppShell
      initialProjectId={project?.id ?? null}
      initialProjectName={project?.name ?? null}
      initialTree={buildRenderTree(nodes)}
      devBypassActive={isDevBypassActive()}
    />
  );
}
