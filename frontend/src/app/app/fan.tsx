'use client';

// The fan of four tilted cards — the motif of /app/generer, and since
// 2026-10-08 of an empty project's canvas too (owner: the four example images
// of the Image page replace the drop zone). Shared so both draw the same cards.
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { PRESETS } from '@/lib/server/generation/presets';
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

// An example render, shown only to an account with nothing of its own yet.
//
// Same geometry as the render cards so the fan never shifts, but two things
// are deliberately different: the tag reads "exemple" rather than the preset,
// and the card is not a link. The in-app gallery it used to open was removed
// on 2026-10-06 (Enhance took its place), so it is a picture, not a
// destination.
export function ExampleFanCard({ example, index }: { example: ExampleRender; index: number }) {
  const { locale } = useLocale();
  const t = useTranslations();

  return (
    <div
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} bg-[#F7F7FA] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img src={example.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* Scrim only when something has to be read over the image, and deeper
          than the render cards': these images are not known in advance, and a
          pale one would drop a white caption below the contrast floor — the
          defect the hero fan hit. With no caption it would just dim the
          example on the screen meant to show what the product produces. */}
      {example.preset && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      )}
      {/* The badge stays — these slots otherwise hold the user's OWN renders,
          and an unlabelled RenderBox showcase image there would read as their
          work. Frosted white at a readable size reads as the caption it is,
          and it carries its own ground over a pale image or a dark one. */}
      <span className="absolute left-3 top-3 rounded-lg bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[#17161F] backdrop-blur-sm">
        {t('app.genHomeExampleTag')}
      </span>
      {/* Only when the set spans several ambiances — see generer-examples.ts.
          Four cards captioned with the same word would say nothing. */}
      {example.preset && (
        <span className="absolute inset-x-3.5 bottom-3.5 font-[family-name:var(--font-display)] text-sm font-semibold text-white">
          {PRESETS[example.preset].label[locale]}
        </span>
      )}
    </div>
  );
}
