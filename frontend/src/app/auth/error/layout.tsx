import type { Metadata } from 'next';

// Where a failed Google sign-in lands. Crawlable but never indexed, for the
// same reason as /paiement/retour: « noindex » only works on a page a crawler
// is allowed to read.
export const metadata: Metadata = {
  title: 'Erreur de connexion',
  robots: { index: false, follow: false },
};

export default function AuthErrorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
