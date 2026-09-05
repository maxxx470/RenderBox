'use client';

// "Pour qui" section.
//
// This was a tab switcher: three tabs, one short panel visible at a time. It
// spent a full screen of a landing page on a single sentence, and hid two
// thirds of the value proposition behind a click most visitors never make.
// Three columns say all three at once, which is what the section was designed
// as in the first place.
//
// The tabs took a fourth "active" treatment with them — a solid ink pill,
// alongside the violet gradient of the CTAs and the raised white card of the
// rails. One less species of selected-state on the page.
import type { ReactNode } from 'react';
import { Reveal } from './Reveal';
import {
  CARD_GRADIENT,
  CARD_GRADIENT_BORDER,
  CARD_GRADIENT_EDGE,
  CARD_SHEEN,
} from './card-gradient';

export interface AudienceCardData {
  icon: ReactNode;
  /** Who this column is for — the eyebrow above the claim. */
  label: string;
  title: string;
  body: string;
}

export function AudienceCards({ cards }: { cards: AudienceCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-3">
      {cards.map((card, i) => (
        // Same shell as the preset cards further down, so the page has one
        // card species rather than one per section.
        <Reveal key={card.label} delayMs={i * 90} className="h-full">
          <div
            className={`group relative flex h-full flex-col overflow-hidden rounded-2xl p-6.5 ${CARD_GRADIENT} ${CARD_GRADIENT_BORDER} ${CARD_GRADIENT_EDGE}`}
          >
            <span aria-hidden className={CARD_SHEEN} />
            {/* Everything above the gloss layer. Without the stacking context
                the sheen paints over the text it is meant to sit behind. */}
            <div className="relative flex h-full flex-col">
              {/* White, not the violet tint it used to be: on a violet ground
                  a violet chip stops being an object and becomes a smudge. */}
              <div className="mb-4 flex h-10.5 w-10.5 items-center justify-center rounded-[10px] border border-[#E6E1FA] bg-white">
                {card.icon}
              </div>
              <span className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[11px] uppercase tracking-wide text-[#716FFF]">
                {card.label}
              </span>
              <h4 className="mb-2 text-[15px] font-semibold leading-[1.35] text-[#17161F]">
                {card.title}
              </h4>
              <p className="text-[13px] leading-[1.55] text-[#6B6880]">{card.body}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
