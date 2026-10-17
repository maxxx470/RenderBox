'use client';

// /admin — the back-office overview (2026-10-15, owner: « crée l'espace
// admin »): four figures (users, active plans, renders this month, revenue
// this month), the revenue in detail (today, week, month, year — 2026-10-17), the sign-ups of the last 30 days, the renders per engine, what
// the onboarding says (professions, countries, how they heard), the latest
// accounts. Data: GET /api/admin/insights (lib/server/admin/insights.ts).
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { ENGINE_COLORS, ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { TIER_NAME_KEY } from '../PricingCard';
import type { PricingTierId } from '@/lib/pricing-tiers';

interface Count {
  key: string;
  count: number;
}
interface Insights {
  users: { total: number; new7d: number; new30d: number; onboarded: number };
  activePlans: Count[];
  renders: { month: number; total: number; byEngineMonth: Count[] };
  revenue: {
    todayXof: number;
    weekXof: number;
    monthXof: number;
    yearXof: number;
    totalXof: number;
    paidOrdersToday: number;
    paidOrdersWeek: number;
    paidOrdersMonth: number;
    paidOrdersYear: number;
  };
  creditsLeft: number;
  signups30d: Count[];
  professions: Count[];
  countries: Count[];
  referrals: Count[];
  recentUsers: {
    id: string;
    name: string | null;
    email: string;
    profession: string | null;
    country: string | null;
    currentTier: string | null;
    createdAt: string;
  }[];
}

export default function AdminOverviewPage() {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const num = (n: number) => n.toLocaleString(intl);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Insights>('/api/admin/insights')
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // A key of the onboarding lists, in words; free text (countries) as typed.
  const label = (prefix: string, key: string) => {
    const k = `${prefix}${key}` as TranslationKey;
    const s = t(k);
    return s === k ? key : s;
  };
  const tierName = (k: string) => (k in TIER_NAME_KEY ? t(TIER_NAME_KEY[k as PricingTierId]) : k);

  if (error) return <p className="text-sm text-[#B8710B]">{t('admin.overview.loadError')}</p>;

  const plansTotal = data?.activePlans.reduce((s, p) => s + p.count, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-[#6B6878]">{t('admin.overview.subtitle')}</p>

      <div className="grid grid-cols-2 gap-3 min-[1100px]:grid-cols-4">
        <Figure
          label={t('admin.ov.users')}
          value={data ? num(data.users.total) : '—'}
          note={data ? t('admin.ov.usersNote', { n: num(data.users.new7d) }) : ''}
        />
        <Figure
          label={t('admin.ov.plans')}
          value={data ? num(plansTotal) : '—'}
          note={
            data
              ? data.activePlans.map((p) => `${tierName(p.key)} ${num(p.count)}`).join(' · ') ||
                t('admin.ov.none')
              : ''
          }
        />
        <Figure
          label={t('admin.ov.renders')}
          value={data ? num(data.renders.month) : '—'}
          note={data ? t('admin.ov.rendersNote', { n: num(data.renders.total) }) : ''}
        />
        <Figure
          label={t('admin.ov.revenue')}
          value={data ? `${num(data.revenue.monthXof)} FCFA` : '—'}
          note={data ? t('admin.ov.revenueNote', { n: num(data.revenue.totalXof) }) : ''}
          accent
        />
      </div>

      {/* Revenue in detail (owner, 2026-10-17): today, this week, this month,
          this year — UTC days, the week from Monday — and in all. */}
      <Card
        title={t('admin.ov.revenueDetail')}
        hint={data ? t('admin.ov.revenueNote', { n: num(data.revenue.totalXof) }) : ''}
      >
        <div className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
          {(
            [
              ['admin.ov.revToday', 'todayXof', 'paidOrdersToday'],
              ['admin.ov.revWeek', 'weekXof', 'paidOrdersWeek'],
              ['admin.ov.revMonth', 'monthXof', 'paidOrdersMonth'],
              ['admin.ov.revYear', 'yearXof', 'paidOrdersYear'],
            ] as const
          ).map(([key, amount, orders]) => (
            <div key={key} className="rounded-xl bg-[#F7F7FA] px-3.5 py-3">
              <p className="text-[12px] text-[#6B6878]">{t(key)}</p>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold text-[#17161F] min-[640px]:text-[20px]">
                {data ? `${num(data.revenue[amount])} FCFA` : '—'}
              </p>
              <p className="mt-0.5 text-[11.5px] text-[#8A8896]">
                {data ? t('admin.ov.revPayments', { n: num(data.revenue[orders]) }) : ''}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[1.6fr_1fr]">
        <Card
          title={t('admin.ov.signups')}
          hint={data ? t('admin.ov.signupsHint', { n: num(data.users.new30d) }) : ''}
        >
          {data && <SignupBars days={data.signups30d} intl={intl} />}
        </Card>
        <Card title={t('admin.ov.engines')} hint={t('admin.ov.thisMonth')}>
          {data && (
            <Bars
              rows={data.renders.byEngineMonth.map((e) => ({
                key: e.key,
                count: e.count,
                label: ENGINE_LABELS[e.key as EngineName]?.name[locale] ?? e.key,
                dot: ENGINE_COLORS[e.key as EngineName]?.dot,
              }))}
              empty={t('admin.ov.none')}
            />
          )}
          {data && (
            <p className="mt-4 border-t border-[#ECECF2] pt-3 text-[12.5px] text-[#6B6878]">
              {t('admin.ov.creditsLeft', { n: num(data.creditsLeft) })}
            </p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-3">
        <Card title={t('admin.ov.professions')}>
          {data && (
            <Bars
              rows={data.professions.map((p) => ({
                ...p,
                label: label('onboarding.profession.', p.key),
              }))}
              empty={t('admin.ov.none')}
            />
          )}
        </Card>
        <Card title={t('admin.ov.countries')}>
          {data && (
            <Bars
              rows={data.countries.map((c) => ({ ...c, label: c.key }))}
              empty={t('admin.ov.none')}
            />
          )}
        </Card>
        <Card title={t('admin.ov.referrals')}>
          {data && (
            <Bars
              rows={data.referrals.map((r) => ({
                ...r,
                label: label('onboarding.referral.', r.key),
              }))}
              empty={t('admin.ov.none')}
            />
          )}
        </Card>
      </div>

      <Card
        title={t('admin.ov.latest')}
        action={
          <Link
            href="/admin/utilisateurs"
            className="text-[12.5px] font-semibold text-[#2948FC] hover:underline"
          >
            {t('admin.ov.allUsers')}
          </Link>
        }
      >
        {data && data.recentUsers.length === 0 && (
          <p className="text-[13px] text-[#8A8896]">{t('admin.ov.none')}</p>
        )}
        <ul className="divide-y divide-[#ECECF2]">
          {data?.recentUsers.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/utilisateurs/${u.id}`}
                className="flex items-center gap-3 py-2.5 transition-colors hover:bg-[#F7F7FA]"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#F7F7FA] text-[12px] font-semibold text-[#2948FC]">
                  {(u.name || u.email).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-[#17161F]">
                    {u.name || u.email}
                  </span>
                  <span className="block truncate text-[12px] text-[#6B6878]">
                    {[u.profession && label('onboarding.profession.', u.profession), u.country]
                      .filter(Boolean)
                      .join(' · ') || u.email}
                  </span>
                </span>
                {u.currentTier && (
                  <span className="hidden rounded-md bg-[#EEF1FF] px-2 py-0.5 text-[11px] font-semibold text-[#1E36D6] min-[480px]:inline">
                    {tierName(u.currentTier)}
                  </span>
                )}
                <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#8A8896]">
                  {new Date(u.createdAt).toLocaleDateString(intl, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[112px] flex-col justify-between rounded-[18px] p-4 min-[640px]:p-5 ${
        accent
          ? 'bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] text-white'
          : 'bg-white text-[#17161F]'
      }`}
    >
      <span className={`text-[12px] font-medium ${accent ? 'text-white/80' : 'text-[#6B6878]'}`}>
        {label}
      </span>
      <span className="mt-2 font-[family-name:var(--font-display)] text-[24px] font-semibold leading-tight min-[640px]:text-[28px]">
        {value}
      </span>
      <span
        className={`mt-1 truncate text-[11.5px] ${accent ? 'text-white/75' : 'text-[#8A8896]'}`}
      >
        {note}
      </span>
    </div>
  );
}

function Card({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[18px] bg-white p-4 min-[640px]:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
          {title}
        </h2>
        {action ?? (hint ? <span className="text-[12px] text-[#8A8896]">{hint}</span> : null)}
      </div>
      {children}
    </section>
  );
}

/** Horizontal bars, one hue (magnitude): label and figure in ink, the bar
 *  in blue — or the engine's own dot beside its name. */
function Bars({
  rows,
  empty,
}: {
  rows: { key: string; count: number; label: string; dot?: string | undefined }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-[13px] text-[#8A8896]">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label} : ${r.count}`}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-[#3D3B49]">
              {r.dot && <span className={`h-2 w-2 flex-shrink-0 rounded-full ${r.dot}`} />}
              {r.label}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[11.5px] text-[#17161F]">
              {r.count}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#F2F2F5]">
            <div
              className="h-2 rounded-full bg-[#2948FC]"
              style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Sign-ups per day, 30 thin bars on one baseline, a tooltip on each. */
function SignupBars({ days, intl }: { days: Count[]; intl: string }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const fmt = (k: string) =>
    new Date(`${k}T12:00:00Z`).toLocaleDateString(intl, { day: 'numeric', month: 'short' });
  return (
    <div>
      <div className="flex h-[140px] items-end gap-[2px]">
        {days.map((d) => (
          <div
            key={d.key}
            title={`${fmt(d.key)} : ${d.count}`}
            className="group flex h-full flex-1 items-end"
          >
            <div
              className="w-full rounded-t-[4px] bg-[#2948FC] transition-opacity group-hover:opacity-75"
              style={{
                height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : '2px',
                opacity: d.count ? 1 : 0.25,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
        <span>{days[0] ? fmt(days[0].key) : ''}</span>
        <span>{days.at(-1) ? fmt(days.at(-1)!.key) : ''}</span>
      </div>
    </div>
  );
}
