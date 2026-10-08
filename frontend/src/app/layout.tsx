import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter, Poppins } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/lib/i18n/LocaleContext';
import type { Locale } from '@/lib/i18n/dictionaries';
import { resolveLocale } from '@/lib/i18n/geo-locale';
import { COOKIE_PREFIX } from '@/lib/constants';

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

export const metadata: Metadata = {
  title: 'RenderBox',
  description: 'Rendu architectural par IA — cohérent d’une vue à l’autre.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The visitor's own FR / EN choice first; otherwise the language of the
  // country their IP is in (French-speaking → fr, anything else → en).
  const [store, head] = await Promise.all([cookies(), headers()]);
  const locale: Locale = resolveLocale({
    cookie: store.get(`${COOKIE_PREFIX}-locale`)?.value,
    country: head.get('x-vercel-ip-country'),
    region: head.get('x-vercel-ip-country-region'),
  });

  return (
    // suppressHydrationWarning: browser extensions inject attributes on <html>
    // (e.g. webcrx) before React hydrates. Only silences this one element's attributes.
    <html
      lang={locale}
      className={`${inter.variable} ${poppins.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className={`${inter.className} bg-white text-[#17161F] antialiased`}>
        <LocaleProvider initialLocale={locale}>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
