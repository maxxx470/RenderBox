'use client';

import { useState } from 'react';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { PRICING_TIERS, type PricingTierId } from '@/lib/pricing-tiers';
import { PricingCard } from '@/app/PricingCard';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';

const BAND = 'bg-[linear-gradient(135deg,#15803D_0%,#166534_55%,#14532D_100%)]';

const TIER_NAME_KEY: Record<
  PricingTierId,
  | 'landing.pricingTierDecouverteName'
  | 'landing.pricingTierStandardName'
  | 'landing.pricingTierProName'
> = {
  decouverte: 'landing.pricingTierDecouverteName',
  standard: 'landing.pricingTierStandardName',
  pro: 'landing.pricingTierProName',
};

export function TarifsClient({ surface, demo }: { surface: AppSurfaceProps; demo: boolean }) {
  const t = useTranslations();
  const { toast } = useToast();
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

  return (
    <AppSurface {...surface} title={t('tarifs.title')} subtitle={t('landing.pricingSubtitle')}>
      <p className="mb-5 text-[13.5px] text-[#3D3B49]">
        {surface.tier ? (
          <>
            {t('tarifs.current')}{' '}
            <span className="rounded-full bg-[#E8F5EC] px-2.5 py-0.5 text-[12.5px] font-semibold text-[#166534]">
              {t(TIER_NAME_KEY[surface.tier])}
            </span>
            {surface.quotaRemaining !== null && surface.quotaMax !== null && (
              <span className="ml-2 font-[family-name:var(--font-mono)] text-[12px] text-[#5F6B64]">
                {surface.quotaRemaining}/{surface.quotaMax}
              </span>
            )}
          </>
        ) : (
          t('tarifs.none')
        )}
      </p>

      <div className={`rounded-[28px] ${BAND} p-5 min-[640px]:p-8`}>
        <div className="grid grid-cols-1 items-stretch gap-5 min-[1100px]:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PricingCard
              key={tier.id}
              tier={tier}
              onSelect={() => void select(tier.id)}
              loading={checkoutTier === tier.id}
              error={errors[tier.id]}
            />
          ))}
        </div>
      </div>
    </AppSurface>
  );
}
