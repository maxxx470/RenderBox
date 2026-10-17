'use client';

// The Paramètres content, inside the workspace frame.
//
// 2026-10-16 — redrawn after the owner's audit (« trop vide et déséquilibrée »)
// on the mock-up they chose, solution A: two columns from 1100px.
//   Left, what the user sets:
//     · Profil — the onboarding's answers, editable (PATCH
//       /api/users/me/profile, the same route and keys as /bienvenue);
//     · Préférences de génération — the default engine, each engine's version
//       (kept on the account, shared with the command bar's chip through
//       AppChrome) and the interface language.
//   Right, the account:
//     · the plan and its credits, in the one blue card of the page;
//     · Connexion et sécurité — email, Google, whether a password exists
//       (changing it needs the emailed code, i.e. Resend + the domain);
//     · the last three payments, « Tout voir » leading to Abonnement;
//     · sign-out.
// One column below 1100px, the plan first.
//
// Free-access mode (AUTH_DISABLED): every visitor shares one seeded row, so
// nothing here may be saved onto it or linked to it, and there is no session
// to end — the page says so instead (see lib/server/auth-disabled.ts).

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { api } from '@/lib/api';
import { RENDER_COST } from '@/lib/pricing-tiers';
import { COUNTRY_SUGGESTIONS_FR, MAIN_USES, PROFESSIONS, TEAM_SIZES } from '@/lib/onboarding';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { ENGINE_VERSIONS, versionsOf } from '@/lib/server/generation/engine-versions';
import { EngineLogo } from '@/components/EngineLogo';
import { AppSurface, type AppSurfaceProps } from '@/app/app/AppSurface';
import { useAppChrome } from '@/app/app/AppChrome';
import { TIER_NAME_KEY } from '@/app/PricingCard';
import type { PaymentRow } from '@/app/app/tarifs/TarifsClient';

export interface SettingsProfile {
  name: string;
  phone: string;
  profession: string;
  company: string;
  teamSize: string;
  mainUse: string;
  country: string;
  city: string;
}

export interface SettingsAccount {
  email: string;
  profile: SettingsProfile;
  defaultEngine: EngineName;
  hasPassword: boolean;
  googleLinked: boolean;
}

const GRADIENT = 'bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]';
const CARD = 'flex min-w-0 flex-col gap-4 rounded-[18px] bg-white p-5 min-[640px]:p-6';
const FIELD =
  'h-11 w-full min-w-0 rounded-xl border border-[#DEDEE8] bg-white px-3.5 text-[14px] text-[#17161F] outline-none placeholder:text-[#8A8896] focus:border-[#2948FC] disabled:bg-[#F7F7FA] disabled:text-[#6B6878]';
const SOFT_BUTTON =
  'rounded-xl bg-[#F2F2F5] px-4 py-2 text-[13px] font-semibold text-[#17161F] transition-colors hover:bg-[#E9E9EE]';

export function ParametresClient({
  surface,
  account,
  periodEndsAt,
  payments,
  demo,
}: {
  surface: AppSurfaceProps;
  account: SettingsAccount;
  /** ISO end of the current 30-day period, null without a plan. */
  periodEndsAt: string | null;
  /** The latest paid orders, newest first. */
  payments: PaymentRow[];
  demo: boolean;
}) {
  const { t } = useLocale();
  return (
    <AppSurface
      {...surface}
      eyebrow={t('page.accountEyebrow')}
      title={t('parametres.title')}
      subtitle={t('page.settingsSubtitle')}
    >
      <div className="grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_340px] min-[1100px]:gap-5">
        {/* On a phone the plan comes first: it is what a user checks most. */}
        <div className="flex min-w-0 flex-col gap-4 min-[1100px]:order-2 min-[1100px]:gap-5">
          <PlanCard surface={surface} periodEndsAt={periodEndsAt} />
          <div className="hidden flex-col gap-5 min-[1100px]:flex">
            <AccountColumn account={account} payments={payments} demo={demo} idPrefix="wide" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 min-[1100px]:order-1 min-[1100px]:gap-5">
          <ProfileCard initial={account.profile} demo={demo} />
          <PreferencesCard initialEngine={account.defaultEngine} demo={demo} />
          <div className="flex flex-col gap-4 min-[1100px]:hidden">
            <AccountColumn account={account} payments={payments} demo={demo} idPrefix="narrow" />
          </div>
        </div>
      </div>
    </AppSurface>
  );
}

