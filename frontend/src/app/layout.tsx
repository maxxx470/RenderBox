import type { Metadata } from 'next';
import { Inter, Poppins, IBM_Plex_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/lib/i18n/LocaleContext';
import type { Locale } from '@/lib/i18n/dictionaries';
import { COOKIE_PREFIX } from '@/lib/constants';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
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
  const store = await cookies();
  const cookieLocale = store.get(`${COOKIE_PREFIX}-locale`)?.value;
  const locale: Locale = cookieLocale === 'en' ? 'en' : 'fr';

  return (
    <html lang={locale} className={`${inter.variable} ${poppins.variable} ${ibmPlexMono.variable}`}>
      <body className={inter.className}>
        <LocaleProvider initialLocale={locale}>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
