/**
 * Idempotent Order reconciliation against MoneyFusion's own answer — the
 * single place the return page, the webhook and the cron all call, so
 * « credit at most once » has exactly ONE implementation (2026-11-01).
 *
 * Idempotency: `updateMany({ where: { id, status: 'PENDING' } })` is a
 * compare-and-swap. When the return page and the webhook race on the same
 * payment, only the first UPDATE matches a row (count === 1); the second
 * matches none and is a silent no-op, so `activateTier` runs once. On top of
 * that `Order.providerChargeId` (MoneyFusion's `tokenPay`) is @unique, so two
 * orders can never exist against the same payment either. MoneyFusion's
 * documentation warns that it may notify several times for one transaction —
 * this is the answer to that, and it is why the webhook needs no memory.
 *
 * THE AMOUNT IS CHECKED, but tolerantly, and here is the reasoning. The
 * client never chooses a price: `totalPrice` is stamped server-side from
 * pricing-tiers.ts at checkout and `Order.amount` records what we asked for.
 * So this check is not a defence against our own customers — it catches a
 * token that belongs to a different order, and a provider misreporting a
 * sum. A HARD equality check would be the wrong trade: if MoneyFusion ever
 * returned `Montant` net of its fee for some payment method, every honest
 * payment would be refused and the customer would be out of pocket with no
 * credits. So a gross shortfall (under 90%) refuses and shouts; anything
 * else credits and logs the discrepancy. Note we compare against the sum the
 * ORDER recorded, never against the tier's current price — an older pending
 * order made at a previous price must still complete.
 */
import 'server-only';
import type { Order, PrismaClient, Prisma } from '@prisma/client';
import { getOrderMetadataTier } from '@/lib/pricing-tiers';
import { activateTier } from '@/lib/server/generation/tier-quota';
import { createLogger } from '@/lib/server/logger';
import { moneyfusionVerifyPayment, type MoneyfusionStatus } from './moneyfusion';

const log = createLogger();

/** Below this share of the sum we asked for, a payment is not the one. */
export const MIN_PAID_RATIO = 0.9;

function mapToOrderStatus(status: MoneyfusionStatus): Order['status'] | null {
  switch (status) {
    case 'paid':
      return 'PAID';
    case 'failure':
      return 'FAILED';
    case 'no paid':
      // The customer reached the page and did not pay. Not an error, and not
      // final either — the order expires on its own after 24 h, so leave it
      // PENDING rather than close a payment the customer may still finish.
      return null;
    case 'pending':
      return null;
  }
}

export interface ReconcileResult {
  changed: boolean;
  status: string;
}

export type ReconcileOrder = Pick<
  Order,
  'id' | 'status' | 'providerChargeId' | 'userId' | 'metadata' | 'amount'
>;

export async function reconcileMoneyfusionOrder(
  prisma: PrismaClient,
  order: ReconcileOrder,
): Promise<ReconcileResult> {
  if (order.status !== 'PENDING' || !order.providerChargeId) {
    return { changed: false, status: order.status };
  }

  const payment = await moneyfusionVerifyPayment(order.providerChargeId);
  const mapped = mapToOrderStatus(payment.status);
  if (!mapped) return { changed: false, status: order.status };

  if (mapped === 'PAID') {
    // The token must belong to THIS order. MoneyFusion hands `personal_Info`
    // back untouched, so a mismatch means we are looking at someone else's
    // payment — never credit on that.
    if (payment.orderId && payment.orderId !== order.id) {
      log.error('moneyfusion: payment belongs to another order, refusing to credit', {
        orderId: order.id,
        reportedOrderId: payment.orderId,
      });
      return { changed: false, status: order.status };
    }

    if (payment.amount !== null && payment.amount < order.amount * MIN_PAID_RATIO) {
      log.error('moneyfusion: paid sum far below the order, refusing to credit', {
        orderId: order.id,
        expected: order.amount,
        paid: payment.amount,
      });
      return { changed: false, status: order.status };
    }
    if (payment.amount !== null && payment.amount !== order.amount) {
      // Credited anyway — see the note at the top of this file — but never
      // silently: a recurring line here means the fee is taken off `Montant`
      // and the accounting needs to know.
      log.warn('moneyfusion: paid sum differs from the order', {
        orderId: order.id,
        expected: order.amount,
        paid: payment.amount,
      });
    }
  }

  // The real fee MoneyFusion charged on this transaction, as it reports it —
  // better than any rate we could hardcode, and what the accounting books.
  const fee = mapped === 'PAID' ? payment.fee : null;
  const existing =
    order.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
      ? (order.metadata as Prisma.JsonObject)
      : {};

  const updated = await prisma.order.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: {
      status: mapped,
      ...(mapped === 'PAID' ? { paidAt: new Date() } : {}),
      ...(payment.method ? { paymentMethod: payment.method } : {}),
      ...(fee !== null
        ? { commissionAmount: fee, netAmount: Math.max(0, order.amount - fee) }
        : {}),
      ...(payment.transactionId
        ? { metadata: { ...existing, moneyfusionTransaction: payment.transactionId } }
        : {}),
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
