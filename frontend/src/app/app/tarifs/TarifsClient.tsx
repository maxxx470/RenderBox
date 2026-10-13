'use client';

// /app/tarifs — "Abonnement", inside the app.
//
// 2026-10-07 — rebuilt on Metrio's subscription page, as the owner asked
// (their screenshot of metrio /dashboard/subscription), blue in place of
// Metrio's blue:
//
//   1. A centred head: a small tinted pill, the title in black, one line.
//   2. "Solde actuel": a tinted bar with the credits left on the right and
//      the date they expire.
//   3. A warning, Metrio's Alert, when no render can be paid for any more.
//   4. The three plans — THE SAME card as the landing's (PricingCard,
//      tone "page"), read from lib/pricing-tiers.ts; the current plan is
//      outlined blue (owner, 2026-10-13).
//   5. The dollar note, then "Historique": the account's paid orders.
//
// The dark summary card, the "included in every plan" list and the billing
// facts of the 2026-10-06 version are gone (owner).
import { useState } from 'react';
import { Danger, Wallet } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { PRICING_TIERS, RENDER_COST, type PricingTierId } from '@/lib/pricing-tiers';
import { PricingCard, TIER_NAME_KEY } from '../../PricingCard';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';

export interface PaymentRow {
  id: string;
  tier: PricingTierId;
  /** XOF, smallest unit (no decimals). */
  amount: number;
  /** ISO date the payment went through. */
  at: string;
}

export function TarifsClient({
  surface,
  periodEndsAt,
  history,
  demo,
}: {
  surface: AppSurfaceProps;
  /** ISO end of the current 30-day period, null without a plan. */
  periodEndsAt: string | null;
  /** Paid orders, newest first. */
  history: PaymentRow[];
  demo: boolean;
}) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const [checkoutTier, setCheckoutTier] = useState<PricingTierId | null>(null);
  const [errors, setErrors] = useState<Record<PricingTierId, string | null>>({
    decouverte: null,
    standard: null,
    pro: null,
  });

  async function select(tier: PricingTierId) {
    // Free-access mode: there is no real account to attach a paid plan to,
    // and every feature is already open — say so rather than charging the
    // shared demo user (see lib/server/auth-disabled.ts).
    if (demo) {
      toast(t('tarifs.demoNote'), 'info');
      return;
    }
    setCheckoutTier(tier);
    setErrors((prev) => ({ ...prev, [tier]: null }));
    try {
      const res = await api<{ paymentUrl: string }>('/api/payments/checkout', {
        method: 'POST',
        body: { tier },
      });
      window.location.href = res.paymentUrl;
    } catch {
      setErrors((prev) => ({ ...prev, [tier]: t('landing.pricingError') }));
      setCheckoutTier(null);
    }
  }

  const { tier, creditsBalance } = surface;
  const remaining = tier !== null && creditsBalance !== null ? creditsBalance : 0;
  const endDate = periodEndsAt
    ? new Date(periodEndsAt).toLocaleDateString(intl, { day: 'numeric', month: 'long' })
    : null;
  const credits = (n: number) =>
    t(n === 1 ? 'tarifs.creditsOne' : 'tarifs.creditsMany', { count: n.toLocaleString(intl) });
  // Below one 1K / 2K render, nothing can be generated any more.
  const empty = remaining < RENDER_COST;

  return (
    <AppSurface
      {...surface}
      eyebrow={t('tarifs.eyebrow')}
      title={t('tarifs.title')}
      headTitle={t('tarifs.headTitle')}
      headAlign="center"
      subtitle={t('page.pricingSubtitle')}
    >
      {/* Solde actuel. */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-[#EEF1FF] p-3.5 min-[640px]:px-5">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[#1E36D6]">{t('tarifs.balanceLabel')}</div>
          {tier && endDate && (
            <div className="mt-0.5 truncate text-[11px] text-[#1E36D6]/80">
              {t('tarifs.balancePlan', { tier: t(TIER_NAME_KEY[tier]), date: endDate })}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 font-[family-name:var(--font-mono)] text-[14px] font-bold text-[#2948FC]">
          {credits(remaining)}
        </div>
      </div>

      {/* Metrio's Alert, warning variant. */}
      {empty && (
        <div className="relative mb-6 flex items-start gap-2.5 overflow-hidden rounded-xl bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(23,22,31,0.05)]">
          <span aria-hidden className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#B7791F]" />
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[#FDF3E2]">
            <Danger set="curved" size={13} primaryColor="#B7791F" />
          </span>
          <p className="flex-1 text-[13px] font-medium leading-snug text-[#17161F]">
            {tier ? t('tarifs.alertEmpty') : t('tarifs.alertNone')}
          </p>
        </div>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3 pt-2 min-[640px]:gap-4 min-[900px]:grid-cols-3">
        {PRICING_TIERS.map((p) => (
          <PricingCard
            key={p.id}
            tone="page"
            tier={p}
            current={p.id === tier}
            loading={checkoutTier === p.id}
            error={errors[p.id]}
            onSelect={() => void select(p.id)}
          />
        ))}
      </div>

      <p className="mb-6 text-[10.5px] text-[#8A8896]">{t('tarifs.usdNote')}</p>

      {/* Historique. */}
      <section className="mb-4 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(23,22,31,0.04)]">
        <h2 className="flex items-center gap-2 border-b border-[#ECECF2] bg-[#F7F7FA] px-4 py-3 text-[13px] font-bold text-[#17161F]">
          <Wallet set="curved" size={18} primaryColor="#2948FC" />
          {t('tarifs.historyTitle')}
        </h2>
        {history.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-[#8A8896]">{t('tarifs.historyEmpty')}</p>
        ) : (
          <ul className="divide-y divide-[#ECECF2]">
            {/* Date and amount only: a payment made before 2026-10-13 bought
                renders, not credits, so no « +N » figure is printed beside it. */}
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[#17161F]">
                    {t('tarifs.historyItem', { tier: t(TIER_NAME_KEY[h.tier]) })}
                  </div>
                  <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[#6B6878]">
                    {new Date(h.at).toLocaleDateString(intl)} · {h.amount.toLocaleString(intl)} FCFA
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppSurface>
  );
}
