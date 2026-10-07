import { prisma } from '@/lib/server/prisma';
import { loadShell } from '../shell-data';
import { GenerationHome, type RecentRenderCardData } from '../GenerationHome';

// /app/generer — the "Espace de génération": engine picker + a fan of the
// user's most recent renders (across every project) + a quick-start command
// bar.
//
// This used to be /app. The dashboard took that route on 2026-09-03 because
// it is the first screen a new account lands on; generation is one click away
// from it, in the sidebar.
export default async function AppHomePage() {
  // Account and plan: shared with the app layout, see shell-data.ts.
  const { auth, quota } = await loadShell();
  const recentNodes = await prisma.renderNode.findMany({
    where: { project: { userId: auth.user.sub } },
    orderBy: { createdAt: 'desc' },
    take: 4,
    select: {
      id: true,
      preset: true,
      engine: true,
      editType: true,
      project: { select: { id: true, name: true } },
    },
  });

  const recentRenders: RecentRenderCardData[] = recentNodes.map((n) => ({
    id: n.id,
    projectId: n.project.id,
    projectName: n.project.name,
    preset: n.preset,
    engine: n.engine,
    editType: n.editType,
  }));

  return (
    <GenerationHome
      recentRenders={recentRenders}
      tier={quota.tier}
      max={quota.max}
      remaining={quota.remaining}
      userEmail={auth.user.email ?? ''}
    />
  );
}
