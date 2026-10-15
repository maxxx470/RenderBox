'use client';

// The sign-in form of /connexion (2026-10-13, owner: « Google et connexion
// par email et mot de passe »). Five screens in one place:
//
//   login    email + password, « Mot de passe oublié ? »
//   signup   name + email + password → a code is emailed
//   code     the code from the email → the account exists, signed in
//   forgot   email → a code is emailed
//   reset    the code + a new password → signed in
//
// On a phone (below 1024px) a welcome screen comes first — the promise,
// Google, « Créer un compte avec mon e-mail », « J'ai déjà un compte » — so
// each screen fits without scrolling (owner, 2026-10-15).
//
// Google sits above, when configured. With email sending configured
// (`verifyEmail`, Resend), signup goes through the code and the password
// typed at signup stays in this component until the code is entered — the
// server only stores it once the address is proved. Without it (2026-10-15,
// owner), signup creates the account at once and there is no « forgot »
// screen (lib/server/auth/password.ts).
//
// Plain fetch, not lib/api.ts's api(): a 401 here is a wrong password, not
// an expired session to refresh.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Hide, Show } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';

type Mode = 'login' | 'signup' | 'code' | 'forgot' | 'reset';

const GRADIENT = 'bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]';
const FIELD =
  'flex h-12 items-center gap-2 rounded-xl border border-[#ECECF2] bg-[#F7F7FA] px-3.5 focus-within:border-[#2948FC]';
const INPUT =
  'h-full w-full min-w-0 bg-transparent text-[14px] text-[#17161F] outline-none placeholder:text-[#8A8896]';

async function post(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; code: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: unknown };
    return {
      ok: res.ok,
      status: res.status,
      code: typeof data.error === 'string' ? data.error : '',
    };
  } catch {
    return { ok: false, status: 0, code: 'NETWORK' };
  }
}

const ERRORS: Record<string, TranslationKey> = {
  INVALID_CREDENTIALS: 'connexion.errorInvalidCredentials',
  ACCOUNT_LOCKED: 'connexion.errorLocked',
  ACCOUNT_SUSPENDED: 'connexion.errorSuspended',
  CODE_INVALID: 'connexion.errorCodeInvalid',
  CODE_EXPIRED: 'connexion.errorCodeExpired',
  CODE_TOO_MANY_ATTEMPTS: 'connexion.errorCodeTooMany',
  PASSWORD_TOO_SHORT: 'connexion.errorPasswordShort',
  PASSWORD_TOO_LONG: 'connexion.errorPasswordLong',
  PASSWORD_TOO_COMMON: 'connexion.errorPasswordCommon',
  EMAIL_NOT_CONFIGURED: 'connexion.errorEmailUnavailable',
  EMAIL_TAKEN: 'connexion.errorEmailTaken',
};

