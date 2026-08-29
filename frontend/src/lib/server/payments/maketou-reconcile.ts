/**
 * Idempotent Order reconciliation against Maketou's cart status — the
 * single place both the return-verification route and the 5-minute
 * reconciliation cron call, so "credit at most once" has exactly one
 * implementation.
 *
 * Idempotency mechanism: `updateMany({ where: { id, status: 'PENDING' } })`
 * is a compare-and-swap. If the verify route and the cron both race on the
 * same cart, only the first UPDATE matches a row (count === 1); the second
 * matches zero rows and is a silent no-op. Order.providerChargeId (the
 * Maketou cartId) already carries a DB-level @unique constraint, so a
 * second Order can never be created against the same cart either.
 */
import 'server-only';
import type { Order, PrismaClient } from '@prisma/client';
import { getOrderMetadataTier } from '@/lib/pricing-tiers';
import { activateTier } from '@/lib/server/generation/tier-quota';
import { maketouVerifyCart, type MaketouCartStatus } from './maketou';

function mapToOrderStatus(cartStatus: MaketouCartStatus): Order['status'] | null {
  switch (cartStatus) {
    case 'completed':
      return 'PAID';
    case 'abandoned':
      return 'EXPIRED';
    case 'payment_failed':
      return 'FAILED';
    case 'waiting_payment':
      return null; // still pending — nothing to do yet
  }
}

export interface ReconcileResult {
  changed: boolean;
  status: string;
}

/**
 * Re-verifies a single PENDING Maketou Order against the provider and
 * applies the compare-and-swap update. Already-settled orders (non-PENDING)
 * are returned as-is without an API call — reconciliation is only ever
 * meaningful for PENDING rows.
 */
export async function reconcileMaketouOrder(
  prisma: PrismaClient,
  order: Pick<Order, 'id' | 'status' | 'providerChargeId' | 'userId' | 'metadata'>,
): Promise<ReconcileResult> {
  if (order.status !== 'PENDING' || !order.providerChargeId) {
    return { changed: false, status: order.status };
  }

  const cart = await maketouVerifyCart(order.providerChargeId);
  const mapped = mapToOrderStatus(cart.status);
  if (!mapped) return { changed: false, status: order.status };

  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: {
      status: mapped,
      ...(mapped === 'PAID' ? { paidAt: new Date() } : {}),
    },
  });

  const won = updated.count > 0;
  if (won && mapped === 'PAID' && order.userId) {
    // Only the caller that actually won the CAS reaches here — the loser
    // (updated.count === 0) never double-activates the tier.
    const tier = getOrderMetadataTier(order.metadata);
    if (tier) await activateTier(prisma, order.userId, tier);
  }

  return { changed: won, status: won ? mapped : order.status };
}
