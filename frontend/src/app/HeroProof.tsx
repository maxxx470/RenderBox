'use client';

// Proof strip under the hero. Replaces the three lonely CountUp figures that
// stood here before: the numbers were true but read as a feature list, so they
// convinced nobody. Same facts, said as one sentence, plus the row that
// actually answers the visitor's question — "does this take what I already
// have?".
//
// Deliberately absent: a star rating and a user count. RenderBox has neither
// yet, and inventing them on the page where someone decides to pay is not a
// design choice. The layout leaves room for both the day they are real.
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
