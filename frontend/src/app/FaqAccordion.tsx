'use client';

import { useState } from 'react';
import { ChevronDown } from 'react-iconly';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

export function FaqAccordion({
  items,
  className = 'mx-auto max-w-[720px]',
}: {
  items: { q: string; a: string }[];
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div
            key={item.q}
            className="rounded-2xl bg-white shadow-[0_8px_24px_-18px_rgba(23,22,31,0.25)] transition-colors"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-5.5 py-4.5 text-left"
            >
              <span className="text-[14.5px] font-medium text-[#17161F]">{item.q}</span>
              <span
                className={`flex-shrink-0 ${reducedMotion ? '' : 'transition-transform duration-200 ease-out'}`}
                style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <ChevronDown set="curved" size={16} primaryColor="#6B6878" />
              </span>
            </button>
            <div
              className={`grid ${reducedMotion ? '' : 'transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]'}`}
              style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-[13.5px] leading-[1.6] text-[#6B6878]">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
