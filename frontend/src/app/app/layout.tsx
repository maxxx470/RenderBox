import type { ReactNode } from 'react';
import { AppLayoutShell } from './AppLayoutShell';

// Every /app/* screen sits in the same chrome (header bar, rail, bottom bar),
// mounted here once so it survives navigations — see AppChrome.tsx.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
