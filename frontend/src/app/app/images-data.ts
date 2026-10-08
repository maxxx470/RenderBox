import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { loadShell } from './shell-data';
import type { DashboardData } from './DashboardStats';
import type { ImageCardData } from './ImagesGrid';
import { imageHref, imageTypeOf, kindOf, type ProjectKind } from './project-kinds';

// What the dashboard (/app) and Mes images (/app/images) both need: every
// image of the account — uploaded, generated, enhanced — as a card, and the
// account figures. Replaced projects-data.ts on 2026-10-08, when Mes images
// took the place of the Projets page (owner).
//
// Two database calls, as few as before (DATABASE_URL pins a single
// connection, so every query is a full round trip — see the history of
// projects-data.ts): the account and its plan come from loadShell, shared
// with the layout; then every node of the account in one query. Each
// project's kind, which decides where an image opens, is derived in memory
// from that same list.
//
// The list is bounded by what the account produced (the paid quota caps
// renders at 300 a month on the top tier) and selects seven small columns.
export async function loadImagesPage(): Promise<{
  images: ImageCardData[];
  dashboard: DashboardData;
  userEmail: string;
}> {
  const { auth, quota } = await loadShell();
  const userId = auth.user.sub;

  const nodes = await prisma.renderNode.findMany({
    where: { project: { userId } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      projectId: true,
      parentId: true,
      kind: true,
      preset: true,
      editType: true,
      createdAt: true,
    },
  });

  const rendersByProject = new Map<string, { editType: string | null }[]>();
  for (const node of nodes) {
    if (node.kind !== 'GENERATED') continue;
    const list = rendersByProject.get(node.projectId);
    if (list) list.push({ editType: node.editType });
    else rendersByProject.set(node.projectId, [{ editType: node.editType }]);
  }
  const kindByProject = new Map<string, ProjectKind>();
  const projectKind = (projectId: string) => {
    let kind = kindByProject.get(projectId);
    if (!kind) {
      kind = kindOf(rendersByProject.get(projectId) ?? []);
      kindByProject.set(projectId, kind);
    }
    return kind;
  };

  const images: ImageCardData[] = nodes.map((n) => ({
    id: n.id,
    type: imageTypeOf(n),
    preset: n.preset,
    editType: n.editType,
    createdAt: n.createdAt.toISOString(),
    href: imageHref(n, projectKind(n.projectId)),
  }));

  return {
    images,
    dashboard: {
      imageCount: nodes.length,
      renderCount: nodes.filter((n) => n.kind === 'GENERATED').length,
      // Newest first, so the first node is the latest activity.
      lastActivityAt: nodes[0]?.createdAt.toISOString() ?? null,
      tier: quota.tier,
      quotaMax: quota.max,
      quotaRemaining: quota.remaining,
      periodEndsAt: quota.periodEndsAt?.toISOString() ?? null,
    },
    userEmail: auth.user.email ?? '',
  };
}
