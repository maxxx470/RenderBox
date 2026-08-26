'use client';

// Phase 6 — read-only static demo, no DB/API calls (D-06 spec 3: "aucune
// tentative de créer un vrai projet depuis cette page"). Preset visuals are
// CSS-drawn placeholders, not fabricated photos — RenderBox ships no real
// demo render assets, so a static gradient card per ambiance stands in.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PRESET_KEYS, PRESETS } from '@/lib/server/generation/presets';
import { useLocale } from '@/lib/i18n/LocaleContext';

const DEMO_PRESETS = PRESET_KEYS.filter((k) => k !== 'esquisse');

const PRESET_GRADIENT: Record<string, string> = {
  jour_ext: 'from-[#F1EBEC] to-[#ECE3E5]',
  jour_int: 'from-[#FCEEE9] to-[#F1EBEC]',
  nuit_ext: 'from-[#170608] to-[#3D0206]',
  nuit_int: 'from-[#1A0407] to-[#7F0000]',
};

export default function ExemplePage() {
  const t = useTranslations();
  const { locale } = useLocale();

  const materialRows = [
    { label: t('exemple.materialsFacade'), value: t('exemple.materialsFacadeValue') },
    { label: t('exemple.materialsRoof'), value: t('exemple.materialsRoofValue') },
    { label: t('exemple.materialsJoinery'), value: t('exemple.materialsJoineryValue') },
    { label: t('exemple.materialsGround'), value: t('exemple.materialsGroundValue') },
  ];

  return (
    <main className="min-h-screen bg-white px-6 py-14">
      <LanguageToggle />
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-[13px] text-[#7A6E71] hover:text-[#170608]">
          {t('exemple.backHome')}
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-poppins)] text-[26px] font-bold text-[#170608]">
          {t('exemple.title')}
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-[#7A6E71]">{t('exemple.subtitle')}</p>

        <section className="mt-9">
          <h2 className="mb-3 text-[13px] font-semibold text-[#170608]">
            {t('exemple.materialsTitle')}
          </h2>
          <div className="rounded-[16px] border border-[#ECE3E5] bg-[#F8F5F6] p-4.5">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {materialRows.map((r) => (
                <div key={r.label}>
                  <dt className="text-[11px] text-[#7A6E71]">{r.label}</dt>
                  <dd className="text-[13px] font-medium text-[#170608]">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mt-9">
          <h2 className="mb-3 text-[13px] font-semibold text-[#170608]">
            {t('exemple.rendersTitle')}
          </h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {DEMO_PRESETS.map((key) => (
              <div
                key={key}
                className={`relative flex h-40 items-end rounded-[14px] bg-gradient-to-br p-3.5 ${PRESET_GRADIENT[key]}`}
              >
                <span
                  className={`rounded-[20px] px-2.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] ${
                    key.startsWith('nuit') ? 'bg-white/15 text-white' : 'bg-white text-[#170608]'
                  }`}
                >
                  {PRESETS[key].label[locale]}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-11 rounded-[16px] bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-6 py-8 text-center">
          <h2 className="mb-4 font-[family-name:var(--font-poppins)] text-[18px] font-semibold text-white">
            {t('exemple.ctaTitle')}
          </h2>
          <Link
            href="/connexion"
            className="inline-block rounded-[10px] bg-white px-5 py-2.5 text-[13px] font-medium text-[#C81120] hover:bg-white/90"
          >
            {t('exemple.ctaButton')}
          </Link>
        </section>
      </div>
    </main>
  );
}
