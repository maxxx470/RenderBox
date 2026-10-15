'use client';

// The onboarding (owner, 2026-10-13: « le SaaS fera connaissance avec
// l'utilisateur … il n'aura plus besoin de mettre autre chose après »):
// four short screens — Vous, Votre métier, Vos projets, D'où venez-vous —
// each saved on the account as soon as it is left (PATCH
// /api/users/me/profile), the last one marking the onboarding done. Name,
// profession and country are required; the rest may stay empty. The
// preferred engine chosen here is the one the command bar starts on.
import { useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { ENGINE_COLORS, ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { EngineLogo } from '@/components/EngineLogo';
import { ENGINE_NAMES, type EngineName } from '@/lib/server/generation/engines/types';
import {
  COUNTRY_SUGGESTIONS_FR,
  MAIN_USES,
  PROFESSIONS,
  PROJECT_TYPES,
  REFERRAL_SOURCES,
  TEAM_SIZES,
} from '@/lib/onboarding';

export interface OnboardingProfile {
  name: string | null;
  phone: string | null;
  profession: string | null;
  company: string | null;
  teamSize: string | null;
  projectTypes: string[];
  mainUse: string | null;
  defaultEngine: string | null;
  country: string | null;
  city: string | null;
  referralSource: string | null;
}

const GRADIENT = 'bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]';
const FIELD =
  'h-11 w-full rounded-xl border border-[#ECECF2] bg-[#F7F7FA] px-3.5 min-[1024px]:h-12 text-[14px] text-[#17161F] outline-none placeholder:text-[#8A8896] focus:border-[#2948FC]';

const SCREENS = [
  'onboarding.screen1',
  'onboarding.screen2',
  'onboarding.screen3',
  'onboarding.screen4',
] as const;

export function OnboardingForm({ initial }: { initial: OnboardingProfile }) {
  const { t } = useLocale();
  const [screen, setScreen] = useState(0);
  const [p, setP] = useState<OnboardingProfile>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof OnboardingProfile>(k: K, v: OnboardingProfile[K]) =>
    setP((prev) => ({ ...prev, [k]: v }));

  // What each screen saves; the required fields are checked before leaving.
  const payload = (): Record<string, unknown> => {
    const s = (v: string | null) => v ?? '';
    switch (screen) {
      case 0:
        return { name: s(p.name), phone: s(p.phone) };
      case 1:
        return {
          ...(p.profession ? { profession: p.profession } : {}),
          company: s(p.company),
          ...(p.teamSize ? { teamSize: p.teamSize } : {}),
        };
      case 2:
        return {
          projectTypes: p.projectTypes,
          ...(p.mainUse ? { mainUse: p.mainUse } : {}),
          ...(p.defaultEngine ? { defaultEngine: p.defaultEngine } : {}),
        };
      default:
        return {
          country: s(p.country),
          city: s(p.city),
          ...(p.referralSource ? { referralSource: p.referralSource } : {}),
          complete: true,
        };
    }
  };

  const missing = (): TranslationKey | null => {
    if (screen === 0 && !p.name?.trim()) return 'onboarding.needName';
    if (screen === 1 && !p.profession) return 'onboarding.needProfession';
    if (screen === 3 && !p.country?.trim()) return 'onboarding.needCountry';
    return null;
  };

  async function next() {
    const need = missing();
    if (need) return setError(t(need));
    setError(null);
    setBusy(true);
    try {
      await api('/api/users/me/profile', { method: 'PATCH', body: payload() });
      if (screen === SCREENS.length - 1) {
        window.location.assign('/app');
        return;
      }
      setScreen((s) => s + 1);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'ONBOARDING_INCOMPLETE'
          ? t('onboarding.needAll')
          : t('onboarding.saveError'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Progress: four short bars, the done ones blue. */}
      <div className="flex items-center gap-1.5" aria-hidden>
        {SCREENS.map((k, i) => (
          <span
            key={k}
            className={`h-1.5 flex-1 rounded-full ${i <= screen ? 'bg-[#2948FC]' : 'bg-[#ECECF2]'}`}
          />
        ))}
      </div>
      <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px] min-[1024px]:mt-4 font-semibold uppercase tracking-[0.12em] text-[#2948FC]">
        {t('onboarding.stepOf', { n: String(screen + 1), total: String(SCREENS.length) })}
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-[22px] min-[1024px]:mt-1.5 min-[1024px]:text-[26px] font-semibold tracking-[-0.4px] text-[#17161F]">
        {t(SCREENS[screen]!)}
      </h1>
      <p className="mt-1 text-[13px] text-[#6B6878] min-[1024px]:mt-1.5 min-[1024px]:text-[14px]">
        {t(`${SCREENS[screen]!}Sub` as TranslationKey)}
      </p>

      <div className="mt-4 flex flex-col gap-3.5 min-[1024px]:mt-7 min-[1024px]:gap-5">
        {screen === 0 && (
          <>
            <Labeled label={t('onboarding.name')} htmlFor="ob-name" required>
              <input
                id="ob-name"
                autoComplete="name"
                maxLength={120}
                value={p.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
                placeholder={t('connexion.namePlaceholder')}
                className={FIELD}
              />
            </Labeled>
            <Labeled
              label={t('onboarding.phone')}
              htmlFor="ob-phone"
              hint={t('onboarding.phoneHint')}
            >
              <input
                id="ob-phone"
                type="tel"
                autoComplete="tel"
                maxLength={32}
                value={p.phone ?? ''}
                onChange={(e) => set('phone', e.target.value.replace(/[^+\d\s().-]/g, ''))}
                placeholder="+221 77 000 00 00"
                className={`${FIELD} font-[family-name:var(--font-mono)]`}
              />
            </Labeled>
          </>
        )}

        {screen === 1 && (
          <>
            <Labeled label={t('onboarding.profession')} required>
              <Chips
                options={PROFESSIONS}
                prefix="onboarding.profession."
                value={p.profession ? [p.profession] : []}
                onToggle={(k) => set('profession', k)}
              />
            </Labeled>
            <Labeled label={t('onboarding.company')} htmlFor="ob-company">
              <input
                id="ob-company"
                autoComplete="organization"
                maxLength={120}
                value={p.company ?? ''}
                onChange={(e) => set('company', e.target.value)}
                className={FIELD}
              />
            </Labeled>
            <Labeled label={t('onboarding.teamSize')}>
              <Chips
                options={TEAM_SIZES}
                prefix="onboarding.teamSize."
                value={p.teamSize ? [p.teamSize] : []}
                onToggle={(k) => set('teamSize', k)}
              />
            </Labeled>
          </>
        )}

        {screen === 2 && (
          <>
            <Labeled label={t('onboarding.projectTypes')} hint={t('onboarding.several')}>
              <Chips
                options={PROJECT_TYPES}
                prefix="onboarding.projectType."
                value={p.projectTypes}
                onToggle={(k) =>
                  set(
                    'projectTypes',
                    p.projectTypes.includes(k)
                      ? p.projectTypes.filter((x) => x !== k)
                      : [...p.projectTypes, k],
                  )
                }
              />
            </Labeled>
            <Labeled label={t('onboarding.mainUse')}>
              <Chips
                options={MAIN_USES}
                prefix="onboarding.mainUse."
                value={p.mainUse ? [p.mainUse] : []}
                onToggle={(k) => set('mainUse', k)}
              />
            </Labeled>
            <Labeled label={t('onboarding.engine')} hint={t('onboarding.engineHint')}>
              <EngineChoice
                value={(p.defaultEngine as EngineName | null) ?? null}
                onChange={(e) => set('defaultEngine', e)}
              />
            </Labeled>
          </>
        )}

        {screen === 3 && (
          <>
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
              <Labeled label={t('onboarding.country')} htmlFor="ob-country" required>
                <input
                  id="ob-country"
                  list="ob-countries"
                  autoComplete="country-name"
                  maxLength={80}
                  value={p.country ?? ''}
                  onChange={(e) => set('country', e.target.value)}
                  className={FIELD}
                />
                <datalist id="ob-countries">
                  {COUNTRY_SUGGESTIONS_FR.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Labeled>
              <Labeled label={t('onboarding.city')} htmlFor="ob-city">
                <input
                  id="ob-city"
                  autoComplete="address-level2"
                  maxLength={80}
                  value={p.city ?? ''}
                  onChange={(e) => set('city', e.target.value)}
                  className={FIELD}
                />
              </Labeled>
            </div>
            <Labeled label={t('onboarding.referral')}>
              <Chips
                options={REFERRAL_SOURCES}
                prefix="onboarding.referral."
                value={p.referralSource ? [p.referralSource] : []}
                onToggle={(k) => set('referralSource', k)}
              />
            </Labeled>
          </>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-[#E5484D]">
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center gap-3">
          {screen > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setScreen((s) => s - 1);
              }}
              className="h-11 rounded-xl bg-[#F2F2F5] px-5 min-[1024px]:h-12 text-[14px] font-semibold text-[#17161F] transition-colors hover:bg-[#E9E9EE] disabled:opacity-60"
            >
              {t('onboarding.back')}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void next()}
            className={`h-11 flex-1 rounded-xl text-[14px] min-[1024px]:h-12 font-semibold text-white transition-[opacity,scale] duration-150 active:scale-[0.98] disabled:opacity-60 ${GRADIENT}`}
          >
            {busy
              ? t('onboarding.saving')
              : screen === SCREENS.length - 1
                ? t('onboarding.finish')
                : t('onboarding.next')}
          </button>
        </div>
        <p className="text-center text-[12px] text-[#8A8896] [@media(max-height:700px)]:max-[1023px]:hidden">
          {t('onboarding.privacy')}
        </p>
      </div>
    </div>
  );
}

function Labeled({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const head = (
    <span className="text-[13px] font-medium text-[#17161F]">
      {label}
      {required && <span className="text-[#C21F33]"> *</span>}
    </span>
  );
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 min-[1024px]:mb-2">
        {htmlFor ? <label htmlFor={htmlFor}>{head}</label> : head}
        {hint && <span className="text-[12px] text-[#8A8896]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chips<K extends string>({
  options,
  prefix,
  value,
  onToggle,
}: {
  options: readonly K[];
  prefix: string;
  value: readonly string[];
  onToggle: (k: K) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap gap-1.5 min-[1024px]:gap-2">
      {options.map((k) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(k)}
            className={`h-8 rounded-lg px-3 text-[12.5px] font-medium transition-colors min-[1024px]:h-9 min-[1024px]:px-3.5 min-[1024px]:text-[13px] ${
              on ? 'bg-[#2948FC] text-white' : 'bg-[#F2F2F5] text-[#3D3B49] hover:bg-[#E9E9EE]'
            }`}
          >
            {t(`${prefix}${k}` as TranslationKey)}
          </button>
        );
      })}
    </div>
  );
}

function EngineChoice({
  value,
  onChange,
}: {
  value: EngineName | null;
  onChange: (e: EngineName) => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="grid grid-cols-2 gap-2">
      {ENGINE_NAMES.map((e) => {
        const on = value === e;
        return (
          <button
            key={e}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(e)}
            className={`flex flex-col items-start gap-0.5 rounded-xl p-2.5 text-left min-[1024px]:gap-1 min-[1024px]:p-3 transition-colors ${
              on ? ENGINE_COLORS[e].chip : 'bg-[#F2F2F5] text-[#17161F] hover:bg-[#E9E9EE]'
            }`}
          >
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              <EngineLogo engine={e} size={18} />
              {ENGINE_LABELS[e].name[locale]}
            </span>
            <span className={`text-[12px] ${on ? 'opacity-85' : 'text-[#6B6878]'}`}>
              {ENGINE_LABELS[e].description[locale]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
