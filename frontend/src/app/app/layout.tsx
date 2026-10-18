import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppLayoutShell } from './AppLayoutShell';

// Private pages: never listed by search engines (robots.ts also keeps them out).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Every /app/* screen sits in the same chrome (header bar, rail, bottom bar),
// mounted here once so it survives navigations — see AppChrome.tsx.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
