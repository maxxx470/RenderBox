import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { checkTierQuota } from '@/lib/server/generation/tier-quota';
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { GenerationHome, type RecentRenderCardData } from '../GenerationHome';

// /app/generer — the "Espace de génération": engine picker + a fan of the
// user's most recent renders (across every project) + a quick-start command
// bar.
//
// This used to be /app. The dashboard took that route on 2026-09-03 because
// it is the first screen a new account lands on; generation is one click away
// from it, in the sidebar.
export default async function AppHomePage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  const [recentNodes, quota] = await Promise.all([
    prisma.renderNode.findMany({
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
    }),
    // count: 0 — read-only status check (also lazily clears an expired tier,
    // same as the real enforcement path — see tier-quota.ts).
    checkTierQuota(prisma, auth.user.sub, 0),
  ]);

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
      authDisabled={isAuthDisabled()}
    />
  );
}
