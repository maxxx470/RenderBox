import { describe, it, expect } from 'vitest';
import { INDEXED_PAGES, OG_IMAGE, pageMetadata, SEO_COPY, SEO_PATHS } from './seo';

describe('pageMetadata', () => {
  it('names the page in the language it shows as canonical, and both languages as alternates', () => {
    const m = pageMetadata('info', 'fr');
    expect(m.alternates?.canonical).toBe('/info?lang=fr');
    expect(m.alternates?.languages).toEqual({
      fr: '/info?lang=fr',
      en: '/info?lang=en',
      'x-default': '/info',
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
