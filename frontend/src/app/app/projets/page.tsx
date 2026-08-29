import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { ProjectsGrid, type ProjectCardData } from '../ProjectsGrid';

// /app/projets — the full "Mes projets" grid, one click away from the new
// generation-focused home at /app (see app/page.tsx + GenerationHome.tsx).
export default async function AppProjectsPage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  const projects = await prisma.project.findMany({
    where: { userId: auth.user.sub },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      renderNodes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
  });

  const items: ProjectCardData[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    thumbnailNodeId: p.renderNodes[0]?.id ?? null,
    lastActivityAt: (p.renderNodes[0]?.createdAt ?? p.createdAt).toISOString(),
  }));

  return <ProjectsGrid initialProjects={items} />;
}
