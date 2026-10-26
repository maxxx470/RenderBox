import type { Metadata } from 'next';

// The page a payment provider sends the customer back to: one account's own
// order, nothing a search engine should hold. It is left crawlable on purpose
// — a page blocked in robots.txt is never read, so its « noindex » would
// never be seen and Google could list the bare address all the same.
export const metadata: Metadata = {
  title: 'Retour de paiement',
  robots: { index: false, follow: false },
};

export default function PaiementRetourLayout({ children }: { children: React.ReactNode }) {
  return children;
}
