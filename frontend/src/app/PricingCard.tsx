'use client';

// One pricing tier card, shared by the landing's green band and the in-app
// /app/tarifs page so both always show the same offer. Designed for the green
// band: plain tiers are white cards, the featured one is outlined glass.
import type { ReactNode } from 'react';
import { TickSquare } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { PricingTier } from '@/lib/pricing-tiers';

const GRADIENT = 'bg-[linear-gradient(135deg,#16A34A_0%,#15803D_48%,#166534_100%)]';
const MONO = 'font-[family-name:var(--font-mono)]';

export function CheckItem({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <li
      className={`flex items-start gap-2.5 text-[13.5px] ${light ? 'text-white' : 'text-[#3D3B49]'}`}
    >
      <span
        className={`mt-px flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-full ${
          light ? 'bg-white' : 'bg-[#16A34A]'
        }`}
      >
        <TickSquare set="light" size={11} primaryColor={light ? '#15803D' : '#ffffff'} />
      </span>
      {children}
    </li>
  );
}

export function PricingCard({
  tier,
  onSelect,
  loading,
  error,
}: {
  tier: PricingTier;
  onSelect: () => void;
  loading: boolean;
  error: string | null;
}) {
  const t = useTranslations();
  const name =
    tier.id === 'decouverte'
      ? t('landing.pricingTierDecouverteName')
      : tier.id === 'standard'
        ? t('landing.pricingTierStandardName')
        : t('landing.pricingTierProName');

  return (
    // Sits on the green pricing band. Plain tiers are white cards; the
    // featured one is the reference's outlined glass card — the band showing
    // through is what sets it apart, not a louder colour.
    <div
      className={`relative flex h-full flex-col gap-5 rounded-[24px] p-7 transition-transform duration-[250ms] ease-out motion-safe:hover:-translate-y-[3px] ${
        tier.featured
          ? 'border-2 border-white/45 bg-white/10 text-white backdrop-blur-sm'
          : 'bg-white text-[#17161F] shadow-[0_24px_48px_-28px_rgba(0,0,0,0.45)]'
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold">{name}</h3>
          {tier.featured ? (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#166534]">
              {t('landing.pricingBadgeFeatured')}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-[28px] font-bold tracking-[-0.5px]">
            {tier.priceXof.toLocaleString('fr-FR')} FCFA
          </span>
          <span className={`text-[12px] ${tier.featured ? 'text-white/80' : 'text-[#5F6B64]'}`}>
            {t('landing.pricingPeriod')}
          </span>
        </div>
        <div
          className={`text-[12px] ${MONO} ${tier.featured ? 'text-white/80' : 'text-[#5F6B64]'}`}
        >
          ~{tier.priceUsdDisplay} $
        </div>
      </div>
      {/* One line, not four.
          The other three — both engines, the five presets, advanced editing —
          are IDENTICAL on all three tiers, so printing them on each card
          repeated six lines of text that carry no decision, and buried the one
          line that does. The section's own subtitle already says "same
          engines, same presets, only the monthly quota changes", and the card
          then spent most of its height contradicting that by listing them
          anyway. They are stated once, under the grid. */}
      <ul className="flex flex-col gap-2.5">
        <CheckItem light={tier.featured}>
          <span className={`font-semibold ${MONO}`}>
            {t('landing.pricingFeatureQuota', { count: tier.generationsPerMonth })}
          </span>
        </CheckItem>
        <CheckItem light={tier.featured}>{t('landing.pricingFeatureEngines')}</CheckItem>
        <CheckItem light={tier.featured}>{t('landing.pricingFeaturePresets')}</CheckItem>
        <CheckItem light={tier.featured}>{t('landing.pricingFeatureEditing')}</CheckItem>
        <CheckItem light={tier.featured}>{t('landing.pricingFeatureAssistant')}</CheckItem>
      </ul>
      <button
        type="button"
        disabled={loading}
        onClick={onSelect}
        className={`mt-auto inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-60 ${
          tier.featured ? 'bg-white text-[#166534]' : `${GRADIENT} text-white`
        }`}
      >
        {loading ? t('landing.pricingCtaLoading') : t('landing.pricingCta', { tier: name })}
      </button>
      {/* Error text on white, never on the band: #E5484D on green is unreadable. */}
      {error ? (
        <p className="rounded-xl bg-white px-3 py-2 text-[12px] text-[#E5484D]">{error}</p>
      ) : null}
    </div>
  );
}
