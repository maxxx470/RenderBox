'use client';

import { useEffect, useState } from 'react';

// SSR-safe: starts `false` (server has no matchMedia) and settles on mount
// before any animation logic runs — every consumer effect that reads this
// value only fires client-side anyway, so the one-render lag is invisible.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
