// Brings an engine's image to the shape the user asked for — the exact ratio
// and at least the chosen size — whatever engine made it (2026-10-08, owner:
// a paying user gets every ratio and every size on both engines).
//
// Visio's Pro model already renders the right ratio at the right size, so for
// it this is a no-op. Pixel IA (gpt-image-1) only returns 1024×1024,
// 1536×1024 or 1024×1536: its image is cropped to the exact ratio (centred,
// the engine was asked for the nearest shape so little is lost) and enlarged
// to the size's long edge. Enlarging adds pixels, not detail — said plainly
// in the assistant's knowledge.
import 'server-only';
import sharp from 'sharp';
import { RATIOS, type RatioKey } from './ratios';
import { RESOLUTIONS, type ResolutionKey } from './resolutions';
import type { GenerateRenderOutput } from './engines/types';

/** Off by less than this, a ratio counts as already right. */
const RATIO_TOLERANCE = 0.01;
/** Within this share of the target, a size counts as already reached. */
const SIZE_TOLERANCE = 0.9;

export interface ShapeRequest {
  ratio?: RatioKey | undefined;
  resolution?: ResolutionKey | undefined;
}

/** The centred crop box that gives `target` (width / height). */
export function cropBox(width: number, height: number, target: number) {
  if (width / height > target) {
    const w = Math.round(height * target);
    return { left: Math.round((width - w) / 2), top: 0, width: w, height };
  }
  const h = Math.round(width / target);
  return { left: 0, top: Math.round((height - h) / 2), width, height: h };
}

export async function shapeOutput(
  output: GenerateRenderOutput,
  request: ShapeRequest,
): Promise<GenerateRenderOutput> {
  const target = request.ratio ? RATIOS[request.ratio].value : null;
  const longEdge = request.resolution ? RESOLUTIONS[request.resolution].longEdge : null;
  if (target === null && longEdge === null) return output;

  const meta = await sharp(output.imageBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return output;

  const crop =
    target !== null && Math.abs(width / height - target) / target > RATIO_TOLERANCE
      ? cropBox(width, height, target)
      : null;
  const w = crop?.width ?? width;
  const h = crop?.height ?? height;
  const scale =
    longEdge !== null && Math.max(w, h) < longEdge * SIZE_TOLERANCE ? longEdge / Math.max(w, h) : 1;
  if (!crop && scale === 1) return output;

  let pipeline = sharp(output.imageBuffer);
  if (crop) pipeline = pipeline.extract(crop);
  if (scale !== 1) {
    pipeline = pipeline.resize(Math.round(w * scale), Math.round(h * scale), {
      kernel: 'lanczos3',
    });
  }
  // JPEG at a high quality: a 4K PNG would weigh tens of megabytes for no
  // visible gain on a render.
  const imageBuffer = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { imageBuffer, mimeType: 'image/jpeg' };
}
