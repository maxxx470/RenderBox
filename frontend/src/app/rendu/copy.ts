// The chrome of the use-case pages and of their hub, in both languages.
//
// Why not the dictionaries: these strings belong to one family of pages and
// are read beside the content they label, which already lives here as
// `{ fr, en }` pairs (use-cases.ts, like exemple/gallery.ts before it).
// Putting a dozen more keys in the 1200-key dictionaries would split one
// page's copy across two files for no gain. Anything reused elsewhere on the
// site still goes in the dictionaries.
import type { Locale } from '@/lib/i18n/dictionaries';

export type Bi = Record<Locale, string>;

/** The hub, /rendu — the page that holds the main term and links the others. */
export const HUB = {
  seo: {
    fr: {
      title: 'Rendu architectural par IA : tous les cas',
      description:
        'Croquis, plan 2D, capture SketchUp, axonométrie, maquette, rendu de nuit, amélioration d’image : ce que RenderPro fait, cas par cas, avec des exemples.',
    },
    en: {
      title: 'AI architectural rendering, case by case',
      description:
        'Sketches, 2D plans, SketchUp captures, axonometrics, models, night renders, image enhancement: what RenderPro does, case by case, with examples.',
    },
  },
  h1: {
    fr: 'Rendu architectural par IA, cas par cas',
    en: 'AI architectural rendering, case by case',
  },
  lede: {
    fr: 'RenderPro part toujours d’une image que vous avez déjà — un croquis, un plan, une capture 3D, une photo — et garde votre géométrie. Voici chaque cas, avec ce qu’il faut donner et ce que vous recevez.',
    en: 'RenderPro always starts from an image you already have — a sketch, a plan, a 3D capture, a photo — and keeps your geometry. Here is each case, with what to give and what you get.',
  },
  eyebrow: { fr: 'CAS D’USAGE', en: 'USE CASES' },
} as const;

/** Labels shared by the hub and every use-case page. `satisfies` rather than
 *  a `Record<string, Bi>` annotation, so each key is known and
 *  `noUncheckedIndexedAccess` does not make every lookup optional. */
export const UC = {
  eyebrow: { fr: 'CAS D’USAGE', en: 'USE CASE' },
  before: { fr: 'Avant', en: 'Before' },
  after: { fr: 'Après', en: 'After' },
  steps: { fr: 'Comment faire', en: 'How it works' },
  examples: { fr: 'Exemples', en: 'Examples' },
  faq: { fr: 'Questions fréquentes', en: 'Frequently asked questions' },
  related: { fr: 'Voir aussi', en: 'See also' },
  ambiance: { fr: 'Ambiance utilisée', en: 'Ambiance used' },
  ctaTitle: {
    fr: 'Essayez sur votre propre image',
    en: 'Try it on your own image',
  },
  ctaBody: {
    fr: 'Créez votre compte, déposez une image, lancez un rendu. Les formules et le prix de chaque rendu sont sur la page des tarifs.',
    en: 'Create your account, drop in an image, run a render. The plans and what each render costs are on the pricing page.',
  },
  ctaButton: { fr: 'Commencer', en: 'Get started' },
  ctaPricing: { fr: 'Voir les tarifs', en: 'See pricing' },
  allCases: { fr: 'Tous les cas d’usage', en: 'All use cases' },
  footerHeading: { fr: 'Cas d’usage', en: 'Use cases' },
  landingEyebrow: { fr: 'CAS D’USAGE', en: 'USE CASES' },
  landingTitle: {
    fr: 'Ce que RenderPro fait, cas par cas',
    en: 'What RenderPro does, case by case',
  },
  landingSubtitle: {
    fr: 'Chaque cas a sa page : ce qu’il faut donner, ce que vous recevez, et des exemples.',
    en: 'Each case has its own page: what to give, what you get, and examples.',
  },
  backToHub: { fr: 'Rendu architectural par IA', en: 'AI architectural rendering' },
  home: { fr: 'Accueil', en: 'Home' },
} satisfies Record<string, Bi>;
