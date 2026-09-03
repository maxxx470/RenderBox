import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { checkTierQuota } from '@/lib/server/generation/tier-quota';
import { ProjectsGrid, type ProjectCardData } from '../ProjectsGrid';
import type { DashboardData } from '../DashboardStats';

// 30 days, matching TIER_PERIOD_MS in lib/server/generation/tier-quota.ts.
// Kept as a local constant rather than exported from there: this is display
// arithmetic, and the gate must stay the single authority on whether a period
// has actually lapsed.
const TIER_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// /app/projets — the user's dashboard: plan and quota, activity figures, then
// the project grid underneath. One page rather than two, because every figure
// here is about the projects listed below it.
export default async function AppDashboardPage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  const userId = auth.user.sub;

  // checkTierQuota with count: 0 reads status without consuming anything —
  // and, by design, is also what clears a lapsed period, so loading the
  // dashboard keeps the displayed plan honest.
  const [
    projects,
    quota,
    user,
    renderCount,
    lastRender,
    lastGenerated,
    projectPresets,
    countsByProject,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
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
    }),
    checkTierQuota(prisma, userId, 0),
    prisma.user.findUnique({ where: { id: userId }, select: { tierPeriodStart: true } }),
    prisma.renderNode.count({ where: { project: { userId }, kind: 'GENERATED' } }),
    prisma.renderNode.findFirst({
      where: { project: { userId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    // The thumbnail is the project's most recent GENERATED node. The relation
    // select above cannot be filtered separately, hence its own query:
    // ordered newest-first then reduced to one row per project, so each entry
    // is that project's latest render.
    prisma.renderNode.findMany({
      where: { project: { userId }, kind: 'GENERATED' },
      orderBy: { createdAt: 'desc' },
      distinct: ['projectId'],
      select: { id: true, projectId: true },
    }),
    // Which ambiances each project contains, for the filter above the grid.
    prisma.renderNode.findMany({
      where: { project: { userId }, kind: 'GENERATED', preset: { not: null } },
      distinct: ['projectId', 'preset'],
      select: { projectId: true, preset: true },
    }),
    prisma.renderNode.groupBy({
      by: ['projectId'],
      where: { project: { userId }, kind: 'GENERATED' },
      _count: { _all: true },
    }),
  ]);

  const thumbnailByProject = new Map(lastGenerated.map((n) => [n.projectId, n.id]));
  const countByProject = new Map(countsByProject.map((r) => [r.projectId, r._count._all]));

  const presetsByProject = new Map<string, string[]>();
  for (const row of projectPresets) {
    if (!row.preset) continue;
    const list = presetsByProject.get(row.projectId);
    if (list) list.push(row.preset);
    else presetsByProject.set(row.projectId, [row.preset]);
  }

  const items: ProjectCardData[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    // Falls back to the last node of any kind — the starting photo — while a
    // project has no render yet. Before this, that fallback was the ONLY rule,
    // so a project whose latest action was an upload showed its source photo
    // instead of the render the user had already produced.
    thumbnailNodeId: thumbnailByProject.get(p.id) ?? p.renderNodes[0]?.id ?? null,
    lastActivityAt: (p.renderNodes[0]?.createdAt ?? p.createdAt).toISOString(),
    presets: presetsByProject.get(p.id) ?? [],
    renderCount: countByProject.get(p.id) ?? 0,
  }));

  // Only meaningful while a tier is active: checkTierQuota nulls the period
  // out the moment it lapses, so a stale tierPeriodStart never surfaces.
  const periodEndsAt =
    quota.tier && user?.tierPeriodStart
      ? new Date(user.tierPeriodStart.getTime() + TIER_PERIOD_MS).toISOString()
      : null;

  const dashboard: DashboardData = {
    projectCount: projects.length,
    renderCount,
    lastActivityAt: lastRender?.createdAt.toISOString() ?? null,
    tier: quota.tier,
    quotaMax: quota.max,
    quotaRemaining: quota.remaining,
    periodEndsAt,
  };

  return (
    <ProjectsGrid
      initialProjects={items}
      dashboard={dashboard}
      userEmail={auth.user.email ?? ''}
      authDisabled={isAuthDisabled()}
    />
  );
}
