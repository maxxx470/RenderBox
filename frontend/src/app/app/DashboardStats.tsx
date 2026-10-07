'use client';

// The four figure cards at the top of the dashboard (/app).
//
// 2026-10-07 — rebuilt on Metrio's StatCard (src/components/ui/StatCard.tsx),
// as the owner asked: a soft tinted card, the icon in a small tile top-left,
// the label in uppercase top-right, the figure large bottom-left with one
// line under it, and a small graphic bottom-right (ring, bars or curve).
// The tints keep the owner's earlier rule — no green among these four: blue
// for projects, red for renders, yellow for activity, and Metrio's own
// cream-amber for what is left of the plan.
//
// Every figure comes from the database on the server (projects-data.ts) —
// nothing is estimated, projected or padded.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Folder, Image as ImageIcon, TimeCircle, Star } from 'react-iconly';
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

interface Tone {
  /** Card ground. */
  bg: string;
  /** Icon, graphic. */
  ink: string;
  /** Icon tile ground (the ink at 15%). */
  tile: string;
  /** Uppercase label — the tone's dark end, ≥ 6:1 on its ground. */
  label: string;
}

const TONES = {
  blue: { bg: '#EEF3FF', ink: '#2563EB', tile: 'rgba(37,99,235,0.15)', label: '#1E3A8A' },
  red: { bg: '#FDEEEE', ink: '#DC2626', tile: 'rgba(220,38,38,0.13)', label: '#991B1B' },
  yellow: { bg: '#FEF9E1', ink: '#CA8A04', tile: 'rgba(202,138,4,0.15)', label: '#854D0E' },
  amber: { bg: '#FDF3E2', ink: '#B7791F', tile: 'rgba(183,121,31,0.15)', label: '#8A5B15' },
} satisfies Record<string, Tone>;

type Graphic = { kind: 'ring'; value: number } | { kind: 'bars' } | { kind: 'curve' };

function MiniGraphic({ graphic, color }: { graphic: Graphic; color: string }) {
  if (graphic.kind === 'ring') {
    const r = 18;
    const c = 2 * Math.PI * r;
    return (
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden className="flex-shrink-0">
        <circle cx="24" cy="24" r={r} stroke={color} strokeWidth="4.5" fill="none" opacity="0.15" />
        <circle
          cx="24"
          cy="24"
          r={r}
          stroke={color}
          strokeWidth="4.5"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c - (graphic.value / 100) * c}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
        />
      </svg>
    );
  }
  if (graphic.kind === 'bars') {
    const heights = [10, 16, 12, 22, 14, 20, 28];
    return (
      <svg width="48" height="32" viewBox="0 0 48 32" aria-hidden className="flex-shrink-0">
        {heights.map((h, i) => (
          <rect
            key={i}
            x={2 + i * 7}
            y={32 - h}
            width="4"
            height={h}
            rx="1.5"
            fill={color}
            opacity={i === heights.length - 1 ? 1 : 0.3}
          />
        ))}
      </svg>
    );
  }
  return (
    <svg
      width="64"
      height="32"
      viewBox="0 0 64 32"
      aria-hidden
      className="flex-shrink-0 overflow-visible"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="2,26 12,22 22,14 32,18 42,8 52,12 62,4"
        opacity="0.8"
      />
      <circle cx="62" cy="4" r="3.5" fill={color} stroke="#ffffff" strokeWidth="1.5" />
    </svg>
  );
}

