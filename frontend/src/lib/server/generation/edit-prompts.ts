// The prompts of the edits — Ajouter, the zone retouch and Commenter — built
// on the server from structured fields (2026-10-19, the owner's prompt
// audit). Each is a PromptSpec (render-profiles.ts): the geometry lock first,
// then the one change asked for, then what stays, laid out for the engine.
//
// An edit keeps the image's own light. Until then an Ajouter on a render made
// with a light re-sent that light's short text and lost "keep everything
// else" on the way; without one, it kept it. One path now, the same
// protections whatever the source, and the light of a version never drifts
// from the one before (audit R6, R7).
//
// Commenter always runs on Pixel IA (annotations.ts, ANNOTATE_ENGINE).
import 'server-only';
import type { EngineName } from './engines/types';
import { regionOf, type Annotation } from './annotations';
import { describeZone, type EditZone } from './describe-zone';
import {
  BASE_CHECK,
  GEOMETRY_LOCK,
  checkFor,
  formatPrompt,
  projectMaterialLines,
  toPromptLine,
  type PromptSection,
} from './render-profiles';

const KEEP_LIGHT: PromptSection = {
  title: 'LIGHT',
  visio:
    "Light: keep the image's existing light, time of day and color balance unchanged; light the change with that same light, with matching shadows and reflections.",
  pixel: [
    '- Keep the existing light, time of day and color balance unchanged.',
    '- Light the change with that same light, with matching shadows and reflections.',
  ],
};

const KEEP_MATERIALS =
  'Keep every other material, color and finish exactly as in the source image.';

function materialsSection(materials: readonly { face: string; valeur: string }[]): PromptSection {
  const lines = [KEEP_MATERIALS, ...projectMaterialLines(materials)];
  return { title: 'MATERIALS', visio: lines.join('\n'), pixel: lines };
}

/** Ajouter: one element, its appearance read from the second image. */
export function buildAddElementPrompt(input: {
  engine: EngineName;
  instruction: string;
  materials: readonly { face: string; valeur: string }[];
}): string {
  const element = toPromptLine(input.instruction);
  return formatPrompt(input.engine, {
    kind: 'edit',
    lock: GEOMETRY_LOCK,
    request: [
      `Only add: ${element}. The second image is a reference for that element's appearance only: never copy its background, framing, light or any other object.`,
      'Place it at a believable scale and position, in the existing perspective. Everything else must remain faithful to the source image.',
    ],
    sections: [KEEP_LIGHT, materialsSection(input.materials)],
    avoid:
      "copying the reference image's background or light, changing the framing, relighting the scene, adding anything else",
    check:
      'geometry unchanged, openings unchanged, materials unchanged, nothing new except the requested element',
  });
}

/** The zone retouch (no longer offered in the interface; the route keeps it). */
export function buildZonePrompt(input: {
  engine: EngineName;
  zone: EditZone;
  instruction: string;
  materials: readonly { face: string; valeur: string }[];
}): string {
  const change = toPromptLine(input.instruction);
  return formatPrompt(input.engine, {
    kind: 'edit',
    lock: GEOMETRY_LOCK,
    request: [
      describeZone(input.zone),
      `Requested change there: "${change}". Words such as improve, modernise or make it nicer are not permission to change the design.`,
    ],
    sections: [KEEP_LIGHT, materialsSection(input.materials)],
    check: checkFor(BASE_CHECK, true),
  });
}

/**
 * Commenter: numbered points, each tied to its comment and to a coarse region
 * name so the edit still lands when the marked copy is missing.
 */
export function buildAnnotationPrompt(input: {
  engine: EngineName;
  annotations: readonly Annotation[];
  /** Optional note that applies to the whole set (the command-bar text). */
  instruction?: string | undefined;
  /** True when the marked copy is attached as the second image. */
  withMarkedImage: boolean;
}): string {
  const changes = input.annotations.map(
    (a, i) =>
      `- Marker ${i + 1}, at ${Math.round(a.x)}% from the left, ${Math.round(a.y)}% from the top (${regionOf(a.x, a.y)}): ${toPromptLine(a.comment)}`,
  );
  const note = input.instruction ? toPromptLine(input.instruction) : '';
  if (note) changes.push(`- Overall note: ${note}`);
  const keep =
    'Keep everything else identical to the first image: composition, camera, framing, geometry, lighting and every material not mentioned.';
  return formatPrompt(input.engine, {
    kind: 'edit',
    lock: GEOMETRY_LOCK,
    request: [
      'Apply only the numbered changes below, each one at its own place.',
      input.withMarkedImage
        ? 'The second attached image is the same picture with numbered markers drawn on it: each number shows exactly where the matching change applies. Do not reproduce the markers in the result.'
        : 'Each change is anchored to a point given in percent from the top-left corner of the image.',
    ],
    sections: [
      { title: 'CHANGES', visio: changes.join('\n'), pixel: changes },
      { title: 'KEEP', visio: keep, pixel: [keep] },
    ],
    check:
      'geometry unchanged, openings unchanged, materials unchanged, no new objects, except where a numbered change says otherwise; no marker drawn in the result',
  });
}
