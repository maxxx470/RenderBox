'use client';

// Proof strip under the hero: who is watching, and what the tool plugs into.
//
// It used to also carry three counters — "5 ambiances · 2 moteurs IA ·
// 0 matériau oublié". Removed: the presets and the engines each have their own
// section further down, where they are shown rather than counted, and the
// third opened on a zero, which reads as an empty counter before it reads as a
// promise. What is left is what only this strip can say.
//
// The audience line is the owner's own figure and wording: "Plus de 5 000
// personnes utilisent RenderBox" (2026-10-08, was "Plus de 5 000
// utilisateurs"), white on a brand-red rectangle, with five overlapping
// profile circles standing on their own beside it — not in the same card
// (owner, same evening; a yellow ground, then a red underline, came first).
// It replaced a TikTok follower count the owner found too narrow. It is a
// claim about the product, so it must stay true — the owner answers for the
// number, and the portraits must be the owner's to use.
//
// Still deliberately absent: a star rating. There are no reviews to average.
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { TOOL_LOGOS } from './tool-logos';

// TikTok's own mark (Simple Icons, CC0), inlined like the vendor marks in
// tool-logos.ts. Kept here rather than in that file: that list means "tools
// whose exports we read", and TikTok is not one of them.
export const TIKTOK_PATH =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z';

/**
 * Five profile circles, overlapping, on their own beside the red rectangle.
 * A portrait goes in public/communaute/ under its number (1.webp … 5.webp,
 * square, 120px) and its `src` here; until then the circle shows an initial
 * on a charter colour.
 */
const PROFILES: readonly { src: string | null; initials: string; tint: string }[] = [
  { src: null, initials: 'A', tint: 'bg-[#2948FC] text-white' },
  { src: null, initials: 'M', tint: 'bg-[#F34857] text-white' },
  { src: null, initials: 'K', tint: 'bg-[#EEF1FF] text-[#1E36D6]' },
  { src: null, initials: 'F', tint: 'bg-[#17161F] text-white' },
  { src: null, initials: 'L', tint: 'bg-[#FFE4E7] text-[#C21F33]' },
];

function ProfileStack() {
  return (
    <span aria-hidden className="flex flex-shrink-0 items-center">
      {PROFILES.map((p, i) => (
        <span
          key={p.initials}
          className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold shadow-[0_4px_10px_-4px_rgba(23,22,31,0.35)] ring-[3px] ring-white ${p.tint} ${i === 0 ? '' : '-ml-3'}`}
          style={{ zIndex: PROFILES.length - i }}
        >
          {p.src ? (
            <img src={p.src} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            p.initials
          )}
        </span>
      ))}
    </span>
  );
}

function CommunityBadge() {
  const t = useTranslations();
  return (
    <span className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#F34857_0%,#EF3E50_55%,#E2364A_100%)] px-4 py-2.5 text-center text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(239,62,80,0.7)]">
      {t('landing.proofUsers')}
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
      className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
        <path d={logo.path} fill={logo.hex} />
      </svg>
      <span
        style={{ color: logo.hex }}
        className="font-[family-name:var(--font-display)] text-[13px] font-semibold"
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
      {/* The three counters that used to sit here are gone — "5 ambiances ·
          2 moteurs IA · 0 matériau oublié". The presets and the engines are
          both stated further down the page, in the sections that show them,
          and a proof line opening on a zero read as an empty counter before it
          read as a promise. What is left is the part that is only true here:
          the audience, and what the tool plugs into. */}
      {/* The profile stack before the figure is the owner's call
          (2026-10-08): it says "people use this", which is the claim the line
          makes. An earlier stack of gradient discs was removed because it
          stood for the five ambiances and read as users — here it means
          users, and the portraits must be real and the owner's to use. */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ProfileStack />
        <CommunityBadge />
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
