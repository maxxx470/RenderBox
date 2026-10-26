'use client';

// The one question Google Analytics makes necessary. It is a real question:
// « Refuser » is a button of the same size as « Accepter », it is remembered,
// and nothing is measured until « Accepter » is pressed (lib/analytics.ts).
//
// Charter: white card on the grey ground, 16px corners, no outline, the blue
// gradient on the accepting button and the soft grey fill on the other.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { Consent } from '@/lib/analytics';

export function ConsentBanner({ onAnswer }: { onAnswer: (consent: Consent) => void }) {
  const t = useTranslations();
  return (
    <div
      role="dialog"
      aria-label={t('consent.title')}
      className="fixed inset-x-0 bottom-0 z-[80] px-3 pb-3 pt-2"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_18px_40px_-20px_rgba(23,22,31,0.45)] min-[640px]:flex-row min-[640px]:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-[#17161F]">{t('consent.title')}</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-[#6B6878]">
            {t('consent.body')}{' '}
            <Link href="/legal" className="text-[#2948FC] hover:underline">
              {t('consent.legal')}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onAnswer('denied')}
            className="h-10 flex-1 rounded-xl bg-[#F2F2F5] px-4 text-[13px] font-semibold text-[#17161F] transition-colors hover:bg-[#E9E9EE] min-[640px]:flex-none"
          >
            {t('consent.refuse')}
          </button>
          <button
            type="button"
            onClick={() => onAnswer('granted')}
            className="h-10 flex-1 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-4 text-[13px] font-semibold text-white min-[640px]:flex-none"
          >
            {t('consent.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
