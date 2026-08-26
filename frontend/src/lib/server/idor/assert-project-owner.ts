// Shared ownership check for every RenderBox route keyed by a Project id —
// RenderNode, Material, Generation all belong to a Project, which belongs
// to a User. Every route under /api/projects/[projectId]/* MUST call this
// immediately after requireAuth, before touching any row. Routes keyed by a
// child id instead (e.g. the render-node image proxy) do the ownership
// check inline via a `select: { project: { select: { userId: true } } }`
// join — one query, not two — rather than calling this a second time.
//
// 404 (not 403) on mismatch — don't leak whether the project exists at all
// to a non-owner, same posture as the starter's requireOrgRole.
import 'server-only';
import { prisma } from '@/lib/server/prisma';

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found');
    this.name = 'ProjectNotFoundError';
  }
}

export async function assertProjectOwner(projectId: string, userId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project || project.userId !== userId) {
    throw new ProjectNotFoundError();
  }
}
