'use client';

// « Stock Kie » (2026-10-22, owner — Phase 2): a site credit is a Kie credit,
// so the Kie balance and the credits the accounts hold are compared in the
// same unit. The balance is read live from Kie and never written; the top-ups
// are only the history the admins record. Data: GET /api/admin/kie-stock
// (lib/server/admin/kie-stock.ts); a top-up: POST /api/admin/kie-topups.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { useToast } from '@/contexts/ToastContext';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { ENGINE_VERSIONS } from '@/lib/server/generation/engine-versions';
import type { CoverageLevel, KieStock } from '@/lib/server/admin/kie-stock';
import { TIER_NAME_KEY } from '@/app/PricingCard';

const KIE_BILLING = 'https://kie.ai/billing';
const CARD = 'rounded-[18px] bg-white p-4 min-[640px]:p-5';
const MONO = 'font-[family-name:var(--font-mono)]';
const INPUT =
  'h-10 w-full rounded-xl border border-[#DEDEE8] bg-white px-3 text-[13.5px] text-[#17161F] outline-none focus:border-[#2948FC]';

const LEVEL: Record<CoverageLevel, { label: TranslationKey; chip: string; banner: string }> = {
  red: {
    label: 'admin.stock.levelRed',
    chip: 'bg-[#FFE4E7] text-[#C21F33]',
    banner: 'bg-[#FFE4E7] text-[#C21F33]',
  },
  orange: {
    label: 'admin.stock.levelOrange',
    chip: 'bg-[#FDF1DC] text-[#B8710B]',
    banner: 'bg-[#FDF1DC] text-[#8A5408]',
  },
  green: { label: 'admin.stock.levelGreen', chip: 'bg-[#E6F4EA] text-[#1E7A3D]', banner: '' },
};

/** The preset of the top-up form: 5 $ buys 1 000 credits at Kie's price. */
const PRESET = { amountUsd: 5, credits: 1000 };

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
      {children}
    </h2>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[12px] text-[#6B6878]">{label}</span>
      <span className={`text-[22px] font-semibold text-[#17161F] ${MONO}`}>{value}</span>
      {sub ? <span className={`text-[12px] text-[#8A8896] ${MONO}`}>{sub}</span> : null}
    </div>
  );
}

