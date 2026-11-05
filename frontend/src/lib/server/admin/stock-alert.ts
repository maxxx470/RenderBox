/**
 * « Je viens de vendre une formule — mon stock Kie peut-il la couvrir ? »
 *
 * (2026-11-05, owner, asked after reading the payment path: « un
 * utilisateur vient pour faire un abonnement … et au final les crédits
 * étaient épuisés du côté de l'administration ».)
 *
 * THE SALE IS NEVER BLOCKED, and that is the whole design. `activateTier`
 * credits the customer the moment the payment settles, without consulting
 * Kie — refusing to credit someone who has just paid would be far worse
 * than any stock shortage, and the arithmetic says the sale is never the
 * problem: 6 000 FCFA brings 500 credits that cost about 1 500 FCFA of
 * Kie (3 FCFA each, provider-cost.ts). Every sale more than pays for its
 * own top-up. Holding sales back to protect the stock would cost the
 * owner money for nothing.
 *
 * What was actually missing is that NOTHING SAID SO. /admin/stock-kie
 * shows the coverage, but only to someone who goes and looks; three plans
 * sold on a Sunday evening would be discovered when a customer complains.
 * So this module raises the alarm at the moment of the sale, and raises
 * nothing else.
 *
 * What happens today when the stock really is empty, for the record: the
 * render debits the credits, Kie answers 402, there is no direct
 * Gemini/OpenAI key in production to fall back to, the engine throws and
 * the credits are refunded. The customer loses nothing but cannot render.
 * That is the situation this alert exists to shorten.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createNotification } from '@/lib/server/notifications';
import { coverageLevel, type CoverageLevel, type StockBalance } from './kie-stock';

export interface SaleStockAlert {
  level: Exclude<CoverageLevel, 'green'>;
  /** Kie's balance divided by what every account holds. Under 1 = red. */
  coverage: number;
  /** Kie credits left, as Kie itself reported them. */
  balance: number;
  /** What every account holds, the sale included. */
  circulation: number;
  /** What this sale just put into circulation. */
  soldCredits: number;
  /** Credits still uncovered, 0 when coverage is merely thin. */
  missing: number;
}

/**
 * The decision, pure so it can be read and tested with no Kie, no database
 * and no clock.
 *
 * Returns null — say nothing — in the three cases where an alert would be
 * noise rather than news:
 *   · `open`: no Kie account at all, so a site credit answers to no stock
 *     and the renders run on the direct keys;
 *   · `unknown`: Kie did not answer. A transient hiccup must not page the
 *     owner on every sale, and the admin page already shows the gap;
 *   · green: the stock covers what is owed, which is the normal case.
 */
export function saleStockAlert(input: {
  stock: StockBalance;
  circulation: number;
  soldCredits: number;
}): SaleStockAlert | null {
  if (input.stock.kind !== 'known') return null;

  const { balance } = input.stock;
  const circulation = input.circulation;
  // Nothing owed: nothing can be uncovered, whatever the balance.
  if (circulation <= 0) return null;

  const coverage = balance / circulation;
  const level = coverageLevel(coverage);
  if (level === 'green') return null;

  return {
    level,
    coverage,
    balance,
    circulation,
    soldCredits: input.soldCredits,
    missing: Math.max(0, circulation - balance),
  };
}

/** What the owner reads in the bell, in their own terms. */
export function alertMessage(a: SaleStockAlert): { title: string; body: string } {
  const pct = Math.round(a.coverage * 100);
  if (a.level === 'red') {
    return {
      title: 'Stock Kie insuffisant',
      body:
        `Une formule de ${a.soldCredits} crédits vient d'être vendue. ` +
        `Les comptes détiennent ${a.circulation} crédits et il en reste ${a.balance} chez Kie ` +
        `(couverture ${pct} %) : ${a.missing} crédits ne sont pas couverts. ` +
        `Les rendus échoueront une fois le stock épuisé — rechargez sur kie.ai.`,
    };
  }
  return {
    title: 'Stock Kie bientôt juste',
    body:
      `Une formule de ${a.soldCredits} crédits vient d'être vendue. ` +
      `Couverture ${pct} % : ${a.balance} crédits chez Kie pour ${a.circulation} en circulation. ` +
      `Tout fonctionne, mais prévoyez une recharge.`,
  };
}

/**
 * Tell every admin, once per sale.
 *
 * `dedupeKey` carries the order id, so the same settled payment can be
 * reconciled twice — the webhook and the return page race by design — and
 * the owner still reads one notification. It carries no timestamp, as
 * templates.ts requires.
 */
export async function notifyAdminsOfSaleStock(
  prisma: PrismaClient,
  orderId: string,
  alert: SaleStockAlert,
): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  });

  const { title, body } = alertMessage(alert);
  let sent = 0;
  for (const admin of admins) {
    const row = await createNotification(prisma, {
      userId: admin.id,
      type: 'KIE_STOCK_LOW',
      title,
      body,
      data: {
        orderId,
        level: alert.level,
        balance: alert.balance,
        circulation: alert.circulation,
        soldCredits: alert.soldCredits,
        missing: alert.missing,
      },
      dedupeKey: `kie-stock-low:${orderId}:${admin.id}`,
    });
    if (row) sent++;
  }
  return sent;
}
