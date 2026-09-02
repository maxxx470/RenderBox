'use client';

// Scroll-reveal wrapper — fires once per element via IntersectionObserver,
// translateY+opacity only (transform/opacity are the only GPU-cheap
// properties), custom ease-out curve, short stagger via inline delay.
// Respects prefers-reduced-motion (skips the initial hidden state entirely
// rather than just dropping the transform, per emil-design-eng guidance:
// reduced motion means gentler, not necessarily zero — here the safest
// gentle option is "just show it").
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Reveal({
  children,
  delayMs = 0,
  className = '',
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '-60px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
