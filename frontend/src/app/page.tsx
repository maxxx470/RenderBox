import { getAuthCta } from '@/lib/server/auth-disabled';
import { LandingClient } from './LandingClient';

// Thin server wrapper so getAuthCta() (reads the AUTH_DISABLED env var) can
// run server-side and hand the result down as a prop — the landing page
// itself is a Client Component (interactive pricing checkout, auth-aware
// nav) and can't read server env vars directly.
export default function LandingPage() {
  return <LandingClient ctaHref={getAuthCta()} />;
}
