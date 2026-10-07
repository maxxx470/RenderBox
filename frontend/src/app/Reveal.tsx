'use client';

// Scroll-reveal wrapper, after Metrio's landing (src/pages/landing/landing.css,
// `.reveal` / `.reveal.in`): each block arrives blurred, slightly offset and
// transparent, and settles sharp in 0.8s on cubic-bezier(0.16, 1, 0.3, 1) —
// a fast start that lands softly. The owner found the previous version (a
// 12px fade) too faint to read as an entrance (2026-10-06).
//
// Fires once per element via IntersectionObserver, as the block's top clears
// the bottom ~10% of the viewport. Once the entrance has played, the blur and
// transform classes are dropped entirely: a lingering `filter` would create a
// containing block and break any `position: fixed` or backdrop-filter inside.
//
// Tailwind v4 moves with the `translate` and `scale` properties, not
// `transform` — the transition lists them by name. The previous version
// listed `transform`, so its offset snapped instead of sliding: only the fade
// ever animated.
//
// Reduced motion: shown at once, no transition.
import { useEffect, useRef, useState, type ReactNode } from 'react';

type Variant = 'up' | 'left' | 'right' | 'scale';

// Full literal class strings (Tailwind JIT, see CLAUDE.md).
const FROM: Record<Variant, string> = {
  up: 'translate-y-6',
  left: '-translate-x-8',
  right: 'translate-x-8',
  scale: 'translate-y-3 scale-[0.94]',
};

export function Reveal({
  children,
  delayMs = 0,
  className = '',
  variant = 'up',
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  variant?: Variant;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'hidden' | 'in' | 'done'>('hidden');

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('done');
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPhase('in');
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const state =
    phase === 'done'
      ? ''
      : phase === 'in'
        ? 'opacity-100 blur-0 translate-x-0 translate-y-0 scale-100 transition-[opacity,translate,scale,filter] duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)]'
        : `opacity-0 blur-[9px] ${FROM[variant]}`;

  return (
    <div
      ref={ref}
      className={`${state} ${className}`}
      style={phase === 'in' && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'opacity') setPhase('done');
      }}
    >
      {children}
    </div>
  );
}
