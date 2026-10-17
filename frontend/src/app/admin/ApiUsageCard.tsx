'use client';

// « Crédits API » at the top of /admin (2026-10-17, owner: « mets-moi les
// utilisations de mon abonnement API … si c'est en train de finir »): the Kie
// account behind both engines — its live balance, the days it lasts at the
// last week's pace, what the images cost — with a warning colour once it runs
// low, and a link to top it up on kie.ai (a prepaid wallet: no subscription).
// Data: GET /api/admin/api-usage (lib/server/admin/api-usage.ts).
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { ENGINE_VERSIONS, type EngineVersionKey } from '@/lib/server/generation/engine-versions';
import type { ApiUsage, ApiUsageLevel } from '@/lib/server/admin/api-usage';

const KIE_BILLING = 'https://kie.ai/billing';

const LEVEL: Record<ApiUsageLevel, { label: TranslationKey; chip: string; ring: string }> = {
  ok: { label: 'admin.api.levelOk', chip: 'bg-[#E6F4EA] text-[#1E7A3D]', ring: '' },
  low: {
    label: 'admin.api.levelLow',
    chip: 'bg-[#FDF1DC] text-[#B8710B]',
    ring: 'shadow-[0_0_0_2px_#F1C27D]',
  },
  critical: {
    label: 'admin.api.levelCritical',
    chip: 'bg-[#FFE4E7] text-[#C21F33]',
    ring: 'shadow-[0_0_0_2px_#E5484D]',
  },
  unknown: { label: 'admin.api.levelUnknown', chip: 'bg-[#F2F2F5] text-[#3D3B49]', ring: '' },
};

