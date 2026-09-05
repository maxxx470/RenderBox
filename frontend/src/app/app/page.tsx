import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { checkTierQuota } from '@/lib/server/generation/tier-quota';
import { ProjectsGrid, type ProjectCardData } from './ProjectsGrid';
import type { DashboardData } from './DashboardStats';

// /app — the dashboard, and the first screen after sign-in: plan and quota,
// activity figures, then the project grid underneath. One page rather than
// two, because every figure here is about the projects listed below it.
//
// The generation space it used to share this route with now lives at
// /app/generer, reachable from the sidebar.
//
// ---------------------------------------------------------------------------
// Why this page makes exactly two database calls
// ---------------------------------------------------------------------------
// DATABASE_URL pins `connection_limit=1` (Neon serverless tuning), so Prisma
// holds a single connection and a Promise.all of N queries runs them one after
// another, not in parallel. Every query is therefore a full round trip added
// to the page's time to first byte — measured at ~600ms each in production.
//
// This page used to issue eight, which is exactly why it took ~5s to load on a
// database holding five projects and zero renders. The work below is now:
//   1. projects (+ their newest node, for the fallback thumbnail and date)
//   2. every generated node of this user, in one go
//   3. checkTierQuota — which also returns periodEndsAt, so no separate
//      user lookup
// Thumbnails, per-project ambiances and per-project counts are all derived in
// memory from (2) instead of costing three more round trips.
//
// The size of (2) is bounded by the paid quota (300/month on the top tier) and
// selects four small columns, so it stays far cheaper than the round trips it
// replaces. If a single account ever holds tens of thousands of renders, move
// this to one `DISTINCT ON` raw query rather than back to several Prisma ones.
export default async function AppDashboardPage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  const userId = auth.user.sub;

  // checkTierQuota with count: 0 reads status without consuming anything —
  // and, by design, is also what clears a lapsed period, so loading the
  // dashboard keeps the displayed plan honest.
  const [projects, generatedNodes, quota] = await Promise.all([
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
    prisma.renderNode.findMany({
      where: { project: { userId }, kind: 'GENERATED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, projectId: true, preset: true, createdAt: true },
    }),
    checkTierQuota(prisma, userId, 0),
  ]);

  // Newest-first, so the first node seen for a project is its latest render.
  const thumbnailByProject = new Map<string, string>();
  const countByProject = new Map<string, number>();
  const presetsByProject = new Map<string, string[]>();

  for (const node of generatedNodes) {
    if (!thumbnailByProject.has(node.projectId)) {
      thumbnailByProject.set(node.projectId, node.id);
    }
    countByProject.set(node.projectId, (countByProject.get(node.projectId) ?? 0) + 1);
    if (node.preset) {
      const list = presetsByProject.get(node.projectId);
      if (!list) presetsByProject.set(node.projectId, [node.preset]);
      else if (!list.includes(node.preset)) list.push(node.preset);
    }
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

  // Most recent activity across the account: the projects query already
  // carries each project's newest node, so this needs no query of its own.
  const lastActivity = projects.reduce<Date | null>((newest, p) => {
    const at = p.renderNodes[0]?.createdAt;
    return at && (!newest || at > newest) ? at : newest;
  }, null);

  const dashboard: DashboardData = {
    projectCount: projects.length,
    renderCount: generatedNodes.length,
    lastActivityAt: lastActivity?.toISOString() ?? null,
    tier: quota.tier,
    quotaMax: quota.max,
    quotaRemaining: quota.remaining,
    periodEndsAt: quota.periodEndsAt?.toISOString() ?? null,
  };

  return (
    <ProjectsGrid initialProjects={items} dashboard={dashboard} userEmail={auth.user.email ?? ''} />
  );
}
