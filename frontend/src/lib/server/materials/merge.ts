// Merge logic for auto-detected materials against what's already stored for
// a project's face. Never overwrite blindly:
//   - no existing row → take the detection
//   - existing row is source="manuel" → NEVER overwritten by auto-detection,
//     regardless of confidence (a human correction always wins)
//   - existing row is source="auto" → overwritten only if the new detection's
//     confidence is STRICTLY higher than the stored one
//
// Pure function, no I/O — the caller (detect-and-merge.ts) does the actual
// upsert with whatever this returns.
export interface ExistingMaterial {
  valeur: string;
  source: 'auto' | 'manuel';
  confidence: number | null;
}

export interface DetectedMaterial {
  face: string;
  valeur: string;
  confidence: number;
}

export interface MergedMaterial {
  valeur: string;
  source: 'auto' | 'manuel';
  confidence: number | null;
}

export function mergeMaterialDetection(
  existing: ExistingMaterial | null,
  detected: DetectedMaterial,
): MergedMaterial {
  if (!existing) {
    return { valeur: detected.valeur, source: 'auto', confidence: detected.confidence };
  }
  if (existing.source === 'manuel') {
    return existing;
  }
  // existing.source === 'auto'
  const existingConfidence = existing.confidence ?? -1;
  if (detected.confidence > existingConfidence) {
    return { valeur: detected.valeur, source: 'auto', confidence: detected.confidence };
  }
  return existing;
}
