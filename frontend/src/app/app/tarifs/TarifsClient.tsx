'use client';

// /app/tarifs — "Abonnement", inside the app.
//
// 2026-10-07 — rebuilt on Metrio's subscription page, as the owner asked
// (their screenshot of metrio /dashboard/subscription), blue in place of
// Metrio's blue:
//
//   1. A centred head: a small tinted pill, the title in black, one line.
//   2. "Solde actuel": a tinted bar with the renders left on the right.
//   3. A warning, Metrio's Alert, when there is nothing left to render with.
//   4. The three plans: name and volume, the price in FCFA with the dollar
//      figure under it, two ticks, the button. The featured one is outlined
//      blue with "Le plus choisi" centred on its top edge.
//   5. The dollar note, then "Historique": the account's paid orders.
//
// The dark summary card, the "included in every plan" list and the billing
// facts of the 2026-10-06 version are gone (owner).
import { useState } from 'react';
import { Danger, TickSquare, Wallet } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { PRICING_TIERS, type PricingTier, type PricingTierId } from '@/lib/pricing-tiers';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';

export interface PaymentRow {
  id: string;
  tier: PricingTierId;
  /** XOF, smallest unit (no decimals). */
  amount: number;
  /** ISO date the payment went through. */
  at: string;
}

const TIER_NAME_KEY: Record<PricingTierId, TranslationKey> = {
  decouverte: 'landing.pricingTierDecouverteName',
  standard: 'landing.pricingTierStandardName',
  pro: 'landing.pricingTierProName',
};

const GRADIENT = 'bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]';

function PlanCard({
  tier,
  current,
  loading,
  error,
  onSelect,
}: {
  tier: PricingTier;
  current: boolean;
  loading: boolean;
  error: string | null;
  onSelect: () => void;
}) {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const name = t(TIER_NAME_KEY[tier.id]);

  return (
    <div
      className={`relative flex flex-col justify-between rounded-[14px] p-4 shadow-[0_1px_2px_rgba(23,22,31,0.04)] min-[640px]:p-5 ${
        tier.featured
          ? 'border-[1.5px] border-[#2948FC] bg-white shadow-[0_8px_24px_rgba(41,72,252,0.12)]'
          : 'bg-[#F7F7FA]'
      }`}
    >
      {tier.featured && (
        <span
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-[0_1px_2px_rgba(23,22,31,0.12)] bg-[linear-gradient(135deg,#F34857_0%,#EF3E50_100%)]`}
        >
          {t('landing.pricingBadgeFeatured')}
        </span>
      )}
      <div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-extrabold text-[#17161F]">{name}</h3>
          {current && (
            <span className="rounded-md bg-[#EEF1FF] px-2 py-0.5 text-[10.5px] font-semibold text-[#1E36D6]">
              {t('tarifs.badgeCurrent')}
            </span>
          )}
        </div>
        <p className="mb-3 text-[11px] font-medium text-[#6B6878]">
          {t('tarifs.cardVolume', { count: tier.generationsPerMonth.toLocaleString(intl) })}
        </p>

        <div className="mb-0.5 text-[16px] font-bold text-[#17161F]">
          {tier.priceXof.toLocaleString(intl)} FCFA
        </div>
        <div className="mb-3 text-[14px] text-[#6B6878]">
          ≈ {locale === 'fr' ? `${tier.priceUsdDisplay} $ US` : `$${tier.priceUsdDisplay} USD`}
        </div>

        <div className="my-3 h-px bg-[#ECECF2]" />

        <ul className="mb-4 space-y-2 text-[11px] font-medium text-[#17161F]">
          {(['tarifs.checkEngines', 'tarifs.checkEditing'] as const).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <TickSquare set="curved" size={14} primaryColor="#2948FC" />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <button
          type="button"
          disabled={loading}
          onClick={onSelect}
          className={`mt-2 h-[38px] w-full rounded-xl text-[12px] font-bold shadow-[0_1px_2px_rgba(23,22,31,0.06)] transition-[opacity,border-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
            tier.featured
              ? `${GRADIENT} text-white hover:opacity-95`
              : 'bg-white text-[#17161F] hover:bg-[#EEF1FF] hover:text-[#2948FC]'
          }`}
        >
          {loading
            ? t('landing.pricingCtaLoading')
            : current
              ? t('tarifs.ctaRenew')
              : t('tarifs.ctaChoose')}
        </button>
        {error && <p className="mt-2 text-[11.5px] text-[#E5484D]">{error}</p>}
      </div>
    </div>
  );
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

  const { tier, quotaRemaining } = surface;
  const remaining = tier !== null && quotaRemaining !== null ? quotaRemaining : 0;
  const endDate = periodEndsAt
    ? new Date(periodEndsAt).toLocaleDateString(intl, { day: 'numeric', month: 'long' })
    : null;
  const renders = (n: number) =>
    t(n === 1 ? 'tarifs.rendersOne' : 'tarifs.rendersMany', { count: n.toLocaleString(intl) });

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
        <div className="flex-shrink-0 text-[14px] font-extrabold text-[#2948FC]">
          {renders(remaining)}
        </div>
      </div>

      {/* Metrio's Alert, warning variant. */}
      {remaining === 0 && (
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
          <PlanCard
            key={p.id}
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
            {history.map((h) => {
              const plan = PRICING_TIERS.find((p) => p.id === h.tier);
              return (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-[#17161F]">
                      {t('tarifs.historyItem', { tier: t(TIER_NAME_KEY[h.tier]) })}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-[#6B6878]">
                      {new Date(h.at).toLocaleDateString(intl)} · {h.amount.toLocaleString(intl)}{' '}
                      FCFA
                    </div>
                  </div>
                  {plan && (
                    <div className="flex-shrink-0 text-[12px] font-extrabold text-[#2948FC]">
                      +{renders(plan.generationsPerMonth)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppSurface>
  );
}
