// Orchestrates Claude Vision detection + merge-without-overwrite for a
// project, right after a render is generated. Deliberately a plain function
// call from the generate route (not an HTTP endpoint) — it's a
// server-to-server step within the same request, so there's no reason to
// add a network hop or an internal-auth scheme just to guard a route that
// would otherwise need one. Never throws on a detection/parse failure
// (that's already `detectMaterials`'s contract); DB errors do propagate,
// but the caller wraps this whole call in try/catch so a materials-memory
// hiccup never fails the generation the user actually asked for.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { detectMaterials, VisionNotConfiguredError } from '@/lib/server/ai/vision-materials';
import { mergeMaterialDetection, type ExistingMaterial } from './merge';
import { log } from '@/lib/server/observability/log';

export async function detectAndMergeMaterials(
  projectId: string,
  imageBuffer: Buffer,
  mimeType: string,
): Promise<void> {
  let detected;
  try {
    detected = await detectMaterials(imageBuffer, mimeType);
  } catch (e) {
    if (e instanceof VisionNotConfiguredError) {
      log.warn('detectAndMergeMaterials: skipped — Claude Vision not configured');
      return;
    }
    throw e;
  }

  if (detected.length === 0) return;

  const existingRows = await prisma.material.findMany({
    where: { projectId },
    select: { face: true, valeur: true, source: true, confidence: true },
  });
  const existingByFace = new Map<string, ExistingMaterial>(
    existingRows.map((r) => [
      r.face,
      { valeur: r.valeur, source: r.source as 'auto' | 'manuel', confidence: r.confidence },
    ]),
  );

  for (const item of detected) {
    const existing = existingByFace.get(item.face) ?? null;
    const merged = mergeMaterialDetection(existing, item);
    await prisma.material.upsert({
      where: { projectId_face: { projectId, face: item.face } },
      create: {
        projectId,
        face: item.face,
        valeur: merged.valeur,
        source: merged.source,
        confidence: merged.confidence,
      },
      update: { valeur: merged.valeur, source: merged.source, confidence: merged.confidence },
    });
  }
}
