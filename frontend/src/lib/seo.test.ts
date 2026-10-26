import { describe, it, expect } from 'vitest';
import {
  canonicalUrl,
  INDEXED_PAGES,
  LAST_MODIFIED,
  localizedPath,
  OG_IMAGE,
  pageMetadata,
  SEO_COPY,
  SEO_PATHS,
  SITE_URL,
} from './seo';

describe('pageMetadata', () => {
  it('names the page in the language it shows, and both languages as alternates', () => {
    const m = pageMetadata('info', 'fr');
    expect(m.alternates?.languages).toEqual({
      fr: '/info?lang=fr',
      en: '/info?lang=en',
      'x-default': `${SITE_URL}/info`,
    });
    expect(m.title).toBe(SEO_COPY.info.fr.title);
    expect(m.openGraph).toMatchObject({ locale: 'fr_FR', images: [OG_IMAGE] });
  });

  it('gives the home page its full title, outside the « · RenderPro » template', () => {
    expect(pageMetadata('home', 'en').title).toEqual({ absolute: SEO_COPY.home.en.title });
  });

  it('keeps the sign-in page out of search results, and only it', () => {
    expect(pageMetadata('connexion', 'fr').robots).toEqual({ index: false, follow: true });
    for (const page of INDEXED_PAGES) expect(pageMetadata(page, 'fr').robots).toBeUndefined();
  });

  it('has a title and a description in both languages for every page', () => {
    for (const page of Object.keys(SEO_PATHS) as (keyof typeof SEO_PATHS)[]) {
      for (const locale of ['fr', 'en'] as const) {
        expect(SEO_COPY[page][locale].title.length).toBeGreaterThan(3);
        // Search engines cut descriptions around 160 characters.
        expect(SEO_COPY[page][locale].description.length).toBeLessThanOrEqual(230);
      }
    }
  });
});

// Every address is canonical to itself (2026-10-26). Until then the bare
// address — the one every link points at and the one a crawler fetches —
// named a `?lang=` address as its canonical, and Search Console answered
// « Page en double : Google n'a pas choisi la même URL canonique ».
describe('the canonical address', () => {
  it('is the bare address when the bare address was asked for', () => {
    expect(pageMetadata('home', 'fr').alternates?.canonical).toBe(`${SITE_URL}/`);
    expect(pageMetadata('info', 'en').alternates?.canonical).toBe(`${SITE_URL}/info`);
  });

  it('is the language address when that language was asked for', () => {
    expect(pageMetadata('home', 'fr', 'fr').alternates?.canonical).toBe('/?lang=fr');
    expect(pageMetadata('info', 'en', 'en').alternates?.canonical).toBe('/info?lang=en');
  });

  it('never points at another address: each one names itself', () => {
    for (const page of INDEXED_PAGES) {
      expect(pageMetadata(page, 'fr').alternates?.canonical).toBe(canonicalUrl(page));
      for (const locale of ['fr', 'en'] as const) {
        expect(pageMetadata(page, locale, locale).alternates?.canonical).toBe(
          localizedPath(page, locale),
        );
      }
    }
  });

  it('gives the home page a trailing slash, the address it is linked by', () => {
    expect(canonicalUrl('home')).toBe('https://www.renderpro.app/');
    expect(canonicalUrl('exemple')).toBe('https://www.renderpro.app/exemple');
  });

  it('the language the page shows drives the words, the asked one the address', () => {
    // A French visitor who asked for nothing reads French at the bare address.
    const m = pageMetadata('home', 'fr');
    expect(m.openGraph).toMatchObject({ locale: 'fr_FR' });
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/`);
  });
});

describe('the dates the sitemap publishes', () => {
  it('are real days, not the day of the build', () => {
    for (const [page, date] of Object.entries(LAST_MODIFIED)) {
      expect(date, page).toMatch(/^20\d\d-\d\d-\d\d$/);
      expect(new Date(date).getTime(), page).toBeLessThanOrEqual(Date.now());
    }
  });

  it('cover every indexed page but /info, whose announcements date it', () => {
    const dated = new Set(Object.keys(LAST_MODIFIED));
    for (const page of INDEXED_PAGES) {
      expect(dated.has(page) || page === 'info', page).toBe(true);
    }
  });
});
