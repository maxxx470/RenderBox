import 'server-only';
import type { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { COOKIE_PREFIX } from '@/lib/constants';
import type { Locale } from './dictionaries';
import { resolveLocale } from './geo-locale';

/**
 * The language this request is served in: the visitor's own FR / EN choice
 * (the locale cookie, which `?lang=` also sets — see proxy.ts), otherwise the
 * language of the country their IP is in.
 */
export async function requestLocale(): Promise<{ locale: Locale; country: string | null }> {
  const [store, head] = await Promise.all([cookies(), headers()]);
  const country = head.get('x-vercel-ip-country');
  const locale = resolveLocale({
    cookie: store.get(`${COOKIE_PREFIX}-locale`)?.value,
    country,
    region: head.get('x-vercel-ip-country-region'),
  });
  return { locale, country };
}

/**
 * The same answer, read off a request instead of Next's request context — for
 * Route Handlers, which hold the `NextRequest` and can therefore be tested
 * without Next's async storage. The route that renders an image needs it: the
 * ambiance's prompt is written in the visitor's language.
 */
export function localeFromRequest(req: NextRequest): Locale {
  return resolveLocale({
    cookie: req.cookies.get(`${COOKIE_PREFIX}-locale`)?.value,
    country: req.headers.get('x-vercel-ip-country'),
    region: req.headers.get('x-vercel-ip-country-region'),
  });
}