export function ApiUsageCard() {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const num = (n: number, digits = 0) => n.toLocaleString(intl, { maximumFractionDigits: digits });
  const [data, setData] = useState<ApiUsage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<ApiUsage>('/api/admin/api-usage')
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const level = LEVEL[data?.level ?? 'unknown'];
  const versionName = (key: string) =>
    ENGINE_VERSIONS[key as EngineVersionKey]?.name[locale] ?? key;
  const maxDay = Math.max(...(data?.daily30d.map((d) => d.credits) ?? [0]), 1);
  const fmtDay = (k: string) =>
    new Date(`${k}T12:00:00Z`).toLocaleDateString(intl, { day: 'numeric', month: 'short' });

  return (
    <section className={`rounded-[18px] bg-white p-4 min-[640px]:p-5 ${level.ring}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
            {t('admin.api.title')}
          </h2>
          {data && (
            <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${level.chip}`}>
              {t(level.label)}
            </span>
          )}
        </div>
        <a
          href={KIE_BILLING}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5"
        >
          {t('admin.api.topUp')} ↗
        </a>
      </div>

      {error && <p className="text-[13px] text-[#B8710B]">{t('admin.api.loadError')}</p>}

      <div className="grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <Stat
          label={t('admin.api.balance')}
          value={data?.balance != null ? num(data.balance) : '—'}
          note={
            data?.balanceUsd != null
              ? t('admin.api.balanceUsd', { n: num(data.balanceUsd, 2) })
              : ''
          }
        />
        <Stat
          label={t('admin.api.daysLeft')}
          value={data?.daysLeft != null ? num(data.daysLeft, 1) : '—'}
          note={
            data?.perDay != null
              ? t('admin.api.perDay', { n: num(data.perDay, 1) })
              : t('admin.api.noPace')
          }
        />
        <Stat
          label={t('admin.api.spent')}
          value={data ? num(data.spent.week, 1) : '—'}
          note={
            data
              ? t('admin.api.spentNote', {
                  today: num(data.spent.today, 1),
                  month: num(data.spent.month, 1),
                })
              : ''
          }
        />
        <Stat
          label={t('admin.api.perImage')}
          value={data?.avgPerImage != null ? num(data.avgPerImage, 1) : '—'}
          note={data ? t('admin.api.images30d', { n: num(data.kieImages30d) }) : ''}
        />
      </div>

      {data && (
        <div className="mt-4 grid grid-cols-1 gap-4 min-[900px]:grid-cols-[1.6fr_1fr]">
          <div>
            <p className="mb-2 text-[12px] text-[#6B6878]">{t('admin.api.daily')}</p>
            <div className="flex h-[90px] items-end gap-[2px]">
              {data.daily30d.map((d) => (
                <div
                  key={d.key}
                  title={`${fmtDay(d.key)} : ${num(d.credits, 1)}`}
                  className="group flex h-full flex-1 items-end"
                >
                  <div
                    className="w-full rounded-t-[4px] bg-[#2948FC] transition-opacity group-hover:opacity-75"
                    style={{
                      height: d.credits ? `${Math.max(6, (d.credits / maxDay) * 100)}%` : '2px',
                      opacity: d.credits ? 1 : 0.25,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-[family-name:var(--font-mono)] text-[10.5px] text-[#8A8896]">
              <span>{data.daily30d[0] ? fmtDay(data.daily30d[0].key) : ''}</span>
              <span>{data.daily30d.at(-1) ? fmtDay(data.daily30d.at(-1)!.key) : ''}</span>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12px] text-[#6B6878]">{t('admin.api.byModel')}</p>
            {data.byVersion30d.length === 0 ? (
              <p className="text-[13px] text-[#8A8896]">{t('admin.ov.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.byVersion30d.map((v) => (
                  <li
                    key={v.key}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[#F7F7FA] px-3 py-2 text-[12.5px]"
                  >
                    <span className="font-medium text-[#17161F]">{versionName(v.key)}</span>
                    <span className="font-[family-name:var(--font-mono)] text-[11.5px] text-[#3D3B49]">
                      {t('admin.api.modelLine', {
                        images: num(v.images),
                        credits: num(v.credits, 1),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {data && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-[#ECECF2] pt-3 text-[12.5px] leading-relaxed text-[#6B6878]">
          {!data.configured && <li className="text-[#B8710B]">{t('admin.api.notConfigured')}</li>}
          {data.balanceError && (
            <li className="text-[#B8710B]">
              {t(problemKey(data.balanceProblem?.code ?? null, data.balanceProblem?.message))}
              {data.balanceProblem && data.balanceProblem.message !== 'timeout' && (
                <span className="mt-0.5 block font-[family-name:var(--font-mono)] text-[11.5px] text-[#8A8896]">
                  {t('admin.api.kieSaid', {
                    code: String(data.balanceProblem.code ?? '—'),
                    msg: data.balanceProblem.message,
                  })}
                </span>
              )}
            </li>
          )}
          {data.directImages7d > 0 && (
            <li className="text-[#C21F33]">
              {t('admin.api.direct', { n: num(data.directImages7d) })}
            </li>
          )}
          {data.kieImages30d > data.pricedImages30d && (
            <li>{t('admin.api.unpriced', { n: num(data.kieImages30d - data.pricedImages30d) })}</li>
          )}
          <li>{t('admin.api.prepaid')}</li>
        </ul>
      )}
    </section>
  );
}

/** What to do, from Kie's refusal code. */
function problemKey(code: number | null, message: string | undefined): TranslationKey {
  if (code === 401 || code === 403) return 'admin.api.problemKey';
  if (code === 402) return 'admin.api.problemCredits';
  if (code === 429) return 'admin.api.problemLimit';
  if (message === 'timeout' || code === null) return 'admin.api.problemNetwork';
  return 'admin.api.balanceError';
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl bg-[#F7F7FA] px-3.5 py-3">
      <p className="text-[12px] text-[#6B6878]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold text-[#17161F] min-[640px]:text-[20px]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11.5px] text-[#8A8896]">{note}</p>
    </div>
  );
}
