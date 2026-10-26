import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requestLocale } from '@/lib/i18n/request-locale';
import { pageMetadata } from '@/lib/seo';

// The page is a Client Component: its title, address and languages for
// search engines are said here (lib/seo.ts).
export async function generateMetadata(): Promise<Metadata> {
  const { locale, explicitLang } = await requestLocale();
  return pageMetadata('exemple', locale, explicitLang);
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
