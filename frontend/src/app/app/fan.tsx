'use client';

// The fan of four tilted cards — the motif of /app/generer, and since
// 2026-10-08 of an empty project's canvas too (owner: the four example images
// of the Image page replace the drop zone). Shared so both draw the same cards.
//
// Below 900px (2026-10-15, owner, after the « TripStar » reference) the fan is
// a carousel instead: one card in front, its neighbours tilted behind it,
// turning by itself every few seconds — see FanCarousel.
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { ExampleRender } from './generer-examples';

export const CARD_TRANSFORM = [
  '',
  '-rotate-3 translate-y-1.5',
  'rotate-2 -translate-y-1 z-[2]',
  '-rotate-2 translate-y-2.5',
];

/** How many positions the fan lays out, filled or not. */
export const FAN_SLOTS = CARD_TRANSFORM.length;

// Shared geometry so a filled slot and an empty one occupy exactly the same
// space — otherwise the fan would shift as renders replace placeholders.
// Below 900px the card sits in FanCarousel: no tilt, no overlap (the carousel
// places it), and as tall as the phone allows.
export const CARD_SHAPE =
  'group relative h-[300px] w-[220px] flex-shrink-0 overflow-hidden rounded-[18px] shadow-[0_20px_40px_-20px_#17161F30] transition-transform hover:z-10 hover:-translate-y-2 hover:rotate-0 max-[899px]:ml-0 max-[899px]:h-[clamp(210px,40dvh,300px)] max-[899px]:w-auto max-[899px]:aspect-[11/15] max-[899px]:translate-y-0 max-[899px]:rotate-0';

const MOBILE_QUERY = '(max-width: 899px)';
const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const AUTOPLAY_MS = 4000;

/** One card of a FanCarousel; `mobile: false` keeps it out of the phone's carousel. */
export interface FanItem {
  key: string;
  node: ReactNode;
  mobile?: boolean;
}

/**
 * The fan's container. From 900px it is the fan as it always was: the cards
 * side by side, overlapped and tilted by their own classes. Below 900px it is
 * a carousel (owner, 2026-10-15): the current card in front, its neighbours
 * smaller and tilted behind it, dots under it. It turns every 4 s; a touch
 * stops it for good (someone choosing a template must not see it move away),
 * a swipe turns it by hand, a tap on a neighbour brings it to the front
 * (without opening it). It never turns by itself when the phone asks for
 * reduced motion.
 */
export function FanCarousel({ items }: { items: FanItem[] }) {
  const t = useTranslations();
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
  const mobileItems = items.filter((it) => it.mobile !== false);
  const n = mobileItems.length;
  const [active, setActive] = useState(0);
  const [stopped, setStopped] = useState(false);
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);

  useEffect(() => {
    if (!isMobile || stopped || n < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % n), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [isMobile, stopped, n]);

  const go = (step: number) => setActive((a) => (((a + step) % n) + n) % n);

  const onPointerDown = (e: PointerEvent) => {
    if (!isMobile) return;
    setStopped(true);
    startX.current = e.clientX;
    swiped.current = false;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!isMobile || startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 10) swiped.current = true;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  let slot = -1;
  return (
    <div
      role="region"
      aria-roledescription={isMobile ? 'carousel' : undefined}
      aria-label={t('app.carouselLabel')}
      className="flex flex-1 flex-col items-center justify-center overflow-hidden pb-5 min-[900px]:flex-row"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (startX.current = null)}
        className="relative h-[clamp(210px,40dvh,300px)] w-full touch-pan-y select-none min-[900px]:contents"
      >
        {items.map((it) => {
          if (it.mobile === false) {
            return (
              <div key={it.key} className="max-[899px]:hidden min-[900px]:contents">
                {it.node}
              </div>
            );
          }
          const i = ++slot;
          // Offset from the front card, wrapped so the ring has no end.
          let o = (((i - active) % n) + n) % n;
          if (o > n / 2) o -= n;
          const near = Math.abs(o) <= 1;
          const onClickCapture = (e: MouseEvent) => {
            if (!isMobile) return;
            if (swiped.current || o !== 0) {
              e.preventDefault();
              e.stopPropagation();
              if (!swiped.current) setActive(i);
              swiped.current = false;
            }
          };
          return (
            <div
              key={it.key}
              onClickCapture={onClickCapture}
              style={
                {
                  '--o': Math.max(-2, Math.min(2, o)),
                  '--s': o === 0 ? 1 : 0.84,
                  '--op': near ? (o === 0 ? 1 : 0.7) : 0,
                  '--z': 10 - Math.abs(o),
                } as CSSProperties
              }
              className={`max-[899px]:absolute max-[899px]:left-1/2 max-[899px]:top-0 max-[899px]:z-[var(--z)] max-[899px]:opacity-[var(--op)] max-[899px]:[transform:translateX(calc(-50%_+_var(--o)_*_58%))_rotate(calc(var(--o)_*_6deg))_scale(var(--s))] max-[899px]:transition-[transform,opacity] max-[899px]:duration-500 max-[899px]:ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none min-[900px]:contents ${
                near ? '' : 'max-[899px]:pointer-events-none'
              }`}
            >
              {it.node}
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="mt-3 flex items-center gap-1.5 min-[900px]:hidden">
          {mobileItems.map((it, i) => (
            <button
              key={it.key}
              type="button"
              onClick={() => {
                setStopped(true);
                setActive(i);
              }}
              aria-label={t('app.carouselSlide', { n: String(i + 1), total: String(n) })}
              aria-current={i === active ? 'true' : undefined}
              className="flex h-6 items-center justify-center px-0.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-[width,background-color] duration-300 ${
                  i === active ? 'w-5 bg-[#2948FC]' : 'w-1.5 bg-[#C9CFE0]'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A fine outline drawn over the picture (owner, 2026-10-10), so a light image
// keeps its edge on the grey ground. Over the image, not a border: the picture
// is absolutely positioned and would cover one.
const OUTLINE = (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-[#D8D8E0]"
  />
);

// An example render: a picture, nothing over it (owner, 2026-10-08: no
// "exemple" badge, no ambiance caption — the four images on their own). Same
// geometry as the render cards so the fan never shifts; not a link.
export function ExampleFanCard({ example, index }: { example: ExampleRender; index: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} bg-[#F7F7FA] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img src={example.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {OUTLINE}
    </div>
  );
}

// A template of the image generator page (owner, 2026-10-10): its picture,
// greyed on hover with "Utiliser ce modèle" over it. The whole card is the
// button — it puts the template's prompt in the bar and asks for the photo.
// On a touch screen there is no hover: the label stays visible.
export function TemplateFanCard({
  src,
  label,
  action,
  index,
  onUse,
}: {
  src: string;
  /** The template's name — the card's accessible name, with the action. */
  label: string;
  /** "Utiliser ce modèle". */
  action: string;
  index: number;
  onUse: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onUse}
      aria-label={`${action} : ${label}`}
      title={label}
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} bg-[#F7F7FA] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2948FC] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover transition-[filter] duration-200 ease-out group-hover:brightness-75 group-hover:grayscale group-focus-visible:brightness-75 group-focus-visible:grayscale"
      />
      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:items-end [@media(hover:none)]:pb-3 [@media(hover:none)]:opacity-100">
        <span className="rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#17161F] shadow-[0_10px_24px_-10px_rgba(23,22,31,0.55)]">
          {action}
        </span>
      </span>
      {OUTLINE}
    </button>
  );
}
