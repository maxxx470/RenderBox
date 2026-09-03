'use client';

// Proof strip under the hero. Replaces the three lonely CountUp figures that
// stood here before: the numbers were true but read as a feature list, so they
// convinced nobody. Same facts, said as one sentence, plus the row that
// actually answers the visitor's question — "does this take what I already
// have?".
//
// The audience figure is the owner's TikTok following, and it says exactly
// that. It is NOT a user count — RenderBox has none yet — and the copy must
// keep naming the platform, otherwise the number silently becomes a claim
// about the product that nobody can back up.
//
// Still deliberately absent: a star rating. There are no reviews to average.
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { PRESETS, PRESET_KEYS } from '@/lib/server/generation/presets';
import { HERO_CARD_GRADIENT } from './hero-cards';
import { TOOL_LOGOS } from './tool-logos';
import { CountUp } from './CountUp';

// Stands in for the reference's avatar cluster, one disc per ambiance. Same
// visual device — overlapping circles that give the line a left anchor —
// without claiming a single user the product does not have.
function PresetCluster() {
  const { locale } = useLocale();
  return (
    <div className="flex items-center">
      {PRESET_KEYS.map((key, i) => (
        <span
          key={key}
          title={PRESETS[key].label[locale]}
          className={`h-8 w-8 flex-shrink-0 rounded-full border-2 border-white shadow-[0_2px_8px_-2px_rgba(23,22,31,0.35)] ${
            HERO_CARD_GRADIENT[key]
          } ${i === 0 ? '' : '-ml-2.5'}`}
        />
      ))}
    </div>
  );
}

// TikTok's own mark (Simple Icons, CC0), inlined like the vendor marks in
// tool-logos.ts. Kept here rather than in that file: that list means "tools
// whose exports we read", and TikTok is not one of them.
export const TIKTOK_PATH =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';

function CommunityBadge() {
  const t = useTranslations();
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#ECECF2] bg-white px-3.5 py-1.5 shadow-[0_2px_10px_-4px_rgba(23,22,31,0.18)]">
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
        <path d={TIKTOK_PATH} fill="#17161F" />
      </svg>
      <span className="text-[14px] text-[#3D3B49]">
        <b className="font-semibold text-[#17161F]">
          <CountUp to={100000} />+
        </b>{' '}
        {t('landing.proofCommunity')}
      </span>
    </span>
  );
}

function ToolPill({ logo }: { logo: (typeof TOOL_LOGOS)[number] }) {
  return (
    <span
      // Brand colours are data, not design tokens, so they go through inline
      // styles: a Tailwind class built from `logo.hex` at runtime would never
      // be seen by the scanner and would silently generate no CSS.
      style={{ backgroundColor: `${logo.hex}14`, borderColor: `${logo.hex}33` }}
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
        <path d={logo.path} fill={logo.hex} />
      </svg>
      <span
        style={{ color: logo.hex }}
        className="font-[family-name:var(--font-general-sans)] text-[13px] font-semibold"
      >
        {logo.label}
      </span>
    </span>
  );
}

export function HeroProof() {
  const t = useTranslations();

  return (
    <div className="border-b border-[#ECECF2] pb-15 pt-16">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3.5">
        <PresetCluster />
        <CommunityBadge />
        <p className="text-center text-[15px] text-[#3D3B49]">
          <b className="font-semibold text-[#17161F]">
            <CountUp to={5} />
          </b>{' '}
          {t('landing.proofPresets')}
          <span className="mx-2 text-[#DEDEE8]">·</span>
          <b className="font-semibold text-[#17161F]">
            <CountUp to={2} />
          </b>{' '}
          {t('landing.proofEngines')}
          <span className="mx-2 text-[#DEDEE8]">·</span>
          <b className="font-semibold text-[#17161F]">
            <CountUp to={0} />
          </b>{' '}
          {t('landing.proofMaterials')}
        </p>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
        <span className="mr-1 text-sm text-[#8A8896]">{t('landing.proofCompatible')}</span>
        {TOOL_LOGOS.map((logo) => (
          <ToolPill key={logo.id} logo={logo} />
        ))}
      </div>
    </div>
  );
}

// Reused by the footer link — one definition of the mark, not two.
export function TikTokMark({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <path d={TIKTOK_PATH} fill="currentColor" />
    </svg>
  );
}
