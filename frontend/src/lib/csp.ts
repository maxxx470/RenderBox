// Content-Security-Policy for RenderBox's HTML pages.
//
// next.config.ts carries the static security headers but deliberately left CSP
// out, noting it needed a per-request nonce and should ship from middleware
// "when the first frontend page lands". They have landed — landing, /app,
// /admin, /parametres, /legal — so this is that follow-up.
//
// Shipped REPORT-ONLY on purpose. A wrong CSP breaks a live site silently, in
// the browser, where no test or build can see it; report-only cannot block
// anything, so it buys real-world evidence at zero risk. Flip
// `CSP_ENFORCE=true` once the reports come back clean.

import { MEDIA_ORIGIN } from '@/app/motion-media';

export interface CspResult {
  nonce: string;
  policy: string;
  /** Header to send to the browser — report-only unless CSP_ENFORCE is set. */
  headerName: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only';
}

/** Google Analytics' hosts, only when an id is configured — and the script
 *  itself is still only fetched once the visitor accepts (lib/analytics.ts).
 *  `script-src` names none of them: under 'strict-dynamic' a host list is
 *  ignored, and the scripts carry the request's nonce instead. */
const GA_HOSTS = [
  'https://www.googletagmanager.com',
  'https://www.google-analytics.com',
  'https://analytics.google.com',
];
const gaConfigured = (): boolean => Boolean(process.env.NEXT_PUBLIC_GA_ID);

/** Sentry's ingest hosts, only when a DSN is actually configured. */
function connectSources(sentryDsn: string | undefined): string[] {
  const sources = ["'self'"];
  if (sentryDsn) sources.push('https://*.ingest.sentry.io', 'https://*.ingest.de.sentry.io');
  if (gaConfigured()) sources.push(...GA_HOSTS);
  return sources;
}

export function buildCsp(options: {
  nonce: string;
  isProduction: boolean;
  enforce: boolean;
  sentryDsn?: string | undefined;
}): CspResult {
  const { nonce, isProduction, enforce, sentryDsn } = options;

  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonced bootstrap load its own chunks
    // without enumerating every hashed filename. In dev, Next injects inline
    // eval-based tooling that no nonce covers.
    isProduction
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
    // Inline style ATTRIBUTES (style={{ clipPath }}, the zone rectangle, the
    // comparison divider) require 'unsafe-inline' here — there is no nonce
    // mechanism for attributes, only for <style> elements.
    `style-src 'self' 'unsafe-inline'`,
    // blob: covers the reference-image preview built with createObjectURL.
    // MEDIA_ORIGIN: the motion films' posters, served from Cloudflare R2.
    // Analytics answers some calls with a 1-pixel image.
    `img-src 'self' data: blob: ${MEDIA_ORIGIN}${gaConfigured() ? ` ${GA_HOSTS.join(' ')}` : ''}`,
    // The motion films themselves (motion-media.ts). Without this, media-src
    // falls back to default-src 'self' and would block them once enforced.
    `media-src 'self' ${MEDIA_ORIGIN}`,
    // next/font self-hosts its files at build time — no external font origin.
    `font-src 'self'`,
    `connect-src ${connectSources(sentryDsn).join(' ')}`,
    // The service worker (public/sw.js) and the web app manifest.
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    // Matches the X-Frame-Options: DENY already set in next.config.ts.
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `report-uri /api/csp-report`,
  ];

  if (isProduction) directives.push('upgrade-insecure-requests');

  return {
    nonce,
    policy: directives.join('; '),
    headerName: enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
  };
}
