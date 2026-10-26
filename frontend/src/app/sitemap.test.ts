// What the sitemap and robots.txt publish. Both are read by machines only, so
// nothing here checks how they look — only that they name the right addresses
// and keep the private ones out (2026-10-26, after Search Console).
import { describe, it, expect } from 'vitest';
import sitemap from './sitemap';
import robots from './robots';
import { INDEXED_PAGES, SEO_PATHS, SITE_URL } from '@/lib/seo';

const entries = sitemap();

describe('the sitemap', () => {
  it('names one entry per public page, and only those', () => {
    expect(entries).toHaveLength(INDEXED_PAGES.length);
    expect(new Set(entries.map((e) => e.url)).size).toBe(entries.length);
  });

  it('gives absolute addresses on the canonical domain', () => {
    for (const e of entries) {
      expect(e.url.startsWith(`${SITE_URL}/`), e.url).toBe(true);
      expect(e.url).not.toContain('vercel.app');
      expect(e.url).not.toContain('localhost');
    }
  });

  it('lists the bare address, not a language one: that is what a crawler asks for', () => {
    for (const e of entries) expect(e.url, e.url).not.toContain('?lang=');
  });

  it('names both languages and the bare address as x-default', () => {
    for (const e of entries) {
      const langs = e.alternates?.languages ?? {};
      expect(Object.keys(langs).sort()).toEqual(['en', 'fr', 'x-default']);
      expect(langs['fr']).toContain('?lang=fr');
      expect(langs['en']).toContain('?lang=en');
      expect(langs['x-default']).toBe(e.url);
    }
  });

  it('holds no private, signed-in or technical address', () => {
    const forbidden = ['/app', '/admin', '/parametres', '/bienvenue', '/api', '/connexion'];
    for (const e of entries) {
      const path = e.url.slice(SITE_URL.length);
      for (const bad of forbidden) expect(path.startsWith(bad), `${e.url} / ${bad}`).toBe(false);
    }
  });

  it('dates each page by a real day, never by the moment of the build', () => {
    const today = new Date().toISOString().slice(0, 10);
    const dates = entries.map((e) => String(e.lastModified));
    for (const d of dates) expect(d).toMatch(/^20\d\d-\d\d-\d\d$/);
    // Were it the build's date, every page would carry today's.
    expect(dates.every((d) => d === today)).toBe(false);
  });
});

describe('robots.txt', () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
  const disallow = [rule?.disallow ?? []].flat();

  it('opens the site and names the sitemap in full', () => {
    expect(rule?.allow).toBe('/');
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it('never blocks the whole site', () => {
    expect(disallow).not.toContain('/');
    expect(disallow).not.toContain('*');
  });

  it('blocks the signed-in app, the back-office and the API', () => {
    for (const p of ['/app', '/admin', '/parametres', '/bienvenue', '/api/']) {
      expect(disallow, p).toContain(p);
    }
  });

  it('leaves every page of the sitemap readable', () => {
    for (const page of INDEXED_PAGES) {
      const path = SEO_PATHS[page];
      for (const blocked of disallow) {
        expect(path === blocked || path.startsWith(`${blocked}/`), `${path} / ${blocked}`).toBe(
          false,
        );
      }
    }
  });

  it('blocks nothing that carries a noindex: a blocked page is never read', () => {
    // /auth/error, /paiement/retour and the old /settings were blocked AND
    // unmarked — the one combination that leaves Google free to list a bare
    // address it was never allowed to look at.
    for (const p of ['/auth/', '/settings', '/paiement/']) expect(disallow).not.toContain(p);
  });
});
