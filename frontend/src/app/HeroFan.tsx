'use client';

// Fanned card carousel for the hero, in the spirit of the reference: tilted
// overlapping cards bleeding off the bottom, the middle one raised and
// carrying the call to action.
//
// Same geometry as the /app quick-start fan (GenerationHome's RenderFanCard)
// so the landing and the product read as one design, and the same entrance
// animation (rb-card-in, staggered).
import Link from 'next/link';
import { ArrowRight } from 'react-iconly';
import { HERO_CARDS } from './hero-cards';

// Tilt per position. The middle card stays upright and on top — it is the one
// the CTA sits over, so it must not be the one leaning away.
const TILT = [
  '-rotate-6 translate-y-6',
  '-rotate-3 translate-y-2',
  'rotate-0 -translate-y-2 z-[3]',
  'rotate-3 translate-y-2',
  'rotate-6 translate-y-6',
];

export function HeroFan({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  // No real renders configured yet — the caller keeps its existing preview.
  if (HERO_CARDS.length === 0) return null;

  const middle = Math.floor(HERO_CARDS.length / 2);

  return (
    <div className="relative mt-14">
      {/* Bleeds off the bottom like the reference: the row is taller than the
          visible window, and overflow-hidden crops it. */}
      <div className="flex items-end justify-center overflow-hidden pt-6">
        {HERO_CARDS.map((card, i) => (
          <div
            key={card.src}
            style={{ animationDelay: `${i * 90}ms` }}
            className={`rb-card-in relative h-[300px] w-[220px] flex-shrink-0 overflow-hidden rounded-[22px] border border-[#DEDEE8] bg-[#F7F7FA] shadow-[0_24px_48px_-24px_rgba(23,22,31,0.45)] transition-transform duration-200 ease-out hover:z-10 hover:-translate-y-2 hover:rotate-0 ${
              i === 0 ? '' : '-ml-10'
            } ${TILT[i] ?? ''}`}
          >
            <img src={card.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute inset-x-4 bottom-4">
              <div className="font-[family-name:var(--font-general-sans)] text-[17px] font-bold text-white">
                {card.title}
              </div>
              <div className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-white/80">
                {card.subtitle}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Floating CTA over the middle card, as in the reference.
          The centring translate lives on the wrapper and the entrance on the
          link: rb-card-in animates `transform`, so sharing one element would
          wipe the -50% offset mid-animation and slide the button sideways. */}
      <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
        <Link
          href={ctaHref}
          style={{ animationDelay: `${middle * 90 + 200}ms` }}
          className="rb-card-in inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#17161F] shadow-[0_16px_36px_-12px_rgba(23,22,31,0.45)] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
        >
          {ctaLabel}
          <ArrowRight set="bold" size={15} primaryColor="#716FFF" />
        </Link>
      </div>
    </div>
  );
}
