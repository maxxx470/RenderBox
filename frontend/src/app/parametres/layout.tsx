import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppLayoutShell } from '@/app/app/AppLayoutShell';

// Private pages: never listed by search engines (robots.ts also keeps them out).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Paramètres is an app page with a top-level URL: it wears the same chrome
// as /app/* (see AppChrome.tsx).
export default function ParametresLayout({ children }: { children: ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
