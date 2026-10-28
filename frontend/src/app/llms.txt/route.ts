// /llms.txt (2026-10-18, owner: « le GEO »): what RenderPro is, for AI
// assistants that answer questions about it (ChatGPT, Perplexity, Claude,
// Gemini…), in the llmstxt.org format. Prices and credits come from
// pricing-tiers.ts, so this text never drifts from the site.
export const runtime = 'nodejs';
export const dynamic = 'force-static';

import { PRICING_TIERS } from '@/lib/pricing-tiers';
import { usdPrice } from '@/lib/local-currency';
import { describePrices } from '@/lib/provider-cost';
import { TIKTOK_ACCOUNT, YOUTUBE_CHANNEL } from '@/lib/community-links';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { localizedPath, SITE_URL } from '@/lib/seo';

const NAMES = {
  decouverte: 'landing.pricingTierDecouverteName',
  standard: 'landing.pricingTierStandardName',
  pro: 'landing.pricingTierProName',
} as const;

function body(): string {
  const en = dictionaries.en;
  const fcfa = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');
  const plans = PRICING_TIERS.map(
    (t) =>
      `- ${en[NAMES[t.id]]}: ${fcfa(t.priceXof)} FCFA (about ${usdPrice(t.priceXof, 'en-US') ?? '—'}) for ${fcfa(
        t.creditsPerMonth,
      )} credits, valid 30 days`,
  ).join('\n');
  const faq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map(
      (n) =>
        `### ${en[`landing.faq${n}Q` as 'landing.faq1Q']}\n${en[`landing.faq${n}A` as 'landing.faq1A']}`,
    )
    .join('\n\n');
  const page = (p: 'home' | 'info' | 'exemple' | 'legal', lang: 'en' | 'fr') =>
    `${SITE_URL}${localizedPath(p, lang)}`;

  return `# RenderPro

> RenderPro is a web app that turns architectural plans, sketches and 3D screenshots into photorealistic architectural renders in minutes, with AI. It is made for architects, engineers and design offices, building draughtspeople, developers and builders, in French and English, with plans priced in FCFA (West African CFA franc). Également en français : RenderPro transforme vos plans, esquisses et captures 3D en rendus architecturaux photoréalistes par IA.

## What it does

- Generate: upload an image (photo, scanned sketch, screenshot or image export from SketchUp, Revit, AutoCAD, Archicad or Rhino) and get a photorealistic render that keeps the framing, volumes and openings. Optional styles: furnished 3D plan, exploded axonometric, analysis board, isometric model, sketch; templates for day and night, exterior and interior.
- Two AI engines: Visio (most detail, renders straight at the chosen size up to 4K) and Pixel AI (follows precise instructions closely).
- Comment: click points on a render and write the change for each (up to 8 comments); the rest of the image is kept.
- Add: insert an element (furniture, people, trees…) from a reference picture.
- Enhance: improve a render made with any other software (sharpness, detail, light, materials, sky, planting, life and atmosphere), each with an optional reference image.
- Every ratio (1:1 to 21:9) and size (1K, 2K, 4K); every render is kept in a project tree; the user owns the renders, with no commercial-use limit.

## Pricing

${plans}
- One credit is one credit of the AI provider: each image costs exactly what the engine charges at the size asked for — ${describePrices('en')}. The materials sheet is free. Unused credits expire after 30 days. No subscription renews by itself.

## Pages

- [Home](${page('home', 'en')}): features, examples, pricing and FAQ ([en français](${page('home', 'fr')}))
- [Render examples](${page('exemple', 'en')}): renders across several projects ([en français](${page('exemple', 'fr')}))
- [What's new](${page('info', 'en')}): changelog and feature videos ([en français](${page('info', 'fr')}))
- [Legal notice and privacy](${page('legal', 'en')})

## FAQ

${faq}

## Links

- YouTube: ${YOUTUBE_CHANNEL}
- TikTok: ${TIKTOK_ACCOUNT}
`;
}

export function GET(): Response {
  return new Response(body(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
