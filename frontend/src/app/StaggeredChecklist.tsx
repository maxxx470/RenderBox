'use client';

// Feature checklist (§4 of the animation spec) — one shared viewport trigger
// for the whole list (cheaper than N separate observers), each item staggered
// via `transition-delay` alone: 80ms between items, fade + translateX(-12px→0)
// on the row, a small ease-out-back scale-in on the checkmark itself.
import { TickSquare } from 'react-iconly';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

const EASE_OUT_BACK = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export function StaggeredChecklist({ items }: { items: string[] }) {
  const [ref, inView] = useInView<HTMLUListElement>({ threshold: 0.2 });
  const reducedMotion = usePrefersReducedMotion();
  const visible = inView || reducedMotion;

  return (
    <ul ref={ref} className="mt-6 flex flex-col gap-3">
      {items.map((item, i) => {
        const delayMs = reducedMotion ? 0 : i * 80;
        return (
          <li
            key={item}
            className="flex items-start gap-2.5 text-[13.5px] text-[#3D3B49] transition-[opacity,transform] duration-300 ease-out"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateX(0)' : 'translateX(-12px)',
              transitionDelay: `${delayMs}ms`,
            }}
          >
            <span
              className="mt-0.5 flex-shrink-0 text-[#716FFF] transition-[opacity,transform] duration-200"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'scale(1)' : 'scale(0)',
                transitionTimingFunction: EASE_OUT_BACK,
                transitionDelay: `${delayMs}ms`,
              }}
            >
              <TickSquare set="bold" size={15} primaryColor="#716FFF" />
            </span>
            {item}
          </li>
        );
      })}
    </ul>
  );
}
