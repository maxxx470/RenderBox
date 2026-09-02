import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { generalSans } from '@/fonts/general-sans';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocaleProvider } from '@/lib/i18n/LocaleContext';
import type { Locale } from '@/lib/i18n/dictionaries';
import { COOKIE_PREFIX } from '@/lib/constants';

// Site-wide charter (2026-09-02): General Sans for body/headings, JetBrains
// Mono for technical/tag text — the pairing introduced on the landing page
// redesign, now the single source of truth for every route via CSS
// variables on <html>. Previously Inter/Poppins/IBM Plex Mono; those are
// fully retired, not just superseded, so no route should reference them.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-jetbrains-mono',
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
    <html lang={locale} className={`${generalSans.variable} ${jetbrainsMono.variable}`}>
      <body className={`${generalSans.className} bg-white text-[#17161F] antialiased`}>
        <LocaleProvider initialLocale={locale}>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
