// Phase 5 targeted-retouch: translates a % rectangle into a natural-language
// region instruction. Deliberately NOT pixel-mask inpainting — a language
// instruction is consistent with how Nanobanana/gpt-image-1 already handle
// image-edit prompts, and a real binary-mask system would be over-engineering
// for this V1 (see the phase spec).
import { z } from 'zod';

export const ZoneSchema = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(0).max(100),
    height: z.number().min(0).max(100),
  })
  .refine((z) => z.x + z.width <= 100, { message: 'x + width must be <= 100' })
  .refine((z) => z.y + z.height <= 100, { message: 'y + height must be <= 100' });

export type EditZone = z.infer<typeof ZoneSchema>;

function regionLabel(h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom'): string {
  if (h === 'center' && v === 'middle') return 'the center';
  if (v === 'middle') return `the middle-${h}`;
  if (h === 'center') return `the ${v}-center`;
  return `the ${v}-${h}`;
}

export function describeZone(zone: EditZone): string {
  const centerX = zone.x + zone.width / 2;
  const centerY = zone.y + zone.height / 2;

  const h = centerX < 100 / 3 ? 'left' : centerX < 200 / 3 ? 'center' : 'right';
  const v = centerY < 100 / 3 ? 'top' : centerY < 200 / 3 ? 'middle' : 'bottom';

  return `Modify ONLY ${regionLabel(h, v)} of the image, and preserve everything else pixel-identical to the source.`;
}
