import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter, Poppins } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/lib/i18n/LocaleContext';
import { requestLocale } from '@/lib/i18n/request-locale';
import { OG_IMAGE, SEO_COPY, SITE_NAME, SITE_URL } from '@/lib/seo';
import { VisitorCountryProvider } from '@/lib/visitor-country';
import { FxRatesProvider } from '@/lib/fx-rates';
import { getEurRates } from '@/lib/server/fx-rates';
import { PwaRegister } from './PwaRegister';

// Site-wide type (2026-10-06, owner: "la même police que sur Metrio"):
// Metrio's pairing — Inter for body text, Poppins for titles, IBM Plex Mono
// for technical/tag text. One source of truth for every route, as CSS
// variables on <html>: --font-sans, --font-display, --font-mono. (General
// Sans and JetBrains Mono, the 2026-09-02 charter, are retired.)
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

// Browser chrome colour while the site is open (white, like the app's header).
// The web app manifest is app/manifest.ts, the worker public/sw.js.
export const viewport: Viewport = { themeColor: '#FFFFFF' };

// What every page tells search engines and link previews unless it says more
// (lib/seo.ts; the public pages set their own title, address and languages).
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await requestLocale();
  const { title, description } = SEO_COPY.home[locale];
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: { default: title, template: `%s · ${SITE_NAME}` },
    description,
    openGraph: { type: 'website', siteName: SITE_NAME, title, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    // Safari (iPhone, iPad, Mac) installs from its Share / File menu and reads these.
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
    formatDetection: { telephone: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The visitor's own FR / EN choice first; otherwise the language of the
  // country their IP is in (French-speaking → fr, anything else → en).
  const { locale, country } = await requestLocale();
  // Synchronous by design: it hands back whatever this instance already holds
  // and refreshes in the background, so no page ever waits on the rate API.
  const rates = getEurRates();

  return (
    // suppressHydrationWarning: browser extensions inject attributes on <html>
    // (e.g. webcrx) before React hydrates. Only silences this one element's attributes.
    <html
      lang={locale}
      className={`${inter.variable} ${poppins.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className={`${inter.className} bg-white text-[#17161F] antialiased`}>
        <PwaRegister />
        <LocaleProvider initialLocale={locale}>
          {/* The country also gives the plan card its local-currency line. */}
          <VisitorCountryProvider country={country}>
            {/* The country picks the currency, these give the day's rate. */}
            <FxRatesProvider rates={rates}>
              <ToastProvider>
                <AuthProvider>{children}</AuthProvider>
              </ToastProvider>
            </FxRatesProvider>
          </VisitorCountryProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
