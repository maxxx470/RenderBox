'use client';

// The stage of the image generator and of Améliorer once an image is pinned
// (owner, 2026-10-19): the source on the left, the render on the right (one
// above the other on a phone), and — once a render is there — « Comparer »,
// which lays the render over its source with a slider to wipe between them,
// whatever made the render (an ambiance, a template, Commenter, Ajouter or
// Améliorer). Under the stage: the two views, what made the render, then the
// page's own actions.
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Image as ImageIcon } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';

const MONO = 'font-[family-name:var(--font-mono)]';
const TAG = `rounded-md px-2 py-1 ${MONO} text-[10px] font-medium shadow-[0_1px_2px_rgba(23,22,31,0.08)]`;

type View = 'side' | 'compare';

/** One side of the stage: a picture on the grey ground, its tag in a corner. */
function StagePane({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#F7F7FA] p-3">
      <span className={`absolute left-3 top-3 z-10 bg-white text-[#6B6878] ${TAG}`}>{tag}</span>
      {children}
    </div>
  );
}

/**
 * The render over its source, wiped with a vertical handle (drag, or the
 * arrow keys once focused). The box takes the render's own proportions, as
 * large as the stage allows; the source is cropped to the same frame, as the
 * render was.
 */
function CompareSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
  label,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  label: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const [position, setPosition] = useState(50);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !natural) return;
    const read = () => {
      const k = Math.min(
        (stage.clientWidth - 24) / natural.w,
        (stage.clientHeight - 24) / natural.h,
      );
      if (k > 0) setFit({ w: Math.floor(natural.w * k), h: Math.floor(natural.h * k) });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [natural]);

  function moveTo(clientX: number, box: HTMLElement) {
    const rect = box.getBoundingClientRect();
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX, e.currentTarget);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 4;
    if (e.key === 'ArrowLeft') setPosition((p) => Math.max(0, p - step));
    else if (e.key === 'ArrowRight') setPosition((p) => Math.min(100, p + step));
    else return;
    e.preventDefault();
  }

  return (
    <div
      ref={stageRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#F7F7FA]"
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging.current && moveTo(e.clientX, e.currentTarget)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        // The images are draggable by default: the browser's own drag would
        // fight the wipe (see BeforeAfterSlider).
        onDragStart={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        style={fit ? { width: fit.w, height: fit.h } : undefined}
        className={`relative cursor-ew-resize touch-none select-none overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#2948FC] ${
          fit ? '' : 'h-[calc(100%-24px)] w-[calc(100%-24px)]'
        }`}
      >
        <img
          src={before}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className={`absolute left-3 top-3 bg-white text-[#6B6878] ${TAG}`}>
          {beforeLabel}
        </span>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          <img
            src={after}
            alt=""
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            className="h-full w-full object-cover"
          />
          <span className={`absolute right-3 top-3 bg-[#F34857] font-semibold text-white ${TAG}`}>
            {afterLabel}
          </span>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
          style={{ left: `${position}%` }}
        >
          <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-white text-[#EF3E50] shadow-[0_10px_26px_-6px_rgba(67,92,254,0.6)]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SourceResultStage({
  sourceSrc,
  resultSrc,
  working,
  workingText,
  emptyText,
  info,
  actions,
}: {
  sourceSrc: string;
  /** The render, once there is one. */
  resultSrc: string | null;
  working: boolean;
  workingText: string;
  /** What the empty right side says before the first render. */
  emptyText: string;
  /** What made the render (engine · ambiance · size), in mono. */
  info?: string;
  /** The page's own buttons, at the end of the row under the stage. */
  actions?: ReactNode;
}) {
  const t = useTranslations();
  const [view, setView] = useState<View>('side');
  const comparing = view === 'compare' && resultSrc !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 pb-2">
      {comparing ? (
        <CompareSlider
          key={resultSrc}
          before={sourceSrc}
          after={resultSrc}
          beforeLabel={t('app.genSourceTag')}
          afterLabel={t('app.genResultTag')}
          label={t('app.compareSlider')}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 min-[640px]:flex-row">
          <StagePane tag={t('app.genSourceTag')}>
            <img
              src={sourceSrc}
              alt=""
              draggable={false}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </StagePane>
          <StagePane tag={t('app.genResultTag')}>
            {resultSrc ? (
              <img
                key={resultSrc}
                src={resultSrc}
                alt=""
                draggable={false}
                className="rb-card-in max-h-full max-w-full rounded-lg object-contain"
              />
            ) : working ? (
              <div role="status" className="flex flex-col items-center gap-3 text-center">
                <span className="rb-spin h-8 w-8 rounded-full border-[3px] border-[#D5DCFF] border-t-[#2948FC]" />
                <span className="max-w-[220px] text-[12.5px] text-[#6B6878]">{workingText}</span>
              </div>
            ) : (
              <div className="flex max-w-[240px] flex-col items-center gap-2.5 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white">
                  <ImageIcon set="curved" size={20} primaryColor="#C9C7D1" />
                </span>
                <span className="text-[12.5px] leading-snug text-[#8A8896]">{emptyText}</span>
              </div>
            )}
          </StagePane>
        </div>
      )}
      {resultSrc && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" className="flex rounded-lg bg-[#F2F2F5] p-0.5">
            {(['side', 'compare'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  view === v ? 'bg-[#2948FC] text-white' : 'text-[#3D3B49] hover:bg-[#E9E9EE]'
                }`}
              >
                {t(v === 'side' ? 'app.viewSide' : 'app.viewCompare')}
              </button>
            ))}
          </div>
          <span className={`mr-auto min-w-0 truncate px-1 ${MONO} text-[11px] text-[#6B6878]`}>
            {info}
          </span>
          {actions}
        </div>
      )}
    </div>
  );
}
