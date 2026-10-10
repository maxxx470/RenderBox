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

// A template of the image generator page (owner, 2026-10-10): its picture,
// greyed on hover with "Utiliser ce modèle" over it. The whole card is the
// button — it puts the template's prompt in the bar and asks for the photo.
// On a touch screen there is no hover: the label stays visible.
export function TemplateFanCard({
  src,
  label,
  action,
  index,
  onUse,
}: {
  src: string;
  /** The template's name — the card's accessible name, with the action. */
  label: string;
  /** "Utiliser ce modèle". */
  action: string;
  index: number;
  onUse: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onUse}
      aria-label={`${action} : ${label}`}
      title={label}
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} bg-[#F7F7FA] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2948FC] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover transition-[filter] duration-200 ease-out group-hover:brightness-75 group-hover:grayscale group-focus-visible:brightness-75 group-focus-visible:grayscale"
      />
      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:items-end [@media(hover:none)]:pb-3 [@media(hover:none)]:opacity-100">
        <span className="rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#17161F] shadow-[0_10px_24px_-10px_rgba(23,22,31,0.55)]">
          {action}
        </span>
      </span>
    </button>
  );
}
