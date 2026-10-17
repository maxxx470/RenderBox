'use client';

// « Comptabilité » on /admin (2026-10-17, owner: « combien je dépense, combien
// je gagne … des graphiques si je suis en faillite ou si je gagne »): the
// revenue, every expense (Maketou's fee, the Kie API, fixed costs), what is
// left, for this month / last month / this year / since the start, and the
// last 12 months in and out. Data: GET /api/admin/accounting
// (lib/server/admin/accounting.ts).
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import type { Accounting, AccountingPeriod, Ledger } from '@/lib/server/admin/accounting';

const PERIODS: { id: AccountingPeriod; label: TranslationKey }[] = [
  { id: 'month', label: 'admin.acc.month' },
  { id: 'lastMonth', label: 'admin.acc.lastMonth' },
  { id: 'year', label: 'admin.acc.year' },
  { id: 'all', label: 'admin.acc.all' },
];

const IN = 'bg-[#2948FC]';
const OUT = 'bg-[#F34857]';

export function AccountingCard() {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const num = (n: number) => n.toLocaleString(intl, { maximumFractionDigits: 0 });
  const fcfa = (n: number) => `${num(n)} FCFA`;
  const pct = (n: number) => n.toLocaleString(intl, { style: 'percent', maximumFractionDigits: 0 });
  const [data, setData] = useState<Accounting | null>(null);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<AccountingPeriod>('month');

  useEffect(() => {
    let cancelled = false;
    api<Accounting>('/api/admin/accounting')
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const l: Ledger | null = data?.periods[period] ?? null;
  const state = !l ? null : l.resultXof > 0 ? 'profit' : l.resultXof < 0 ? 'loss' : 'even';
  const maxMonth = Math.max(
    1,
    ...(data?.months.flatMap((m) => [m.revenueXof, m.expensesXof]) ?? []),
  );
  const monthName = (key: string) =>
    new Date(`${key}-15T12:00:00Z`).toLocaleDateString(intl, { month: 'short' });
  const monthLong = (key: string) =>
    new Date(`${key}-15T12:00:00Z`).toLocaleDateString(intl, { month: 'long', year: 'numeric' });

  const lines = l
    ? [
        {
          key: 'fee',
          label: t('admin.acc.feeLine', { pct: pct(data?.feeRate ?? 0) }),
          note: t('admin.acc.feeNote'),
          xof: l.maketouFeeXof,
        },
        {
          key: 'kie',
          label: t('admin.acc.kieLine'),
          note: t('admin.acc.kieNote', { n: num(l.kieImages), c: num(l.kieCredits) }),
          xof: l.kieXof,
        },
        {
          key: 'fixed',
          label: t('admin.acc.fixedLine'),
          note: data?.fixedCosts.length
            ? data.fixedCosts.map((c) => `${c.label} ${fcfa(c.xofPerMonth)}`).join(' · ')
            : t('admin.acc.fixedNone'),
          xof: l.fixedXof,
        },
      ]
    : [];

  return (
    <section className="rounded-[18px] bg-white p-4 min-[640px]:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
            {t('admin.acc.title')}
          </h2>
          {state && (
            <span
              className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${
                state === 'profit'
                  ? 'bg-[#E6F4EA] text-[#1E7A3D]'
                  : state === 'loss'
                    ? 'bg-[#FFE4E7] text-[#C21F33]'
                    : 'bg-[#F2F2F5] text-[#3D3B49]'
              }`}
            >
              {t(`admin.acc.${state}`)}
            </span>
          )}
        </div>
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                period === p.id
                  ? 'bg-[#2948FC] text-white'
                  : 'bg-[#F2F2F5] text-[#3D3B49] hover:bg-[#E9E9EE]'
              }`}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] text-[#B8710B]">{t('admin.acc.loadError')}</p>}

      <div className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <Tile
          label={t('admin.acc.revenue')}
          value={l ? fcfa(l.revenueXof) : '—'}
          note={l ? t('admin.acc.revenueNote', { n: num(l.orders) }) : ''}
        />
        <Tile
          label={t('admin.acc.expenses')}
          value={l ? fcfa(l.expensesXof) : '—'}
          note={
            l
              ? l.revenueXof > 0
                ? t('admin.acc.expensesNote', { pct: pct(l.expensesXof / l.revenueXof) })
                : t('admin.acc.noSales')
              : ''
          }
        />
        <Tile
          label={t('admin.acc.result')}
          value={l ? `${l.resultXof > 0 ? '+' : ''}${fcfa(l.resultXof)}` : '—'}
          note={t('admin.acc.resultNote')}
          tone={state === 'profit' ? 'good' : state === 'loss' ? 'bad' : undefined}
        />
        <Tile
          label={t('admin.acc.margin')}
          value={l && l.revenueXof > 0 ? pct(l.resultXof / l.revenueXof) : '—'}
          note={t('admin.acc.marginNote')}
        />
      </div>

      {data && l && (
        <div className="mt-4 grid grid-cols-1 gap-4 min-[900px]:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-[#6B6878]">{t('admin.acc.chart')}</p>
              <div className="flex items-center gap-3 text-[11.5px] text-[#3D3B49]">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-[3px] ${IN}`} />
                  {t('admin.acc.revenue')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-[3px] ${OUT}`} />
                  {t('admin.acc.expenses')}
                </span>
              </div>
            </div>
            <div className="flex h-[120px] items-end gap-1.5 min-[640px]:gap-2.5">
              {data.months.map((m) => (
                <div
                  key={m.key}
                  title={t('admin.acc.tip', {
                    month: monthLong(m.key),
                    in: fcfa(m.revenueXof),
                    out: fcfa(m.expensesXof),
                    res: `${m.resultXof > 0 ? '+' : ''}${fcfa(m.resultXof)}`,
                  })}
                  className="group flex h-full flex-1 items-end justify-center gap-[2px]"
                >
                  {(
                    [
                      [m.revenueXof, IN],
                      [m.expensesXof, OUT],
                    ] as const
                  ).map(([v, color], i) => (
                    <div
                      key={i}
                      className={`w-full max-w-[14px] rounded-t-[4px] transition-opacity group-hover:opacity-75 ${color}`}
                      style={{
                        height: v ? `${Math.max(4, (v / maxMonth) * 100)}%` : '2px',
                        opacity: v ? 1 : 0.2,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5 font-[family-name:var(--font-mono)] text-[10px] text-[#8A8896] min-[640px]:gap-2.5">
              {data.months.map((m, i) => (
                <span key={m.key} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
                  {/* Every other month on a phone, ending on this one, so the names do not collide. */}
                  <span className={(data.months.length - 1 - i) % 2 ? 'max-[639px]:invisible' : ''}>
                    {monthName(m.key)}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-[12px] text-[#6B6878]">{t('admin.acc.breakdown')}</p>
            <ul className="flex flex-col gap-1.5">
              {lines.map((line) => (
                <li key={line.key} className="rounded-lg bg-[#F7F7FA] px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="font-medium text-[#17161F]">{line.label}</span>
                    <span className="shrink-0 font-[family-name:var(--font-mono)] text-[12px] font-semibold text-[#17161F]">
                      {fcfa(line.xof)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#ECECF2]">
                    <div
                      className={`h-full rounded-full ${OUT}`}
                      style={{
                        width: l.expensesXof ? `${(line.xof / l.expensesXof) * 100}%` : '0%',
                      }}
                    />
                  </div>
                  <p className="mt-1 truncate text-[11.5px] text-[#8A8896]">{line.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {data && l && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-[#ECECF2] pt-3 text-[12.5px] leading-relaxed text-[#6B6878]">
          {l.directImages > 0 && (
            <li className="text-[#B8710B]">{t('admin.acc.direct', { n: num(l.directImages) })}</li>
          )}
          {data.fixedCosts.length === 0 && <li>{t('admin.acc.fixedHint')}</li>}
          <li>{t('admin.acc.kieSince')}</li>
          <li>{t('admin.acc.rate', { rate: num(data.xofPerUsd) })}</li>
        </ul>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'good' | 'bad' | undefined;
}) {
  const bg = tone === 'good' ? 'bg-[#E6F4EA]' : tone === 'bad' ? 'bg-[#FFE4E7]' : 'bg-[#F7F7FA]';
  const ink =
    tone === 'good' ? 'text-[#1E7A3D]' : tone === 'bad' ? 'text-[#C21F33]' : 'text-[#17161F]';
  return (
    <div className={`rounded-xl px-3.5 py-3 ${bg}`}>
      <p className="text-[12px] text-[#6B6878]">{label}</p>
      <p
        className={`mt-1 font-[family-name:var(--font-mono)] text-[17px] font-semibold min-[640px]:text-[19px] ${ink}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11.5px] text-[#8A8896]">{note}</p>
    </div>
  );
}
