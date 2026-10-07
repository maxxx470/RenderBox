// /app/tarifs — "Abonnement", inside the app: the current plan and its usage,
// then the three plans and the same checkout as the landing, then the
// account's past payments.
//
// Every "choose a plan" button in the workspace used to point at /#tarifs,
// which dropped a signed-in user back onto the marketing page, rail gone.
// Once inside, nothing links out to the landing any more.
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { prisma } from '@/lib/server/prisma';
import { getOrderMetadataTier } from '@/lib/pricing-tiers';
import { loadAppSurface } from '../surface-data';
import { loadShell } from '../shell-data';
import { TarifsClient, type PaymentRow } from './TarifsClient';

/** Enough history for an account page; older payments stay in the database. */
const HISTORY_LIMIT = 20;

export default async function AppTarifsPage() {
  // Both read the same cached shell data — one query for the page.
  const [surface, { auth, quota }] = await Promise.all([loadAppSurface('pricing'), loadShell()]);

  // Only paid orders: a PENDING or FAILED checkout gave the account nothing,
  // and listing it would read as a plan that was bought.
  const orders = await prisma.order.findMany({
    where: { userId: auth.user.sub, status: 'PAID' },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { id: true, amount: true, metadata: true, paidAt: true, createdAt: true },
  });
  const history: PaymentRow[] = orders.flatMap((o) => {
    const tier = getOrderMetadataTier(o.metadata);
    if (!tier) return [];
    return [{ id: o.id, tier, amount: o.amount, at: (o.paidAt ?? o.createdAt).toISOString() }];
  });

  return (
    <TarifsClient
      surface={surface}
      periodEndsAt={quota.periodEndsAt?.toISOString() ?? null}
      history={history}
      demo={isAuthDisabled()}
    />
  );
}
