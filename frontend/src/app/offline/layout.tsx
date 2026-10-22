import type { Metadata } from 'next';

// The page the service worker shows when the network is gone: never indexed.
export const metadata: Metadata = {
  title: 'Hors connexion',
  robots: { index: false, follow: false },
};

export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
