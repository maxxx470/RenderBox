import { JetBrains_Mono } from 'next/font/google';
import { getAuthCta } from '@/lib/server/auth-disabled';
import { generalSans } from '@/fonts/general-sans';
import { LandingClient } from './LandingClient';

// Thin server wrapper so getAuthCta() (reads the AUTH_DISABLED env var) can
// run server-side and hand the result down as a prop — the landing page
// itself is a Client Component (interactive pricing checkout, auth-aware
// nav) and can't read server env vars directly.
//
// The landing page uses its own font pair (General Sans + JetBrains Mono),
// deliberately scoped here rather than added to the root layout — it's a
// redesign of this page only; /app, /admin etc. keep Poppins/Inter/IBM Plex
// Mono untouched.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export default function LandingPage() {
  return (
    <LandingClient
      ctaHref={getAuthCta()}
      fontClassName={`${generalSans.variable} ${jetbrainsMono.variable}`}
    />
  );
}
