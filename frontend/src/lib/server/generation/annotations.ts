// Point-and-comment edits ("annotate"), after ChatGPT's image-edit comments:
// the user clicks a spot on the render, writes what should change there, and
// can drop several such comments before sending them in one pass.
//
// Each annotation is a point in % of the image (0-100 from the top-left) plus
// a comment. The engine receives three things: the source render, a copy of
// it with the numbered markers drawn on (made in the browser — see
// AppShell's drawMarkers), and the prompt below, which ties each number to
// its comment and to a coarse region name so the edit still lands if the
// marked copy is ever missing.
//
// Annotate always runs on gpt-image (Moteur 2): it is the engine whose
// image-edit follows localized, multi-instruction requests reliably. The route
// enforces that server-side whatever engine the client sends.
//
// No `server-only` tag: the client imports the limits and the schema shape.
import { z } from 'zod';

export const MAX_ANNOTATIONS = 8;
export const MAX_COMMENT_LENGTH = 500;

/** The engine every annotate edit runs on. */
export const ANNOTATE_ENGINE = 'gpt_image' as const;

export const AnnotationSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  comment: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
});

export const AnnotationsSchema = z.array(AnnotationSchema).min(1).max(MAX_ANNOTATIONS);

export type Annotation = z.infer<typeof AnnotationSchema>;

/** A coarse name for where a point sits — thirds of the frame. */
export function regionOf(x: number, y: number): string {
  const h = x < 100 / 3 ? 'left' : x < 200 / 3 ? 'center' : 'right';
  const v = y < 100 / 3 ? 'top' : y < 200 / 3 ? 'middle' : 'bottom';
  if (h === 'center' && v === 'middle') return 'the center';
  if (v === 'middle') return `the middle-${h}`;
  if (h === 'center') return `the ${v}-center`;
  return `the ${v}-${h}`;
}

export function buildAnnotationPrompt(input: {
  annotations: readonly Annotation[];
  /** Optional note that applies to the whole set (the command-bar text). */
  instruction?: string | undefined;
  /** True when the marked copy is attached as the second image. */
  withMarkedImage: boolean;
}): string {
  const parts = [
    'Edit this architectural render with the following localized changes ONLY.',
    input.withMarkedImage
      ? 'The second attached image is the same picture with numbered markers drawn on it: each number shows exactly where the matching change applies. Do not reproduce the markers in the result.'
      : 'Each change is anchored to a point given in percent from the top-left corner of the image.',
    'Keep everything else identical to the first image: composition, camera, framing, geometry, lighting and every material not mentioned.',
    ...input.annotations.map(
      (a, i) =>
        `${i + 1}. At ${Math.round(a.x)}% from the left, ${Math.round(a.y)}% from the top (${regionOf(a.x, a.y)}): ${a.comment.trim()}`,
    ),
  ];
  if (input.instruction?.trim()) parts.push(`Overall note: ${input.instruction.trim()}`);
  return parts.join('\n');
}
