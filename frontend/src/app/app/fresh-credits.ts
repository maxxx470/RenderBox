'use client';

// The credit balance, kept right without a reload (2026-10-19, owner: « il
// faut actualiser pour savoir combien il reste, et quand l'action échoue et
// que les crédits sont rendus »). One watcher in the app chrome reads
// GET /api/credits when the tab comes back on screen and whenever something
// that spends or refunds credits calls `creditsChanged()`; it tells the header
// and, by an event, the pages that keep their own copy of the figure.
import { useEffect } from 'react';
import { api } from '@/lib/api';

const REFRESH = 'rp:credits-refresh';
const FRESH = 'rp:credits';

/** Something spent or gave back credits: read the balance again, now. */
export function creditsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH));
}

/** Mounted once, by the chrome: reads the balance and shares it. */
export function useCreditsWatcher(onRemaining: (remaining: number) => void): void {
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ remaining: number | null }>('/api/credits')
        .then(({ remaining }) => {
          if (!alive || remaining === null) return;
          onRemaining(remaining);
          window.dispatchEvent(new CustomEvent(FRESH, { detail: remaining }));
        })
        .catch(() => undefined);
    };
    read();
    window.addEventListener(REFRESH, read);
    window.addEventListener('focus', read);
    window.addEventListener('pageshow', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      alive = false;
      window.removeEventListener(REFRESH, read);
      window.removeEventListener('focus', read);
      window.removeEventListener('pageshow', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [onRemaining]);
}

/** For a page that keeps its own copy of the balance. */
export function useSyncedCredits(set: (remaining: number) => void): void {
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      if (typeof n === 'number') set(n);
    };
    window.addEventListener(FRESH, on);
    return () => window.removeEventListener(FRESH, on);
  }, [set]);
}
