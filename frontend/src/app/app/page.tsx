import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { isPricingTierId, type PricingTierId } from '@/lib/pricing-tiers';
import { GenerationHome, type RecentRenderCardData } from './GenerationHome';

// /app root — the "Espace de génération" home: engine picker + a fan of the
// user's most recent renders (across every project) + a quick-start command
// bar. "Mes projets" (the full grid) moved to /app/projets — see
// ModeSidebar's Krea-style precedent: modes/navigation change behavior in
// place, not the route, except this one deliberate exception (grid vs. home
// really are two different screens per the spec).
export default async function AppHomePage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  const [recentNodes, lastPaidOrder] = await Promise.all([
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
    // "Palier réel de l'utilisateur" — RenderBox has no subscription/renewal
    // record yet (see the pricing-page follow-up note), so the most recent
    // PAID Maketou order's tier is the best available signal of what the
    // user currently has. Falls back to the lowest tier below rather than a
    // generic "Free" label per the spec.
    prisma.order.findFirst({
      where: { userId: auth.user.sub, provider: 'maketou', status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      select: { metadata: true },
    }),
  ]);

  const recentRenders: RecentRenderCardData[] = recentNodes.map((n) => ({
    id: n.id,
    projectId: n.project.id,
    projectName: n.project.name,
    preset: n.preset,
    engine: n.engine,
    editType: n.editType,
  }));

  const metaTier =
    lastPaidOrder?.metadata && typeof lastPaidOrder.metadata === 'object'
      ? (lastPaidOrder.metadata as Record<string, unknown>).tier
      : undefined;
  const currentTier: PricingTierId =
    typeof metaTier === 'string' && isPricingTierId(metaTier) ? metaTier : 'decouverte';

  return <GenerationHome recentRenders={recentRenders} currentTier={currentTier} />;
}
