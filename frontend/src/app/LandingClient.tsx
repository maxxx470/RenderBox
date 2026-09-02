'use client';

// RenderBox landing page — v2 redesign (2026-09-02), reproducing the visual
// system of a reference site (structure, tokens, type pairing) with
// RenderBox's own copy and product. This design system is now the site-wide
// charter (2026-09-02 update) — /app, /admin, /parametres etc. were ported
// off the old red/Poppins charter onto these same tokens, so changes here to
// the shared palette/type pairing should stay consistent with the rest of
// the app. Bilingual via the existing i18n system (landing.* keys in
// lib/i18n/dictionaries) — no hardcoded strings.
//
// Tokens (extracted from the reference site's shipped CSS, kept exact):
//   ink #17161F · ink-2 #3D3B49 · muted #8A8896
//   line #ECECF2 · line-strong #DEDEE8 · band #F7F7FA · surface-2 #FBFBFD
//   violet #716FFF · violet-2 #A264FF · violet-3 #6470FF
//   signature gradient: linear-gradient(135deg,#6E6BFF 0%,#8B5CF6 48%,#A855F7 100%)
//   error/danger (semantic, NOT brand): #E5484D — used only for error text
//   and destructive actions, never for accents
// Fonts: General Sans + JetBrains Mono (tags/technical values), loaded once
// site-wide in the root layout (frontend/src/app/layout.tsx).
//
// No fabricated testimonials/ratings/"trusted by N" claims — RenderBox has
// no real customers yet; inventing quotes would be deceptive. The reference
// site's social-proof section is intentionally replaced with the honest
// stat strip that was already on the page (presets/engines/materials).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Home,
  Location,
  Graph,
  TickSquare,
  Image as ImageIcon,
  Category,
  Edit,
} from 'react-iconly';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { PRESETS } from '@/lib/server/generation/presets';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { PRICING_TIERS, type PricingTier, type PricingTierId } from '@/lib/pricing-tiers';
import { Reveal } from './Reveal';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { FaqAccordion } from './FaqAccordion';
import { Kicker } from './Kicker';
import { CountUp } from './CountUp';
import { AudienceTabs, type AudienceTabData } from './AudienceTabs';
import { StaggeredChecklist } from './StaggeredChecklist';
import { MaterialsFeedStudio } from './MaterialsFeedStudio';
import { TreeGallery } from './TreeGallery';
import { EnginesStateTiles } from './EnginesStateTiles';
import { StickyBar } from './StickyBar';
import { HeroFan } from './HeroFan';
import { HERO_CARDS } from './hero-cards';

// Tailwind's JIT scanner only detects complete, literal class-name tokens in
// the source text — it can't see a class assembled at runtime from a plain
// CSS-value constant interpolated into `bg-[${x}]`. Defining the full class
// name itself here (not just the CSS value) keeps every usage below a
// single, complete token the scanner can find, exactly like MONO already is.
const GRADIENT = 'bg-[linear-gradient(135deg,#6E6BFF_0%,#8B5CF6_48%,#A855F7_100%)]';
const MONO = 'font-[family-name:var(--font-jetbrains-mono)]';

function EyebrowTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-[#EFECFF] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-[#716FFF] ${MONO}`}
    >
      {children}
    </span>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  return <span className={`${GRADIENT} bg-clip-text text-transparent`}>{children}</span>;
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13.5px] text-[#3D3B49]">
      <span className="mt-0.5 flex-shrink-0 text-[#716FFF]">
        <TickSquare set="bold" size={15} primaryColor="#716FFF" />
      </span>
      {children}
    </li>
  );
}

function PresetCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#ECECF2] bg-[#FBFBFD] p-6.5 transition-colors hover:border-[#CFCADF]">
      <div
        className={`mb-4 flex h-10.5 w-10.5 items-center justify-center rounded-[10px] ${GRADIENT}`}
      >
        <Category set="bold" size={18} primaryColor="#ffffff" />
      </div>
      <h4 className="mb-2 text-[15px] font-semibold text-[#17161F]">{title}</h4>
      <p className="text-[13px] leading-[1.55] text-[#6B6880]">{body}</p>
    </div>
  );
}

