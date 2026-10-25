'use client';

// The day's exchange rates (units per euro), read once by the root layout and
// handed to the client components that price something — today the plan card's
// local-currency line (lib/local-currency.ts).
//
// Same shape as VisitorCountryProvider, and for the same reason: the value is
// known on the server, needed in a client component, and constant for the
// whole render. Null when the server has no live copy yet, in which case
// `localPrice` falls back to the table committed in local-currency.ts.
import { createContext, useContext, type ReactNode } from 'react';

export type EurRates = Readonly<Record<string, number>>;

const RatesContext = createContext<EurRates | null>(null);

export function FxRatesProvider({
  rates,
  children,
}: {
  rates: EurRates | null;
  children: ReactNode;
}) {
  return <RatesContext.Provider value={rates}>{children}</RatesContext.Provider>;
}

export function useEurRates(): EurRates | null {
  return useContext(RatesContext);
}
