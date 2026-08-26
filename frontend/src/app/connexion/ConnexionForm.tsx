'use client';

import { useState, type FormEvent } from 'react';
import { Message } from 'react-iconly';
import { api, ApiError } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';

type Status = 'idle' | 'submitting' | 'sent' | 'error';

export function ConnexionForm({ initialError }: { initialError?: 'invalid' | 'expired' | null }) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>(initialError ? 'error' : 'idle');
  const [error, setError] = useState<string | null>(
    initialError === 'expired'
      ? t('verifier.expiredBody')
      : initialError === 'invalid'
        ? t('verifier.invalidBody')
        : null,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      await api('/api/auth/magic-link/request', { method: 'POST', body: { email } });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      if (err instanceof ApiError && err.status === 429) {
        setError(t('connexion.errorRateLimited'));
      } else {
        setError(t('connexion.errorGeneric'));
      }
    }
  }

  if (status === 'sent') {
    return (
      <div className="text-center">
        <h1 className="mb-1.5 font-[family-name:var(--font-poppins)] text-xl font-semibold text-[#170608]">
          {t('connexion.sentTitle')}
        </h1>
        <p className="text-sm text-[#7A6E71]">{t('connexion.sentBody')}</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-1.5 text-center font-[family-name:var(--font-poppins)] text-xl font-semibold text-[#170608]">
        {t('connexion.heading')}
      </h1>
      <p className="mb-7 text-center text-[13px] text-[#7A6E71]">{t('connexion.subheading')}</p>

      <a
        href="/api/auth/oauth/google/start?next=/app"
        className="mb-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#ECE3E5] px-3 py-3 text-sm font-medium text-[#170608] hover:bg-[#F8F5F6]"
      >
        <GoogleMark />
        {t('connexion.googleButton')}
      </a>

      <div className="mb-5 flex items-center gap-2.5">
        <div className="h-px flex-1 bg-[#ECE3E5]" />
        <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
          {t('connexion.or')}
        </span>
        <div className="h-px flex-1 bg-[#ECE3E5]" />
      </div>

      <form onSubmit={onSubmit}>
        <label className="mb-1.5 block text-xs text-[#7A6E71]" htmlFor="connexion-email">
          {t('connexion.emailLabel')}
        </label>
        <div className="mb-3.5 flex items-center gap-2 rounded-xl border border-[#ECE3E5] bg-[#F8F5F6] px-3.5 py-3 focus-within:border-[#C81120]">
          <Message set="bold" size={18} primaryColor="#7A6E71" />
          <input
            id="connexion-email"
            type="email"
            required
            placeholder={t('connexion.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent text-sm text-[#170608] outline-none placeholder:text-[#7A6E71]"
          />
        </div>

        {error && (
          <p role="alert" className="mb-3 text-sm text-[#C81120]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {status === 'submitting' ? t('connexion.submitting') : t('connexion.submitButton')}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-[#7A6E71]">{t('connexion.hint')}</p>
    </>
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
