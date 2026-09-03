'use client';

// "Deux moteurs" comparison — two tiles that loop through idle → run → ok
// (§7 of the animation spec), offset by 220ms between engines to read as a
// wave rather than two tiles blinking in sync. An event line below cycles
// through 4 messages on its own independent 16s beat. Purely decorative —
// it does not reflect real generation state, so it starts immediately on
// mount rather than waiting for a viewport check (there's nothing to defer
// until the visitor scrolls to it, unlike the heavier data-shaped demos
// elsewhere on the page).
import { useEffect, useState } from 'react';
import { Category, TickSquare } from 'react-iconly';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

const MONO = 'font-[family-name:var(--font-jetbrains-mono)]';
const TILE_CYCLE_MS = 6000;
const TILE_OFFSET_MS = 220;
const EVENT_MS = 4000;

type TileState = 'idle' | 'run' | 'ok';

function EngineTile({
  name,
  offsetMs,
  reducedMotion,
}: {
  name: string;
  offsetMs: number;
  reducedMotion: boolean;
}) {
  const [state, setState] = useState<TileState>(reducedMotion ? 'ok' : 'idle');

  useEffect(() => {
    if (reducedMotion) return;
    let timeout: ReturnType<typeof setTimeout>;
    const start = setTimeout(loop, offsetMs);

    function loop() {
      setState('idle');
      timeout = setTimeout(() => {
        setState('run');
        timeout = setTimeout(() => {
          setState('ok');
          timeout = setTimeout(loop, TILE_CYCLE_MS / 3);
        }, TILE_CYCLE_MS / 3);
      }, TILE_CYCLE_MS / 3);
    }

    return () => {
      clearTimeout(start);
      clearTimeout(timeout);
    };
  }, [offsetMs, reducedMotion]);

  const borderClass =
    state === 'run'
      ? 'border-[#716FFF] rb-badge-pulse'
      : state === 'ok'
        ? 'border-[#1E7A3D]'
        : 'border-[#ECECF2]';

  return (
    <div
      className={`flex flex-1 flex-col items-center gap-2.5 rounded-2xl border bg-white px-4 py-5 text-center transition-colors duration-300 ${borderClass}`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F7F7FA]">
        {state === 'ok' ? (
          <TickSquare set="light" size={18} primaryColor="#1E7A3D" />
        ) : (
          <span
            className={state === 'run' && !reducedMotion ? 'rb-spin inline-flex' : 'inline-flex'}
          >
            <Category
              set="light"
              size={18}
              primaryColor={state === 'run' ? '#716FFF' : '#8A8896'}
            />
          </span>
        )}
      </div>
      <span className="text-[13px] font-semibold text-[#17161F]">{name}</span>
      {/* The raw state name used to be printed here — "idle" / "run" / "ok",
          untranslated developer vocabulary shown to every visitor whatever
          their language. The spinner and the tick already carry the same
          progression, so the word was noise on top of jargon. */}
    </div>
  );
}

export function EnginesStateTiles({ engines, events }: { engines: string[]; events: string[] }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const reducedMotion = usePrefersReducedMotion();
  const [eventIndex, setEventIndex] = useState(0);

  useEffect(() => {
    if (!inView || reducedMotion || events.length === 0) return;
    const id = setInterval(() => {
      setEventIndex((i) => (i + 1) % events.length);
    }, EVENT_MS);
    return () => clearInterval(id);
  }, [inView, reducedMotion, events.length]);

  return (
    <div ref={ref}>
      <div className="flex gap-3.5">
        {engines.map((name, i) => (
          <EngineTile
            key={name}
            name={name}
            offsetMs={i * TILE_OFFSET_MS}
            reducedMotion={reducedMotion || !inView}
          />
        ))}
      </div>
      <p className={`mt-3 text-center text-[11.5px] text-[#8A8896] ${MONO}`}>
        {events[reducedMotion ? 0 : eventIndex]}
      </p>
    </div>
  );
}
