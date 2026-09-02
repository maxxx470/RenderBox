// /paiement/retour — Phase 6. Maketou has no reliable webhook, so THIS page
// is one of the two places (alongside the 5-min reconciliation cron) that
// ever finds out a payment succeeded — it actively calls the verify route
// rather than trusting the redirect itself.
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';

type Outcome = 'checking' | 'PAID' | 'PENDING' | 'EXPIRED' | 'FAILED';

export default function PaiementRetourPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [outcome, setOutcome] = useState<Outcome>('checking');

  useEffect(() => {
    if (!orderId) {
      setOutcome('FAILED');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ status: string }>(
          `/api/payments/verify?orderId=${encodeURIComponent(orderId)}`,
        );
        if (cancelled) return;
        if (res.status === 'PAID') setOutcome('PAID');
        else if (res.status === 'EXPIRED' || res.status === 'FAILED') setOutcome(res.status);
        else setOutcome('PENDING');
      } catch {
        if (!cancelled) setOutcome('PENDING');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const copy: Record<Exclude<Outcome, 'checking'>, { title: string; body: string }> = {
    PAID: { title: t('paiementRetour.paidTitle'), body: t('paiementRetour.paidBody') },
    PENDING: { title: t('paiementRetour.pendingTitle'), body: t('paiementRetour.pendingBody') },
    EXPIRED: { title: t('paiementRetour.failedTitle'), body: t('paiementRetour.failedBody') },
    FAILED: { title: t('paiementRetour.failedTitle'), body: t('paiementRetour.failedBody') },
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <LanguageToggle />
      {outcome === 'checking' ? (
        <p className="text-[13px] text-[#8A8896]">{t('paiementRetour.checking')}</p>
      ) : (
        <>
          <h1 className="font-[family-name:var(--font-general-sans)] text-2xl font-bold text-[#17161F]">
            {copy[outcome].title}
          </h1>
          <p className="text-[14px] text-[#8A8896]">{copy[outcome].body}</p>
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
