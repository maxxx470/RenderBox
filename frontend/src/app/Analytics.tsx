'use client';

// Loads Google Analytics once the visitor has accepted, and never before.
// See lib/analytics.ts for the three rules this obeys.
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  CONSENT_KEY,
  GA_ID,
  isMeasurablePath,
  readConsent,
  writeConsent,
  type Consent,
} from '@/lib/analytics';
import { ConsentBanner } from './ConsentBanner';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function Analytics({ nonce }: { nonce: string | null }) {
  // null until the browser is read: the server renders neither script nor
  // banner, so the two sides agree on the first paint.
  const [consent, setConsent] = useState<Consent | null | 'unread'>('unread');
  const pathname = usePathname();
  const measurable = isMeasurablePath(pathname);

  useEffect(() => {
    setConsent(readConsent());
    // Another tab answering the banner settles it here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_KEY) setConsent(readConsent());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Each page of the public site, once accepted. App Router does not reload
  // the document between pages, so the view is sent by hand.
  useEffect(() => {
    if (consent !== 'granted' || !measurable || !GA_ID) return;
    window.gtag?.('event', 'page_view', { page_path: pathname });
  }, [consent, measurable, pathname]);

  const answer = useCallback((value: Consent) => {
    writeConsent(value);
    setConsent(value);
  }, []);

  if (!GA_ID || consent === 'unread') return null;

  return (
    <>
      {consent === 'granted' && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
            {...(nonce ? { nonce } : {})}
          />
          <Script id="ga-setup" strategy="afterInteractive" {...(nonce ? { nonce } : {})}>
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
window.gtag=gtag;gtag('js',new Date());
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});
gtag('config','${GA_ID}',{anonymize_ip:true,send_page_view:false});`}
          </Script>
        </>
      )}
      {/* Asked once, on the public site only — never over the workspace. */}
      {consent === null && measurable && <ConsentBanner onAnswer={answer} />}
    </>
  );
}
