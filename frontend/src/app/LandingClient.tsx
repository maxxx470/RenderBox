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
//   blue #435CFE (icons, large surfaces) · blue-deep #2948FC (text on white,
//   6.1:1) · blue-ink #1E36D6 (text on the #EEF1FF tint, 7.3:1)
//   signature gradient: linear-gradient(135deg,#435CFE 0%,#2948FC 48%,#1E36D6 100%)
//   error/danger (semantic, NOT brand): #E5484D — used only for error text
//   and destructive actions, never for accents
// Fonts: Inter (text), Poppins (titles), IBM Plex Mono (tags/technical
// values) — Metrio's pairing, loaded once
// site-wide in the root layout (frontend/src/app/layout.tsx).
//
// No fabricated testimonials/ratings/"trusted by N" claims — RenderBox has
// no real customers yet; inventing quotes would be deceptive. The reference
// site's social-proof section is intentionally replaced with the honest
// stat strip that was already on the page (presets/engines/materials).
import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Category, ChevronRight, Document, Image as ImageIcon, Swap } from 'react-iconly';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { PRESETS } from '@/lib/server/generation/presets';
import { BEFORE_AFTER_PAIRS } from './before-after';
import { PricingCard } from './PricingCard';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { PublicMobileMenu } from '@/components/PublicMobileMenu';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { PRICING_TIERS, type PricingTierId } from '@/lib/pricing-tiers';
import { Reveal } from './Reveal';
import { PresentationVideo } from './PresentationVideo';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { FaqAccordion } from './FaqAccordion';
import { FaqIllustration } from './FaqIllustration';
import { HeroProof } from './HeroProof';
import { SiteFooter } from '@/components/SiteFooter';
import { AudienceCards, type AudienceCardData } from './AudienceCards';
import { MotionFilm } from './MotionFilm';
import { StickyBar } from './StickyBar';
import { HeroFan } from './HeroFan';
import { HERO_CARDS } from './hero-cards';
import { BrandMark } from '@/components/BrandMark';

// Tailwind's JIT scanner only detects complete, literal class-name tokens in
// the source text — it can't see a class assembled at runtime from a plain
// CSS-value constant interpolated into `bg-[${x}]`. Defining the full class
// name itself here (not just the CSS value) keeps every usage below a
// single, complete token the scanner can find, exactly like MONO already is.
const GRADIENT = 'bg-[linear-gradient(135deg,#435CFE_0%,#2948FC_48%,#1E36D6_100%)]';
const MONO = 'font-[family-name:var(--font-mono)]';

// Hero headline, revealed word by word.
//
// The plain words are split so each can carry its own delay; the accented
// phrase stays ONE element on purpose — its gradient is clipped to the text,
// and splitting it would restart the gradient inside every word instead of
// running it across the whole phrase. It therefore lands as a single beat,
// which also gives the key phrase more punch than a further stagger would.
//
// Spaces are real text nodes BETWEEN the spans, not padding inside them: the
// words are inline-block, so a space tucked inside one would collapse at a
// line break and the headline would copy-paste as a single run-on word.
const WORD_STAGGER_MS = 55;