export default function AdminKieStockPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const num = (n: number, digits = 0) => n.toLocaleString(intl, { maximumFractionDigits: digits });
  const pct = (n: number) => `${num(n * 100, 1)} %`;
  const [data, setData] = useState<KieStock | null>(null);
  const [error, setError] = useState(false);
  const [amountUsd, setAmountUsd] = useState('');
  const [credits, setCredits] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(false);
    api<KieStock>('/api/admin/kie-stock')
      .then(setData)
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  async function save() {
    const usd = Number(amountUsd.replace(',', '.'));
    const cr = Number(credits.replace(',', '.'));
    if (!(usd > 0) || !(cr > 0)) {
      toast(t('admin.stock.formInvalid'), 'error');
      return;
    }
    setSaving(true);
    try {
      await api('/api/admin/kie-topups', {
        method: 'POST',
        body: { amountUsd: usd, credits: cr, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast(t('admin.stock.formSaved'), 'success');
      setAmountUsd('');
      setCredits('');
      setNote('');
      load();
    } catch {
      toast(t('admin.stock.formFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className={`${CARD} flex flex-col items-start gap-3`}>
        <p className="text-[13.5px] text-[#3D3B49]">{t('admin.stock.loadError')}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-xl bg-[#2948FC] px-4 py-2 text-[13px] font-semibold text-white"
        >
          {t('admin.retry')}
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-[13px] text-[#8A8896]">{t('admin.stock.loading')}</p>;

  const level = LEVEL[data.level];
  const versionName = (key: keyof typeof ENGINE_VERSIONS) => ENGINE_VERSIONS[key].name[locale];

  return (
    <div className="flex flex-col gap-4">
      {data.level !== 'green' ? (
        <div
          role="alert"
          className={`rounded-[14px] px-4 py-3 text-[13.5px] font-medium ${level.banner}`}
        >
          {data.balance === null
            ? t('admin.stock.bannerUnknown')
            : t('admin.stock.bannerLow', {
                coverage: data.coverage === null ? '—' : pct(data.coverage),
              })}{' '}
          <a href={KIE_BILLING} target="_blank" rel="noreferrer" className="underline">
            {t('admin.stock.topUpOnKie')}
          </a>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        <section className={`${CARD} flex flex-col gap-4`}>
          <Title>{t('admin.stock.stockTitle')}</Title>
          <Figure
            label={t('admin.stock.stockLabel')}
            value={
              data.balance === null ? '—' : `${num(data.balance, 1)} ${t('admin.stock.credits')}`
            }
            sub={
              data.balanceUsd === null || data.balanceXof === null
                ? t(data.configured ? 'admin.stock.balanceUnreadable' : 'admin.stock.notConfigured')
                : `≈ ${num(data.balanceUsd, 2)} $ · ≈ ${num(data.balanceXof)} FCFA`
            }
          />
          <p className="text-[12px] text-[#8A8896]">{t('admin.stock.readOnly')}</p>
        </section>

        <section className={`${CARD} flex flex-col gap-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Title>{t('admin.stock.circulationTitle')}</Title>
            <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${level.chip}`}>
              {t(level.label)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Figure
              label={t('admin.stock.circulationLabel')}
              value={`${num(data.circulation)} ${t('admin.stock.credits')}`}
              sub={
                data.demoCredits > 0
                  ? `${t('admin.stock.accounts', { count: num(data.accountsWithCredits) })} · ${t('admin.stock.demoShare', { credits: num(data.demoCredits) })}`
                  : t('admin.stock.accounts', { count: num(data.accountsWithCredits) })
              }
            />
            <Figure
              label={t('admin.stock.coverageLabel')}
              value={data.coverage === null ? '—' : pct(data.coverage)}
              sub={t('admin.stock.coverageRule')}
            />
          </div>
        </section>
      </div>

      <section className={`${CARD} flex flex-col gap-3`}>
        <Title>{t('admin.stock.imagesTitle')}</Title>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead className="text-[12px] text-[#6B6878]">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{t('admin.stock.colEngine')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.stock.colSize')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.stock.colPrice')}</th>
                <th className="py-1.5 font-medium">{t('admin.stock.colImages')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECECF2]">
              {data.imagesLeft.map((row) => (
                <tr key={`${row.version}-${row.resolution}`}>
                  <td className="py-2 pr-3 text-[#17161F]">
                    {ENGINE_LABELS[row.engine].name[locale]}{' '}
                    <span className="text-[#8A8896]">({versionName(row.version)})</span>
                  </td>
                  <td className={`py-2 pr-3 ${MONO}`}>{row.resolution.toUpperCase()}</td>
                  <td className={`py-2 pr-3 ${MONO}`}>{num(row.credits)}</td>
                  <td className={`py-2 font-semibold ${MONO}`}>
                    {row.images === null ? '—' : num(row.images)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        <section className={`${CARD} flex flex-col gap-3`}>
          <Title>{t('admin.stock.financesTitle')}</Title>
          <dl className="flex flex-col divide-y divide-[#ECECF2] text-[13px]">
            {(
              [
                ['admin.stock.revenue', `${num(data.finances.revenueXof)} FCFA`],
                [
                  'admin.stock.kieCost',
                  `${num(data.finances.kieCostXof)} FCFA (${num(data.finances.kieCreditsConsumed, 1)} ${t('admin.stock.credits')})`,
                ],
                ['admin.stock.maketouFee', `${num(data.finances.maketouFeeXof)} FCFA`],
                ['admin.stock.profit', `${num(data.finances.profitXof)} FCFA`],
                [
                  'admin.stock.margin',
                  data.finances.margin === null ? '—' : pct(data.finances.margin),
                ],
              ] as [TranslationKey, string][]
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-[#6B6878]">{t(k)}</dt>
                <dd className={`text-right font-medium text-[#17161F] ${MONO}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={`${CARD} flex flex-col gap-3`}>
          <Title>{t('admin.stock.marginsTitle')}</Title>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px] text-left text-[13px]">
              <thead className="text-[12px] text-[#6B6878]">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">{t('admin.stock.colPlan')}</th>
                  <th className="py-1.5 pr-3 font-medium">{t('admin.stock.colKieCost')}</th>
                  <th className="py-1.5 pr-3 font-medium">{t('admin.stock.colGross')}</th>
                  <th className="py-1.5 font-medium">{t('admin.stock.colNet')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECECF2]">
                {data.plans.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 text-[#17161F]">
                      {t(TIER_NAME_KEY[p.id])}
                      <span className={`block text-[11.5px] text-[#8A8896] ${MONO}`}>
                        {num(p.priceXof)} FCFA · {num(p.credits)} {t('admin.stock.credits')}
                      </span>
                    </td>
                    <td className={`py-2 pr-3 ${MONO}`}>{num(p.kieCostXof)} FCFA</td>
                    <td className={`py-2 pr-3 font-semibold ${MONO}`}>{pct(p.gross)}</td>
                    <td className={`py-2 font-semibold ${MONO}`}>{pct(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[#8A8896]">
            {t('admin.stock.constants', {
              usd: String(data.constants.usdPerCredit).replace('.', locale === 'fr' ? ',' : '.'),
              rate: num(data.constants.xofPerUsd),
              credit: num(data.constants.xofPerCredit, 2),
              fee: num(data.constants.maketouFeeRate * 100),
            })}
          </p>
        </section>
      </div>

      <section className={`${CARD} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Title>{t('admin.stock.topUpsTitle')}</Title>
          <a
            href={KIE_BILLING}
            target="_blank"
            rel="noreferrer"
            className="text-[12.5px] font-semibold text-[#2948FC]"
          >
            {t('admin.stock.topUpOnKie')}
          </a>
        </div>
        <form
          className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-[1fr_1fr_2fr_auto] min-[720px]:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#3D3B49]">
            {t('admin.stock.formUsd')}
            <input
              className={INPUT}
              inputMode="decimal"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#3D3B49]">
            {t('admin.stock.formCredits')}
            <input
              className={INPUT}
              inputMode="decimal"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#3D3B49]">
            {t('admin.stock.formNote')}
            <input
              className={INPUT}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAmountUsd(String(PRESET.amountUsd));
                setCredits(String(PRESET.credits));
              }}
              className="h-10 whitespace-nowrap rounded-xl bg-[#F2F2F5] px-3 text-[12.5px] font-semibold text-[#3D3B49] hover:bg-[#E9E9EE]"
            >
              {t('admin.stock.formPreset')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 whitespace-nowrap rounded-xl bg-[#2948FC] px-4 text-[13px] font-semibold text-white hover:bg-[#1E36D6] disabled:opacity-60"
            >
              {t('admin.stock.formSave')}
            </button>
          </div>
        </form>
        {data.topUps.length === 0 ? (
          <p className="text-[13px] text-[#8A8896]">{t('admin.stock.topUpsEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#ECECF2] text-[13px]">
            {data.topUps.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-[#3D3B49]">
                  {new Date(r.createdAt).toLocaleDateString(intl, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {r.note ? <span className="text-[#8A8896]"> · {r.note}</span> : null}
                  {r.adminEmail ? <span className="text-[#8A8896]"> · {r.adminEmail}</span> : null}
                </span>
                <span className={`font-medium text-[#17161F] ${MONO}`}>
                  {num(r.amountUsd, 2)} $ → {num(r.credits)} {t('admin.stock.credits')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
