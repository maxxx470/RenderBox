'use client';

// THE plan card — one component for the landing's blue band and the in-app
// Abonnement page (/app/tarifs), so both always show the same offer (owner,
// 2026-10-13). Everything it prints comes from lib/pricing-tiers.ts: the
// price, the credits, the list of what a plan includes (PLAN_FEATURES); the
// dictionaries only hold the words around the figures.
//
// The two pages differ only in the ground the card sits on (`tone`):
//   band   on the landing's blue band — plain tiers are white cards, the
//          featured one is outlined glass, the band showing through;
//   page   in the app, on white — plain tiers on the soft grey, the featured
//          one white and lifted; the account's current plan is outlined blue
//          with a « Formule actuelle » badge.
import type { ReactNode } from 'react';
import { TickSquare } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { PLAN_FEATURES, type PricingTier, type PricingTierId } from '@/lib/pricing-tiers';
import { imageRange } from '@/lib/provider-cost';
import { localPrice } from '@/lib/local-currency';
import { useVisitorCountry } from '@/lib/visitor-country';
import { useEurRates } from '@/lib/fx-rates';

const GRADIENT = 'bg-[linear-gradient(135deg,#435CFE_0%,#2948FC_48%,#1E36D6_100%)]';
const MONO = 'font-[family-name:var(--font-mono)]';

export const TIER_NAME_KEY: Record<PricingTierId, TranslationKey> = {
  decouverte: 'landing.pricingTierDecouverteName',
  standard: 'landing.pricingTierStandardName',
  pro: 'landing.pricingTierProName',
};

function CheckItem({ children, light }: { children: ReactNode; light: boolean }) {
  return (
    <li
      className={`flex items-start gap-2.5 text-[13.5px] ${light ? 'text-white' : 'text-[#3D3B49]'}`}
    >
      <span
        className={`mt-px flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center rounded-md ${
          light ? 'bg-white' : 'bg-[#FFE4E7]'
        }`}
      >
        <TickSquare set="curved" size={11} primaryColor={light ? '#2948FC' : '#EF3E50'} />
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
  tone = 'band',
  current = false,
}: {
  tier: PricingTier;
  onSelect: () => void;
  loading: boolean;
  error: string | null;
  tone?: 'band' | 'page';
  /** The account's active plan (the app only). */
  current?: boolean;
}) {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const name = t(TIER_NAME_KEY[tier.id]);
  // The price in the visitor's currency where we know it (« ≈ 9,15 € »),
  // the dollar line otherwise; payment is in FCFA either way.
  const local = localPrice(tier.priceXof, useVisitorCountry(), intl, useEurRates());
  // White type only on the featured card of the blue band.
  const light = tone === 'band' && tier.featured;
  const muted = light ? 'text-white/80' : 'text-[#6B6878]';

  const frame =
    tone === 'band'
      ? tier.featured
        ? 'border-2 border-white/45 bg-white/10 text-white backdrop-blur-sm'
        : 'bg-white text-[#17161F] shadow-[0_24px_48px_-28px_rgba(0,0,0,0.45)]'
      : `${tier.featured ? 'bg-white shadow-[0_8px_24px_rgba(41,72,252,0.12)]' : 'bg-[#F7F7FA]'} text-[#17161F] ${
          current ? 'ring-[1.5px] ring-[#2948FC]' : ''
        }`;

  return (
    <div
      className={`relative flex h-full flex-col gap-5 rounded-[24px] p-6 transition-transform duration-[250ms] ease-out motion-safe:hover:-translate-y-[3px] min-[640px]:p-7 ${frame}`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-[family-name:var(--font-display)] text-[15px] font-semibold">
            {name}
          </h3>
          {tier.featured ? (
            <span className="rounded-md bg-[#F34857] px-2.5 py-0.5 text-[11px] font-semibold text-white">
              {t('landing.pricingBadgeFeatured')}
            </span>
          ) : null}
          {current ? (
            <span className="rounded-md bg-[#EEF1FF] px-2 py-0.5 text-[11px] font-semibold text-[#1E36D6]">
              {t('tarifs.badgeCurrent')}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-[28px] font-bold tracking-[-0.5px]">
            {tier.priceXof.toLocaleString(intl)} FCFA
          </span>
          <span className={`text-[12px] ${muted}`}>{t('landing.pricingPeriod')}</span>
        </div>
        <div className={`text-[12px] ${MONO} ${muted}`}>
          {local
            ? t('landing.pricingLocal', { amount: local })
            : t('landing.pricingUsd', { amount: String(tier.priceUsdDisplay) })}
        </div>
      </div>
      <ul className="flex flex-col gap-2.5">
        <CheckItem light={light}>
          <span className={`font-semibold ${MONO}`}>
            {t('landing.pricingFeatureCredits', {
              count: tier.creditsPerMonth.toLocaleString(intl),
            })}
          </span>
        </CheckItem>
        <CheckItem light={light}>
          {t('landing.pricingFeatureImages', {
            min: imageRange(tier.creditsPerMonth).min.toLocaleString(intl),
            max: imageRange(tier.creditsPerMonth).max.toLocaleString(intl),
          })}
        </CheckItem>
        {PLAN_FEATURES.map((k) => (
          <CheckItem key={k} light={light}>
            {t(k)}
          </CheckItem>
        ))}
      </ul>
      <button
        type="button"
        disabled={loading}
        onClick={onSelect}
        className={`mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-60 ${
          light ? 'bg-white text-[#1E36D6]' : `${GRADIENT} text-white`
        }`}
      >
        {loading
          ? t('landing.pricingCtaLoading')
          : current
            ? t('tarifs.ctaRenew')
            : t('landing.pricingCta', { tier: name })}
      </button>
      {/* Error text on white, never on the band: #E5484D on blue is unreadable. */}
      {error ? (
        <p className="rounded-xl bg-white px-3 py-2 text-[12px] text-[#E5484D]">{error}</p>
      ) : null}
    </div>
  );
}
