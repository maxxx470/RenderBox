'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/i18n/LocaleContext';
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
  const { locale } = useLocale();
  // Starts at the real figure, not at zero. The server-rendered HTML is what a
  // crawler and a JS-less visitor read, and these numbers sit inside a claim
  // sentence ("5 ambiances de rendu") — shipping "0 ambiances de rendu" would
  // put the opposite of the truth in the markup. The first animation frame
  // drops it back to 0, so the count-up still reads as a count-up.
  const [value, setValue] = useState(to);
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
      {/* Grouped in the reader's own locale: 100 000 in French, 100,000 in
          English. Hardcoding fr-FR printed a French-spaced number on the
          English page. */}
      {value.toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR')}
    </span>
  );
}
