'use client';

// Aspect-ratio chip.
//
// Deliberately an INDICATOR, not a picker. Neither engine takes an aspect
// parameter (see lib/server/generation/engines/) — RenderBox re-renders an
// existing photo, so the framing is inherited from the source. A chip offering
// "2:3" would be a control that changes nothing. This one reads the real
// dimensions of the image in play and reports what the render will be, which
// is the useful half of the reference's chip.
import { useEffect, useState } from 'react';
import { Scan } from 'react-iconly';
import { CHIP_STATIC } from './chip';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** "1512x1008" → "3:2". Falls back to a decimal when the reduction is ugly. */
export function formatRatio(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const divisor = gcd(Math.round(width), Math.round(height));
  const w = Math.round(width) / divisor;
  const h = Math.round(height) / divisor;
  // A ratio like 1439:960 is noise, not information — show 3:2-style figures
  // only when they stay readable.
  if (w <= 32 && h <= 32) return `${w}:${h}`;
  return `${(width / height).toFixed(2)}:1`;
}

export function RatioChip({ file, src }: { file?: File | null; src?: string | null }) {
  const [ratio, setRatio] = useState<string | null>(null);

  useEffect(() => {
    setRatio(null);
    const url = file ? URL.createObjectURL(file) : src;
    if (!url) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setRatio(formatRatio(img.naturalWidth, img.naturalHeight));
    };
    img.src = url;

    return () => {
      cancelled = true;
      // Only revoke what this effect created — `src` is owned by the caller.
      if (file) URL.revokeObjectURL(url);
    };
  }, [file, src]);

  // Nothing truthful to show yet: no image, or it has not loaded.
  if (!ratio) return null;

  return (
    <span className={CHIP_STATIC}>
      <Scan set="light" size={13} primaryColor="#8A8896" />
      {ratio}
    </span>
  );
}
