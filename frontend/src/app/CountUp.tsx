'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

// cubic ease-out, matches the rest of the landing's entrance curve family.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUp({
  to,
  durationMs = 1400,
  className = '',
}: {
  to: number;
  durationMs?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!inView || startedRef.current) return;
    startedRef.current = true;
    if (reducedMotion) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(easeOutCubic(t) * to));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, durationMs, reducedMotion]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString('fr-FR')}
    </span>
  );
}
