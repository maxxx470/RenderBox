'use client';

// Phase 6 — read-only static demo, no DB/API calls (D-06 spec 3: "aucune
// tentative de créer un vrai projet depuis cette page"). Preset visuals are
// CSS-drawn placeholders, not fabricated photos — RenderBox ships no real
// demo render assets, so a static gradient card per ambiance stands in.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { PRESET_KEYS, PRESETS } from '@/lib/server/generation/presets';
import { useLocale } from '@/lib/i18n/LocaleContext';

const DEMO_PRESETS = PRESET_KEYS.filter((k) => k !== 'esquisse');

const PRESET_GRADIENT: Record<string, string> = {
  jour_ext: 'from-[#F1F0F6] to-[#ECECF2]',
  jour_int: 'from-[#FCEEE9] to-[#F1F0F6]',
  nuit_ext: 'from-[#17161F] to-[#3D0206]',
  nuit_int: 'from-[#1A0407] to-[#A855F7]',
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
    <main className="min-h-screen bg-white">
      <SiteHeader links cta={{ href: '/app', label: t('landing.navStart') }} />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-[family-name:var(--font-general-sans)] text-[26px] font-bold text-[#17161F]">
          {t('exemple.title')}
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-[#8A8896]">{t('exemple.subtitle')}</p>

        <section className="mt-9">
          <h2 className="mb-3 text-[13px] font-semibold text-[#17161F]">
            {t('exemple.materialsTitle')}
          </h2>
          <div className="rounded-[16px] border border-[#ECECF2] bg-[#F7F7FA] p-4.5">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {materialRows.map((r) => (
                <div key={r.label}>
                  <dt className="text-[11px] text-[#8A8896]">{r.label}</dt>
                  <dd className="text-[13px] font-medium text-[#17161F]">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mt-9">
          <h2 className="mb-3 text-[13px] font-semibold text-[#17161F]">
            {t('exemple.rendersTitle')}
          </h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {DEMO_PRESETS.map((key) => (
              <div
                key={key}
                className={`relative flex h-40 items-end rounded-[14px] bg-gradient-to-br p-3.5 ${PRESET_GRADIENT[key]}`}
              >
                <span
                  className={`rounded-[20px] px-2.5 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] ${
                    key.startsWith('nuit') ? 'bg-white/15 text-white' : 'bg-white text-[#17161F]'
                  }`}
                >
                  {PRESETS[key].label[locale]}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-11 rounded-[16px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-6 py-8 text-center">
          <h2 className="mb-4 font-[family-name:var(--font-general-sans)] text-[18px] font-semibold text-white">
            {t('exemple.ctaTitle')}
          </h2>
          <Link
            href="/connexion"
            className="inline-block rounded-[10px] bg-white px-5 py-2.5 text-[13px] font-medium text-[#716FFF] hover:bg-white/90"
          >
            {t('exemple.ctaButton')}
          </Link>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
