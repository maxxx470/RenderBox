'use client';

// Render-history gallery (§6 of the animation spec). Desktop: a static grid
// that reveals in a 100ms stagger. Mobile (<620px): the row auto-scrolls
// right then back once to hint that it's swipeable, then stops for good the
// instant the visitor touches, wheels, or drags it themselves — a nudge,
// not a nuisance. Only runs once the section is half in view.
import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'react-iconly';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { Reveal } from './Reveal';

const MONO = 'font-[family-name:var(--font-jetbrains-mono)]';
const GRADIENT = 'bg-[linear-gradient(135deg,#6E6BFF_0%,#8B5CF6_48%,#A855F7_100%)]';
const FORWARD_MS = 1500;
const BACKWARD_MS = 1200;
const PAUSE_AT_END_MS = 500;
const PAUSE_AT_START_MS = 900;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface TreeGalleryItem {
  label: string;
  tag: string;
}

export function TreeGallery({ items }: { items: TreeGalleryItem[] }) {
  const [sectionRef, inView] = useInView<HTMLDivElement>({ threshold: 0.5 });
  const reducedMotion = usePrefersReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);
  const stoppedRef = useRef(false);
  const rafRef = useRef(0);
  const startedRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 619px)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!inView || !isMobile || reducedMotion || startedRef.current) return;
    const row = rowRef.current;
    if (!row) return;
    startedRef.current = true;

    function stop() {
      stoppedRef.current = true;
      cancelAnimationFrame(rafRef.current);
    }
    row.addEventListener('touchstart', stop, { passive: true });
    row.addEventListener('wheel', stop, { passive: true });
    row.addEventListener('pointerdown', stop);

    function tween(from: number, to: number, durationMs: number, onDone: () => void) {
      const start = performance.now();
      function tick(now: number) {
        if (stoppedRef.current || !row) return;
        const t = Math.min(1, (now - start) / durationMs);
        row.scrollLeft = from + (to - from) * easeInOutCubic(t);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          onDone();
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function sweep() {
      if (stoppedRef.current || !row) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      tween(0, max, FORWARD_MS, () => {
        if (stoppedRef.current) return;
        setTimeout(() => {
          if (stoppedRef.current) return;
          tween(max, 0, BACKWARD_MS, () => {
            if (stoppedRef.current) return;
            setTimeout(sweep, PAUSE_AT_START_MS);
          });
        }, PAUSE_AT_END_MS);
      });
    }
    sweep();

    return () => {
      stop();
      row.removeEventListener('touchstart', stop);
      row.removeEventListener('wheel', stop);
      row.removeEventListener('pointerdown', stop);
    };
  }, [inView, isMobile, reducedMotion]);

  return (
    <div ref={sectionRef}>
      <div
        ref={rowRef}
        className="flex gap-2.5 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] min-[620px]:grid min-[620px]:grid-cols-4 min-[620px]:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <Reveal
            key={item.label}
            delayMs={i * 100}
            className="min-w-[120px] flex-shrink-0 min-[620px]:min-w-0"
          >
            <div
              className={`flex h-[92px] w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-[#ECECF2] ${GRADIENT}`}
            >
              <ImageIcon set="bold" size={18} primaryColor="#ffffff" />
            </div>
            <div className="mt-1.5 text-center">
              <div className="text-xs font-medium text-[#17161F]">{item.label}</div>
              <div className={`text-[9px] text-[#8A8896] ${MONO}`}>{item.tag}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