function AnimatedHeadline({
  prefix,
  accent,
  suffix,
  className,
}: {
  prefix: string;
  accent: string;
  suffix: string;
  className: string;
}) {
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
  const segments: React.ReactNode[] = [
    ...words(prefix),
    <span key="accent">{accent}</span>,
    ...words(suffix),
  ];

  return (
    <h1 className={className}>
      {segments.map((segment, i) => (
        <Fragment key={i}>
          <span className="rb-word-in" style={{ animationDelay: `${i * WORD_STAGGER_MS}ms` }}>
            {segment}
          </span>
          {i < segments.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </h1>
  );
}

// The reference's section header: a small eyebrow, a large title, a muted
// subtitle — centred by default, left-aligned for the two-column FAQ.
function SectionHeader({
  eyebrow,
  title,
  subtitle,
  light = false,
  align = 'center',
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  light?: boolean;
  align?: 'center' | 'left';
}) {
  // The section's entrance, as on Metrio: eyebrow, title and subtitle each
  // arrive in turn (blurred → sharp, see Reveal), 90ms apart, so reaching a
  // new section reads as a beat rather than a page that was already there.
  return (
    <div
      className={`mb-11 max-w-[640px] ${align === 'center' ? 'mx-auto text-center' : 'text-left'}`}
    >
      <Reveal>
        <p
          className={`mb-3 inline-flex items-center gap-2 text-[13px] font-medium ${light ? 'text-white/85' : 'text-[#17161F]'}`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${light ? 'bg-[#FF9AA6]' : 'bg-[#F34857]'}`}
          />
          {eyebrow}
        </p>
      </Reveal>
      <Reveal delayMs={90}>
        <h2
          className={`text-[30px] font-bold leading-[1.2] tracking-[-0.6px] min-[640px]:text-[36px] ${
            light ? 'text-white' : 'text-[#17161F]'
          }`}
        >
          {title}
        </h2>
      </Reveal>
      {subtitle ? (
        <Reveal delayMs={180}>
          <p
            className={`mt-3.5 text-[14.5px] leading-[1.6] ${
              light ? 'text-white/85' : 'text-[#6B6878]'
            } ${align === 'center' ? 'mx-auto max-w-[520px]' : ''}`}
          >
            {subtitle}
          </p>
        </Reveal>
      ) : null}
    </div>
  );
}

// The four photoreal ambiances, encoded on two channels so a card is readable
// without reading its title.
//
//   colour = the light the preset produces (day is bright and cool, night is
//            deep and warm-lit) — this is the informative channel, it previews
//            the actual result;
//   glyph  = the kind of shot — Home for the two exteriors, Category (a
//            floor-plan-like grid) for the two interiors.
//
// Iconly ships no sun or moon, so forcing five arbitrary glyphs would have said
// less than this does. Full literal class strings for the Tailwind scanner.
// One preset, shown rather than described.
//
// Each card used to lead with a 40px gradient square and a glyph — a colour
// standing in for a light, on a page whose whole promise is what the light
// looks like. The renders already existed: /public/galerie feeds the
// /exemple page. A preset IS a look, so the look is the card.
//
// The files under /public/presets are centre-cropped to 3:2 and re-encoded at
// 600x400 (203KB for all five, down from 472KB at full size) — the cards
// display at roughly 280px wide, so the originals were paying for resolution
// nobody sees. Served from /public because the site CSP is
// `img-src 'self' data: blob:` and an external host is silently blocked.
//
// The crop of each was checked by eye: all five keep their subject in the
// middle band, which is why a centre crop is safe here and would not be for
// an arbitrary image.
const AMBIANCE_IMAGE = {
  jourExt: '/presets/jour-ext.jpg',
  nuitExt: '/presets/nuit-ext.jpg',
  jourInt: '/presets/jour-int.jpg',
  nuitInt: '/presets/nuit-int.jpg',
} as const;

type AmbianceKey = keyof typeof AMBIANCE_IMAGE;

function PresetCard({
  ambiance,
  title,
  body,
  alt,
}: {
  ambiance: AmbianceKey;
  title: string;
  body: string;
  /** Describes the render, not the preset — the title already names it. */
  alt: string;
}) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-[#FBFBFD] transition-colors">
      <div className="aspect-[3/2] w-full overflow-hidden bg-[#F1F0F4]">
        <img
          src={AMBIANCE_IMAGE[ambiance]}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-[400ms] ease-out motion-safe:group-hover:scale-[1.04]"
        />
      </div>
      <div className="flex flex-1 flex-col p-5.5">
        <h4 className="mb-2 text-[15px] font-semibold text-[#17161F]">{title}</h4>
        <p className="text-[13px] leading-[1.55] text-[#6B6878]">{body}</p>
      </div>
    </div>
  );
}

function SketchVisual() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#F7F7FA]">
      <svg viewBox="0 0 200 140" className="h-3/4 w-3/4 text-[#DEDEE8]" fill="none">
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
          className={`rb-card-in absolute ${className} inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold shadow-[0_10px_24px_-12px_rgba(23,22,31,0.35)] ${
            style === 'gradient'
              ? `${GRADIENT} text-white`
              : style === 'ink'
                ? 'bg-[#17161F] text-white'
                : 'bg-[#FFE4E7] text-[#C21F33]'
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
      <ImageIcon set="curved" size={40} primaryColor="#ffffff" />
    </div>
  );
}

export function LandingClient({ ctaHref }: { ctaHref: '/app' | '/connexion' }) {
  const t = useTranslations();
  const { locale } = useLocale();
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
  // The header stays at the top (owner, 2026-10-08); once the page has moved
  // under it, it gains a hairline and a soft shadow so it reads as a layer.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = heroSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      // Past the hero = the sentinel has gone ABOVE the viewport. "Not
      // intersecting" alone also holds while it is still below the fold, and
      // the hero band is now taller than a laptop screen — the bar was showing
      // on arrival, doubling the hero's own CTA.
      ([entry]) =>
        setPastHero(entry ? !entry.isIntersecting && entry.boundingClientRect.top < 0 : false),
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

  const faqItems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
    q: t(`landing.faq${n}Q` as 'landing.faq1Q'),
    a: t(`landing.faq${n}A` as 'landing.faq1A'),
    // One illustration per answer, in the questions' order (FaqIllustration).
    image: `/faq/${n}.webp`,
  }));
  // The open question drives the illustration column; closing it keeps the
  // last picture rather than emptying the column.
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [faqShown, setFaqShown] = useState(0);

  const NAV_LINK = 'rounded-lg px-3 py-1.5 transition-colors hover:text-[#17161F]';

  return (
    // pb-14 clears the 56px sticky bar: without it the bar parks on top of
    // the last rows of the footer for the whole bottom of the page.
    <main className="bg-white pb-14 text-[#17161F]">
      {/* The header stays at the top of the screen while the page scrolls
          (owner, 2026-10-08), over a translucent white with a background blur.
          It lives outside the hero band: that band clips its overflow, and a
          sticky element cannot outlive a clipping parent. */}
      <header
        className={`sticky top-0 z-50 border-b bg-white/75 backdrop-blur-md backdrop-saturate-150 transition-[border-color,box-shadow] duration-200 ${
          scrolled
            ? 'border-[#ECECF2] shadow-[0_6px_20px_-14px_rgba(23,22,31,0.35)]'
            : 'border-transparent'
        }`}
      >
        <nav className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3 min-[640px]:px-6 min-[640px]:py-3.5">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-bold text-[#17161F]">
            <BrandMark size="md" />
            RenderBox
          </Link>
          <div className="hidden items-center gap-1 text-[13.5px] font-medium text-[#3D3B49] min-[920px]:flex">
            <a href="#fonctionnalites" className={NAV_LINK}>
              {t('landing.navFeatures')}
            </a>
            <a href="#comment" className={NAV_LINK}>
              {t('landing.navHow')}
            </a>
            <a href="#tarifs" className={NAV_LINK}>
              {t('landing.navPricing')}
            </a>
            <Link href="/exemple" className={NAV_LINK}>
              {t('landing.navExamples')}
            </Link>
            <a href="#faq" className={NAV_LINK}>
              {t('landing.navFaq')}
            </a>
          </div>
          <div className="flex items-center gap-2.5 min-[500px]:gap-3.5">
            {/* Below 920px the language choice moves into the menu. */}
            <span className="hidden min-[920px]:block">
              <LanguageInlineSwitch />
            </span>
            {/* Outlined, no fill (owner, 2026-10-08: as plain text it was
                  lost beside "Commencer"); a pale blue fill on hover. */}
            <Link
              href={ctaHref}
              className="hidden rounded-xl border border-[#C9CFE0] px-4 py-[9px] text-[13.5px] font-semibold text-[#17161F] transition-colors duration-150 hover:border-[#2948FC] hover:bg-[#F4F6FF] min-[500px]:block"
            >
              {t('landing.navLogin')}
            </Link>
            <Link
              href={ctaHref}
              className={`inline-flex items-center rounded-xl ${GRADIENT} px-5 py-2.5 text-[13.5px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]`}
            >
              {t('landing.navStart')}
            </Link>
            <PublicMobileMenu
              className="min-[920px]:hidden"
              links={[
                { href: '#fonctionnalites', label: t('landing.navFeatures') },
                { href: '#comment', label: t('landing.navHow') },
                { href: '#tarifs', label: t('landing.navPricing') },
                { href: '/exemple', label: t('landing.navExamples') },
                { href: '#faq', label: t('landing.navFaq') },
              ]}
              cta={{ href: ctaHref, label: t('landing.navLogin') }}
            />
          </div>
        </nav>
      </header>

      {/* HERO BAND — nav and hero share the reference's dotted ground, which
          ends in a large rounded bottom edge. The dots fade in from the top so
          the nav sits on clean white. */}
      <div className="relative overflow-hidden rounded-b-[40px] bg-[linear-gradient(180deg,#FFFFFF_0%,#F1F3FA_100%)] min-[860px]:rounded-b-[56px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,#C9CFE0_1px,transparent_1.3px)] bg-[length:18px_18px] [mask-image:linear-gradient(180deg,transparent_0%,#000_28%,#000_100%)]"
        />

        <section className="relative mx-auto max-w-[1180px] px-6 pb-14 pt-10 text-center min-[860px]:pt-14">
          <div className="relative mx-auto flex flex-col items-center">
            <HeroPresetTags />
            {/* The reference's "New" pill above the headline. It points at
                the gallery: a claim about two engines is best answered by
                showing what they make. */}
            <Link
              href="/exemple"
              className="rb-card-in mb-6 inline-flex items-center gap-2 rounded-lg bg-white py-1 pl-1 pr-3 text-[12.5px] font-medium text-[#17161F] shadow-[0_8px_20px_-14px_rgba(23,22,31,0.35)] transition-colors hover:bg-[#E9E9EE]"
            >
              <span
                className={`rounded-md ${GRADIENT} px-2.5 py-0.5 text-[11px] font-semibold text-white`}
              >
                {t('landing.heroBadgeNew')}
              </span>
              {t('landing.heroBadgeText')}
              <ChevronRight set="curved" size={13} primaryColor="#6B6878" />
            </Link>
            {/* No Reveal wrapper here: rb-word-in is the entrance, and
                stacking Reveal's own opacity/translate on top would fight it
                for the same properties. */}
            <AnimatedHeadline
              prefix={t('landing.heroTitlePrefix')}
              accent={t('landing.heroTitleAccent')}
              suffix={t('landing.heroTitleSuffix')}
              className="mx-auto max-w-[860px] text-[40px] font-bold leading-[1.1] tracking-[-1.2px] min-[640px]:text-[58px]"
            />
            <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.6] text-[#6B6878]">
              {t('landing.heroSubtitle')}
            </p>
          </div>

          {/* The fan takes over as soon as real renders are configured in
              hero-cards.ts; until then the preview block stands in, rather
              than a row of empty frames on a marketing page. */}
          {HERO_CARDS.length > 0 && (
            <HeroFan ctaHref={ctaHref} ctaLabel={t('landing.heroCtaPrimary')} />
          )}

          {HERO_CARDS.length === 0 && (
            <Reveal delayMs={120} className="relative mx-auto mt-12 max-w-[760px]">
              <Link
                href={ctaHref}
                className={`mb-10 inline-flex items-center rounded-xl ${GRADIENT} px-6 py-3.5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]`}
              >
                {t('landing.heroCtaPrimary')}
              </Link>
              <div className="relative rounded-[28px] bg-white p-4 shadow-[0_30px_60px_-28px_rgba(30,54,214,0.45)] min-[640px]:p-6">
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
                    className={`absolute bottom-3 left-3 rounded-lg bg-black/40 px-2.5 py-1 text-[10px] text-white ${MONO}`}
                  >
                    {t('landing.heroPreviewCaption')}
                  </span>
                </div>
              </div>
              <div className="absolute -bottom-5 left-6 flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-xs shadow-[0_14px_30px_-12px_rgba(23,22,31,0.2)]">
                <ImageIcon set="curved" size={14} primaryColor="#F34857" />
                {t('landing.heroChipFacade')}
              </div>
              <div
                className={`absolute -bottom-5 right-6 rounded-xl bg-white px-3.5 py-2.5 text-xs shadow-[0_14px_30px_-12px_rgba(23,22,31,0.2)] ${MONO}`}
              >
                {t('landing.heroChipMaterials')}
              </div>
            </Reveal>
          )}
        </section>
      </div>
      <div ref={heroSentinelRef} aria-hidden />

      <div className="mx-auto max-w-[1180px] px-6">
        {/* PROOF STRIP */}
        <Reveal className="pt-12">
          <HeroProof />
        </Reveal>

        {/* PRESENTATION VIDEO — right after the hero and the compatible
            tools (owner, 2026-10-06). A placeholder until the site is
            finished and the film is made, framed like Metrio's: a browser
            window that straightens as it scrolls in. */}
        <PresentationVideo />

        {/* BEFORE / AFTER */}
        <section className="py-14 min-[860px]:py-20">
          <SectionHeader
            eyebrow={t('landing.eyebrowResult')}
            title={`${t('landing.beforeAfterTitlePrefix')}${t('landing.beforeAfterTitleAccent')}`}
            subtitle={t('landing.beforeAfterBody')}
          />
          {/* Two pairs: exterior left, interior right; stacked on phones. */}
          <div className="grid gap-6 min-[860px]:grid-cols-2">
            {BEFORE_AFTER_PAIRS.map((pair, i) => {
              const exterior = pair.kind === 'exterior';
              return (
                <Reveal key={pair.kind} delayMs={100 + i * 120}>
                  <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-[#17161F]">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-[#F34857]" />
                    {t(exterior ? 'landing.beforeAfterExterior' : 'landing.beforeAfterInterior')}
                  </p>
                  <BeforeAfterSlider
                    // Real images when they exist, the drawn placeholders
                    // otherwise. Lazy: below the fold.
                    before={
                      pair.before ? (
                        <img
                          src={pair.before}
                          alt={t(
                            exterior
                              ? 'landing.beforeAfterAltBefore'
                              : 'landing.beforeAfterAltBeforeInterior',
                          )}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <SketchVisual />
                      )
                    }
                    after={
                      pair.after ? (
                        <img
                          src={pair.after}
                          alt={t(
                            exterior
                              ? 'landing.beforeAfterAltAfter'
                              : 'landing.beforeAfterAltAfterInterior',
                          )}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <RenderVisual />
                      )
                    }
                    beforeLabel={t('landing.beforeAfterLabelBefore')}
                    afterLabel={t('landing.beforeAfterLabelAfter')}
                  />
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* KEY FEATURES — one card per audience (the trade, a title, a picture),
            the second one in the brand red, then a single CTA under the row. */}
        <section id="fonctionnalites" className="scroll-mt-20 py-14 min-[860px]:py-20">
          <SectionHeader
            eyebrow={t('landing.eyebrowFeatures')}
            title={t('landing.audienceTitle')}
          />
          <AudienceCards
            cards={
              [
                {
                  label: t('landing.audience1Tab'),
                  title: t('landing.audience1Title'),
                  image: '/metiers/architectes.webp',
                },
                {
                  label: t('landing.audience2Tab'),
                  title: t('landing.audience2Title'),
                  image: '/metiers/ingenieurs.webp',
                },
                {
                  label: t('landing.audience3Tab'),
                  title: t('landing.audience3Title'),
                  image: '/metiers/dessinateurs.webp',
                },
                {
                  label: t('landing.audience4Tab'),
                  title: t('landing.audience4Title'),
                  image: '/metiers/promoteurs.webp',
                },
              ] satisfies AudienceCardData[]
            }
          />
          <Reveal delayMs={200} className="mt-10 flex justify-center">
            <Link
              href={ctaHref}
              className={`inline-flex items-center rounded-xl ${GRADIENT} px-6 py-3.5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]`}
            >
              {t('landing.checklistCta')}
            </Link>
          </Reveal>
        </section>

        {/* HOW IT WORKS — two full-width cards, one above the other (owner's
            brief, 2026-10-06): the gradient one carries the "Commenter" film
            wide enough to read, the grey one the render-tree film.
            The engines sit under them as a third card. */}
        <section id="comment" className="scroll-mt-20 py-14 min-[860px]:py-20">
          <SectionHeader
            eyebrow={t('landing.eyebrowHow')}
            title={t('landing.howTitle')}
            subtitle={t('landing.howSubtitle')}
          />
          <div className="flex flex-col gap-5">
            <Reveal>
              <div className={`rounded-[24px] ${GRADIENT} p-4 text-white min-[640px]:p-10`}>
                {/* A punchy title and the film — visitors look at the picture,
                    not at a checklist (owner's brief, 2026-10-06). */}
                <div className="mb-5 flex items-start gap-4 px-1 pt-2 min-[640px]:mb-7 min-[640px]:px-0 min-[640px]:pt-0">
                  <div className="hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white min-[640px]:flex">
                    <Document set="curved" size={22} primaryColor="#F34857" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-[24px] font-semibold leading-[1.2] min-[640px]:text-[30px]">
                      {t('landing.commentTitle')}
                    </h3>
                    <p className="max-w-[680px] text-[14px] leading-[1.55] text-white/85 min-[640px]:text-[15px]">
                      {t('landing.commentSubtitle')}
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-[20px] bg-white p-1.5 shadow-[0_30px_60px_-30px_rgba(10,18,70,0.6)] min-[640px]:p-2">
                  <MotionFilm
                    src={`/motion/commenter-${locale}.mp4`}
                    poster={`/motion/commenter-${locale}.jpg`}
                    label={t('landing.commentAlt')}
                    className="rounded-[14px]"
                  />
                </div>
              </div>
            </Reveal>

            <Reveal delayMs={100}>
              <div className="rounded-[24px] bg-[#F7F7FA] p-4 min-[640px]:p-10">
                {/* Same shape as the card above: a title and the film of the
                    render tree branching (owner's brief, 2026-10-06). */}
                <div className="mb-5 flex items-start gap-4 px-1 pt-2 min-[640px]:mb-7 min-[640px]:px-0 min-[640px]:pt-0">
                  <div
                    className={`hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${GRADIENT} min-[640px]:flex`}
                  >
                    <Category set="curved" size={22} primaryColor="#ffffff" />
                  </div>
                  <div>
                    <span
                      className={`mb-1.5 block text-[11px] uppercase tracking-wide text-[#C21F33] ${MONO}`}
                    >
                      {t('landing.split2Tag')}
                    </span>
                    <h3 className="mb-2 text-[24px] font-semibold leading-[1.2] min-[640px]:text-[30px]">
                      {t('landing.treeTitle')}
                    </h3>
                    <p className="max-w-[680px] text-[14px] leading-[1.55] text-[#6B6878] min-[640px]:text-[15px]">
                      {t('landing.treeSubtitle')}
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-[20px] bg-white p-1.5 shadow-[0_30px_60px_-30px_rgba(23,22,31,0.3)] min-[640px]:p-2">
                  <MotionFilm
                    src={`/motion/arbre-${locale}.mp4`}
                    poster={`/motion/arbre-${locale}.jpg`}
                    label={t('landing.treeAlt')}
                    className="rounded-[14px]"
                  />
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delayMs={150} className="mt-5">
            <div className="rounded-[24px] bg-[#F7F7FA] p-4 min-[640px]:p-10">
              {/* Same shape as the two cards above: the same prompt rendered
                  by each engine, interior on the left, exterior on the right
                  (owner's brief, 2026-10-06). Engines are only ever named
                  "Visio / Pixel IA" here, never by provider. */}
              <div className="mb-5 flex items-start gap-4 px-1 pt-2 min-[640px]:mb-7 min-[640px]:px-0 min-[640px]:pt-0">
                <div
                  className={`hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${GRADIENT} min-[640px]:flex`}
                >
                  <Swap set="curved" size={22} primaryColor="#ffffff" />
                </div>
                <div>
                  <span
                    className={`mb-1.5 block text-[11px] uppercase tracking-wide text-[#C21F33] ${MONO}`}
                  >
                    {t('landing.enginesEyebrow')}
                  </span>
                  <h3 className="mb-2 text-[24px] font-semibold leading-[1.2] min-[640px]:text-[30px]">
                    {t('landing.enginesTitle')}
                  </h3>
                  <p className="max-w-[680px] text-[14px] leading-[1.55] text-[#6B6878] min-[640px]:text-[15px]">
                    {t('landing.enginesSubtitle')}
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-[20px] bg-white p-1.5 shadow-[0_30px_60px_-30px_rgba(23,22,31,0.3)] min-[640px]:p-2">
                <MotionFilm
                  src={`/motion/moteurs-${locale}.mp4`}
                  poster={`/motion/moteurs-${locale}.jpg`}
                  label={t('landing.enginesAlt')}
                  className="rounded-[14px]"
                />
              </div>
            </div>
          </Reveal>
        </section>

        {/* PRESETS */}
        <section className="py-14 min-[860px]:py-20">
          <SectionHeader
            eyebrow={t('landing.eyebrowPresets')}
            title={`${t('landing.presetsTitlePrefix')}${t('landing.presetsTitleAccent')}`}
          />
          {/* Four photoreal ambiances in a row, then Esquisse on its own —
              the sketch preset is the one that is deliberately NOT
              photorealistic, so grouping it with the other four would
              misdescribe it. */}
          <div className="grid grid-cols-1 gap-5 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-4">
            <Reveal>
              <PresetCard
                ambiance="jourExt"
                title={t('landing.presetsCard1Title')}
                body={t('landing.presetsCard1Body')}
                alt={t('landing.presetsCard1Alt')}
              />
            </Reveal>
            <Reveal delayMs={60}>
              <PresetCard
                ambiance="nuitExt"
                title={t('landing.presetsCard2Title')}
                body={t('landing.presetsCard2Body')}
                alt={t('landing.presetsCard2Alt')}
              />
            </Reveal>
            <Reveal delayMs={120}>
              <PresetCard
                ambiance="jourInt"
                title={t('landing.presetsCard3Title')}
                body={t('landing.presetsCard3Body')}
                alt={t('landing.presetsCard3Alt')}
              />
            </Reveal>
            <Reveal delayMs={180}>
              <PresetCard
                ambiance="nuitInt"
                title={t('landing.presetsCard4Title')}
                body={t('landing.presetsCard4Body')}
                alt={t('landing.presetsCard4Alt')}
              />
            </Reveal>
          </div>

          <Reveal delayMs={240} className="mx-auto mt-5 max-w-[760px]">
            <div className="flex flex-col gap-5 rounded-[24px] border border-dashed border-[#DEDEE8] bg-white p-5 min-[640px]:flex-row min-[640px]:items-center">
              <div className="w-full flex-shrink-0 overflow-hidden rounded-2xl bg-[#F1F0F4] min-[640px]:w-[240px]">
                <img
                  src="/presets/esquisse.jpg"
                  alt={t('landing.presetsSketchAlt')}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/2] h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 min-[640px]:py-1.5">
                <p className={`mb-1.5 text-[11px] uppercase tracking-wide text-[#8A8896] ${MONO}`}>
                  {t('landing.presetsSketchLabel')}
                </p>
                <h4 className="mb-2 text-[15px] font-semibold text-[#17161F]">
                  {t('landing.presetsSketchTitle')}
                </h4>
                <p className="max-w-[62ch] text-[13px] leading-[1.55] text-[#6B6878]">
                  {t('landing.presetsSketchBody')}
                </p>
              </div>
            </div>
          </Reveal>
        </section>
      </div>

      {/* PRICING — full-bleed blue band, as in the reference. The deep end
          of the gradient carries the white text (#2948FC = 5.0:1); the bright
          #435CFE would fail 4.5:1 for the 14px copy. */}
      <section
        id="tarifs"
        className="scroll-mt-0 bg-[linear-gradient(135deg,#2948FC_0%,#1E36D6_55%,#1A2BB0_100%)] py-16 min-[860px]:py-24"
      >
        <div className="mx-auto max-w-[1180px] px-6">
          <SectionHeader
            light
            eyebrow={t('landing.eyebrowPricing')}
            title={`${t('landing.pricingTitlePrefix')}${t('landing.pricingTitleAccent')}`}
            subtitle={t('landing.pricingSubtitle')}
          />
          <div className="mx-auto grid max-w-[1040px] grid-cols-1 items-stretch gap-5 min-[860px]:grid-cols-3">
            {PRICING_TIERS.map((tier, i) => (
              <Reveal key={tier.id} delayMs={i * 120} className="h-full">
                <PricingCard
                  tier={tier}
                  onSelect={() => void handleSelectTier(tier.id)}
                  loading={checkoutTier === tier.id}
                  error={checkoutErrors[tier.id]}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — two columns: the header on the left, the questions on the
          right, as in the reference. */}
      <section
        id="faq"
        className="mx-auto max-w-[1180px] scroll-mt-20 px-6 py-16 min-[860px]:py-24"
      >
        <div className="grid grid-cols-1 gap-6 min-[960px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] min-[960px]:gap-14">
          <div>
            <SectionHeader
              align="left"
              eyebrow={t('landing.eyebrowFaq')}
              title={t('landing.faqTitle')}
              subtitle={t('landing.faqSubtitle')}
            />
            <FaqIllustration images={faqItems.map((f) => f.image)} shown={faqShown} />
          </div>
          <Reveal delayMs={80}>
            <FaqAccordion
              items={faqItems}
              className=""
              openIndex={faqOpen}
              onOpenChange={(i) => {
                setFaqOpen(i);
                if (i !== null) setFaqShown(i);
              }}
            />
          </Reveal>
        </div>
      </section>

      <SiteFooter ctaHref={ctaHref} />

      {/* The primary action: this bar is pinned to the bottom of every screen
          from the end of the hero to the footer, so it repeats the one action
          the page exists for rather than a secondary link. */}
      <StickyBar visible={pastHero} href={ctaHref} label={t('landing.heroCtaPrimary')} />
    </main>
  );
}
