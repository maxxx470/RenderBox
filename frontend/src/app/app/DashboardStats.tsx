'use client';

// The dashboard header that sits above the project grid on /app.
//
// Every figure here comes from the database on the server (see the page that
// renders this) — nothing is estimated, projected or padded. When a value
// cannot exist yet (no active plan), the card says so and offers the action
// that would create it, rather than showing a zero that looks like a failure.
import Link from 'next/link';
import { Folder, Image as ImageIcon, Chart, TimeCircle } from 'react-iconly';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import type { PricingTierId } from '@/lib/pricing-tiers';

export interface DashboardData {
  projectCount: number;
  renderCount: number;
  /** ISO date of the most recent render, or null when nothing has been generated. */
  lastActivityAt: string | null;
  tier: PricingTierId | null;
  /** Monthly allowance, null when no plan is active. */
  quotaMax: number | null;
  /** Generations left in the current period, null when no plan is active. */
  quotaRemaining: number | null;
  /** ISO date the current period ends, null when no plan is active. */
  periodEndsAt: string | null;
}

const TIER_LABEL_KEY = {
  decouverte: 'app.tierDecouverte',
  standard: 'app.tierStandard',
  pro: 'app.tierPro',
} as const;

// One accent per card so the row reads as three distinct facts rather than
// three copies of the same box. The three hues are the ones already used by
// the landing's audience tabs — violet, sky, amber — so nothing new enters
// the palette. Error red is deliberately absent: it means "something is
// wrong", never "this is the third card".
//
// Full literal class strings: Tailwind's scanner cannot see a class built by
// interpolating a colour value (see the JIT note in CLAUDE.md).
const ACCENTS = {
  violet: {
    frame: 'rounded-2xl border border-[#DEDEE8] bg-white p-4 shadow-[0_1px_3px_#17161F0A]',
    chip: 'mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[#DCDBFF] bg-[#EFECFF]',
    color: '#716FFF',
  },
  sky: {
    frame: 'rounded-2xl border border-[#DEDEE8] bg-white p-4 shadow-[0_1px_3px_#17161F0A]',
    chip: 'mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[#C7E7F7] bg-[#E6F4FC]',
    color: '#0EA5E9',
  },
  amber: {
    frame: 'rounded-2xl border border-[#DEDEE8] bg-white p-4 shadow-[0_1px_3px_#17161F0A]',
    chip: 'mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-[#F3E0BC] bg-[#FCF3E2]',
    color: '#E9A21B',
  },
} as const;

type AccentName = keyof typeof ACCENTS;

function StatCard({
  accent,
  icon,
  value,
  label,
}: {
  accent: AccentName;
  icon: (color: string) => React.ReactNode;
  value: string;
  label: string;
}) {
  const a = ACCENTS[accent];
  return (
    <div className={a.frame}>
      <div className={a.chip}>{icon(a.color)}</div>
      <div className="font-[family-name:var(--font-general-sans)] text-[22px] font-bold leading-none text-[#17161F]">
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-[#8A8896]">{label}</div>
    </div>
  );
}

export function DashboardStats({ data }: { data: DashboardData }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';

  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short' });

  const used =
    data.quotaMax !== null && data.quotaRemaining !== null
      ? data.quotaMax - data.quotaRemaining
      : 0;
  // Guarded against a max of 0 so a future free tier can't divide by zero.
  const pct = data.quotaMax ? Math.min(100, Math.round((used / data.quotaMax) * 100)) : 0;

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 min-[860px]:grid-cols-[1.4fr_1fr_1fr_1fr]">
      {/* Quota — the one card that changes behaviour rather than just its
          number, so it leads and takes the widest column. */}
      <div className="rounded-2xl border border-[#DEDEE8] bg-[#FBFBFD] p-4 shadow-[0_1px_3px_#17161F0A]">
        {data.tier && data.quotaMax !== null && data.quotaRemaining !== null ? (
          <>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#8A8896]">{t('dashboard.quotaLabel')}</span>
              <span className="rounded-full bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-2.5 py-1 text-[10.5px] font-semibold text-white">
                {t(TIER_LABEL_KEY[data.tier])}
              </span>
            </div>
            <div className="font-[family-name:var(--font-general-sans)] text-[22px] font-bold leading-none text-[#17161F]">
              {data.quotaRemaining.toLocaleString(intl)}
              <span className="ml-1.5 text-[13px] font-medium text-[#8A8896]">
                {t('dashboard.quotaOf', { max: data.quotaMax.toLocaleString(intl) })}
              </span>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ECECF2]"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('dashboard.quotaLabel')}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#6E6BFF] to-[#A855F7]"
                style={{ width: `${pct}%` }}
              />
            </div>
            {data.periodEndsAt && (
              <div className="mt-2.5 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
                {t('dashboard.renewsOn', { date: shortDate(data.periodEndsAt) })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-1.5 text-[12px] text-[#8A8896]">{t('dashboard.quotaLabel')}</div>
            <div className="font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
              {t('dashboard.noTierTitle')}
            </div>
            <p className="mt-1.5 text-[12px] leading-[1.5] text-[#8A8896]">
              {t('dashboard.noTierBody')}
            </p>
            <Link
              href="/#tarifs"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3.5 py-2 text-[12.5px] font-semibold text-white"
            >
              {t('dashboard.noTierCta')}
            </Link>
          </>
        )}
      </div>

      <StatCard
        accent="violet"
        icon={(c) => <Folder set="light" size={16} primaryColor={c} />}
        value={data.projectCount.toLocaleString(intl)}
        label={t('dashboard.statProjects')}
      />
      <StatCard
        accent="sky"
        icon={(c) => <ImageIcon set="light" size={16} primaryColor={c} />}
        value={data.renderCount.toLocaleString(intl)}
        label={t('dashboard.statRenders')}
      />
      <StatCard
        accent="amber"
        icon={(c) =>
          data.lastActivityAt ? (
            <TimeCircle set="light" size={16} primaryColor={c} />
          ) : (
            <Chart set="light" size={16} primaryColor={c} />
          )
        }
        value={data.lastActivityAt ? shortDate(data.lastActivityAt) : '—'}
        label={t('dashboard.statLastActivity')}
      />
    </div>
  );
}
