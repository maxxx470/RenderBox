'use client';

// The app's header bar, after Metrio's topbar (src/layouts/AppLayout.tsx):
// full width above the rail, 64px, white with a hairline under it.
//
//   left   the brand, a divider, the page title (Poppins, like Metrio's)
//   right  notifications · FR/EN · the account · the renders left
//
// The quota used to be a pill at the foot of the rail; the owner moved it
// here (2026-10-06), where Metrio shows its "pages restantes" badge.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { BrandMark } from '@/components/BrandMark';
import { isPlaceholderAccount } from '@/lib/account-label';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { NotificationsBell } from './NotificationsBell';
import { RailIcon } from './RailIcon';

const TIER_LABEL_KEY: Record<
  PricingTierId,
  'app.tierDecouverte' | 'app.tierStandard' | 'app.tierPro'
> = {
  decouverte: 'app.tierDecouverte',
  standard: 'app.tierStandard',
  pro: 'app.tierPro',
};

export interface AppTopbarProps {
  title: string;
  tier: PricingTierId | null;
  quotaMax: number | null;
  quotaRemaining: number | null;
  userEmail: string;
}

export function AppTopbar({ title, tier, quotaMax, quotaRemaining, userEmail }: AppTopbarProps) {
  const t = useTranslations();
  const placeholder = isPlaceholderAccount(userEmail);
  const accountLabel = placeholder ? t('app.freeAccessAccount') : userEmail;
  const initial = (placeholder ? accountLabel : userEmail).trim().charAt(0).toUpperCase() || '?';
  const hasQuota = tier !== null && quotaMax !== null && quotaRemaining !== null && quotaMax > 0;
  const quotaLabel = hasQuota
    ? t('app.topbarQuota', { remaining: String(quotaRemaining), max: String(quotaMax) })
    : t('app.genHomeChooseTier');

  return (
    <header className="relative z-50 flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b border-[#ECECF2] bg-white px-3 shadow-[0_1px_2px_rgba(23,22,31,0.04)] min-[640px]:px-6">
      <div className="flex min-w-0 items-center gap-3 min-[640px]:gap-4">
        <Link
          href="/app"
          aria-label="RenderBox"
          className="flex flex-shrink-0 items-center gap-2.5"
        >
          <BrandMark size="md" />
          <span className="hidden font-[family-name:var(--font-display)] text-[18px] font-bold text-[#17161F] min-[900px]:inline">
            RenderBox
          </span>
        </Link>
        <div className="flex h-6 min-w-0 items-center border-l border-[#ECECF2] pl-3 min-[640px]:pl-4">
          <h1 className="truncate font-[family-name:var(--font-display)] text-[16px] font-semibold text-[#17161F] min-[640px]:text-[19px]">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 min-[640px]:gap-2.5">
        <NotificationsBell />

        <LanguageInlineSwitch className="rounded-full border border-[#ECECF2] px-2.5 py-1.5" />

        <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-[#ECECF2] min-[640px]:block" />

        {/* The account: Metrio's avatar + name + role, here the address and
            the plan. Opens Paramètres. */}
        <Link
          href="/parametres"
          title={accountLabel}
          aria-label={accountLabel}
          className="hidden items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-[#F7F7FA] min-[480px]:flex min-[1100px]:pr-3"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#CDEBD6] bg-[#E8F5EC] text-[13px] font-semibold text-[#166534]">
            {initial}
          </span>
          <span className="hidden max-w-[180px] flex-col text-left leading-tight min-[1100px]:flex">
            <span className="truncate text-[13.5px] font-medium text-[#17161F]">
              {accountLabel}
            </span>
            <span className="text-[11.5px] text-[#5F6B64]">
              {tier ? t(TIER_LABEL_KEY[tier]) : t('app.genHomeChooseTier')}
            </span>
          </span>
        </Link>

        {/* Renders left this month — Metrio's "pages restantes" badge. */}
        <Link
          href="/app/tarifs"
          title={quotaLabel}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#CDEBD6] bg-[#E8F5EC] px-2.5 py-1.5 text-[12px] font-semibold text-[#166534] transition-colors hover:border-[#16A34A] min-[640px]:px-3"
        >
          <RailIcon name="pricing" />
          {/* On a phone, just the number: the bar has no room for the words. */}
          <span className="whitespace-nowrap min-[640px]:hidden">
            {hasQuota ? quotaRemaining : quotaLabel}
          </span>
          <span className="hidden whitespace-nowrap min-[640px]:inline">{quotaLabel}</span>
        </Link>
      </div>
    </header>
  );
}
