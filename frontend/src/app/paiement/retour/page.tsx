// /paiement/retour — Phase 6. Maketou has no reliable webhook, so THIS page
// is one of the two places (alongside the 5-min reconciliation cron) that
// ever finds out a payment succeeded — it actively calls the verify route
// rather than trusting the redirect itself.
//
// Phase 11: a mobile-money charge is routinely still PENDING when the customer
// bounces back (the operator confirms out of band). A single check left them
// on a dead end, told to come back later with nothing moving on screen — so
// the page now keeps asking, then hands off honestly to the cron.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';

type Outcome = 'checking' | 'PAID' | 'PENDING' | 'EXPIRED' | 'FAILED' | 'PENDING_TIMEOUT';

const POLL_INTERVAL_MS = 5000;
// ~2 minutes of watching. Past that the cron is the better place to wait: it
// reconciles every 5 minutes whether or not this tab is still open.
const MAX_POLLS = 24;

export default function PaiementRetourPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [outcome, setOutcome] = useState<Outcome>('checking');
  const [elapsed, setElapsed] = useState(0);
  const pollCount = useRef(0);

  const check = useCallback(async (): Promise<Outcome> => {
    if (!orderId) return 'FAILED';
    try {
      const res = await api<{ status: string }>(
        `/api/payments/verify?orderId=${encodeURIComponent(orderId)}`,
      );
      if (res.status === 'PAID') return 'PAID';
      if (res.status === 'EXPIRED' || res.status === 'FAILED') return res.status;
      return 'PENDING';
    } catch {
      // A failed request says nothing about the payment itself — treat it as
      // "not settled yet" and let the next poll decide.
      return 'PENDING';
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setOutcome('FAILED');
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const next = await check();
      if (cancelled) return;
      setOutcome(next);
      if (next !== 'PENDING') return;
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) {
        setOutcome('PENDING_TIMEOUT');
        return;
      }
      timer = setTimeout(() => void run(), POLL_INTERVAL_MS);
    };
    void run();

    return () => {
      cancelled = true;
      clearInterval(tick);
      if (timer) clearTimeout(timer);
    };
  }, [orderId, check]);

  async function checkAgain() {
    setOutcome('checking');
    pollCount.current = 0;
    const next = await check();
    setOutcome(next);
  }

  const copy: Record<Exclude<Outcome, 'checking'>, { title: string; body: string }> = {
    PAID: { title: t('paiementRetour.paidTitle'), body: t('paiementRetour.paidBody') },
    PENDING: { title: t('paiementRetour.pendingTitle'), body: t('paiementRetour.pendingBody') },
    PENDING_TIMEOUT: {
      title: t('paiementRetour.pendingTitle'),
      body: t('paiementRetour.pendingTimeoutBody'),
    },
    EXPIRED: { title: t('paiementRetour.failedTitle'), body: t('paiementRetour.failedBody') },
    FAILED: { title: t('paiementRetour.failedTitle'), body: t('paiementRetour.failedBody') },
  };

  const watching = outcome === 'PENDING';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <LanguageToggle />
      {outcome === 'checking' ? (
        <p className="text-[13px] text-[#8A8896]">{t('paiementRetour.checking')}</p>
      ) : (
        <>
          {watching && (
            <span className="rb-spin h-7 w-7 rounded-full border-2 border-[#ECECF2] border-t-[#716FFF]" />
          )}
          <h1 className="font-[family-name:var(--font-general-sans)] text-2xl font-bold text-[#17161F]">
            {copy[outcome].title}
          </h1>
          <p className="text-[14px] text-[#8A8896]">{copy[outcome].body}</p>
          {watching && (
            <p className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
              {t('paiementRetour.pendingElapsed', { s: elapsed })}
            </p>
          )}
          {outcome === 'PENDING_TIMEOUT' && (
            <button
              type="button"
              onClick={() => void checkAgain()}
              className="rounded-[10px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              {t('paiementRetour.checkAgain')}
            </button>
          )}
        </>
      )}
      <Link
        href="/parametres"
        className="mt-4 rounded-[10px] border border-[#ECECF2] px-5 py-2 text-[13px] font-medium text-[#17161F] hover:bg-[#F7F7FA]"
      >
        {t('paiementRetour.backButton')}
      </Link>
    </main>
  );
}
