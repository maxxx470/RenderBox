'use client';

// Before/after comparison (§2 of the animation spec).
// Desktop (≥640px): draggable clip-path slider (emil-design-eng technique —
// overlay two images, clip the top one with clip-path, adjust on drag; no
// extra DOM, fully hardware-accelerated) plus a spark that continuously
// sweeps the handle rail to hint the zone is interactive.
// Mobile (<640px): a two-button toggle instead of drag (imprecise on touch)
// that auto-plays every 1.7s until the visitor taps either button, at which
// point the auto-play stops for good — same "demo until you drive"
// convention used by the materials Feed Studio and the tree-gallery sweep.
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

const MONO = 'font-[family-name:var(--font-jetbrains-mono)]';
const MOBILE_AUTOPLAY_MS = 1700;

export function BeforeAfterSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: ReactNode;
  after: ReactNode;
  beforeLabel: string;
  afterLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const dragging = useRef(false);

  const [sectionRef, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const reducedMotion = usePrefersReducedMotion();
  const [showAfter, setShowAfter] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const autoplayRef = useRef(true);

  function updateFromClientX(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, ratio)));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    updateFromClientX(e.clientX);
  }

  function onPointerUp() {
    dragging.current = false;
  }

  function switchTo(next: boolean) {
    if (next === showAfter) return;
    if (reducedMotion) {
      setShowAfter(next);
      return;
    }
    setTransitionPhase('out');
    setTimeout(() => {
      setShowAfter(next);
      setTransitionPhase('in');
      requestAnimationFrame(() => requestAnimationFrame(() => setTransitionPhase('idle')));
    }, 200);
  }

  useEffect(() => {
    if (!inView || reducedMotion) return;
    const id = setInterval(() => {
      if (!autoplayRef.current) return;
      switchTo(!showAfter);
    }, MOBILE_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [inView, reducedMotion, showAfter]);

  function handleManualToggle(next: boolean) {
    autoplayRef.current = false;
    switchTo(next);
  }

  const mobileStyle =
    transitionPhase === 'out'
      ? {
          opacity: 0,
          transform: 'translateY(6px) scale(0.97)',
          transition: 'opacity 200ms, transform 200ms',
        }
      : transitionPhase === 'in'
        ? {
            opacity: 1,
            transform: 'translateY(0) scale(1)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }
        : { opacity: 1, transform: 'translateY(0) scale(1)' };

  return (
    <div ref={sectionRef}>
      {/* Mobile: toggle buttons */}
      <div className="min-[640px]:hidden">
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleManualToggle(false)}
            className={`flex-1 rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors ${
              !showAfter
                ? 'border-transparent bg-[#17161F] text-white'
                : 'border-[#ECECF2] text-[#3D3B49]'
            }`}
          >
            {beforeLabel}
          </button>
          <button
            type="button"
            onClick={() => handleManualToggle(true)}
            className={`flex-1 rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors ${
              showAfter
                ? 'border-transparent bg-[#716FFF] text-white'
                : 'border-[#ECECF2] text-[#3D3B49]'
            }`}
          >
            {afterLabel}
          </button>
        </div>
        <div
          className="aspect-[16/10] w-full overflow-hidden rounded-2xl border border-[#ECECF2]"
          style={mobileStyle}
        >
          {showAfter ? after : before}
        </div>
      </div>

      {/* Desktop: drag slider */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative hidden aspect-[16/10] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-2xl border border-[#E4E1EF] min-[640px]:block"
      >
        <div className="absolute inset-0">{before}</div>
        <span
          className={`absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white ${MONO}`}
        >
          {beforeLabel}
        </span>

        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          {after}
          <span
            className={`absolute right-3 top-3 rounded-full bg-[#716FFF] px-2.5 py-1 text-[10px] font-medium text-white ${MONO}`}
          >
            {afterLabel}
          </span>
        </div>

        {!reducedMotion && (
          <div
            aria-hidden
            className="rb-spark pointer-events-none absolute top-0 h-full w-6 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            style={{ left: `${position}%` }}
          />
        )}

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
          style={{ left: `${position}%` }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#716FFF] shadow-[0_10px_26px_-6px_rgba(113,111,255,0.6)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
