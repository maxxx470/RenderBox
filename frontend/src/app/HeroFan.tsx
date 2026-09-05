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
//
// The fan only works where there is width for it: it is 940px wide and gets
// cropped symmetrically, so below `sm` the two outer cards were sliced through
// the middle of their own captions and four of the five ambiances were simply
// unreachable. Under 640px the same cards become an auto-advancing slider —
// one card at a time, swipeable, with the CTA moved below it instead of on top
// of the only render still visible.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Image as ImageIcon } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESETS } from '@/lib/server/generation/presets';
import { HERO_CARDS, HERO_CARD_GRADIENT, type HeroCard } from './hero-cards';

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

/** How long each slide holds before the slider steps to the next one. */
const SLIDE_MS = 3600;

/** Half the mobile card width — the track pads by this so a card can centre. */
const SLIDE_HALF = 118;

// The card face itself, shared by the fan and the slider so a change to the
// scrim, the caption or the placeholder cannot land on one and miss the other.
function HeroCardFace({
  card,
  label,
  tag,
  className,
}: {
  card: HeroCard;
  label: string;
  tag: string;
  className: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] border border-[#DEDEE8] shadow-[0_24px_48px_-24px_rgba(23,22,31,0.45)] ${
        card.src ? 'bg-[#F7F7FA]' : HERO_CARD_GRADIENT[card.preset]
      } ${className}`}
    >
      {card.src ? (
        <img
          src={card.src}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />
      ) : (
        // Placeholder for a render not supplied yet: a dashed frame and a
        // sweep, the usual "image slot" motif, so the empty card reads as
        // awaiting content rather than as a solid block someone forgot to fill.
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
          <span className="flex h-[86px] w-[86px] items-center justify-center rounded-2xl border-2 border-dashed border-white/40 bg-white/10 backdrop-blur-sm">
            <ImageIcon set="light" size={26} primaryColor="#17161F" />
          </span>
          <span
            aria-hidden
            className="rb-shimmer pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />
        </div>
      )}

      {/* Scrim only where the caption sits, so a real photo keeps its own
          contrast everywhere else.
          Tuned for the worst case rather than the average: the sketch ambiance
          is a near-white axonometric, and at black/60 over a third of the card
          the white caption sat around 3:1 on it — readable on the four dark
          renders, not on that one. Deeper and slightly taller fixes every
          image, including whichever ones replace these later. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-4 bottom-4">
        <div className="font-[family-name:var(--font-general-sans)] text-[17px] font-bold text-white">
          {label}
        </div>
        <div className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-white/85">
          {tag}
        </div>
      </div>
    </div>
  );
}

// Mobile-only slider. Built on native scroll-snap rather than a transform
// track: swiping, momentum and the snap itself then come from the platform,
// and the auto-advance is just a scrollTo on top of it — so a finger already
// mid-swipe is never fighting a running animation.
function HeroSlider({ tag }: { tag: string }) {
  const { locale, t } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  // Ping-pong rather than wrap: rewinding from the fifth card to the first is
  // a four-card sweep, the one visibly wrong moment in most auto-carousels.
  const dirRef = useRef(1);
  const [held, setHeld] = useState(false);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);
  // Bumped on every interaction so the timer restarts from the slide the user
  // just landed on, instead of snatching it away a moment later.
  const [restart, setRestart] = useState(0);
  const count = HERO_CARDS.length;

  const goTo = useCallback((i: number, smooth = true) => {
    const track = trackRef.current;
    const child = track?.children[i];
    if (!track || !(child instanceof HTMLElement)) return;
    track.scrollTo({
      left: child.offsetLeft - (track.clientWidth - child.clientWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Read the index back off the scroll position rather than trusting the last
  // command: a swipe moves the track without ever going through goTo.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const centre = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < track.children.length; i += 1) {
        const child = track.children[i];
        if (!(child instanceof HTMLElement)) continue;
        const distance = Math.abs(child.offsetLeft + child.clientWidth / 2 - centre);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      indexRef.current = best;
      setIndex(best);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Nothing should keep sliding once the hero has scrolled away — it is motion
  // nobody is watching, on a battery.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const io = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? true),
      { threshold: 0.35 },
    );
    io.observe(track);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || held || !inView || count < 2) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (indexRef.current + dirRef.current >= count) dirRef.current = -1;
      else if (indexRef.current + dirRef.current < 0) dirRef.current = 1;
      goTo(indexRef.current + dirRef.current);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [reduced, held, inView, restart, count, goTo]);

  return (
    <div className="sm:hidden">
      <div
        ref={trackRef}
        role="group"
        aria-label={t('landing.heroSliderLabel')}
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => {
          setHeld(false);
          setRestart((r) => r + 1);
        }}
        onPointerCancel={() => {
          setHeld(false);
          setRestart((r) => r + 1);
        }}
        style={{ paddingInline: `calc(50% - ${SLIDE_HALF}px)` }}
        className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pt-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {HERO_CARDS.map((card, i) => (
          <div
            key={card.preset}
            style={{ animationDelay: `${i * 90}ms` }}
            className="rb-card-in flex-shrink-0 snap-center"
          >
            <HeroCardFace
              card={card}
              label={PRESETS[card.preset].label[locale]}
              tag={tag}
              className="h-[316px] w-[236px]"
            />
          </div>
        ))}
      </div>

      {/* The dots double as controls: without them the slider is something
          that happens to you rather than something you can steer. */}
      <div className="mt-1 flex items-center justify-center">
        {HERO_CARDS.map((card, i) => (
          <button
            key={card.preset}
            type="button"
            aria-label={PRESETS[card.preset].label[locale]}
            aria-current={i === index}
            onClick={() => {
              dirRef.current = i >= index ? 1 : -1;
              goTo(i);
              setRestart((r) => r + 1);
            }}
            className="flex h-10 w-7 items-center justify-center"
          >
            <span
              className={`h-1.5 rounded-full transition-all duration-300 ease-out ${
                i === index ? 'w-5 bg-[#716FFF]' : 'w-1.5 bg-[#DEDEE8]'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function HeroFan({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  const { locale, t } = useLocale();

  if (HERO_CARDS.length === 0) return null;

  const middle = Math.floor(HERO_CARDS.length / 2);
  const tag = t('landing.heroFanTag');

  // The yellow carried a 10px hard offset block of the SAME yellow plus a 5px
  // white ring — a sticker/brutalist device on a page whose every other
  // surface is soft-shadowed and violet, so it read as pasted on. What the
  // button actually needs, floating over photographs, is separation from busy
  // imagery: a thin white ring does that, and one soft shadow gives it the
  // same depth as the cards it sits on.
  const cta = (
    <Link
      href={ctaHref}
      style={{ animationDelay: `${middle * 90 + 220}ms` }}
      className="rb-card-in inline-flex items-center gap-2 rounded-full bg-[#FFC53D] px-5 py-3 text-sm font-semibold text-[#17161F] shadow-[0_0_0_3px_#FFFFFF,0_10px_22px_-8px_rgba(23,22,31,0.38)] transition-[transform,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-[#FFB92B] active:scale-[0.97]"
    >
      {ctaLabel}
      <ArrowRight set="light" size={15} primaryColor="#17161F" />
    </Link>
  );

  return (
    <div className="relative mt-10">
      {/* Bleeds off the bottom like the reference: the row is taller than the
          visible window and the overflow is cropped. */}
      {/* pb-6 buys back the overflow the captions were falling into. The two
          outer cards are pushed down 24px and tilted 6 degrees, which drops
          their lower corner another ~12px — well past the caption sitting 16px
          above the card's edge, so "Jour extérieur" and "Esquisse" were being
          sliced through the middle of the only text that names them. The cards
          still bleed off the bottom, just by their corner instead of their
          label. */}
      <div className="hidden items-end justify-center overflow-hidden pb-6 pt-8 sm:flex">
        {HERO_CARDS.map((card, i) => (
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
              <HeroCardFace
                card={card}
                label={PRESETS[card.preset].label[locale]}
                tag={tag}
                className={`h-[300px] w-[220px] transition-transform duration-300 ease-out group-hover:-translate-y-3 group-hover:rotate-0 ${
                  TILT[i] ?? ''
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      <HeroSlider tag={tag} />

      {/* Floating CTA over the middle card, as in the reference.
          The centring translate lives on the wrapper and the entrance on the
          link: rb-card-in animates `transform`, so sharing one element would
          wipe the -50% offset mid-animation and slide the button sideways.

          Desktop only. On a phone there is exactly one card on screen, and a
          button parked over it hides the very render it is meant to sell — so
          below `sm` the CTA sits under the slider instead. */}
      <div className="absolute left-1/2 top-0 z-30 hidden -translate-x-1/2 sm:block">{cta}</div>
      <div className="mt-2 flex justify-center sm:hidden">{cta}</div>
    </div>
  );
}