export function ConnexionForm({
  googleEnabled,
  verifyEmail,
  passwordMin,
  next,
  initialMode,
}: {
  googleEnabled: boolean;
  verifyEmail: boolean;
  passwordMin: number;
  next: string;
  initialMode: 'login' | 'signup';
}) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Below 1024px: the email form is open (else the welcome screen shows).
  const [emailOpen, setEmailOpen] = useState(false);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    setCode('');
  };

  function fail(r: { status: number; code: string }) {
    if (r.status === 429) return setError(t('connexion.errorRateLimited'));
    const key = ERRORS[r.code];
    setError(key ? t(key, { min: String(passwordMin) }) : t('connexion.errorGeneric'));
  }

  const signedIn = () => window.location.assign(next);

  async function sendCode(purpose: 'signup' | 'reset') {
    return post('/api/auth/password/code', { email, purpose, locale });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if ((mode === 'signup' || mode === 'reset') && password.length < passwordMin) {
      setError(t('connexion.errorPasswordShort', { min: String(passwordMin) }));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const r = await post('/api/auth/password/login', { email, password });
        return r.ok ? signedIn() : fail(r);
      }
      if (mode === 'signup' && !verifyEmail) {
        const r = await post('/api/auth/password/signup', {
          email,
          password,
          ...(name.trim() ? { name: name.trim() } : {}),
        });
        return r.ok ? signedIn() : fail(r);
      }
      if (mode === 'signup' || mode === 'forgot') {
        const r = await sendCode(mode === 'signup' ? 'signup' : 'reset');
        if (!r.ok) return fail(r);
        return go(mode === 'signup' ? 'code' : 'reset');
      }
      // code (signup) or reset: prove the address, set the password.
      const r = await post('/api/auth/password/confirm', {
        email,
        code,
        password,
        purpose: mode === 'code' ? 'signup' : 'reset',
        ...(mode === 'code' && name.trim() ? { name: name.trim() } : {}),
      });
      return r.ok ? signedIn() : fail(r);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setBusy(true);
    const r = await sendCode(mode === 'code' ? 'signup' : 'reset');
    setBusy(false);
    if (r.ok) setInfo(t('connexion.resent'));
    else fail(r);
  }

  const title: Record<Mode, TranslationKey> = {
    login: 'connexion.loginTitle',
    signup: 'connexion.signupTitle',
    code: 'connexion.codeTitle',
    forgot: 'connexion.forgotTitle',
    reset: 'connexion.resetTitle',
  };
  const subtitle: Record<Mode, string> = {
    login: t('connexion.loginSubtitle'),
    signup: t('connexion.signupSubtitle'),
    code: t('connexion.codeBody', { email }),
    forgot: t('connexion.forgotBody'),
    reset: t('connexion.codeBody', { email }),
  };

  const showGoogle = googleEnabled && (mode === 'login' || mode === 'signup');

  const googleHref = `/api/auth/oauth/google/start?next=${encodeURIComponent(next)}`;
  const legal = (
    <p className="mt-6 text-center text-[12px] leading-relaxed text-[#8A8896] min-[1024px]:mt-8">
      {t('connexion.legalPrefix')}{' '}
      <a href="/legal" className="font-medium text-[#2948FC] hover:underline">
        {t('connexion.legalLink')}
      </a>
      .
    </p>
  );

  return (
    <div>
      {/* Below 1024px: the welcome screen first (owner, 2026-10-15, after the
          « Laundrify » reference) — the promise and three choices, nothing to
          scroll. The email form only shows once one is picked. From 1024px
          the form is there at once, and this block never shows. */}
      {!emailOpen && (
        <div className="min-[1024px]:hidden">
          <h1 className="font-[family-name:var(--font-display)] text-[25px] font-semibold leading-[1.15] tracking-[-0.4px] text-[#17161F]">
            {t('connexion.panelTitle')}
          </h1>
          <p className="mt-1.5 text-[14px] text-[#6B6878]">{t('connexion.signupSubtitle')}</p>
          <div className="mt-5 flex flex-col gap-2.5">
            {googleEnabled && (
              <a
                href={googleHref}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#F2F2F5] text-[14px] font-semibold text-[#17161F] transition-colors hover:bg-[#E9E9EE]"
              >
                <GoogleMark />
                {t('connexion.googleButton')}
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                go('signup');
                setEmailOpen(true);
              }}
              className={`h-12 w-full rounded-xl text-[14px] font-semibold text-white transition-[opacity,scale] duration-150 active:scale-[0.98] ${GRADIENT}`}
            >
              {t('connexion.emailSignup')}
            </button>
            <button
              type="button"
              onClick={() => {
                go('login');
                setEmailOpen(true);
              }}
              className="h-12 w-full rounded-xl text-[14px] font-semibold text-[#2948FC] transition-colors hover:bg-[#EEF1FF]"
            >
              {t('connexion.haveAccount')}
            </button>
          </div>
          {legal}
        </div>
      )}

      <div className={emailOpen ? '' : 'max-[1023px]:hidden'}>
        <button
          type="button"
          onClick={() => {
            setEmailOpen(false);
            go(initialMode);
          }}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B6878] hover:text-[#17161F] min-[1024px]:hidden"
        >
          <span aria-hidden>←</span>
          {t('connexion.back')}
        </button>
        <h1 className="font-[family-name:var(--font-display)] text-[25px] font-semibold tracking-[-0.4px] text-[#17161F] min-[1024px]:text-[28px]">
          {t(title[mode])}
        </h1>
        <p className="mt-1.5 text-[14px] text-[#6B6878]">{subtitle[mode]}</p>

        {/* On a phone Google was offered on the welcome screen. */}
        {showGoogle && (
          <a
            href={googleHref}
            className="mt-7 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#F2F2F5] text-[14px] font-semibold text-[#17161F] transition-colors hover:bg-[#E9E9EE] max-[1023px]:hidden"
          >
            <GoogleMark />
            {t('connexion.googleButton')}
          </a>
        )}

        {showGoogle && (
          <div className="my-6 flex items-center gap-3 max-[1023px]:hidden">
            <div className="h-px flex-1 bg-[#ECECF2]" />
            <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#8A8896]">
              {t('connexion.or')}
            </span>
            <div className="h-px flex-1 bg-[#ECECF2]" />
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className={`flex flex-col gap-3.5 max-[1023px]:mt-5 min-[1024px]:gap-4 ${showGoogle ? '' : 'min-[1024px]:mt-7'}`}
        >
          {mode === 'signup' && (
            <Field label={t('connexion.nameLabel')} htmlFor="cx-name">
              <input
                id="cx-name"
                autoComplete="name"
                maxLength={120}
                placeholder={t('connexion.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
              />
            </Field>
          )}

          {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
            <Field label={t('connexion.emailLabel')} htmlFor="cx-email">
              <input
                id="cx-email"
                type="email"
                required
                autoComplete="email"
                placeholder={t('connexion.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
              />
            </Field>
          )}

          {(mode === 'code' || mode === 'reset') && (
            <Field label={t('connexion.codeLabel')} htmlFor="cx-code">
              <input
                id="cx-code"
                required
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={8}
                placeholder="ABCD2345"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                className={`${INPUT} font-[family-name:var(--font-mono)] text-[16px] tracking-[0.3em]`}
              />
            </Field>
          )}

          {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
            <PasswordField
              id="cx-password"
              label={t(mode === 'reset' ? 'connexion.newPasswordLabel' : 'connexion.passwordLabel')}
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              hint={
                mode === 'login' ? null : t('connexion.passwordHint', { min: String(passwordMin) })
              }
              aside={
                mode === 'login' && verifyEmail ? (
                  <button
                    type="button"
                    onClick={() => go('forgot')}
                    className="text-[12.5px] font-medium text-[#2948FC] hover:underline"
                  >
                    {t('connexion.forgot')}
                  </button>
                ) : null
              }
            />
          )}

          {error && (
            <p role="alert" className="text-[13px] text-[#E5484D]">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="text-[13px] text-[#1E7A3D]">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`mt-1 h-12 w-full rounded-xl text-[14px] font-semibold text-white transition-[opacity,scale] duration-150 active:scale-[0.98] disabled:opacity-60 ${GRADIENT}`}
          >
            {busy
              ? t('connexion.submitting')
              : mode === 'login'
                ? t('connexion.signIn')
                : mode === 'forgot'
                  ? t('connexion.sendCode')
                  : mode === 'signup' && !verifyEmail
                    ? t('connexion.createAccount')
                    : t('connexion.continue')}
          </button>

          {(mode === 'code' || mode === 'reset') && (
            <div className="flex items-center justify-between text-[13px]">
              <button
                type="button"
                onClick={() => go(mode === 'code' ? 'signup' : 'forgot')}
                className="text-[#6B6878] hover:text-[#17161F]"
              >
                {t('connexion.back')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void resend()}
                className="font-medium text-[#2948FC] hover:underline disabled:opacity-60"
              >
                {t('connexion.resend')}
              </button>
            </div>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => go('login')}
              className="text-[13px] text-[#6B6878] hover:text-[#17161F]"
            >
              {t('connexion.back')}
            </button>
          )}
        </form>

        {(mode === 'login' || mode === 'signup') && (
          <p className="mt-5 text-center text-[13px] text-[#6B6878] min-[1024px]:mt-6">
            {mode === 'login' ? t('connexion.toSignup') : t('connexion.toLogin')}{' '}
            <button
              type="button"
              onClick={() => go(mode === 'login' ? 'signup' : 'login')}
              className="font-semibold text-[#2948FC] hover:underline"
            >
              {mode === 'login' ? t('connexion.toSignupLink') : t('connexion.toLoginLink')}
            </button>
          </p>
        )}

        {legal}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  aside,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-[#17161F]">
          {label}
        </label>
        {aside}
      </div>
      <div className={FIELD}>{children}</div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  aside,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint: string | null;
  aside: ReactNode;
}) {
  const { t } = useLocale();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <Field label={label} htmlFor={id} aside={aside}>
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          maxLength={128}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={t(shown ? 'connexion.hidePassword' : 'connexion.showPassword')}
          title={t(shown ? 'connexion.hidePassword' : 'connexion.showPassword')}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg hover:bg-[#ECECF2]"
        >
          {shown ? (
            <Hide set="curved" size={18} primaryColor="#6B6878" />
          ) : (
            <Show set="curved" size={18} primaryColor="#6B6878" />
          )}
        </button>
      </Field>
      {hint && <p className="mt-1.5 text-[12px] text-[#8A8896]">{hint}</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
