/**
 * IndexNow — telling the search engines about a page without an account
 * (2026-11-01, owner: « fais l'indexation sur bing et microsoft si possible …
 * tout ce qu'il faut pour que l'indexation soit bonne »).
 *
 * Bing Webmaster Tools needs a Microsoft sign-in, which nothing here can do.
 * IndexNow is the protocol Bing itself publishes for the same purpose: a key
 * hosted on the site proves the submission comes from its owner, and one POST
 * hands over a list of URLs. **Bing, Yandex, Seznam and Naver share the
 * protocol** — api.indexnow.org forwards to all of them — so one call covers
 * them. Google does NOT take part: it is reached by the sitemap and Search
 * Console, nothing else.
 *
 * The key is public by design (it is served as a file anyone can read), so it
 * is not a secret and lives in the repo: `public/<key>.txt`, whose contents
 * are the key itself. `INDEXNOW_KEY` can override it per environment; both
 * must name the same file for a submission to be accepted.
 *
 * Submitting again is harmless — IndexNow is a hint, not a queue, and the
 * engines de-duplicate. What it cannot do is force indexing: it only brings
 * the crawler sooner.
 */
import 'server-only';
import { canonicalFor, canonicalUrl, INDEXED_PAGES, SITE_URL } from '@/lib/seo';
import { USE_CASES, useCasePath } from '@/app/rendu/use-cases';

/**
 * Every address worth indexing — the same list the sitemap publishes, built
 * from the same sources so the two cannot drift (a test compares them).
 * Only the bare addresses: the `?lang=` variants are the hreflang group of
 * these, not pages of their own.
 */
export function indexableUrls(): string[] {
  return [
    ...INDEXED_PAGES.map((page) => canonicalUrl(page)),
    canonicalFor('/rendu'),
    ...USE_CASES.map((uc) => canonicalFor(useCasePath(uc.slug))),
  ];
}

/** Matches `public/<key>.txt`. Public on purpose — it proves ownership. */
export const INDEXNOW_DEFAULT_KEY = 'b7f3c21e9a5d486fb0e7c4a1d2358f6c';

export function indexNowKey(): string {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && /^[a-zA-Z0-9-]{8,128}$/.test(key) ? key : INDEXNOW_DEFAULT_KEY;
}

export interface IndexNowResult {
  submitted: number;
  status: number;
  ok: boolean;
  /** What the endpoint said, when it said anything — for the admin to read. */
  body: string;
}

/**
 * Hand a list of absolute URLs to IndexNow. Up to 10 000 per call, all on the
 * same host as the key — anything else is refused by the protocol, so URLs
 * that do not belong to this site are dropped rather than sent.
 */
export async function submitToIndexNow(
  urls: readonly string[],
  signal?: AbortSignal,
): Promise<IndexNowResult> {
  const host = new URL(SITE_URL).host;
  const urlList = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });

  if (urlList.length === 0) {
    return { submitted: 0, status: 0, ok: false, body: 'no url for this host' };
  }

  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: indexNowKey(), keyLocation: keyLocation(), urlList }),
    ...(signal ? { signal } : {}),
  });

  return {
    submitted: urlList.length,
    status: res.status,
    // 200 accepted, 202 accepted but the key is still being verified.
    ok: res.status === 200 || res.status === 202,
    body: (await res.text().catch(() => '')).slice(0, 500),
  };
}

export function keyLocation(): string {
  return `${SITE_URL}/${indexNowKey()}.txt`;
}
