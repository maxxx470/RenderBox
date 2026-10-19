// The account's latest generated images, across every project — the
// « Images récentes » of the image generator and, since 2026-10-19 (owner:
// « ajoute ça à Améliorer »), of the Enhance page.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import type { RecentRenderCardData } from './GenerationHome';

export async function loadRecentRenders(
  userId: string,
  take = 15,
): Promise<RecentRenderCardData[]> {
  const nodes = await prisma.renderNode.findMany({
    where: { project: { userId }, kind: 'GENERATED' },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      preset: true,
      engine: true,
      editType: true,
      project: { select: { id: true, name: true } },
    },
  });
  return nodes.map((n) => ({
    id: n.id,
    projectId: n.project.id,
    projectName: n.project.name,
    preset: n.preset,
    engine: n.engine,
    editType: n.editType,
  }));
}