function StatCard({
  tone,
  icon,
  label,
  value,
  subtext,
  graphic,
}: {
  tone: Tone;
  icon: (color: string) => ReactNode;
  label: string;
  value: string;
  subtext: string;
  graphic: Graphic;
}) {
  return (
    <div
      style={{ backgroundColor: tone.bg }}
      className="relative flex min-h-[120px] flex-col justify-between overflow-hidden rounded-[20px] border border-[#ECECF2] p-4 shadow-[0_1px_3px_rgba(23,22,31,0.04)] min-[640px]:p-6"
    >
      <div className="flex w-full items-center justify-between gap-1">
        {/* A rounded square, as in Metrio's card: a tile, not a button. */}
        <span
          style={{ backgroundColor: tone.tile }}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg min-[640px]:h-8 min-[640px]:w-8"
        >
          {icon(tone.ink)}
        </span>
        <span
          style={{ color: tone.label }}
          className="truncate text-right text-[9.5px] font-bold uppercase tracking-wider min-[640px]:text-[11px]"
        >
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex w-full items-end justify-between gap-1">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-[family-name:var(--font-display)] text-[20px] font-black leading-tight tracking-tight text-[#17161F] min-[640px]:text-[24px] min-[900px]:text-[28px]">
            {value}
          </span>
          <span className="truncate text-[10px] font-medium leading-normal text-[#4B4A57] min-[640px]:text-[11px]">
            {subtext}
          </span>
        </div>
        <div className="hidden h-10 flex-shrink-0 items-center justify-center min-[400px]:flex min-[640px]:h-12">
          <MiniGraphic graphic={graphic} color={tone.ink} />
        </div>
      </div>
    </div>
  );
}

export function DashboardStats({ data }: { data: DashboardData }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';

  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short' });

  const hasPlan = data.tier !== null && data.quotaMax !== null && data.quotaRemaining !== null;
  const used = hasPlan ? data.quotaMax! - data.quotaRemaining! : 0;
  // Guarded against a max of 0 so a future free tier can't divide by zero.
  const pct =
    hasPlan && data.quotaMax ? Math.min(100, Math.round((used / data.quotaMax) * 100)) : 0;

  return (
    <div className="grid grid-cols-2 gap-2.5 min-[640px]:gap-3.5 min-[1000px]:grid-cols-4">
      <StatCard
        tone={TONES.blue}
        icon={(c) => <Folder set="light" size={16} primaryColor={c} />}
        label={t('dashboard.cardProjectsLabel')}
        value={data.projectCount.toLocaleString(intl)}
        subtext={t('dashboard.cardProjectsSub')}
        graphic={{ kind: 'ring', value: Math.min(100, data.projectCount * 10) }}
      />
      <StatCard
        tone={TONES.red}
        icon={(c) => <ImageIcon set="light" size={16} primaryColor={c} />}
        label={t('dashboard.statRenders')}
        value={data.renderCount.toLocaleString(intl)}
        subtext={t('dashboard.cardRendersSub')}
        graphic={{ kind: 'bars' }}
      />
      <StatCard
        tone={TONES.yellow}
        icon={(c) => <TimeCircle set="light" size={16} primaryColor={c} />}
        label={t('dashboard.statLastActivity')}
        value={data.lastActivityAt ? shortDate(data.lastActivityAt) : '—'}
        subtext={
          data.lastActivityAt ? t('dashboard.cardActivitySub') : t('dashboard.cardActivityNone')
        }
        graphic={{ kind: 'curve' }}
      />
      {/* What is left of the plan — Metrio's "pages restantes" card. It opens
          the subscription page, where the plan is changed or renewed. */}
      <Link
        href="/app/tarifs"
        className="rounded-[20px] transition-transform hover:-translate-y-0.5"
      >
        <StatCard
          tone={TONES.amber}
          icon={(c) => <Star set="light" size={16} primaryColor={c} />}
          label={t('dashboard.cardQuotaLabel')}
          value={hasPlan ? data.quotaRemaining!.toLocaleString(intl) : '0'}
          subtext={
            hasPlan
              ? data.periodEndsAt
                ? `${t('dashboard.quotaOf', { max: data.quotaMax!.toLocaleString(intl) })} · ${t(
                    'dashboard.renewsOn',
                    { date: shortDate(data.periodEndsAt) },
                  )}`
                : t('dashboard.quotaOf', { max: data.quotaMax!.toLocaleString(intl) })
              : t('dashboard.noTierTitle')
          }
          graphic={{ kind: 'ring', value: 100 - pct }}
        />
      </Link>
    </div>
  );
}
