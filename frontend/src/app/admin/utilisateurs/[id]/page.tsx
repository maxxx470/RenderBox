'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { EngineLogo } from '@/components/EngineLogo';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { TIER_NAME_KEY } from '../../../PricingCard';

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  currentTier: string | null;
  tierPeriodStart: string | null;
  creditsBalance: number;
  defaultEngine: string | null;
  phone: string | null;
  profession: string | null;
  company: string | null;
  teamSize: string | null;
  projectTypes: string[];
  mainUse: string | null;
  country: string | null;
  city: string | null;
  referralSource: string | null;
  onboardedAt: string | null;
}
interface RenderRow {
  id: string;
  engine: string | null;
  createdAt: string;
}
interface ProjectRow {
  id: string;
  name: string;
  createdAt: string;
  generationsCount: number;
}
interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}
interface DetailResponse {
  user: UserDetail;
  projects: ProjectRow[];
  orders: OrderRow[];
  renders: RenderRow[];
}

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export default function AdminUserDetailPage() {
  const { t, locale } = useLocale();
  const params = useParams<{ id: string }>();
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [data, setData] = useState<DetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<DetailResponse>(`/api/admin/users/${params.id}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch {
      setActionError(t('admin.userDetail.actionError'));
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return <p className="text-sm text-[#8A8896]">{t('admin.userDetail.notFound')}</p>;
  }
  if (!data) return null;

  const { user, projects, orders } = data;
  const renders = data.renders ?? [];
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  // A key of the onboarding lists in words; anything else as stored.
  const word = (prefix: string, k: string | null) => {
    if (!k) return null;
    const key = `${prefix}${k}` as TranslationKey;
    const s = t(key);
    return s === key ? k : s;
  };
  const periodEnd = user.tierPeriodStart && new Date(user.tierPeriodStart).getTime() + PERIOD_MS;
  const planLive = Boolean(user.currentTier && periodEnd && periodEnd > Date.now());
  const profile: [TranslationKey, string | null][] = [
    ['admin.userDetail.fPhone', user.phone],
    ['admin.userDetail.fProfession', word('onboarding.profession.', user.profession)],
    ['admin.userDetail.fCompany', user.company],
    ['admin.userDetail.fTeam', word('onboarding.teamSize.', user.teamSize)],
    [
      'admin.userDetail.fProjects',
      user.projectTypes.map((p) => word('onboarding.projectType.', p)).join(', ') || null,
    ],
    ['admin.userDetail.fUse', word('onboarding.mainUse.', user.mainUse)],
    [
      'admin.userDetail.fEngine',
      user.defaultEngine
        ? (ENGINE_LABELS[user.defaultEngine as EngineName]?.name[locale] ?? user.defaultEngine)
        : null,
    ],
    ['admin.userDetail.fPlace', [user.city, user.country].filter(Boolean).join(', ') || null],
    ['admin.userDetail.fReferral', word('onboarding.referral.', user.referralSource)],
  ];

  async function adjustCredits(sign: 1 | -1) {
    const n = Number(creditAmount);
    if (!Number.isInteger(n) || n <= 0 || creditReason.trim().length < 3) {
      setActionError(t('admin.userDetail.creditsInvalid'));
      return;
    }
    await runAction(() =>
      api(`/api/admin/users/${user.id}/credits`, {
        method: 'POST',
        body: { delta: sign * n, reason: creditReason.trim() },
      }),
    );
    setCreditAmount('');
    setCreditReason('');
  }

  return (
    <div>
      <Link
        href="/admin/utilisateurs"
        className="text-[12.5px] text-[#8A8896] hover:text-[#17161F]"
      >
        {t('admin.userDetail.back')}
      </Link>

      <div className="mt-3 mb-6 flex items-center gap-3.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[16px] font-semibold text-[#2948FC]">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[18px] font-semibold text-[#17161F]">
            {user.name || user.email}
          </h1>
          <p className="text-[12.5px] text-[#8A8896]">
            {t('admin.userDetail.memberSince', {
              date: new Date(user.createdAt).toLocaleDateString('fr-FR'),
            })}
          </p>
        </div>
      </div>

      {user.deletedAt ? (
        <div className="mb-5 rounded-[14px] bg-[#B8710B14] px-4 py-3 text-[13px] text-[#B8710B]">
          {t('admin.userDetail.deletedBanner', {
            date: new Date(user.deletedAt).toLocaleDateString('fr-FR'),
            days: '30',
          })}
        </div>
      ) : null}

      {actionError ? <p className="mb-4 text-sm text-[#B8710B]">{actionError}</p> : null}

      <div className="mb-3.5 grid grid-cols-1 gap-3.5 min-[1000px]:grid-cols-[1.3fr_1fr]">
        {/* What the onboarding told about this user. */}
        <section className="rounded-[18px] bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-[#17161F]">
              {t('admin.userDetail.profileTitle')}
            </h2>
            <span
              className={`text-[11.5px] ${user.onboardedAt ? 'text-[#1E7A3D]' : 'text-[#B8710B]'}`}
            >
              {user.onboardedAt
                ? t('admin.userDetail.onboardedOn', {
                    date: new Date(user.onboardedAt).toLocaleDateString(intl),
                  })
                : t('admin.users.notOnboarded')}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 min-[640px]:grid-cols-2">
            <div>
              <dt className="text-[11.5px] text-[#8A8896]">{t('admin.userDetail.fEmail')}</dt>
              <dd className="truncate text-[13px] text-[#17161F]">{user.email}</dd>
            </div>
            {profile.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11.5px] text-[#8A8896]">{t(k)}</dt>
                <dd className="text-[13px] text-[#17161F]">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Plan and credits, and the hand adjustment (audited). */}
        <section className="rounded-[18px] bg-white p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-[#17161F]">
            {t('admin.userDetail.planTitle')}
          </h2>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[#EEF1FF] px-4 py-3">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[#1E36D6]">
                {planLive && user.currentTier && user.currentTier in TIER_NAME_KEY
                  ? t(TIER_NAME_KEY[user.currentTier as PricingTierId])
                  : t('admin.userDetail.noPlan')}
              </div>
              {planLive && periodEnd && (
                <div className="text-[11px] text-[#1E36D6]/80">
                  {t('admin.userDetail.planUntil', {
                    date: new Date(periodEnd).toLocaleDateString(intl),
                  })}
                </div>
              )}
            </div>
            <div className="font-[family-name:var(--font-mono)] text-[15px] font-bold text-[#2948FC]">
              {user.creditsBalance.toLocaleString(intl)} {t('app.creditsUnit')}
            </div>
          </div>
          <p className="mb-2 text-[12.5px] font-medium text-[#17161F]">
            {t('admin.userDetail.creditsAdjust')}
          </p>
          <div className="flex flex-col gap-2">
            <input
              inputMode="numeric"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={t('admin.userDetail.creditsAmount')}
              className="h-10 rounded-xl border border-[#ECECF2] bg-[#F7F7FA] px-3 font-[family-name:var(--font-mono)] text-[13px] outline-none focus:border-[#2948FC]"
            />
            <input
              value={creditReason}
              maxLength={200}
              onChange={(e) => setCreditReason(e.target.value)}
              placeholder={t('admin.userDetail.creditsReason')}
              className="h-10 rounded-xl border border-[#ECECF2] bg-[#F7F7FA] px-3 text-[13px] outline-none focus:border-[#2948FC]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void adjustCredits(1)}
                className="h-10 flex-1 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t('admin.userDetail.creditsAdd')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void adjustCredits(-1)}
                className="h-10 flex-1 rounded-xl bg-[#F2F2F5] text-[13px] font-semibold text-[#17161F] hover:bg-[#E9E9EE] disabled:opacity-50"
              >
                {t('admin.userDetail.creditsRemove')}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="mb-3.5 rounded-[18px] bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-[#17161F]">
            {t('admin.userDetail.rendersTitle')}
          </h2>
          <Link
            href={`/admin/rendus?userId=${user.id}`}
            className="text-[12.5px] font-semibold text-[#2948FC] hover:underline"
          >
            {t('admin.userDetail.rendersAll')}
          </Link>
        </div>
        {renders.length === 0 ? (
          <p className="text-[12.5px] text-[#8A8896]">{t('admin.userDetail.noRenders')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 min-[640px]:grid-cols-6">
            {renders.map((r) => (
              <a
                key={r.id}
                href={`/api/admin/render-nodes/${r.id}/image`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square overflow-hidden rounded-xl bg-[#F7F7FA]"
                title={new Date(r.createdAt).toLocaleString(intl)}
              >
                <img
                  src={`/api/admin/render-nodes/${r.id}/image`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {r.engine && ENGINE_LABELS[r.engine as EngineName] && (
                  <span className="absolute left-1.5 top-1.5 flex shadow-[0_1px_4px_rgba(23,22,31,0.25)] [border-radius:5px]">
                    <EngineLogo engine={r.engine as EngineName} size={18} />
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="mb-8 grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <section className="rounded-[14px] bg-white p-4.5">
          <h2 className="mb-3 text-[13px] font-semibold text-[#17161F]">
            {t('admin.userDetail.projectsTitle')}
          </h2>
          {projects.length === 0 ? (
            <p className="text-[12.5px] text-[#8A8896]">{t('admin.userDetail.noProjects')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-[13px]">
                  <span className="text-[#17161F]">{p.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#8A8896]">
                    {p.generationsCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[14px] bg-white p-4.5">
          <h2 className="mb-3 text-[13px] font-semibold text-[#17161F]">
            {t('admin.userDetail.ordersTitle')}
          </h2>
          {orders.length === 0 ? (
            <p className="text-[12.5px] text-[#8A8896]">{t('admin.userDetail.noOrders')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#8A8896]">
                    {o.status}
                  </span>
                  <span className="text-[#17161F]">
                    {o.amount.toLocaleString('fr-FR')} {o.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-[14px] bg-white p-4.5">
        <h2 className="mb-3.5 text-[13px] font-semibold text-[#17161F]">
          {t('admin.userDetail.actionsTitle')}
        </h2>

        {/* No role selector on the file (owner, 2026-10-17: « à supprimer de
            la page admin »). The role route stays; the first SUPERADMIN is made
            with pnpm db:make-superadmin. */}
        <div className="flex flex-wrap gap-2.5">
          {user.status === 'SUSPENDED' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(() =>
                  api(`/api/admin/users/${user.id}/status`, {
                    method: 'PATCH',
                    body: { status: 'ACTIVE' },
                  }),
                )
              }
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-[#17161F] bg-[#F2F2F5] hover:bg-[#E9E9EE] disabled:opacity-50"
            >
              {t('admin.userDetail.restoreButton')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !!user.deletedAt}
              onClick={() => {
                if (!confirm(t('admin.userDetail.confirmSuspend'))) return;
                void runAction(() =>
                  api(`/api/admin/users/${user.id}/status`, {
                    method: 'PATCH',
                    body: { status: 'SUSPENDED' },
                  }),
                );
              }}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-[#17161F] bg-[#F2F2F5] hover:bg-[#E9E9EE] disabled:opacity-50"
            >
              {t('admin.userDetail.suspendButton')}
            </button>
          )}

          {user.deletedAt ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(() => api(`/api/admin/users/${user.id}/restore`, { method: 'POST' }))
              }
              className="rounded-xl bg-[#1E7A3D14] px-4 py-2 text-[13px] font-medium text-[#1E7A3D] hover:bg-[#1E7A3D22] disabled:opacity-50"
            >
              {t('admin.userDetail.restoreDeletedButton')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm(t('admin.userDetail.confirmDelete'))) return;
                void runAction(() => api(`/api/admin/users/${user.id}`, { method: 'DELETE' }));
              }}
              className="rounded-xl bg-[#E5484D12] px-4 py-2 text-[13px] font-medium text-[#E5484D] hover:bg-[#E5484D22] disabled:opacity-50"
            >
              {t('admin.userDetail.deleteButton')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
