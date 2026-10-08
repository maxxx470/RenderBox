'use client';

// The app's header bar, after Metrio's topbar (src/layouts/AppLayout.tsx):
// full width above the rail, 64px, white with a hairline under it.
//
//   left   the brand, a divider, the page title (Poppins, like Metrio's)
//   right  notifications · FR/EN · the account · the renders left
//
// The quota used to be a pill at the foot of the rail; the owner moved it
// here (2026-10-06), where Metrio shows its "pages restantes" badge.
//
// 2026-10-08 — from 900px the header is a floating white card beside the rail
// card, and drops what the rail now carries: the logo, the settings gear and
// the account. Below 900px (no rail) it keeps the logo and the account.
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
    <header className="relative z-50 flex h-16 flex-shrink-0 items-center justify-between gap-2 bg-white px-3 shadow-[0_1px_2px_rgba(23,22,31,0.06)] min-[640px]:px-6 min-[900px]:mx-3 min-[900px]:mt-3 min-[900px]:rounded-[20px] min-[900px]:shadow-[0_1px_2px_rgba(23,22,31,0.04)]">
      <div className="flex min-w-0 items-center gap-2 min-[480px]:gap-3 min-[640px]:gap-4">
        <Link
          href="/app"
          aria-label="RenderBox"
          className="flex flex-shrink-0 items-center gap-2.5 min-[900px]:hidden"
        >
          <BrandMark size="md" />
        </Link>
        <div className="flex h-6 min-w-0 items-center min-[480px]:border-l min-[480px]:border-[#ECECF2] min-[480px]:pl-3 min-[640px]:pl-4 min-[900px]:border-l-0 min-[900px]:pl-0">
          <h1 className="truncate font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F] min-[640px]:text-[19px]">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 min-[480px]:gap-1.5 min-[640px]:gap-2.5">
        <NotificationsBell />

        <LanguageInlineSwitch className="rounded-lg bg-[#F2F2F5] px-2 py-1.5 min-[480px]:px-2.5" />

        <span
          aria-hidden
          className="mx-0.5 hidden h-6 w-px bg-[#ECECF2] min-[640px]:block min-[900px]:hidden"
        />

        {/* The account, as Metrio draws it: initials on a grey disc in the
            brand colour, then the name and the plan. Opens Paramètres. */}
        <Link
          href="/parametres"
          title={accountLabel}
          aria-label={accountLabel}
          className="hidden items-center gap-2.5 rounded-lg py-1 pl-1 pr-1 transition-colors hover:bg-[#F7F7FA] min-[480px]:flex min-[900px]:hidden"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#F7F7FA] text-[13px] font-semibold text-[#2948FC]">
            {initial}
          </span>
          <span className="hidden max-w-[180px] flex-col text-left leading-tight min-[1100px]:flex">
            <span className="truncate text-[13.5px] font-medium text-[#17161F]">
              {accountLabel}
            </span>
            <span className="text-[11.5px] text-[#6B6878]">
              {tier ? t(TIER_LABEL_KEY[tier]) : t('app.genHomeChooseTier')}
            </span>
          </span>
        </Link>

        {/* Renders left this month — Metrio's "pages restantes" badge, now
            on the blue tint (#EEF1FF / #1E36D6, 7.3:1) since the 2026-10-08 move to
            blue and red; the account button beside it keeps its pale red. */}
        <Link
          href="/app/tarifs"
          title={quotaLabel}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF1FF] px-2.5 py-1.5 text-[12px] font-semibold text-[#1E36D6] transition-colors hover:bg-[#E2E7FF] max-[479px]:px-2 min-[640px]:px-3"
        >
          <span className="min-[640px]:hidden">
            <RailIcon name="pricing" color="#2948FC" />
          </span>
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
