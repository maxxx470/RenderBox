'use client';

// RenderBox landing page — replaces the izikit starter's default status
// page. Layout/copy reproduced from the validated landing mockup (hero +
// stats + alternating split sections + 3 presets + integrations + dark CTA
// band + footer). Bilingual via the existing i18n system (landing.* keys in
// lib/i18n/dictionaries) — no hardcoded strings.
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';

function AccentText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-br from-[#E8121F] to-[#7F0000] bg-clip-text text-transparent">
      {children}
    </span>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13.5px] text-[#170608]">
      <span className="font-bold text-[#C81120]">✓</span>
      {children}
    </li>
  );
}

function FicheRow({ face, value, tag }: { face: string; value: string; tag: string }) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-[10px] border border-[#ECE3E5] bg-white px-3.5 py-2.5">
      <div>
        <span className="block font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#7A6E71]">
          {face}
        </span>
        <span className="text-[13px] font-semibold text-[#170608]">{value}</span>
      </div>
      <span className="rounded-[6px] bg-[#C8112012] px-1.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[9px] text-[#C81120]">
        {tag}
      </span>
    </div>
  );
}

function TreeNode({
  label,
  tag,
  child,
  extraIndent,
}: {
  label: string;
  tag: string;
  child?: boolean;
  extraIndent?: boolean;
}) {
  return (
    <div
      className={`mb-2.5 flex items-center gap-2 ${child ? 'ml-6.5' : ''} ${extraIndent ? 'ml-13' : ''}`}
    >
      <div className="h-6 w-6 flex-shrink-0 rounded-md bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
      <div>
        <div className="text-xs font-medium text-[#170608]">{label}</div>
        <div className="font-[family-name:var(--font-ibm-plex-mono)] text-[9px] text-[#7A6E71]">
          {tag}
        </div>
      </div>
    </div>
  );
}

function PresetCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#ECE3E5] bg-[#F8F5F6] p-6.5">
      <div className="mb-4 h-10.5 w-10.5 rounded-[10px] bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
      <h4 className="mb-2 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#170608]">
        {title}
      </h4>
      <p className="text-[13px] leading-[1.55] text-[#7A6E71]">{body}</p>
    </div>
  );
}

