'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

// Generic one-shot-or-repeating IntersectionObserver hook shared by every
// scroll-triggered sequence on the landing page (reveal, count-up, the
// materials/engines auto-play demos, the tree-gallery sweep, the sticky
// bar). `once` unobserves after the first hit — for anything that should
// only ever run its intro animation a single time.
export function useInView<T extends HTMLElement>({
  threshold = 0.25,
  rootMargin = '0px',
  once = true,
}: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
} = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inView];
}
