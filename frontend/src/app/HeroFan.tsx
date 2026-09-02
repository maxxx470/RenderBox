'use client';

// Fanned card carousel for the hero, in the spirit of the reference: tilted
// overlapping cards bleeding off the bottom, the middle one upright and
// carrying the call to action.
//
// Same geometry and entrance as the /app quick-start fan (GenerationHome's
// RenderFanCard), so the landing and the product read as one design.
//
// Three transforms are in play per card — the static tilt, the entrance, and
// the idle drift — so each gets its own element. Stacked on one element they
// would overwrite each other, which is how the fan would silently flatten.
import Link from 'next/link';
import { ArrowRight, Image as ImageIcon } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESETS } from '@/lib/server/generation/presets';
import { HERO_CARDS, HERO_CARD_GRADIENT } from './hero-cards';

// Tilt per position. The middle card stays upright and on top — it is the one
// the CTA sits over, so it must not be the one leaning away.
const TILT = [
  '-rotate-6 translate-y-6',
  '-rotate-3 translate-y-2',
  'rotate-0 -translate-y-2',
  'rotate-3 translate-y-2',
  'rotate-6 translate-y-6',
];

// Static stacking so the middle card sits above its neighbours, which in turn
// sit above the outer ones.
const LAYER = ['z-[1]', 'z-[2]', 'z-[3]', 'z-[2]', 'z-[1]'];

export function HeroFan({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  const { locale, t } = useLocale();

  if (HERO_CARDS.length === 0) return null;

  const middle = Math.floor(HERO_CARDS.length / 2);

  return (
    <div className="relative mt-14">
      {/* Bleeds off the bottom like the reference: the row is taller than the
          visible window and the overflow is cropped. */}
      <div className="flex items-end justify-center overflow-hidden pt-8">
        {HERO_CARDS.map((card, i) => {
          const label = PRESETS[card.preset].label[locale];
          return (
            <div
              key={card.preset}
              // Drift lives here, out of reach of the tilt below. Offset per
              // card so the fan breathes instead of pulsing as one block.
              style={{ animationDelay: `${i * 700}ms` }}
              className={`rb-float group relative flex-shrink-0 ${LAYER[i] ?? ''} hover:z-20 ${
                i === 0 ? '' : '-ml-10'
              }`}
            >
              <div style={{ animationDelay: `${i * 90}ms` }} className="rb-card-in">
                <div
                  className={`relative h-[300px] w-[220px] overflow-hidden rounded-[22px] border border-[#DEDEE8] shadow-[0_24px_48px_-24px_rgba(23,22,31,0.45)] transition-transform duration-300 ease-out group-hover:rotate-0 group-hover:-translate-y-3 ${
                    TILT[i] ?? ''
                  } ${card.src ? 'bg-[#F7F7FA]' : HERO_CARD_GRADIENT[card.preset]}`}
                >
                  {card.src ? (
                    <img
                      src={card.src}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                        <ImageIcon set="bold" size={26} primaryColor="#ffffff" />
                      </span>
                    </div>
                  )}

                  {/* Scrim only where the caption sits, so a real photo keeps
                      its own contrast everywhere else. */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="pointer-events-none absolute inset-x-4 bottom-4">
                    <div className="font-[family-name:var(--font-general-sans)] text-[17px] font-bold text-white">
                      {label}
                    </div>
                    <div className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-white/75">
                      {t('landing.heroFanTag')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating CTA over the middle card, as in the reference.
          The centring translate lives on the wrapper and the entrance on the
          link: rb-card-in animates `transform`, so sharing one element would
          wipe the -50% offset mid-animation and slide the button sideways. */}
      <div className="absolute left-1/2 top-0 z-30 -translate-x-1/2">
        <Link
          href={ctaHref}
          style={{ animationDelay: `${middle * 90 + 220}ms` }}
          className="rb-card-in inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#17161F] shadow-[0_16px_36px_-12px_rgba(23,22,31,0.45)] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
        >
          {ctaLabel}
          <ArrowRight set="bold" size={15} primaryColor="#716FFF" />
        </Link>
      </div>
    </div>
  );
}