// ── Profil ──────────────────────────────────────────────────────────────────

function ProfileCard({ initial, demo }: { initial: SettingsProfile; demo: boolean }) {
  const { t } = useLocale();
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof SettingsProfile>(k: K, v: string) => {
    setP((prev) => ({ ...prev, [k]: v }));
    setStatus(null);
  };
  const dirty = (Object.keys(p) as (keyof SettingsProfile)[]).some((k) => p[k] !== saved[k]);

  async function save() {
    if (!p.name.trim()) return setStatus({ ok: false, text: t('parametres.needName') });
    if (!p.country.trim()) return setStatus({ ok: false, text: t('parametres.needCountry') });
    setBusy(true);
    setStatus(null);
    try {
      await api('/api/users/me/profile', {
        method: 'PATCH',
        body: {
          name: p.name,
          phone: p.phone,
          company: p.company,
          country: p.country,
          city: p.city,
          // The choices are keys; an empty one is left as it is (the route
          // refuses anything not listed in lib/onboarding.ts).
          ...(p.profession ? { profession: p.profession } : {}),
          ...(p.teamSize ? { teamSize: p.teamSize } : {}),
          ...(p.mainUse ? { mainUse: p.mainUse } : {}),
        },
      });
      setSaved(p);
      setStatus({ ok: true, text: t('parametres.saved') });
    } catch {
      setStatus({ ok: false, text: t('parametres.saveError') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={CARD} aria-labelledby="settings-profile">
      <CardHead id="settings-profile" title={t('parametres.profileTitle')}>
        {demo ? t('parametres.freeAccessBody') : t('parametres.profileHint')}
      </CardHead>
      <fieldset
        disabled={demo || busy}
        className="grid grid-cols-1 gap-x-4 gap-y-3.5 min-[640px]:grid-cols-2"
      >
        <Field id="pf-name" label={t('onboarding.name')}>
          <input
            id="pf-name"
            autoComplete="name"
            maxLength={120}
            value={p.name}
            onChange={(e) => set('name', e.target.value)}
            className={FIELD}
          />
        </Field>
        <Field id="pf-phone" label={t('onboarding.phone')}>
          <input
            id="pf-phone"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={p.phone}
            onChange={(e) => set('phone', e.target.value.replace(/[^+\d\s().-]/g, ''))}
            placeholder="+221 77 000 00 00"
            className={`${FIELD} font-[family-name:var(--font-mono)]`}
          />
        </Field>
        <Field id="pf-profession" label={t('parametres.profession')}>
          <Choice
            id="pf-profession"
            value={p.profession}
            options={PROFESSIONS}
            prefix="onboarding.profession."
            onChange={(v) => set('profession', v)}
          />
        </Field>
        <Field id="pf-company" label={t('onboarding.company')}>
          <input
            id="pf-company"
            autoComplete="organization"
            maxLength={120}
            value={p.company}
            onChange={(e) => set('company', e.target.value)}
            className={FIELD}
          />
        </Field>
        <Field id="pf-team" label={t('onboarding.teamSize')}>
          <Choice
            id="pf-team"
            value={p.teamSize}
            options={TEAM_SIZES}
            prefix="onboarding.teamSize."
            onChange={(v) => set('teamSize', v)}
          />
        </Field>
        <Field id="pf-use" label={t('onboarding.mainUse')}>
          <Choice
            id="pf-use"
            value={p.mainUse}
            options={MAIN_USES}
            prefix="onboarding.mainUse."
            onChange={(v) => set('mainUse', v)}
          />
        </Field>
        <Field id="pf-country" label={t('onboarding.country')}>
          <input
            id="pf-country"
            list="pf-countries"
            autoComplete="country-name"
            maxLength={80}
            value={p.country}
            onChange={(e) => set('country', e.target.value)}
            className={FIELD}
          />
          <datalist id="pf-countries">
            {COUNTRY_SUGGESTIONS_FR.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field id="pf-city" label={t('onboarding.city')}>
          <input
            id="pf-city"
            autoComplete="address-level2"
            maxLength={80}
            value={p.city}
            onChange={(e) => set('city', e.target.value)}
            className={FIELD}
          />
        </Field>
      </fieldset>
      {!demo && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {status && (
            <p
              role={status.ok ? 'status' : 'alert'}
              className={`mr-auto text-[12.5px] ${status.ok ? 'text-[#1E7A3D]' : 'text-[#E5484D]'}`}
            >
              {status.text}
            </p>
          )}
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void save()}
            className={`rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-[opacity,scale] duration-150 active:scale-[0.98] disabled:opacity-50 ${GRADIENT}`}
          >
            {busy ? t('parametres.saving') : t('parametres.save')}
          </button>
        </div>
      )}
    </section>
  );
}

// ── Préférences de génération ───────────────────────────────────────────────

function PreferencesCard({ initialEngine, demo }: { initialEngine: EngineName; demo: boolean }) {
  const { t, locale, setLocale } = useLocale();
  const { refresh } = useAuth();
  const chrome = useAppChrome();
  const [engine, setEngine] = useState<EngineName>(initialEngine);
  const [savedNote, setSavedNote] = useState(false);

  async function chooseEngine(next: EngineName) {
    if (next === engine) return;
    const previous = engine;
    setEngine(next);
    setSavedNote(false);
    try {
      await api('/api/users/me', { method: 'PATCH', body: { defaultEngine: next } });
      // The command bar starts on the account's engine (AuthContext).
      await refresh();
      setSavedNote(true);
    } catch {
      setEngine(previous);
    }
  }

  return (
    <section className={CARD} aria-labelledby="settings-prefs">
      <CardHead id="settings-prefs" title={t('parametres.prefsTitle')}>
        {t('parametres.prefsHint')}
      </CardHead>
      <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2">
        {ENGINE_NAMES.map((e) => {
          const on = engine === e;
          const chosen = chrome?.versions[e];
          return (
            <div
              key={e}
              className={`flex min-w-0 flex-col gap-3 rounded-[14px] p-3.5 transition-colors ${
                on ? 'bg-[#EEF1FF] ring-[1.5px] ring-[#2948FC]' : 'bg-[#F7F7FA]'
              }`}
            >
              <button
                type="button"
                disabled={demo}
                aria-pressed={on}
                onClick={() => void chooseEngine(e)}
                className="flex items-center gap-2.5 text-left disabled:cursor-default"
              >
                <EngineLogo engine={e} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block font-[family-name:var(--font-display)] text-[14px] font-semibold text-[#17161F]">
                    {ENGINE_LABELS[e].name[locale]}
                  </span>
                  <span className="block truncate text-[12px] text-[#6B6878]">
                    {ENGINE_LABELS[e].description[locale]}
                  </span>
                </span>
                {on ? (
                  <span className="flex-shrink-0 text-[11px] font-semibold text-[#1E36D6]">
                    {t('parametres.defaultBadge')}
                  </span>
                ) : null}
              </button>
              {/* The versions run through Kie: without its key the routes use
                  the direct engines, and no version is offered (as in the
                  command bar). */}
              {chrome?.versionsEnabled && chosen ? (
                <div
                  role="radiogroup"
                  aria-label={t('parametres.versionOf', { engine: ENGINE_LABELS[e].name[locale] })}
                  className="flex flex-wrap gap-1.5"
                >
                  {versionsOf(e).map((v) => {
                    const sel = chosen === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        disabled={demo}
                        title={ENGINE_VERSIONS[v].description[locale]}
                        onClick={() => chrome.setVersion(e, v)}
                        className={`rounded-lg px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11.5px] font-medium transition-colors ${
                          sel
                            ? 'bg-[#2948FC] text-white'
                            : 'bg-white text-[#3D3B49] hover:bg-[#E9E9EE]'
                        }`}
                      >
                        {ENGINE_VERSIONS[v].name[locale]}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {savedNote ? (
        <p role="status" className="-mt-1 text-[12.5px] text-[#1E7A3D]">
          {t('parametres.engineSaved')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECECF2] pt-4">
        <div>
          <div className="text-[14px] font-semibold text-[#17161F]">
            {t('parametres.languageTitle')}
          </div>
          <div className="text-[12px] text-[#6B6878]">{t('parametres.languageHint')}</div>
        </div>
        <div role="radiogroup" className="flex rounded-[10px] bg-[#F2F2F5] p-[3px]">
          {(['fr', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={locale === l}
              onClick={() => setLocale(l)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] transition-colors ${
                locale === l
                  ? 'bg-white font-semibold text-[#17161F] shadow-[0_1px_2px_rgba(23,22,31,0.12)]'
                  : 'text-[#3D3B49]'
              }`}
            >
              {l === 'fr' ? 'Français' : 'English'}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Formule ─────────────────────────────────────────────────────────────────

function PlanCard({
  surface,
  periodEndsAt,
}: {
  surface: AppSurfaceProps;
  periodEndsAt: string | null;
}) {
  const { t, locale } = useLocale();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';
  const { tier, creditsBalance, creditsMax } = surface;

  if (!tier) {
    return (
      <section className={`${CARD} ${GRADIENT} text-white`}>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">
          {t('parametres.planEyebrow')}
        </div>
        <div>
          <div className="font-[family-name:var(--font-display)] text-[20px] font-bold">
            {t('parametres.planNone')}
          </div>
          <p className="mt-1 text-[13px] text-white/80">
            {creditsBalance
              ? t('parametres.planNoneCredits', { n: creditsBalance.toLocaleString(intl) })
              : t('parametres.planNoneHint')}
          </p>
        </div>
        <Link
          href="/app/tarifs"
          className="self-start rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold text-[#1E36D6]"
        >
          {t('parametres.choosePlan')}
        </Link>
      </section>
    );
  }

  const left = Math.max(0, creditsBalance ?? 0);
  const max = creditsMax ?? 0;
  const share = max > 0 ? Math.min(100, Math.round((left / max) * 100)) : 0;
  const endDate = periodEndsAt
    ? new Date(periodEndsAt).toLocaleDateString(intl, { day: 'numeric', month: 'long' })
    : null;

  return (
    <section className={`${CARD} ${GRADIENT} text-white`}>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">
          {t('parametres.planEyebrow')}
        </div>
        <div className="font-[family-name:var(--font-display)] text-[22px] font-bold">
          {t(TIER_NAME_KEY[tier])}
        </div>
      </div>
      <div className="font-[family-name:var(--font-mono)] text-[26px] font-semibold leading-none">
        {left.toLocaleString(intl)}{' '}
        <span className="text-[13px] font-medium opacity-75">
          {t('parametres.planOf', { max: max.toLocaleString(intl) })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={left}
        aria-label={t('parametres.planEyebrow')}
        className="h-2 overflow-hidden rounded-full bg-white/25"
      >
        <div className="h-full rounded-full bg-white" style={{ width: `${share}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[12.5px] text-white/85">
        {endDate ? <span>{t('parametres.planUntil', { date: endDate })}</span> : <span />}
        <span>
          {t('parametres.planImages', {
            count: Math.floor(left / RENDER_COST).toLocaleString(intl),
          })}
        </span>
      </div>
      <Link
        href="/app/tarifs"
        className="self-start rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold text-[#1E36D6]"
      >
        {t('parametres.managePlan')}
      </Link>
    </section>
  );
}

// ── Connexion, paiements, déconnexion ───────────────────────────────────────

/**
 * Drawn twice — beside the settings from 1100px, under them below — so each
 * copy prefixes its ids (only one is ever displayed).
 */
function AccountColumn({
  account,
  payments,
  demo,
  idPrefix,
}: {
  account: SettingsAccount;
  payments: PaymentRow[];
  demo: boolean;
  idPrefix: string;
}) {
  const { t, locale } = useLocale();
  const { logout } = useAuth();
  const intl = locale === 'fr' ? 'fr-FR' : 'en-US';

  return (
    <>
      <section className={CARD} aria-labelledby={`${idPrefix}-security`}>
        <h2
          id={`${idPrefix}-security`}
          className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]"
        >
          {t('parametres.securityTitle')}
        </h2>
        {demo ? (
          <p className="text-[13px] text-[#6B6878]">{t('parametres.freeAccessBody')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#ECECF2]">
            <Row label={t('parametres.emailLabel')} sub={account.email} />
            <Row label="Google" sub={t('parametres.googleSub')}>
              {account.googleLinked ? (
                <span className="rounded-md bg-[#1E7A3D14] px-2 py-0.5 text-[11.5px] font-semibold text-[#1E7A3D]">
                  {t('parametres.linkedBadge')}
                </span>
              ) : (
                <a href="/api/auth/oauth/google/start?next=/parametres" className={SOFT_BUTTON}>
                  {t('parametres.linkGoogleButton')}
                </a>
              )}
            </Row>
            <Row
              label={t('parametres.passwordLabel')}
              sub={account.hasPassword ? t('parametres.passwordSet') : t('parametres.passwordNone')}
            />
          </ul>
        )}
      </section>

      <section className={CARD} aria-labelledby={`${idPrefix}-payments`}>
        <div className="flex items-center justify-between gap-3">
          <h2
            id={`${idPrefix}-payments`}
            className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]"
          >
            {t('parametres.paymentsTitle')}
          </h2>
          {payments.length > 0 ? (
            <Link href="/app/tarifs" className="text-[12.5px] font-semibold text-[#2948FC]">
              {t('parametres.paymentsAll')}
            </Link>
          ) : null}
        </div>
        {payments.length === 0 ? (
          <p className="text-[13px] text-[#6B6878]">{t('parametres.billingEmpty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[#ECECF2]">
            {payments.map((p) => (
              <Row
                key={p.id}
                label={t(TIER_NAME_KEY[p.tier])}
                sub={`${new Date(p.at).toLocaleDateString(intl, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })} · ${t('parametres.paid')}`}
              >
                <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[12.5px] tabular-nums text-[#17161F]">
                  {p.amount.toLocaleString(intl)} FCFA
                </span>
              </Row>
            ))}
          </ul>
        )}
      </section>

      {!demo && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <span className="min-w-0 truncate text-[12.5px] text-[#6B6878]">
            {t('parametres.connectedAs', { email: account.email })}
          </span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              // Out of the site, onto the landing (owner, 2026-10-08).
              window.location.assign('/');
            }}
            className="rounded-xl bg-[#F2F2F5] px-4 py-2 text-[13px] font-semibold text-[#C21F33] transition-colors hover:bg-[#E9E9EE]"
          >
            {t('parametres.logoutButton')}
          </button>
        </div>
      )}
    </>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function CardHead({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div>
      <h2
        id={id}
        className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]"
      >
        {title}
      </h2>
      <p className="mt-0.5 text-[13px] text-[#6B6878]">{children}</p>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-[#3D3B49]">
        {label}
      </label>
      {children}
    </div>
  );
}

/** A select in the field's own look (its chevron drawn, not the OS's). */
function Choice<K extends string>({
  id,
  value,
  options,
  prefix,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly K[];
  prefix: string;
  onChange: (v: K) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as K)}
        className={`${FIELD} appearance-none pr-9`}
      >
        {value === '' ? <option value="">{t('parametres.choose')}</option> : null}
        {options.map((k) => (
          <option key={k} value={k}>
            {t(`${prefix}${k}` as TranslationKey)}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8896]"
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-[#17161F]">{label}</div>
        <div className="truncate text-[12px] text-[#6B6878]">{sub}</div>
      </div>
      {children}
    </li>
  );
}
