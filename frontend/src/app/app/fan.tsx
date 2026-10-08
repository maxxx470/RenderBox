'use client';

// The fan of four tilted cards — the motif of /app/generer, and since
// 2026-10-08 of an empty project's canvas too (owner: the four example images
// of the Image page replace the drop zone). Shared so both draw the same cards.
import type { ExampleRender } from './generer-examples';

export const CARD_TRANSFORM = [
  '',
  '-rotate-3 translate-y-1.5',
  'rotate-2 -translate-y-1 z-[2]',
  '-rotate-2 translate-y-2.5',
];

/** How many positions the fan lays out, filled or not. */
export const FAN_SLOTS = CARD_TRANSFORM.length;

// Shared geometry so a filled slot and an empty one occupy exactly the same
// space — otherwise the fan would shift as renders replace placeholders.
export const CARD_SHAPE =
  'group relative h-[300px] w-[220px] flex-shrink-0 overflow-hidden rounded-[18px] shadow-[0_20px_40px_-20px_#17161F30] transition-transform hover:z-10 hover:-translate-y-2 hover:rotate-0';

// An example render: a picture, nothing over it (owner, 2026-10-08: no
// "exemple" badge, no ambiance caption — the four images on their own). Same
// geometry as the render cards so the fan never shifts; not a link.
export function ExampleFanCard({ example, index }: { example: ExampleRender; index: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} bg-[#F7F7FA] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img src={example.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}
