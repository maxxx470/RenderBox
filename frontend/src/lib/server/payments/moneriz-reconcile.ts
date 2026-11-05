/**
 * Idempotent Order reconciliation against Moneriz — the single place the
 * webhook, the return route and any cron call, so « credit at most once »
 * has exactly one implementation.
 *
 * Idempotency mechanism: `updateMany({ where: { id, status: <allowed> } })`
 * is a compare-and-swap. If two callers race on the same session, only the
 * first UPDATE matches a row (count === 1); the second matches zero and is
 * a silent no-op, so `activateTier` runs for exactly one of them.
 * `Order.providerChargeId` also carries a DB-level @unique constraint, so a
 * second Order can never exist against the same session.
 *
 * **A settled order is not the end of the story** (Moneriz's own guide):
 *  - « une réussite tardive reste possible » after `payment.expired`, with
 *    `data.late=true` — so an EXPIRED order must still be able to become
 *    PAID. Stopping at « not PENDING any more » would take the money and
 *    never open the plan.
 *  - « une tentative failed peut permettre un nouvel essai dans la même
 *    session encore ouverte » — so FAILED must stay re-verifiable too.
 *  - « ne pas rétrograder un paiement confirmé sur une ancienne
 *    expiration »: events arrive out of order, so a stale `expired` must
 *    never undo a PAID. That is why the two transitions have DIFFERENT
 *    compare-and-swap guards below, not one shared guard.
 *
 * Three refusals Maketou made impossible, each of which would otherwise be
 * a way to get a plan for nothing:
 *
 *  1. **Two statuses, not one.** Moneriz's documentation forbids granting
 *     before `status=paid` AND `confirmation=confirmed`. `authorized` is
 *     money held, not captured; `review` is a human still looking. Both
 *     stay PENDING here — the webhook comes again when they settle.
 *  2. **The amount is checked.** We SEND the amount, so we can verify it
 *     came back unchanged. A session settled for less than the plan's price
 *     does not activate the plan.
 *  3. **A test session cannot buy a real plan.** If `MONERIZ_SECRET_KEY` is
 *     ever a test key in production, every « payment » would otherwise be
 *     free.
 */
import 'server-only';
import type { Order, PrismaClient } from '@prisma/client';
import { getOrderMetadataTier, getPricingTier, type PricingTierId } from '@/lib/pricing-tiers';
import { MONERIZ_FEE_RATE } from '@/lib/provider-cost';
import { activateTier } from '@/lib/server/generation/tier-quota';
import { readStockBalance } from '@/lib/server/admin/kie-stock';
import { saleStockAlert, notifyAdminsOfSaleStock } from '@/lib/server/admin/stock-alert';
import { getKieBalance, isKieConfigured } from '@/lib/server/generation/engines/kie';
import { log } from '@/lib/server/observability/log';
import { monerizKeyMode, monerizVerifySession, type MonerizSessionResult } from './moneriz';

export interface MonerizReconcileResult {
  changed: boolean;
  status: string;
  /** Why nothing was granted, when a `paid` session did not activate. Only
   *  for logs and the admin — never shown to a customer. */
  blocked?: 'amount_mismatch' | 'currency_mismatch' | 'test_mode' | 'awaiting_confirmation';
}

type OrderSlice = Pick<
  Order,
  'id' | 'status' | 'providerChargeId' | 'userId' | 'metadata' | 'amount' | 'currency'
>;

/**
 * Order statuses a LATE SUCCESS may still settle. An expired session can
 * confirm afterwards, and a failed attempt can be retried inside a session
 * that is still open.
 */
export const SETTLEABLE_AS_PAID: readonly string[] = ['PENDING', 'EXPIRED', 'FAILED'];

/**
 * Whether it is worth asking Moneriz about this order at all. PAID and
 * REFUNDED are final on our side: re-asking could only ever hand a stale
 * event the chance to undo them.
 */
export function isWorthReconciling(status: string): boolean {
  return SETTLEABLE_AS_PAID.includes(status);
}

