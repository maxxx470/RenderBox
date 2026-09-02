'use client';

// "Pour qui" section — tab switcher with directional slide (§3 of the
// animation spec): clicking a tab slides the current panel out toward the
// side it came from and slides the new one in from the side it was clicked
// from, instead of an instant swap. No auto-play here — the "deux moteurs"
// state tiles further down the page already carry the section's auto-play
// beat, so this one stays manual-only per the spec.
import { useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

type Phase = 'idle' | 'exit' | 'enter-start' | 'enter-end';

export interface AudienceTabData {
  icon: ReactNode;
  color: string;
  label: string;
  title: string;
  body: string;
}

export function AudienceTabs({ tabs }: { tabs: AudienceTabData[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [renderIndex, setRenderIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [dir, setDir] = useState<1 | -1>(1);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  function selectTab(i: number) {
    if (i === active || phase !== 'idle') return;
    const nextDir: 1 | -1 = i > active ? 1 : -1;
    setActive(i);

    if (reducedMotion) {
      setRenderIndex(i);
      return;
    }

    setDir(nextDir);
    setPhase('exit');
    timeouts.current.push(
      setTimeout(() => {
        setRenderIndex(i);
        setPhase('enter-start');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPhase('enter-end'));
        });
        timeouts.current.push(setTimeout(() => setPhase('idle'), 300));
      }, 250),
    );
  }

  const panel = tabs[renderIndex];
  if (!panel) return null;

  const translateX = phase === 'exit' ? dir * -24 : phase === 'enter-start' ? dir * 24 : 0; // 'idle' and 'enter-end' both settle at 0
  const opacity = phase === 'idle' || phase === 'enter-end' ? 1 : 0;
  const transition =
    phase === 'exit'
      ? 'transform 250ms ease-out, opacity 250ms ease-out'
      : phase === 'enter-end'
        ? 'transform 300ms ease-out, opacity 300ms ease-out'
        : 'none';

  return (
    <div>
      <div className="mb-6 flex flex-wrap justify-center gap-2.5" role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => selectTab(i)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
              active === i
                ? 'border-transparent bg-[#17161F] text-white'
                : 'border-[#ECECF2] text-[#3D3B49] hover:border-[#DEDEE8]'
            }`}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full"
              style={{ backgroundColor: active === i ? 'transparent' : `${tab.color}1A` }}
            >
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden">
        <div
          style={{ transform: `translateX(${translateX}px)`, opacity, transition }}
          className="flex items-start gap-4 rounded-2xl border border-[#ECECF2] bg-white p-6 shadow-[0_1px_2px_rgba(23,22,31,0.04)]"
        >
          <div
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${panel.color}1A` }}
          >
            {panel.icon}
          </div>
          <div>
            <h4 className="mb-1.5 text-[16px] font-semibold text-[#17161F]">{panel.title}</h4>
            <p className="text-[13.5px] leading-[1.6] text-[#6B6880]">{panel.body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
