'use client';

// Mounted once by the root layout: registers the service worker (public/sw.js)
// and keeps the browser's install offer for the Paramètres card. Production
// only — in development a worker would keep serving stale chunks.
import { useEffect } from 'react';
import { captureInstallPrompt } from '@/lib/pwa-install';

export function PwaRegister() {
  useEffect(() => captureInstallPrompt(), []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // The worker file is never served from cache (next.config.ts), so a new
    // version is picked up at the next visit.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => undefined);
  }, []);

  return null;
}
