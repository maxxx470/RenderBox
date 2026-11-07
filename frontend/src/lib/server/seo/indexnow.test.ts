// IndexNow (2026-11-01). Bing Webmaster Tools needs a Microsoft sign-in;
// this protocol needs only a key file on the site, so it is the one way to
// submit addresses to Bing, Yandex, Seznam and Naver from here.
//
// Two things must hold or the submission is refused without explanation:
// the key file is served at the exact path the payload names, and the list
// of addresses matches the sitemap — nothing submitted that is not published.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sitemap from '@/app/sitemap';
import { SITE_URL } from '@/lib/seo';
import { indexableUrls, indexNowKey, keyLocation } from './indexnow';

const PUBLIC = resolve(__dirname, '../../../../public');

describe('the key', () => {
  it('has the shape the protocol requires', () => {
    expect(indexNowKey()).toMatch(/^[a-zA-Z0-9-]{8,128}$/);
  });

  it('is served at the exact path the payload names', () => {
    const file = join(PUBLIC, `${indexNowKey()}.txt`);
    expect(existsSync(file), `expected public/${indexNowKey()}.txt`).toBe(true);
    // The file holds the key and nothing else.
    expect(readFileSync(file, 'utf8').trim()).toBe(indexNowKey());
  });

  it('is named by an absolute URL on this site', () => {
    expect(keyLocation()).toBe(`${SITE_URL}/${indexNowKey()}.txt`);
  });
});

describe('what gets submitted', () => {
  it('is exactly what the sitemap publishes', () => {
    const fromSitemap = sitemap()
      .map((e) => e.url)
      .sort();
    expect([...indexableUrls()].sort()).toEqual(fromSitemap);
  });

  it('is eighteen absolute addresses on this host, with no duplicate', () => {
    const urls = indexableUrls();
    expect(urls.length).toBe(18);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u.startsWith(`${SITE_URL}/`) || u === SITE_URL).toBe(true);
  });

  it('submits the bare addresses, never the ?lang= variants', () => {
    // Those are the hreflang group of these pages, not pages of their own:
    // submitting both would ask the crawler to index the same page twice.
    for (const u of indexableUrls()) expect(u).not.toContain('lang=');
  });
});
