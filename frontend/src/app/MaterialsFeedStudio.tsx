'use client';

// "Feed Studio"-style auto-play demo for the materials-detection panel (§5
// of the animation spec): a fake query types itself in, a sheen sweeps the
// list, the 4 material rows flip in one by one, a counter ticks up to "N
// matériaux détectés", then a confirmation badge lands. Loops through 4
// canned queries with a 2s pause between cycles. Clicking a query chip
// jumps straight to that query's demo and — like the before/after
// auto-play elsewhere on this page — permanently stops the loop once the
// visitor has taken control.
import { useEffect, useRef, useState } from 'react';
import { TickSquare } from 'react-iconly';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

const MONO = 'font-[family-name:var(--font-jetbrains-mono)]';
const TYPE_MS_PER_LETTER = 20;
const ROW_STAGGER_MS = 110;
const ROW_FLIP_MS = 300;
const COUNT_MS = 1100;
const PAUSE_BETWEEN_CYCLES_MS = 2000;

export interface FeedStudioMaterial {
  face: string;
  value: string;
}

type Phase = 'typing' | 'sheen' | 'revealing' | 'counting' | 'badge' | 'pause';

export function MaterialsFeedStudio({
  queries,
  materials,
  autoTag,
  countLabel,
  badgeLabel,
}: {
  queries: string[];
  materials: FeedStudioMaterial[];
  autoTag: string;
  countLabel: (count: number) => string;
  badgeLabel: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const reducedMotion = usePrefersReducedMotion();

  const [queryIndex, setQueryIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('typing');
  const [revealedCount, setRevealedCount] = useState(0);
  const [count, setCount] = useState(0);
  const [sheenKey, setSheenKey] = useState(0);

  const autoplayRef = useRef(true);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef(0);
  const startedRef = useRef(false);

  function clearTimers() {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    cancelAnimationFrame(rafRef.current);
  }

  function runCycle(qIndex: number) {
    clearTimers();
    const query = queries[qIndex] ?? '';
    setQueryIndex(qIndex);
    setRevealedCount(0);
    setCount(0);
    setPhase('typing');

    if (reducedMotion) {
      setTyped(query);
      setRevealedCount(materials.length);
      setCount(materials.length);
      setPhase('badge');
      return;
    }

    // 1. type the query
    let pos = 0;
    function typeStep() {
      pos += 1;
      setTyped(query.slice(0, pos));
      if (pos < query.length) {
        timeouts.current.push(setTimeout(typeStep, TYPE_MS_PER_LETTER));
      } else {
        timeouts.current.push(setTimeout(startSheen, 250));
      }
    }
    typeStep();

    // 2. sheen sweep
    function startSheen() {
      setPhase('sheen');
      setSheenKey((k) => k + 1);
      timeouts.current.push(setTimeout(startReveal, 1100));
    }

    // 3. rows flip in, staggered
    function startReveal() {
      setPhase('revealing');
      let i = 0;
      function revealStep() {
        i += 1;
        setRevealedCount(i);
        if (i < materials.length) {
          timeouts.current.push(setTimeout(revealStep, ROW_STAGGER_MS));
        } else {
          timeouts.current.push(setTimeout(startCount, ROW_FLIP_MS));
        }
      }
      revealStep();
    }

    // 4. count up
    function startCount() {
      setPhase('counting');
      const start = performance.now();
      function tick(now: number) {
        const t = Math.min(1, (now - start) / COUNT_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        setCount(Math.round(eased * materials.length));
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          timeouts.current.push(setTimeout(showBadge, 150));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    // 5. badge, then 6. pause + loop
    function showBadge() {
      setPhase('badge');
      if (!autoplayRef.current) return;
      timeouts.current.push(
        setTimeout(() => {
          setPhase('pause');
          timeouts.current.push(
            setTimeout(() => {
              if (autoplayRef.current) runCycle((qIndex + 1) % queries.length);
            }, PAUSE_BETWEEN_CYCLES_MS),
          );
        }, 400),
      );
    }
  }

  useEffect(() => {
    if (!inView || startedRef.current) return;
    startedRef.current = true;
    runCycle(0);
    return clearTimers;
  }, [inView]);

  function handleChipClick(i: number) {
    autoplayRef.current = false;
    runCycle(i);
  }

  return (
    <div ref={ref} className="rounded-2xl border border-[#ECECF2] bg-[#FBFBFD] p-5.5">
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {queries.map((q, i) => (
          <button
            key={q}
            type="button"
            onClick={() => handleChipClick(i)}
            className={`rounded-full border px-2.5 py-1 text-left text-[10.5px] transition-colors ${MONO} ${
              queryIndex === i && phase !== 'pause'
                ? 'border-[#716FFF] bg-[#EFECFF] text-[#716FFF]'
                : 'border-[#ECECF2] text-[#8A8896] hover:border-[#DEDEE8]'
            }`}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[#ECECF2] bg-white px-3 py-2.5">
        <span className={`text-[12.5px] text-[#17161F] ${MONO}`}>
          {typed}
          {phase === 'typing' && !reducedMotion ? <span className="rb-caret">|</span> : null}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-[10px] border border-[#ECECF2] bg-white p-1">
        {phase === 'sheen' && !reducedMotion ? (
          <div
            key={sheenKey}
            aria-hidden
            className="rb-sheen pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          />
        ) : null}
        {materials.map((m, i) => {
          const revealed = i < revealedCount;
          return (
            <div
              key={m.face}
              className="mb-1 flex items-center justify-between rounded-lg px-2.5 py-2 transition-[opacity,transform] duration-300 ease-out last:mb-0"
              style={{
                opacity: revealed || reducedMotion ? 1 : 0,
                transform:
                  revealed || reducedMotion
                    ? 'translateY(0) scale(1)'
                    : 'translateY(5px) scale(0.94)',
              }}
            >
              <div>
                <span className={`block text-[9.5px] text-[#8A8896] ${MONO}`}>{m.face}</span>
                <span className="text-[12.5px] font-semibold text-[#17161F]">{m.value}</span>
              </div>
              <span
                className={`rounded-full bg-[#EFECFF] px-1.5 py-1 text-[9px] text-[#716FFF] ${MONO}`}
              >
                {autoTag}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className={`text-[11px] text-[#8A8896] ${MONO}`}>{countLabel(count)}</span>
        <span
          className="flex items-center gap-1.5 rounded-full bg-[#1E7A3D14] px-2.5 py-1 text-[10.5px] text-[#1E7A3D] transition-opacity duration-300"
          style={{ opacity: phase === 'badge' || phase === 'pause' || reducedMotion ? 1 : 0 }}
        >
          <TickSquare set="bold" size={12} primaryColor="#1E7A3D" />
          {badgeLabel}
        </span>
      </div>
    </div>
  );
}
