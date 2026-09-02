'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';

type Tab = 'terms' | 'privacy';

export default function LegalPage() {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>('terms');

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-14">
      <LanguageToggle />
      <Link href="/" className="text-[13px] text-[#8A8896] hover:text-[#17161F]">
        {t('legal.backHome')}
      </Link>

      <h1 className="mt-4 mb-6 font-[family-name:var(--font-general-sans)] text-2xl font-bold text-[#17161F]">
        {t('legal.title')}
      </h1>

      <div className="mb-6 flex gap-1 border-b border-[#ECECF2]">
        {(['terms', 'privacy'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-[13px] font-medium ${
              tab === key
                ? 'border-b-2 border-[#716FFF] text-[#716FFF]'
                : 'text-[#8A8896] hover:text-[#17161F]'
            }`}
          >
            {key === 'terms' ? t('legal.tabTerms') : t('legal.tabPrivacy')}
          </button>
        ))}
      </div>

      <p className="whitespace-pre-line text-[14px] leading-relaxed text-[#17161F]">
        {tab === 'terms' ? t('legal.termsBody') : t('legal.privacyBody')}
      </p>
    </main>
  );
}
