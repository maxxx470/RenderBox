import type { ReactNode } from 'react';
import { AppLayoutShell } from '@/app/app/AppLayoutShell';

// Paramètres is an app page with a top-level URL: it wears the same chrome
// as /app/* (see AppChrome.tsx).
export default function ParametresLayout({ children }: { children: ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
