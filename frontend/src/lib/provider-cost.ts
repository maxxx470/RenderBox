// What one image really costs RenderPro (2026-10-18, owner: « pour juste
// l'administrateur, le prix exact que ça prend pour la génération … pour
// chaque modèle »): the Kie credits each engine's default version charges per
// image, as Kie billed them in the paid tests of 2026-10-17 (its recordInfo
// `creditsConsumed`), in dollars and in FCFA. An admin's image costs exactly
// that many RenderPro credits (owner, same day: « au lieu que le rendu lui
// coûte 50 crédits … le prix exact que le modèle prend »); customers keep
// RENDER_COST. Not `server-only`: the command bar shows the price. The
// accounts read the real cost of each image instead (providerCredits).
import { renderCost } from '@/lib/pricing-tiers';
import { XOF_PER_EUR } from '@/lib/local-currency';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { DEFAULT_RESOLUTION, type ResolutionKey } from '@/lib/server/generation/resolutions';

/** Kie's public price: 200 credits for 1 $ (its pricing page, 2026-10-17). */
export const KIE_USD_PER_CREDIT = 0.005;
/** Euro → dollar on 2026-10-17 (open.er-api.com), refreshed by hand. The
 *  FCFA is pegged to the euro, so this one rate gives the dollar in FCFA. */
export const USD_PER_EUR = 1.124208;
export const XOF_PER_USD = XOF_PER_EUR / USD_PER_EUR;

/** Kie credits per image: Visio Pro (Nano Banana Pro) and Pixel IA 2.5. */
export const KIE_CREDITS_PER_IMAGE: Record<EngineName, Record<ResolutionKey, number>> = {
  nanobanana: { '1k': 18, '2k': 18, '4k': 24 },
  gpt_image: { '1k': 6, '2k': 10, '4k': 16 },
};

export interface RealCost {
  kieCredits: number;
  usd: number;
  xof: number;
}

/** Accounts that pay Kie's price: the site's administrators. */
export function paysAtCost(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

/** The RenderPro credits `count` images cost this account. */
export function renderPrice(
  role: string | null | undefined,
  engine: EngineName,
  resolution: ResolutionKey | null | undefined,
  count = 1,
): number {
  return paysAtCost(role)
    ? realImageCost(engine, resolution ?? DEFAULT_RESOLUTION, count).kieCredits
    : renderCost(resolution, count);
}

/** What `count` images of this engine at this size cost on Kie. */
export function realImageCost(engine: EngineName, resolution: ResolutionKey, count = 1): RealCost {
  const kieCredits = KIE_CREDITS_PER_IMAGE[engine][resolution] * count;
  const usd = kieCredits * KIE_USD_PER_CREDIT;
  return { kieCredits, usd, xof: Math.round(usd * XOF_PER_USD) };
}
