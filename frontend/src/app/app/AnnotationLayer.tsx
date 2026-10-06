'use client';

// Point-and-comment layer for the "Commenter" mode, after ChatGPT's image-edit
// comments: click a spot on the render, a bubble opens, write what should
// change there. Several numbered pins can sit on one image; they are sent
// together in one pass (see lib/server/generation/annotations.ts).
//
// The layer is laid over the IMAGE, not the canvas: the render is
// object-contain inside a larger box, so canvas-relative percentages would
// point at the letterboxing. The image's own box is read from the <img>
// (offsetLeft/Top/Width/Height — the canvas is its offset parent) and kept
// current with a ResizeObserver.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { MAX_ANNOTATIONS, MAX_COMMENT_LENGTH } from '@/lib/server/generation/annotations';

export interface Pin {
  id: string;
  x: number;
  y: number;
  comment: string;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function useImageBox(imgRef: RefObject<HTMLImageElement | null>): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const read = () =>
      setBox(
        img.offsetWidth > 0
          ? {
              left: img.offsetLeft,
              top: img.offsetTop,
              width: img.offsetWidth,
              height: img.offsetHeight,
            }
          : null,
      );
    read();
    img.addEventListener('load', read);
    const ro = new ResizeObserver(read);
    ro.observe(img);
    if (img.parentElement) ro.observe(img.parentElement);
    return () => {
      img.removeEventListener('load', read);
      ro.disconnect();
    };
  }, [imgRef]);
  return box;
}

const PIN =
  'flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white font-[family-name:var(--font-jetbrains-mono)] text-[12px] font-semibold text-white shadow-[0_6px_16px_-4px_rgba(21,128,61,0.75)]';

export function AnnotationLayer({
  imgRef,
  pins,
  onChange,
  disabled,
}: {
  imgRef: RefObject<HTMLImageElement | null>;
  pins: Pin[];
  onChange: (pins: Pin[]) => void;
  disabled: boolean;
}) {
  const t = useTranslations();
  const box = useImageBox(imgRef);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const active = pins.find((p) => p.id === activeId) ?? null;

  useEffect(() => {
    if (active) textRef.current?.focus();
  }, [active]);

  // An emptied bubble left open becomes a stray pin with nothing to say.
  function close(save: boolean) {
    if (!active) return;
    const text = (save ? draft : active.comment).trim();
    onChange(
      text
        ? pins.map((p) => (p.id === active.id ? { ...p, comment: text } : p))
        : pins.filter((p) => p.id !== active.id),
    );
    setActiveId(null);
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled || !box) return;
    if (active) {
      close(true);
      return;
    }
    if (pins.length >= MAX_ANNOTATIONS) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    const pin: Pin = { id: `${Date.now()}-${pins.length}`, x, y, comment: '' };
    onChange([...pins, pin]);
    setDraft('');
    setActiveId(pin.id);
  }

  if (!box) return null;

  return (
    <div
      onClick={handleClick}
      className={`absolute ${disabled ? '' : 'cursor-crosshair'}`}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      {pins.map((p, i) => (
        <button
          key={p.id}
          type="button"
          aria-label={t('annotate.pinLabel', { n: i + 1 })}
          title={p.comment || undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            if (active && active.id !== p.id) close(true);
            setDraft(p.comment);
            setActiveId(p.id);
          }}
          className={`absolute ${PIN} ${p.id === activeId ? 'scale-110 bg-[#166534]' : 'bg-[#15803D]'} transition-transform duration-150 ease-out`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          {i + 1}
        </button>
      ))}

      {active && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-10 w-[240px] rounded-2xl border border-[#E1E9E3] bg-white p-2.5 shadow-[0_18px_40px_-16px_rgba(23,22,31,0.45)]"
          style={{
            // Opens on the side with room, so a pin near an edge never pushes
            // its own bubble out of the canvas.
            left: active.x > 60 ? undefined : `calc(${active.x}% + 20px)`,
            right: active.x > 60 ? `calc(${100 - active.x}% + 20px)` : undefined,
            top: active.y > 65 ? undefined : `calc(${active.y}% - 14px)`,
            bottom: active.y > 65 ? `calc(${100 - active.y}% - 14px)` : undefined,
          }}
        >
          <textarea
            ref={textRef}
            value={draft}
            maxLength={MAX_COMMENT_LENGTH}
            rows={2}
            placeholder={t('annotate.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                close(true);
              } else if (e.key === 'Escape') {
                close(false);
              }
            }}
            className="w-full resize-none rounded-xl bg-[#F7F7FA] px-2.5 py-2 text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896]"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onChange(pins.filter((p) => p.id !== active.id));
                setActiveId(null);
              }}
              className="rounded-full px-2.5 py-1 text-[12px] font-medium text-[#E5484D] hover:bg-[#E5484D0F]"
            >
              {t('annotate.remove')}
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              disabled={!draft.trim()}
              className="rounded-full bg-[#15803D] px-3.5 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {t('annotate.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The render with its numbered markers burnt in — attached to the request as
 * the second image, so the engine sees exactly where each comment points.
 * Drawn at the image's natural size; JPEG keeps a large render well under the
 * upload limit. The markers are red, not the brand green, on purpose: this
 * image is only ever read by the engine, never shown, and red stands out
 * against foliage and lawns where green markers would vanish.
 */
export async function drawMarkedImage(src: string, pins: Pin[]): Promise<Blob | null> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const r = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
  pins.forEach((p, i) => {
    const cx = (p.x / 100) * canvas.width;
    const cy = (p.y / 100) * canvas.height;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#E5484D';
    ctx.fill();
    ctx.lineWidth = Math.max(3, r * 0.18);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), cx, cy + 1);
  });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}
