'use client';

// "Fonctionnalités clés" — three columns, one per audience.
//
// Reference layout (2026-10-05 green charter): centred cards on the grey band,
// a round icon on top, and the MIDDLE card lifted out in the brand gradient.
// One highlighted card is the reference's way of giving the row a focal point
// without a fourth "selected" treatment; it carries no state.
//
// The icon is passed in as a render function so the highlighted card can draw
// the same glyph white-on-white-ring instead of green-on-green.
import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

const GRADIENT = 'bg-[linear-gradient(135deg,#16A34A_0%,#15803D_48%,#166534_100%)]';

export interface AudienceCardData {
  icon: (color: string) => ReactNode;
  /** Who this column is for — the eyebrow above the claim. */
  label: string;
  title: string;
  body: string;
}

export function AudienceCards({ cards }: { cards: AudienceCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 min-[860px]:grid-cols-3">
      {cards.map((card, i) => {
        const lead = i === 1;
        return (
          <Reveal key={card.label} delayMs={i * 90} className="h-full">
            <div
              className={`flex h-full flex-col items-center rounded-[24px] px-7 py-9 text-center transition-transform duration-[250ms] ease-out motion-safe:hover:-translate-y-1 ${
                lead
                  ? `${GRADIENT} text-white shadow-[0_24px_48px_-24px_rgba(22,101,52,0.6)]`
                  : 'border border-[#ECECF2] bg-[#F7F7FA]'
              }`}
            >
              <div
                className={`mb-5 flex h-12 w-12 items-center justify-center rounded-full ${
                  lead ? 'bg-white' : GRADIENT
                }`}
              >
                {card.icon(lead ? '#15803D' : '#ffffff')}
              </div>
              <span
                className={`mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[11px] uppercase tracking-wide ${
                  lead ? 'text-white/85' : 'text-[#15803D]'
                }`}
              >
                {card.label}
              </span>
              <h3
                className={`mb-2.5 text-[17px] font-semibold leading-[1.35] ${
                  lead ? 'text-white' : 'text-[#17161F]'
                }`}
              >
                {card.title}
              </h3>
              <p
                className={`max-w-[34ch] text-[13.5px] leading-[1.6] ${
                  lead ? 'text-white/90' : 'text-[#5F6B64]'
                }`}
              >
                {card.body}
              </p>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
