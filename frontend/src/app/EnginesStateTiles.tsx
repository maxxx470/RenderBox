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
import {
  CARD_GRADIENT,
  CARD_GRADIENT_BORDER,
  CARD_GRADIENT_EDGE,
  CARD_SHEEN,
} from './card-gradient';

const MONO = 'font-[family-name:var(--font-jetbrains-mono)]';
const TILE_CYCLE_MS = 6000;
const TILE_OFFSET_MS = 220;
const EVENT_MS = 4000;

type TileState = 'idle' | 'run' | 'ok';

function EngineTile({
  name,
  description,
  offsetMs,
  reducedMotion,
}: {
  name: string;
  /** What this engine is actually better at — see engine-labels.ts. */
  description: string;
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

  // The running and finished states keep their own border — those two colours
  // are the tile reporting something, and the shared card edge must not
  // overwrite them. Only the idle border comes from CARD_GRADIENT_EDGE.
  const stateBorder =
    state === 'run'
      ? 'border border-[#716FFF] rb-badge-pulse'
      : state === 'ok'
        ? 'border border-[#1E7A3D]'
        : CARD_GRADIENT_BORDER;

  return (
    <div
      className={`group relative flex flex-1 flex-col items-center gap-2.5 overflow-hidden rounded-2xl px-4 py-5 text-center ${CARD_GRADIENT} ${CARD_GRADIENT_EDGE} ${stateBorder}`}
    >
      <span aria-hidden className={CARD_SHEEN} />
      {/* White ring, not the grey band: on the violet ground #F7F7FA is the
          same value as the card and the ring disappears. */}
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#E6E1FA] bg-white">
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
      <span className="relative text-[13px] font-semibold text-[#17161F]">{name}</span>
      {/* The two tiles used to be identical down to the glyph: same icon, same
          ground, same everything, only the name differing. Side by side that
          said the two engines are interchangeable — while the heading above
          them asks the visitor to CHOOSE one, and the FAQ further down
          promises to explain the difference. The difference was already
          written, in engine-labels.ts, and shown inside the app's own engine
          picker. It belongs here too.

          The raw state name used to sit in this slot — "idle" / "run" / "ok",
          untranslated developer vocabulary shown to every visitor whatever
          their language. The spinner and the tick already carry that
          progression. */}
      <span className="relative max-w-[22ch] text-[12px] leading-[1.45] text-[#6B6880]">
        {description}
      </span>
    </div>
  );
}

export interface EngineTileData {
  name: string;
  description: string;
}

export function EnginesStateTiles({
  engines,
  events,
}: {
  engines: EngineTileData[];
  events: string[];
}) {
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
        {engines.map((engine, i) => (
          <EngineTile
            key={engine.name}
            name={engine.name}
            description={engine.description}
            offsetMs={i * TILE_OFFSET_MS}
            reducedMotion={reducedMotion || !inView}
          />
        ))}
      </div>
      {/* A bare centred line of grey mono under the tiles read as a caption
          that had come loose from something. As a pill with a live dot it
          reads as what it is: the state the two tiles are reporting. */}
      <div className="mt-3.5 flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#ECECF2] bg-white px-3 py-1.5">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#716FFF] ${
              reducedMotion ? '' : 'rb-pulse'
            }`}
          />
          <span className={`text-[11.5px] text-[#6B6880] ${MONO}`}>
            {events[reducedMotion ? 0 : eventIndex]}
          </span>
        </span>
      </div>
    </div>
  );
}