function PricingCard({
  tier,
  onSelect,
  loading,
  error,
}: {
  tier: PricingTier;
  onSelect: () => void;
  loading: boolean;
  error: string | null;
}) {
  const t = useTranslations();
  const name =
    tier.id === 'decouverte'
      ? t('landing.pricingTierDecouverteName')
      : tier.id === 'standard'
        ? t('landing.pricingTierStandardName')
        : t('landing.pricingTierProName');

  return (
    <div
      className={`relative flex flex-col gap-5 rounded-2xl border p-6.5 transition-[transform,box-shadow] duration-[250ms] ease-out hover:-translate-y-[3px] ${
        tier.featured
          ? 'border-[#716FFF] bg-white shadow-[0_20px_40px_-24px_rgba(113,111,255,0.45)] hover:shadow-[0_28px_48px_-20px_rgba(113,111,255,0.55)]'
          : 'border-[#ECECF2] bg-[#FBFBFD] hover:shadow-[0_16px_32px_-18px_rgba(23,22,31,0.2)]'
      }`}
    >
      {tier.featured ? (
        <span
          className={`rb-badge-pulse absolute -top-3 left-6.5 rounded-full ${GRADIENT} px-3 py-1 text-[11px] font-semibold text-white`}
        >
          {t('landing.pricingBadgeFeatured')}
        </span>
      ) : null}
      <div>
        <h3 className="text-lg font-semibold text-[#17161F]">{name}</h3>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-[16px] font-bold text-[#17161F]">
            {tier.priceXof.toLocaleString('fr-FR')} FCFA
          </span>
          <span className="text-[12px] text-[#8A8896]">{t('landing.pricingPeriod')}</span>
        </div>
        <div className={`text-[12px] text-[#8A8896] ${MONO}`}>~{tier.priceUsdDisplay} $</div>
      </div>
      <ul className="flex flex-col gap-2.5">
        <CheckItem>
          <span className={`font-semibold text-[#17161F] ${MONO}`}>
            {t('landing.pricingFeatureQuota', { count: tier.generationsPerMonth })}
          </span>
        </CheckItem>
        <CheckItem>{t('landing.pricingFeatureEngines')}</CheckItem>
        <CheckItem>{t('landing.pricingFeaturePresets')}</CheckItem>
        <CheckItem>{t('landing.pricingFeatureEditing')}</CheckItem>
      </ul>
      <button
        type="button"
        disabled={loading}
        onClick={onSelect}
        className={`mt-auto inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-60 ${
          tier.featured
            ? `${GRADIENT} text-white shadow-[0_10px_26px_-6px_rgba(113,111,255,0.6)]`
            : 'border border-[#ECECF2] text-[#17161F] hover:border-[#CFCADF]'
        }`}
      >
        {loading ? t('landing.pricingCtaLoading') : t('landing.pricingCta', { tier: name })}
      </button>
      {error ? <p className="text-[12px] text-[#E5484D]">{error}</p> : null}
    </div>
  );
}

function SketchVisual() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#F7F7FA]">
      <svg viewBox="0 0 200 140" className="h-3/4 w-3/4 text-[#CFCADF]" fill="none">
        <rect x="20" y="60" width="160" height="60" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 60 L100 20 L180 60" stroke="currentColor" strokeWidth="1.5" />
        <rect x="45" y="80" width="24" height="40" stroke="currentColor" strokeWidth="1.2" />
        <rect x="90" y="80" width="20" height="20" stroke="currentColor" strokeWidth="1.2" />
        <rect x="130" y="80" width="20" height="20" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

// Floating tags around the headline, in the spirit of the reference's named
// cursors — but labelled with the real ambiance presets. The originals are
// other users' cursors, which would advertise a live presence feature
// RenderBox does not have; preset names keep the same visual rhythm and
// happen to explain the product at a glance.
//
// Hidden below 1100px: they sit in the headline's margins, and the charter
// forbids floating controls that collide with content on small viewports.
const TAG_POSITIONS = [
  { preset: 'jour_ext', className: 'left-0 top-10', style: 'gradient' },
  { preset: 'esquisse', className: 'right-0 top-24', style: 'ink' },
  { preset: 'nuit_int', className: 'left-10 top-48', style: 'tint' },
] as const;

function HeroPresetTags() {
  const { locale } = useLocale();

  return (
    <div aria-hidden className="pointer-events-none hidden min-[1100px]:block">
      {TAG_POSITIONS.map(({ preset, className, style }, i) => (
        <span
          key={preset}
          style={{ animationDelay: `${400 + i * 140}ms` }}
          className={`rb-card-in absolute ${className} inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-[0_10px_24px_-12px_rgba(23,22,31,0.35)] ${
            style === 'gradient'
              ? `${GRADIENT} text-white`
              : style === 'ink'
                ? 'bg-[#17161F] text-white'
                : 'bg-[#EFECFF] text-[#716FFF]'
          }`}
        >
          {PRESETS[preset].label[locale]}
          {/* The little pointer that makes it read as a tag, not a badge. */}
          <svg width="9" height="9" viewBox="0 0 9 9" className="-mr-0.5 opacity-70">
            <path d="M0 0 L9 3.5 L4 4.5 L2.5 9 Z" fill="currentColor" />
          </svg>
        </span>
      ))}
    </div>
  );
}

function RenderVisual() {
  return (
    <div className={`flex h-full w-full items-center justify-center ${GRADIENT}`}>
      <ImageIcon set="bold" size={40} primaryColor="#ffffff" />
    </div>
  );
}

export function LandingClient({ ctaHref }: { ctaHref: '/app' | '/connexion' }) {
  const t = useTranslations();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [checkoutTier, setCheckoutTier] = useState<PricingTierId | null>(null);
  const [checkoutErrors, setCheckoutErrors] = useState<Record<PricingTierId, string | null>>({
    decouverte: null,
    standard: null,
    pro: null,
  });
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const el = heroSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(entry ? !entry.isIntersecting : false),
      { rootMargin: '-72px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function handleSelectTier(tier: PricingTierId) {
    // Demo mode: nobody has a real identity to attach a paid tier to, and
    // there's no login wall to gate the checkout behind — send straight to
    // /app instead of starting a Maketou checkout (see auth-disabled.ts).
    if (ctaHref === '/app') {
      router.push('/app');
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.push(ctaHref);
      return;
    }
    setCheckoutTier(tier);
    setCheckoutErrors((prev) => ({ ...prev, [tier]: null }));
    try {
      const res = await api<{ paymentUrl: string }>('/api/payments/checkout', {
        method: 'POST',
        body: { tier },
      });
      window.location.href = res.paymentUrl;
    } catch {
      setCheckoutErrors((prev) => ({ ...prev, [tier]: t('landing.pricingError') }));
      setCheckoutTier(null);
    }
  }

  const faqItems = [1, 2, 3, 4, 5].map((n) => ({
    q: t(`landing.faq${n}Q` as 'landing.faq1Q'),
    a: t(`landing.faq${n}A` as 'landing.faq1A'),
  }));

  return (
    <main className="bg-white text-[#17161F]">
      {/* FLOATING PILL NAV */}
      <div className="sticky top-4 z-30 mx-auto max-w-[1180px] px-4">
        <nav className="flex items-center justify-between rounded-full border border-[#ECECF2] bg-white/90 px-5 py-3 shadow-[0_10px_30px_-14px_rgba(23,22,31,0.15)] backdrop-blur">
          <Link href="/" className="flex items-center gap-2 text-[16px] font-bold text-[#17161F]">
            <div className={`h-6.5 w-6.5 rounded-[7px] ${GRADIENT}`} />
            RenderBox
          </Link>
          {/* Links grouped in their own pill, as in the reference — a segmented
              control rather than three loose links floating in the bar. */}
          <div className="hidden items-center gap-1 rounded-full bg-[#F7F7FA] p-1 text-sm font-medium text-[#6B6880] min-[860px]:flex">
            <a
              href="#fonctionnalites"
              className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#17161F]"
            >
              {t('landing.navFeatures')}
            </a>
            <a
              href="#tarifs"
              className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#17161F]"
            >
              {t('landing.navPricing')}
            </a>
            <Link
              href="/exemple"
              className="rounded-full px-4 py-1.5 transition-colors hover:bg-white hover:text-[#17161F]"
            >
              {t('landing.navExamples')}
            </Link>
          </div>
          <div className="flex items-center gap-3.5">
            <LanguageInlineSwitch />
            <Link
              href={ctaHref}
              className="hidden text-sm text-[#6B6880] hover:text-[#17161F] min-[500px]:block"
            >
              {t('landing.navLogin')}
            </Link>
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-full bg-[#17161F] px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              {t('landing.navStart')}
            </Link>
          </div>
        </nav>
      </div>

      <div className="mx-auto max-w-[1180px] px-6 pb-14">
        {/* HERO */}
        <section className="pb-6 pt-14 text-center">
          <div className="relative mx-auto flex flex-col items-center">
            <HeroPresetTags />
            <Reveal delayMs={0}>
              <span className={`text-[13px] font-medium text-[#716FFF] ${MONO}`}>
                <Kicker
                  phrases={[
                    t('landing.kicker1'),
                    t('landing.kicker2'),
                    t('landing.kicker3'),
                    t('landing.kicker4'),
                    t('landing.kicker5'),
                  ]}
                  reducedMotionLabel={t('landing.kickerReducedMotion')}
                />
              </span>
            </Reveal>
            <Reveal delayMs={100}>
              <EyebrowTag>{t('landing.heroEyebrow')}</EyebrowTag>
            </Reveal>
            <Reveal delayMs={200}>
              <h1 className="mx-auto mt-5 max-w-[720px] text-[40px] font-bold leading-[1.12] tracking-[-1px] min-[640px]:text-[52px]">
                {t('landing.heroTitlePrefix')}
                <GradientText>{t('landing.heroTitleAccent')}</GradientText>
                {t('landing.heroTitleSuffix')}
              </h1>
            </Reveal>
            <Reveal delayMs={300}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={ctaHref}
                  className="rb-pulse inline-flex items-center gap-2 rounded-full bg-[#17161F] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-8px_rgba(0,0,0,0.55)] active:scale-[0.97]"
                >
                  {t('landing.heroCtaPrimary')}
                </Link>
                <Link
                  href="/exemple"
                  className="inline-flex items-center gap-2 rounded-full border border-[#ECECF2] px-6 py-3.5 text-sm font-semibold text-[#17161F] transition-colors hover:border-[#CFCADF]"
                >
                  {t('landing.heroCtaSecondary')}
                </Link>
              </div>
            </Reveal>
          </div>

          {/* The fan takes over as soon as real renders are configured in
              hero-cards.ts; until then the existing preview block stands in,
              rather than a row of empty frames on a marketing page. */}
          {HERO_CARDS.length > 0 && (
            <HeroFan ctaHref={ctaHref} ctaLabel={t('landing.heroCtaPrimary')} />
          )}

          {HERO_CARDS.length === 0 && (
            <Reveal delayMs={120} className="relative mx-auto mt-14 max-w-[760px]">
              <div className="relative rounded-[28px] border border-[#ECECF2] bg-[#FBFBFD] p-4 shadow-[0_30px_60px_-24px_rgba(113,111,255,0.45)] min-[640px]:p-6">
                <div className="mb-3.5 flex items-center justify-between">
                  <span className={`text-[11px] text-[#8A8896] ${MONO}`}>
                    {t('landing.heroPreviewProject')}
                  </span>
                  <span className={`text-[11px] text-[#8A8896] ${MONO}`}>
                    {t('landing.heroPreviewEngine')}
                  </span>
                </div>
                <div className="relative h-[220px] overflow-hidden rounded-2xl min-[640px]:h-[320px]">
                  <RenderVisual />
                  <span
                    className={`absolute bottom-3 left-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white ${MONO}`}
                  >
                    {t('landing.heroPreviewCaption')}
                  </span>
                </div>
              </div>

              {/* Floating badges around the mockup */}
              <div className="absolute -left-4 top-8 hidden h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_14px_30px_-12px_rgba(23,22,31,0.25)] min-[640px]:flex">
                <ImageIcon set="bold" size={18} primaryColor="#716FFF" />
              </div>
              <div className="absolute -right-4 top-20 hidden h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_14px_30px_-12px_rgba(23,22,31,0.25)] min-[640px]:flex">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${GRADIENT}`}>
                  <Edit set="bold" size={12} primaryColor="#ffffff" />
                </div>
              </div>
              <div className="absolute -bottom-5 left-6 flex items-center gap-1.5 rounded-full border border-[#ECECF2] bg-white px-3.5 py-2.5 text-xs shadow-[0_14px_30px_-12px_rgba(23,22,31,0.2)]">
                <ImageIcon set="bold" size={14} primaryColor="#716FFF" />
                {t('landing.heroChipFacade')}
              </div>
              <div
                className={`absolute -bottom-5 right-6 rounded-full border border-[#ECECF2] bg-white px-3.5 py-2.5 text-xs shadow-[0_14px_30px_-12px_rgba(23,22,31,0.2)] ${MONO}`}
              >
                {t('landing.heroChipMaterials')
                  .split(':')
                  .map((part, i) =>
                    i === 0 ? (
                      <span key={i}>{part}:</span>
                    ) : (
                      <b key={i} className="text-[#716FFF]">
                        {part}
                      </b>
                    ),
                  )}
              </div>
            </Reveal>
          )}
        </section>
        <div ref={heroSentinelRef} aria-hidden />

        {/* TRUST STRIP */}
        <Reveal className="flex flex-wrap justify-center gap-11 border-b border-[#ECECF2] py-9 pb-15 pt-20">
          <div className="text-center">
            <b className="block text-xl text-[#17161F]">
              <CountUp to={5} />
            </b>
            <span className="text-xs text-[#8A8896]">{t('landing.trustPresets')}</span>
          </div>
          <div className="text-center">
            <b className="block text-xl text-[#17161F]">
              <CountUp to={2} />
            </b>
            <span className="text-xs text-[#8A8896]">{t('landing.trustEngines')}</span>
          </div>
          <div className="text-center">
            <b className="block text-xl text-[#17161F]">
              <CountUp to={0} />
            </b>
            <span className="text-xs text-[#8A8896]">{t('landing.trustMaterials')}</span>
          </div>
        </Reveal>

        {/* BEFORE / AFTER */}
        <section className="py-20">
          <Reveal className="mx-auto mb-9 max-w-[560px] text-center">
            <EyebrowTag>{t('landing.beforeAfterTag')}</EyebrowTag>
            <h2 className="mx-auto mt-4 text-[30px] font-bold tracking-[-0.6px] leading-[1.25]">
              {t('landing.beforeAfterTitlePrefix')}
              <GradientText>{t('landing.beforeAfterTitleAccent')}</GradientText>
            </h2>
            <p className="mt-2.5 text-sm text-[#6B6880]">{t('landing.beforeAfterBody')}</p>
          </Reveal>
          <Reveal delayMs={100} className="mx-auto max-w-[820px]">
            <BeforeAfterSlider
              before={<SketchVisual />}
              after={<RenderVisual />}
              beforeLabel={t('landing.beforeAfterLabelBefore')}
              afterLabel={t('landing.beforeAfterLabelAfter')}
            />
          </Reveal>
        </section>

        {/* AUDIENCE — tabs */}
        <section className="py-20">
          <Reveal className="mx-auto mb-10 max-w-[560px] text-center">
            <EyebrowTag>{t('landing.audienceTag')}</EyebrowTag>
            <h2 className="mx-auto mt-4 text-[28px] font-bold tracking-[-0.5px] leading-[1.3]">
              {t('landing.audienceTitle')}
            </h2>
          </Reveal>
          <Reveal className="mx-auto max-w-[640px]">
            <AudienceTabs
              tabs={
                [
                  {
                    icon: <Home set="bold" size={20} primaryColor="#716FFF" />,
                    color: '#716FFF',
                    label: t('landing.audience1Tab'),
                    title: t('landing.audience1Title'),
                    body: t('landing.audience1Body'),
                  },
                  {
                    icon: <Location set="bold" size={20} primaryColor="#0EA5E9" />,
                    color: '#0EA5E9',
                    label: t('landing.audience2Tab'),
                    title: t('landing.audience2Title'),
                    body: t('landing.audience2Body'),
                  },
                  {
                    icon: <Graph set="bold" size={20} primaryColor="#E9A21B" />,
                    color: '#E9A21B',
                    label: t('landing.audience3Tab'),
                    title: t('landing.audience3Title'),
                    body: t('landing.audience3Body'),
                  },
                ] satisfies AudienceTabData[]
              }
            />
          </Reveal>
        </section>

        {/* CHECKLIST */}
        <section
          id="fonctionnalites"
          className="rounded-[32px] bg-[#F7F7FA] px-6 py-20 min-[640px]:px-14"
        >
          <div className="grid grid-cols-1 items-center gap-10 min-[860px]:grid-cols-2">
            <Reveal>
              <EyebrowTag>{t('landing.checklistTag')}</EyebrowTag>
              <h2 className="mt-4 text-[28px] font-bold leading-[1.3] tracking-[-0.5px]">
                {t('landing.checklistTitle')}
              </h2>
              <StaggeredChecklist
                items={[
                  t('landing.checklistItem1'),
                  t('landing.checklistItem2'),
                  t('landing.checklistItem3'),
                  t('landing.checklistItem4'),
                  t('landing.checklistItem5'),
                ]}
              />
              <Link
                href={ctaHref}
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#17161F] px-6 py-3.5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                {t('landing.checklistCta')}
              </Link>
            </Reveal>
            <Reveal delayMs={100}>
              <MaterialsFeedStudio
                queries={[
                  t('landing.feedStudioQuery1'),
                  t('landing.feedStudioQuery2'),
                  t('landing.feedStudioQuery3'),
                  t('landing.feedStudioQuery4'),
                ]}
                materials={[
                  { face: t('landing.split1FaceMain'), value: t('landing.split1FaceMainValue') },
                  { face: t('landing.split1FaceBack'), value: t('landing.split1FaceBackValue') },
                  { face: t('landing.split1Joinery'), value: t('landing.split1JoineryValue') },
                  { face: t('landing.split1Roof'), value: t('landing.split1RoofValue') },
                ]}
                autoTag={t('landing.split1AutoTag')}
                countLabel={(count) => t('landing.feedStudioCount', { count })}
                badgeLabel={t('landing.feedStudioBadge')}
              />
            </Reveal>
          </div>
        </section>

        {/* FEATURE BLOCKS */}
        <section className="py-20">
          <div className="grid grid-cols-1 items-center gap-14 py-12.5 min-[860px]:grid-cols-2">
            <Reveal>
              <span className={`mb-2.5 block text-[11px] text-[#716FFF] ${MONO}`}>
                {t('landing.split2Tag')}
              </span>
              <h3 className="mb-3 text-[26px] font-bold tracking-[-0.4px]">
                {t('landing.split2Title')}
              </h3>
              <p className="mb-4.5 max-w-[400px] text-[14.5px] leading-[1.65] text-[#6B6880]">
                {t('landing.split2Body')}
              </p>
              <ul className="flex flex-col gap-2.5">
                <CheckItem>{t('landing.split2Check1')}</CheckItem>
                <CheckItem>{t('landing.split2Check2')}</CheckItem>
                <CheckItem>{t('landing.split2Check3')}</CheckItem>
              </ul>
            </Reveal>
            <Reveal
              delayMs={100}
              className="rounded-2xl border border-[#ECECF2] bg-[#FBFBFD] p-5.5"
            >
              <TreeGallery
                items={[
                  { label: t('landing.split2NodeUpload'), tag: t('landing.split2NodeSource') },
                  { label: t('landing.split2NodeDay'), tag: t('landing.heroPreviewEngine') },
                  { label: t('landing.split2NodeNight'), tag: t('landing.heroPreviewEngine') },
                  { label: t('landing.split2NodeExtra'), tag: 'gpt image' },
                ]}
              />
            </Reveal>
          </div>

          <div className="grid grid-cols-1 items-center gap-14 py-12.5 min-[860px]:grid-cols-2">
            <Reveal delayMs={100} className="min-[860px]:order-2">
              <span className={`mb-2.5 block text-[11px] text-[#716FFF] ${MONO}`}>
                {t('landing.integrationsTitlePrefix')}
                {t('landing.integrationsTitleAccent')}
              </span>
              <h3 className="mb-3 text-[26px] font-bold tracking-[-0.4px]">
                {t('landing.integrationsSubtitle')}
              </h3>
            </Reveal>
            <Reveal className="min-[860px]:order-1">
              <EnginesStateTiles
                engines={[t('landing.heroPreviewEngine'), 'GPT Image']}
                events={[
                  t('landing.enginesEvent1'),
                  t('landing.enginesEvent2'),
                  t('landing.enginesEvent3'),
                  t('landing.enginesEvent4'),
                ]}
              />
            </Reveal>
          </div>
        </section>

        {/* PRESETS */}
        <section className="py-20">
          <Reveal className="mx-auto mb-11.5 max-w-[560px] text-center">
            <h2 className="text-[30px] font-bold tracking-[-0.6px] leading-[1.25]">
              {t('landing.presetsTitlePrefix')}
              <GradientText>{t('landing.presetsTitleAccent')}</GradientText>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-5.5 min-[860px]:grid-cols-3">
            <Reveal>
              <PresetCard
                title={t('landing.presetsCard1Title')}
                body={t('landing.presetsCard1Body')}
              />
            </Reveal>
            <Reveal delayMs={60}>
              <PresetCard
                title={t('landing.presetsCard2Title')}
                body={t('landing.presetsCard2Body')}
              />
            </Reveal>
            <Reveal delayMs={120}>
              <PresetCard
                title={t('landing.presetsCard3Title')}
                body={t('landing.presetsCard3Body')}
              />
            </Reveal>
          </div>
        </section>

        {/* PRICING */}
        <section id="tarifs" className="py-20">
          <Reveal className="mx-auto mb-3 max-w-[560px] text-center">
            <EyebrowTag>{t('landing.pricingTag')}</EyebrowTag>
            <h2 className="mt-4 text-[30px] font-bold tracking-[-0.6px] leading-[1.25]">
              {t('landing.pricingTitlePrefix')}
              <GradientText>{t('landing.pricingTitleAccent')}</GradientText>
            </h2>
            <p className="mt-2.5 text-sm text-[#6B6880]">{t('landing.pricingSubtitle')}</p>
          </Reveal>
          <div className="mx-auto mt-11.5 grid max-w-[980px] grid-cols-1 items-stretch gap-5.5 min-[860px]:grid-cols-3">
            {PRICING_TIERS.map((tier, i) => (
              <Reveal key={tier.id} delayMs={i * 150}>
                <PricingCard
                  tier={tier}
                  onSelect={() => void handleSelectTier(tier.id)}
                  loading={checkoutTier === tier.id}
                  error={checkoutErrors[tier.id]}
                />
              </Reveal>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20">
          <Reveal className="mx-auto mb-11.5 max-w-[560px] text-center">
            <EyebrowTag>{t('landing.faqTag')}</EyebrowTag>
            <h2 className="mt-4 text-[28px] font-bold tracking-[-0.5px] leading-[1.3]">
              {t('landing.faqTitle')}
            </h2>
          </Reveal>
          <Reveal delayMs={80}>
            <FaqAccordion items={faqItems} />
          </Reveal>
        </section>

        {/* FINAL CTA */}
        <section className="py-20">
          <Reveal
            className={`rounded-[32px] ${GRADIENT} px-8 py-16 text-center text-white min-[640px]:px-16`}
          >
            <h2 className="mx-auto max-w-[480px] text-[28px] font-bold leading-[1.25]">
              {t('landing.ctaBandTitle')}
            </h2>
            <p className="mx-auto mt-3.5 max-w-[380px] text-sm text-white/80">
              {t('landing.ctaBandBody')}
            </p>
            <Link
              href={ctaHref}
              className="rb-pulse mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#17161F] transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              {t('landing.ctaBandButton')}
            </Link>
          </Reveal>
        </section>

        {/* FOOTER */}
        <footer className="mt-5 border-t border-[#ECECF2] py-15 pb-7.5">
          <div className="flex flex-wrap justify-between gap-10 pb-10">
            <Link href="/" className="flex items-center gap-2 text-[17px] font-bold text-[#17161F]">
              <div className={`h-6.5 w-6.5 rounded-[7px] ${GRADIENT}`} />
              RenderBox
            </Link>
            <div className="flex flex-wrap gap-15">
              <div>
                <h5 className="mb-3.5 text-xs uppercase tracking-wide text-[#8A8896]">
                  {t('landing.footerProductHeading')}
                </h5>
                <a href="#fonctionnalites" className="mb-2.5 block text-[13px] text-[#17161F]">
                  {t('landing.navFeatures')}
                </a>
                <a href="#tarifs" className="mb-2.5 block text-[13px] text-[#17161F]">
                  {t('landing.navPricing')}
                </a>
                <Link href="/exemple" className="mb-2.5 block text-[13px] text-[#17161F]">
                  {t('landing.navExamples')}
                </Link>
              </div>
              <div>
                <h5 className="mb-3.5 text-xs uppercase tracking-wide text-[#8A8896]">
                  {t('landing.footerResourcesHeading')}
                </h5>
                <span className="mb-2.5 block text-[13px] text-[#8A8896]">
                  {t('landing.footerLinkGuide')}
                </span>
                <span className="mb-2.5 block text-[13px] text-[#8A8896]">
                  {t('landing.footerLinkBlog')}
                </span>
              </div>
              <div>
                <h5 className="mb-3.5 text-xs uppercase tracking-wide text-[#8A8896]">
                  {t('landing.footerSupportHeading')}
                </h5>
                <span className="mb-2.5 block text-[13px] text-[#8A8896]">
                  {t('landing.footerLinkContact')}
                </span>
                <span className="mb-2.5 block text-[13px] text-[#8A8896]">
                  {t('landing.footerLinkHelp')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-[#ECECF2] pt-6 text-xs text-[#8A8896]">
            <span>{t('landing.footerCopyright', { year: new Date().getFullYear() })}</span>
            <Link href="/legal" className="hover:text-[#17161F]">
              {t('landing.footerLegalLinks')}
            </Link>
          </div>
        </footer>
      </div>

      <StickyBar visible={pastHero} href={ctaHref} label={t('landing.heroCtaPrimary')} />
    </main>
  );
}