export default function LandingPage() {
  const t = useTranslations();

  return (
    <main className="bg-white">
      <LanguageToggle />
      <div className="mx-auto max-w-[1180px] px-6">
        {/* NAV */}
        <nav className="flex items-center justify-between py-5">
          <Link
            href="/"
            className="flex items-center gap-2 font-[family-name:var(--font-poppins)] text-[17px] font-bold text-[#170608]"
          >
            <div className="h-6.5 w-6.5 rounded-[7px] bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
            RenderBox
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-[#7A6E71] min-[860px]:flex">
            <a href="#fonctionnalites" className="hover:text-[#170608]">
              {t('landing.navFeatures')}
            </a>
            <a href="#tarifs" className="hover:text-[#170608]">
              {t('landing.navPricing')}
            </a>
            <Link href="/exemple" className="hover:text-[#170608]">
              {t('landing.navExamples')}
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/connexion" className="text-sm text-[#7A6E71] hover:text-[#170608]">
              {t('landing.navLogin')}
            </Link>
            <Link
              href="/connexion"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_#C8112050]"
            >
              {t('landing.navStart')}
            </Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="grid grid-cols-1 items-center gap-12.5 py-15 pb-10 min-[860px]:grid-cols-2">
          <div>
            <div className="mb-4.5 inline-block rounded-[20px] bg-[#C8112012] px-3 py-1.5 font-[family-name:var(--font-ibm-plex-mono)] text-xs text-[#C81120]">
              {t('landing.heroEyebrow')}
            </div>
            <h1 className="mb-4.5 font-[family-name:var(--font-poppins)] text-[44px] font-bold leading-[1.12] tracking-[-1px] text-[#170608]">
              {t('landing.heroTitlePrefix')}
              <AccentText>{t('landing.heroTitleAccent')}</AccentText>
              {t('landing.heroTitleSuffix')}
            </h1>
            <p className="mb-7 max-w-[440px] text-[15px] leading-[1.6] text-[#7A6E71]">
              {t('landing.heroSubtitle')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/connexion"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_#C8112050]"
              >
                {t('landing.heroCtaPrimary')}
              </Link>
              <Link
                href="/exemple"
                className="inline-flex items-center gap-2 rounded-xl border border-[#ECE3E5] px-6 py-3.5 text-sm font-semibold text-[#170608]"
              >
                {t('landing.heroCtaSecondary')}
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -top-4 right-5 z-10 rounded-xl border border-[#ECE3E5] bg-white px-3.5 py-2.5 font-[family-name:var(--font-ibm-plex-mono)] text-xs shadow-[0_14px_30px_-12px_#17060830]">
              {t('landing.heroChipMaterials')
                .split(':')
                .map((part, i) =>
                  i === 0 ? (
                    <span key={i}>{part}:</span>
                  ) : (
                    <b key={i} className="text-[#C81120]">
                      {part}
                    </b>
                  ),
                )}
            </div>
            <div className="rounded-2xl border border-[#ECE3E5] bg-[#F8F5F6] p-5 shadow-[0_30px_60px_-30px_#17060820]">
              <div className="mb-3.5 flex items-center justify-between">
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
                  {t('landing.heroPreviewProject')}
                </span>
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
                  {t('landing.heroPreviewEngine')}
                </span>
              </div>
              <div className="relative mb-3.5 h-[190px] overflow-hidden rounded-xl bg-gradient-to-br from-[#3D0206] to-[#1A0407]">
                <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-black/30 px-2 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#F8D6D6]">
                  {t('landing.heroPreviewCaption')}
                </span>
              </div>
              <div className="flex gap-2.5">
                <div className="h-13 flex-1 rounded-lg border border-[#C81120] bg-[#F1EBEC]" />
                <div className="h-13 flex-1 rounded-lg border border-[#ECE3E5] bg-[#F1EBEC]" />
                <div className="h-13 flex-1 rounded-lg border border-[#ECE3E5] bg-[#F1EBEC]" />
                <div className="h-13 flex-1 rounded-lg border border-[#ECE3E5] bg-[#F1EBEC]" />
              </div>
            </div>
            <div className="absolute -bottom-4.5 -left-2.5 rounded-xl border border-[#ECE3E5] bg-white px-3.5 py-2.5 text-xs shadow-[0_14px_30px_-12px_#17060830]">
              {t('landing.heroChipFacade')}
            </div>
          </div>
        </section>

        {/* TRUST BAR */}
        <div className="flex flex-wrap justify-center gap-11 border-b border-[#ECE3E5] py-9 pb-15">
          <div className="text-center">
            <b className="block font-[family-name:var(--font-poppins)] text-xl text-[#170608]">4</b>
            <span className="text-xs text-[#7A6E71]">{t('landing.trustPresets')}</span>
          </div>
          <div className="text-center">
            <b className="block font-[family-name:var(--font-poppins)] text-xl text-[#170608]">2</b>
            <span className="text-xs text-[#7A6E71]">{t('landing.trustEngines')}</span>
          </div>
          <div className="text-center">
            <b className="block font-[family-name:var(--font-poppins)] text-xl text-[#170608]">0</b>
            <span className="text-xs text-[#7A6E71]">{t('landing.trustMaterials')}</span>
          </div>
        </div>

        {/* SPLIT 1 — materials memory */}
        <section id="fonctionnalites" className="py-20">
          <div className="grid grid-cols-1 items-center gap-14 py-12.5 min-[860px]:grid-cols-2">
            <div>
              <span className="mb-2.5 block font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#C81120]">
                {t('landing.split1Tag')}
              </span>
              <h3 className="mb-3 font-[family-name:var(--font-poppins)] text-[26px] font-bold tracking-[-0.4px] text-[#170608]">
                {t('landing.split1Title')}
              </h3>
              <p className="mb-4.5 max-w-[400px] text-[14.5px] leading-[1.65] text-[#7A6E71]">
                {t('landing.split1Body')}
              </p>
              <ul className="flex flex-col gap-2.5">
                <CheckItem>{t('landing.split1Check1')}</CheckItem>
                <CheckItem>{t('landing.split1Check2')}</CheckItem>
                <CheckItem>{t('landing.split1Check3')}</CheckItem>
              </ul>
            </div>
            <div className="rounded-2xl border border-[#ECE3E5] bg-[#F8F5F6] p-5.5">
              <FicheRow
                face={t('landing.split1FaceMain')}
                value={t('landing.split1FaceMainValue')}
                tag={t('landing.split1AutoTag')}
              />
              <FicheRow
                face={t('landing.split1FaceBack')}
                value={t('landing.split1FaceBackValue')}
                tag={t('landing.split1AutoTag')}
              />
              <FicheRow
                face={t('landing.split1Joinery')}
                value={t('landing.split1JoineryValue')}
                tag={t('landing.split1AutoTag')}
              />
              <FicheRow
                face={t('landing.split1Roof')}
                value={t('landing.split1RoofValue')}
                tag={t('landing.split1AutoTag')}
              />
            </div>
          </div>

          {/* SPLIT 2 — tree gallery (reversed) */}
          <div className="grid grid-cols-1 items-center gap-14 py-12.5 min-[860px]:grid-cols-2">
            <div className="min-[860px]:order-2">
              <span className="mb-2.5 block font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#C81120]">
                {t('landing.split2Tag')}
              </span>
              <h3 className="mb-3 font-[family-name:var(--font-poppins)] text-[26px] font-bold tracking-[-0.4px] text-[#170608]">
                {t('landing.split2Title')}
              </h3>
              <p className="mb-4.5 max-w-[400px] text-[14.5px] leading-[1.65] text-[#7A6E71]">
                {t('landing.split2Body')}
              </p>
              <ul className="flex flex-col gap-2.5">
                <CheckItem>{t('landing.split2Check1')}</CheckItem>
                <CheckItem>{t('landing.split2Check2')}</CheckItem>
                <CheckItem>{t('landing.split2Check3')}</CheckItem>
              </ul>
            </div>
            <div className="rounded-2xl border border-[#ECE3E5] bg-[#F8F5F6] p-5.5 min-[860px]:order-1">
              <div className="rounded-[10px] border border-[#ECE3E5] bg-white p-4">
                <TreeNode
                  label={t('landing.split2NodeUpload')}
                  tag={t('landing.split2NodeSource')}
                />
                <TreeNode
                  label={t('landing.split2NodeDay')}
                  tag={t('landing.heroPreviewEngine')}
                  child
                />
                <TreeNode
                  label={t('landing.split2NodeNight')}
                  tag={t('landing.heroPreviewEngine')}
                  child
                />
                <TreeNode label={t('landing.split2NodeExtra')} tag="gpt image" extraIndent />
              </div>
            </div>
          </div>
        </section>

        {/* 3 PRESETS */}
        <section className="py-20">
          <div className="mx-auto mb-11.5 max-w-[560px] text-center">
            <h2 className="text-[30px] font-bold tracking-[-0.6px] leading-[1.25] text-[#170608]">
              {t('landing.presetsTitlePrefix')}
              <AccentText>{t('landing.presetsTitleAccent')}</AccentText>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5.5 min-[860px]:grid-cols-3">
            <PresetCard
              title={t('landing.presetsCard1Title')}
              body={t('landing.presetsCard1Body')}
            />
            <PresetCard
              title={t('landing.presetsCard2Title')}
              body={t('landing.presetsCard2Body')}
            />
            <PresetCard
              title={t('landing.presetsCard3Title')}
              body={t('landing.presetsCard3Body')}
            />
          </div>
        </section>

        {/* INTEGRATIONS */}
        <section id="tarifs" className="py-20 text-center">
          <div className="mx-auto mb-11.5 max-w-[560px]">
            <h2 className="text-[30px] font-bold tracking-[-0.6px] leading-[1.25] text-[#170608]">
              {t('landing.integrationsTitlePrefix')}
              <AccentText>{t('landing.integrationsTitleAccent')}</AccentText>
            </h2>
            <p className="mt-2.5 text-sm text-[#7A6E71]">{t('landing.integrationsSubtitle')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex h-13 w-13 items-center justify-center rounded-[14px] border border-[#ECE3E5] bg-[#F8F5F6] px-2 text-center font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#7A6E71]">
              {t('landing.heroPreviewEngine')}
            </div>
            <div className="flex h-13 w-13 items-center justify-center rounded-[14px] border border-[#ECE3E5] bg-[#F8F5F6] px-2 text-center font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#7A6E71]">
              GPT Image
            </div>
            <div className="flex h-13 w-13 items-center justify-center rounded-[14px] border border-[#ECE3E5] bg-[#F8F5F6] px-2 text-center font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#7A6E71]">
              Claude Vision
            </div>
          </div>
        </section>

        {/* CTA DARK BAND */}
        <section className="py-20">
          <div className="grid grid-cols-1 items-center gap-10 rounded-3xl bg-gradient-to-br from-[#1A0407] to-[#3D0206] p-9 py-14 text-white min-[860px]:grid-cols-[1.1fr_0.9fr] min-[860px]:px-12.5">
            <div>
              <h2 className="mb-3.5 text-[28px] font-bold leading-[1.25]">
                {t('landing.ctaBandTitle')}
              </h2>
              <p className="mb-6 max-w-[380px] text-sm text-[#E8C9CB]">
                {t('landing.ctaBandBody')}
              </p>
              <Link
                href="/connexion"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_#C8112050]"
              >
                {t('landing.ctaBandButton')}
              </Link>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
              <div className="mb-3.5 flex items-center justify-between">
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#E8C9CB]">
                  {t('landing.ctaBandPreviewTag')}
                </span>
              </div>
              <div className="mb-3.5 h-[190px] rounded-xl bg-gradient-to-br from-[#3D0206] to-[#1A0407]" />
              <div className="flex gap-2.5">
                <div className="h-13 flex-1 rounded-lg border border-white/20 bg-white/10" />
                <div className="h-13 flex-1 rounded-lg border border-white/20 bg-white/10" />
              </div>
            </div>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-5.5 min-[860px]:grid-cols-2">
            <div className="rounded-2xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] p-7.5 text-white">
              <h4 className="mb-1.5 text-lg font-semibold">{t('landing.ctaChatTitle')}</h4>
              <p className="mb-4.5 text-[13px] opacity-85">{t('landing.ctaChatBody')}</p>
              <button
                type="button"
                className="rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-[#170608]"
              >
                {t('landing.ctaChatButton')}
              </button>
            </div>
            <div className="rounded-2xl bg-[#1A0407] p-7.5 text-white">
              <h4 className="mb-1.5 text-lg font-semibold">{t('landing.ctaDemoTitle')}</h4>
              <p className="mb-4.5 text-[13px] opacity-85">{t('landing.ctaDemoBody')}</p>
              <Link
                href="/exemple"
                className="inline-block rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-[#170608]"
              >
                {t('landing.ctaDemoButton')}
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mt-15 border-t border-[#ECE3E5] py-15 pb-7.5">
          <div className="flex flex-wrap justify-between gap-10 pb-10">
            <Link
              href="/"
              className="flex items-center gap-2 font-[family-name:var(--font-poppins)] text-[17px] font-bold text-[#170608]"
            >
              <div className="h-6.5 w-6.5 rounded-[7px] bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
              RenderBox
            </Link>
            <div className="flex flex-wrap gap-15">
              <div>
                <h5 className="mb-3.5 font-[family-name:var(--font-poppins)] text-xs uppercase tracking-wide text-[#7A6E71]">
                  {t('landing.footerProductHeading')}
                </h5>
                <a href="#fonctionnalites" className="mb-2.5 block text-[13px] text-[#170608]">
                  {t('landing.navFeatures')}
                </a>
                <a href="#tarifs" className="mb-2.5 block text-[13px] text-[#170608]">
                  {t('landing.navPricing')}
                </a>
                <Link href="/exemple" className="mb-2.5 block text-[13px] text-[#170608]">
                  {t('landing.navExamples')}
                </Link>
              </div>
              <div>
                <h5 className="mb-3.5 font-[family-name:var(--font-poppins)] text-xs uppercase tracking-wide text-[#7A6E71]">
                  {t('landing.footerResourcesHeading')}
                </h5>
                <span className="mb-2.5 block text-[13px] text-[#7A6E71]">
                  {t('landing.footerLinkGuide')}
                </span>
                <span className="mb-2.5 block text-[13px] text-[#7A6E71]">
                  {t('landing.footerLinkBlog')}
                </span>
              </div>
              <div>
                <h5 className="mb-3.5 font-[family-name:var(--font-poppins)] text-xs uppercase tracking-wide text-[#7A6E71]">
                  {t('landing.footerSupportHeading')}
                </h5>
                <span className="mb-2.5 block text-[13px] text-[#7A6E71]">
                  {t('landing.footerLinkContact')}
                </span>
                <span className="mb-2.5 block text-[13px] text-[#7A6E71]">
                  {t('landing.footerLinkHelp')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-[#ECE3E5] pt-6 text-xs text-[#7A6E71]">
            <span>{t('landing.footerCopyright', { year: new Date().getFullYear() })}</span>
            <Link href="/legal" className="hover:text-[#170608]">
              {t('landing.footerLegalLinks')}
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
