import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { renderPrice } from '@/lib/provider-cost';
import type { EngineName } from '@/lib/server/generation/engines/types';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';

/**
 * The credits one image costs this account (provider-cost.ts): Kie's price
 * for an administrator, RENDER_COST for everyone else. The role is read from
 * the database on each request — never from the token or the client.
 */
export async function renderPriceFor(
  prisma: PrismaClient,
  userId: string,
  engine: EngineName,
  /** Absent: the default size, as the routes treat it. */
  resolution: ResolutionKey | undefined,
): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return renderPrice(user?.role, engine, resolution);
}
