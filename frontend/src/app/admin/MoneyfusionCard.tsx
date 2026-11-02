'use client';

// « Paiements — MoneyFusion » (2026-11-01, owner: « c'est fait », then the
// application was approved).
//
// Two questions the owner cannot answer from the outside, answered by a
// button each:
//
//  1. Does MoneyFusion accept our calls? Their IP allowlist is the one thing
//     that can stop every payment in silence, and their error names the
//     blocked IP — so the message is shown VERBATIM rather than summarised.
//  2. Which address does this server call out from? A Vercel function has no
//     stable outbound IP, so more than one address in a single pass is proof
//     the allowlist cannot hold.
//
// This lives in the admin rather than as a URL to open, because opening an
// API route in the address bar skips the client's session refresh and just
// answers « Missing token » once the 15-minute access token has expired.
import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface CheckResult {
  ok: boolean;
  message?: string;
  error?: string;
  hint?: string;
  tokenPreview?: string;
  amountSentXof?: number;
  reason?: string;
  region?: string | null;
}

interface EgressResult {
  addresses: string[];
  stable: boolean;
  region: string | null;
  note: string;
}

export function MoneyfusionCard() {
  const { t } = useLocale();
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [egress, setEgress] = useState<EgressResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'egress' | null>(null);

  const runCheck = useCallback(async () => {
    setBusy('check');
    setCheck(null);
    try {
      setCheck(await api<CheckResult>('/api/admin/moneyfusion-check'));
    } catch (e) {
      setCheck({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }, []);

  const runEgress = useCallback(async () => {
    setBusy('egress');
    setEgress(null);
    try {
      setEgress(await api<EgressResult>('/api/admin/egress-ip'));
    } catch {
      setEgress(null);
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-white p-4 min-[640px]:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A8896]">
            {t('admin.pay.title')}
          </p>
          <p className="max-w-[62ch] text-[13px] leading-relaxed text-[#6B6878]">
            {t('admin.pay.what')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={busy !== null}
            className="h-10 rounded-xl bg-[#2948FC] px-4 text-[13.5px] font-semibold text-white hover:bg-[#1E36D6] disabled:opacity-50"
          >
            {busy === 'check' ? t('admin.pay.testing') : t('admin.pay.test')}
          </button>
          <button
            type="button"
            onClick={() => void runEgress()}
            disabled={busy !== null}
            className="h-10 rounded-xl bg-[#F2F2F5] px-4 text-[13.5px] font-medium text-[#17161F] hover:bg-[#E9E9EE] disabled:opacity-50"
          >
            {busy === 'egress' ? t('admin.pay.reading') : t('admin.pay.ip')}
          </button>
        </div>
      </div>

      {check ? (
        <div
          className={`rounded-xl p-3.5 ${check.ok ? 'bg-[#1E7A3D0F]' : 'bg-[#FFE4E7]'}`}
          role="status"
        >
          <p
            className={`text-[13px] font-semibold ${check.ok ? 'text-[#1E7A3D]' : 'text-[#C21F33]'}`}
          >
            {check.ok ? t('admin.pay.okTitle') : t('admin.pay.koTitle')}
          </p>
          {/* Their words, not ours: the blocked IP is named in here. */}
          <p className="mt-1 break-words font-[family-name:var(--font-mono)] text-[11.5px] leading-relaxed text-[#3D3B49]">
            {check.message ?? check.error ?? check.reason ?? ''}
          </p>
          {check.hint && !check.ok ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#6B6878]">{check.hint}</p>
          ) : null}
        </div>
      ) : null}

      {egress ? (
        <div className="rounded-xl bg-[#F7F7FA] p-3.5">
          <p className="text-[13px] font-semibold text-[#17161F]">
            {t('admin.pay.ipTitle', { n: String(egress.addresses.length) })}
          </p>
          <p className="mt-1 break-words font-[family-name:var(--font-mono)] text-[12px] text-[#2948FC]">
            {egress.addresses.join(' · ') || '—'}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#6B6878]">{egress.note}</p>
        </div>
      ) : null}

      <p className="text-[12px] text-[#8A8896]">{t('admin.pay.note')}</p>
    </section>
  );
}
