import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { loadShell } from './shell-data';
import type { ProjectCardData } from './ProjectsGrid';
import type { DashboardData } from './DashboardStats';
import { categoriesOf } from './project-categories';

// What the dashboard (/app) and the Projets page (/app/projets) both need:
// every project as a card, and the account figures.
//
// ---------------------------------------------------------------------------
// Why exactly three database calls
// ---------------------------------------------------------------------------
// DATABASE_URL pins `connection_limit=1` (Neon serverless tuning), so Prisma
// holds a single connection and a Promise.all of N queries runs them one after
// another, not in parallel. Every query is therefore a full round trip added
// to the page's time to first byte — measured at ~600ms each in production.
//
// The dashboard once issued eight. The work is now:
//   1. projects (+ their newest node, for the fallback thumbnail and date)
//   2. every generated node of this user, in one go
//   3. checkTierQuota — which also returns periodEndsAt, so no separate
//      user lookup
// Thumbnails, categories and counts are all derived in memory
// from (2) instead of costing more round trips.
//
// The size of (2) is bounded by the paid quota (300/month on the top tier) and
// selects five small columns, so it stays far cheaper than the round trips it
// replaces. If a single account ever holds tens of thousands of renders, move
// this to one `DISTINCT ON` raw query rather than back to several Prisma ones.
export async function loadProjectsPage(): Promise<{
  projects: ProjectCardData[];
  dashboard: DashboardData;
  userEmail: string;
}> {
  // The account and its plan (3) come from loadShell, shared with the app
  // layout so a first load reads them once — see shell-data.ts.
  const { auth, quota } = await loadShell();
  const userId = auth.user.sub;

  const [projects, generatedNodes] = await Promise.all([
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
      select: { id: true, projectId: true, preset: true, editType: true, createdAt: true },
    }),
  ]);

  // Newest-first, so the first node seen for a project is its latest render.
  const thumbnailByProject = new Map<string, string>();
  const rendersByProject = new Map<string, { preset: string | null; editType: string | null }[]>();

  for (const node of generatedNodes) {
    if (!thumbnailByProject.has(node.projectId)) {
      thumbnailByProject.set(node.projectId, node.id);
    }
    const renders = rendersByProject.get(node.projectId);
    const entry = { preset: node.preset, editType: node.editType };
    if (renders) renders.push(entry);
    else rendersByProject.set(node.projectId, [entry]);
  }

  const items: ProjectCardData[] = projects.map((p) => {
    const renders = rendersByProject.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      // Falls back to the last node of any kind — the starting photo — while
      // a project has no render yet.
      thumbnailNodeId: thumbnailByProject.get(p.id) ?? p.renderNodes[0]?.id ?? null,
      lastActivityAt: (p.renderNodes[0]?.createdAt ?? p.createdAt).toISOString(),
      renderCount: renders.length,
      categories: categoriesOf(renders),
    };
  });

  // Most recent activity across the account: the projects query already
  // carries each project's newest node, so this needs no query of its own.
  const lastActivity = projects.reduce<Date | null>((newest, p) => {
    const at = p.renderNodes[0]?.createdAt;
    return at && (!newest || at > newest) ? at : newest;
  }, null);

  return {
    projects: items,
    dashboard: {
      projectCount: projects.length,
      renderCount: generatedNodes.length,
      lastActivityAt: lastActivity?.toISOString() ?? null,
      tier: quota.tier,
      quotaMax: quota.max,
      quotaRemaining: quota.remaining,
      periodEndsAt: quota.periodEndsAt?.toISOString() ?? null,
    },
    userEmail: auth.user.email ?? '',
  };
}
