'use client';

// The visitor's country (ISO 3166-1 alpha-2, from Vercel's
// `x-vercel-ip-country`, read once by the root layout), for the client
// components that adapt to it — today the plan card's local-currency line
// (lib/local-currency.ts). Null off Vercel or when Vercel cannot tell.
import { createContext, useContext, type ReactNode } from 'react';

const CountryContext = createContext<string | null>(null);

export function VisitorCountryProvider({
  country,
  children,
}: {
  country: string | null;
  children: ReactNode;
}) {
  return <CountryContext.Provider value={country}>{children}</CountryContext.Provider>;
}

export function useVisitorCountry(): string | null {
  return useContext(CountryContext);
}