/** Whether a test-mode session is allowed to settle (local work only). */
function testModeAllowed(): boolean {
  const raw = process.env.MONERIZ_ALLOW_TEST_MODE?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

/**
 * What a verified session means for our Order, with no database access —
 * every refusal lives here so it can be tested without a Prisma mock.
 *
 * Returns the Order status to move to, or null to stay as it is. Staying
 * put is always safe: the webhook fires again, and the expiry sweep closes
 * anything abandoned.
 */
export function decideOrderStatus(
  session: MonerizSessionResult,
  order: Pick<OrderSlice, 'amount' | 'currency'>,
): { status: Order['status'] | null; blocked?: MonerizReconcileResult['blocked'] } {
  // The PAYMENT's status is the authority. The session's own status is a
  // different vocabulary (open / processing / complete / …) and `complete`
  // does NOT mean paid — reading it as such would credit an account on a
  // session that finished without money.
  switch (session.paymentStatus) {
    case 'pending':
      return { status: null };
    case 'failed':
      return { status: 'FAILED' };
    case 'expired':
      return { status: 'EXPIRED' };
    case 'reversed':
      // Refunded or charged back. The order stops being a sale; the credits
      // it granted are NOT clawed back here — some are already spent, and
      // taking them silently is the owner's decision, not this function's.
      return { status: 'REFUNDED' };
    case 'paid':
      break;
    case null:
      // No payment attached yet. Only a session that can never be paid is
      // worth recording; anything else waits.
      if (session.sessionStatus === 'expired' || session.sessionStatus === 'disabled') {
        return { status: 'EXPIRED' };
      }
      if (session.sessionStatus === 'reversed') return { status: 'REFUNDED' };
      return { status: null };
  }

  // From here the payment says `paid`. Everything below can still refuse.
  if (session.confirmation !== 'confirmed') {
    return { status: null, blocked: 'awaiting_confirmation' };
  }
  if (session.mode === 'test' && !testModeAllowed()) {
    return { status: null, blocked: 'test_mode' };
  }
  // A live key must not settle a test session, nor the reverse.
  const keyMode = monerizKeyMode();
  if (session.mode !== null && keyMode !== null && session.mode !== keyMode) {
    return { status: null, blocked: 'test_mode' };
  }
  if (
    session.currency !== null &&
    session.currency.toUpperCase() !== order.currency.toUpperCase()
  ) {
    return { status: null, blocked: 'currency_mismatch' };
  }
  // Paying MORE than asked is not a reason to refuse a plan the customer
  // paid for; paying less is.
  if (session.amount !== null && session.amount < order.amount) {
    return { status: null, blocked: 'amount_mismatch' };
  }
  return { status: 'PAID' };
}

/** Moneriz's 5 % commission on the amount actually settled, in whole FCFA
 *  (its tarifs page rounds the fee down), and what is left for us. */
export function monerizFeeSplit(amount: number): { commission: number; net: number } {
  const commission = Math.floor(amount * MONERIZ_FEE_RATE);
  return { commission, net: amount - commission };
}

/**
 * Re-verifies an unsettled Moneriz Order against the provider and applies
 * the compare-and-swap. PAID and REFUNDED orders are returned as-is without
 * an API call.
 */
export async function reconcileMonerizOrder(
  prisma: PrismaClient,
  order: OrderSlice,
): Promise<MonerizReconcileResult> {
  if (!isWorthReconciling(order.status) || !order.providerChargeId) {
    return { changed: false, status: order.status };
  }

  const session = await monerizVerifySession(order.providerChargeId);
  const decision = decideOrderStatus(session, order);
  if (!decision.status) {
    return {
      changed: false,
      status: order.status,
      ...(decision.blocked ? { blocked: decision.blocked } : {}),
    };
  }
  // Nothing to write when the provider only confirms where we already are.
  if (decision.status === order.status) {
    return { changed: false, status: order.status };
  }

  const paid = decision.status === 'PAID';
  // The fee is booked as the real figure Moneriz takes, never an invented
  // one: only on a settled payment, and only from the amount settled.
  const fees = paid ? monerizFeeSplit(session.amount ?? order.amount) : null;

  const updated = await prisma.order.updateMany({
    where: {
      id: order.id,
      // A success may still settle an order that expired or failed earlier
      // (Moneriz confirms late). A NEGATIVE outcome may only ever settle one
      // still PENDING — otherwise a stale `expired` event arriving after a
      // confirmation would undo a real sale.
      status: paid ? { in: [...SETTLEABLE_AS_PAID] } : 'PENDING',
    },
    data: {
      status: decision.status,
      ...(paid
        ? {
            paidAt: new Date(),
            ...(fees ? { commissionAmount: fees.commission, netAmount: fees.net } : {}),
          }
        : {}),
    },
  });

  const won = updated.count > 0;
  if (won && paid && order.userId) {
    // Only the caller that actually won the CAS reaches here — the loser
    // (updated.count === 0) never double-activates the tier.
    const tier = getOrderMetadataTier(order.metadata);
    if (tier) {
      await activateTier(prisma, order.userId, tier);
      // Then, and only then, look at whether the stock can cover what was
      // just sold. This can NEVER fail the payment: the customer is paid
      // up and credited by the line above, and an alert that throws would
      // turn a successful sale into a 500. Hence the catch that swallows
      // everything, and why it runs after the activation rather than
      // around it.
      await alertAdminsIfStockShort(prisma, order.id, tier).catch((err: unknown) => {
        log.error('stock alert failed after a sale, payment unaffected', {
          orderId: order.id,
          err: String(err),
        });
      });
    }
  }

  return { changed: won, status: won ? decision.status : order.status };
}

/**
 * Warn the admins when a sale leaves the Kie stock short (2026-11-05).
 *
 * Read-only on Kie, and deliberately best-effort: a sale is never held
 * back and never fails because this could not run. The circulation is
 * read AFTER the activation, so the credits just sold are counted — the
 * question being « can the stock cover what the accounts now hold », not
 * what they held a second ago.
 */
async function alertAdminsIfStockShort(
  prisma: PrismaClient,
  orderId: string,
  tier: PricingTierId,
): Promise<void> {
  const pricing = getPricingTier(tier);
  if (!pricing) return;

  const stock = await readStockBalance(isKieConfigured(), () => getKieBalance());
  if (stock.kind !== 'known') return;

  const agg = await prisma.user.aggregate({
    _sum: { creditsBalance: true },
    where: { deletedAt: null },
  });

  const alert = saleStockAlert({
    stock,
    circulation: agg._sum.creditsBalance ?? 0,
    soldCredits: pricing.creditsPerMonth,
  });
  if (!alert) return;

  const sent = await notifyAdminsOfSaleStock(prisma, orderId, alert);
  log.warn('kie stock short after a sale', {
    orderId,
    level: alert.level,
    balance: alert.balance,
    circulation: alert.circulation,
    missing: alert.missing,
    adminsNotified: sent,
  });
}
