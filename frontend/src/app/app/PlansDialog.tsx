'use client';

// « Choisissez une formule » over the page (owner, 2026-10-15: the user sees
// the whole interface and the command bar; only when he launches a render
// without a plan or without enough credits does a small page open with the
// plans, so he just picks one). The same three PricingCard as the landing and
// /app/tarifs, the same checkout (POST /api/payments/checkout → Maketou).
//
// Opened through the app chrome (`useAppChrome().openPlans(reason)`), from
// the image generator, a project and the Améliorer page.
import { useEffect, useState } from 'react';
import { CloseSquare } from 'react-iconly';
import { api } from '@/lib/api';
import { PRICING_TIERS, type PricingTierId } from '@/lib/pricing-tiers';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { useToast } from '@/contexts/ToastContext';
import { PricingCard } from '../PricingCard';

export type PlansReason = 'noTier' | 'noCredits';
/** What the refused request cost and what the account had (402). */
export interface PlansDetail {
  cost: number;
  balance: number | null;
}

export function PlansDialog({
  reason,
  detail,
  currentTier,
  demo,
  onClose,
}: {
  reason: PlansReason;
  detail?: PlansDetail | undefined;
  currentTier: PricingTierId | null;
  /** Free-access mode: no real account to charge (see TarifsClient). */
  demo: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [checkoutTier, setCheckoutTier] = useState<PricingTierId | null>(null);
  const [errors, setErrors] = useState<Record<PricingTierId, string | null>>({
    decouverte: null,
    standard: null,
    pro: null,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function select(tier: PricingTierId) {
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plans-title"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#17161F]/45 backdrop-blur-[2px] min-[640px]:items-center min-[640px]:p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rb-pop-up flex max-h-[92dvh] w-full max-w-[1000px] flex-col overflow-hidden rounded-t-[24px] bg-white min-[640px]:rounded-[24px]">
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 min-[640px]:px-7 min-[640px]:pt-6">
          <div className="min-w-0">
            <h2
              id="plans-title"
              className="font-[family-name:var(--font-display)] text-[20px] font-semibold text-[#17161F] min-[640px]:text-[22px]"
            >
              {t('plans.title')}
            </h2>
            <p className="mt-1 text-[13.5px] text-[#6B6878]">
              {t(reason === 'noTier' ? 'plans.reasonNoTier' : 'plans.reasonNoCredits')}
            </p>
            {reason === 'noCredits' && detail ? (
              <p className="mt-1 font-[family-name:var(--font-mono)] text-[12.5px] font-medium text-[#C21F33]">
                {t('plans.costLine', {
                  cost: detail.cost.toLocaleString(),
                  balance: (detail.balance ?? 0).toLocaleString(),
                })}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('plans.close')}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F2F2F5] transition-colors hover:bg-[#E9E9EE]"
          >
            <CloseSquare set="curved" size={18} primaryColor="#3D3B49" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-2 min-[640px]:px-7 min-[640px]:pb-7">
          <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-3 min-[900px]:gap-4">
            {PRICING_TIERS.map((p) => (
              <PricingCard
                key={p.id}
                tone="page"
                tier={p}
                current={p.id === currentTier}
                loading={checkoutTier === p.id}
                error={errors[p.id]}
                onSelect={() => void select(p.id)}
              />
            ))}
          </div>
          <p className="mt-3 text-[10.5px] text-[#8A8896]">{t('tarifs.usdNote')}</p>
        </div>
      </div>
    </div>
  );
}
