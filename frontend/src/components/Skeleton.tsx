// Shared skeleton primitives.
//
// These are server components on purpose — they are what Next.js streams
// immediately from a `loading.tsx` while the page's own data is still being
// fetched, so shipping any client JS with them would defeat the point.
//
// The shimmer is one animation defined once in animations.css (`rb-skeleton`),
// already covered by the site-wide `prefers-reduced-motion` block: with motion
// reduced the blocks simply sit still in their base tone rather than pulsing.

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`rb-skeleton rounded-lg bg-[#F1F0F4] ${className}`} />;
}

/**
 * Wraps a screen's skeleton. `aria-busy` plus a polite live region tells a
 * screen reader that content is on its way, instead of announcing a page made
 * of empty boxes.
 */
export function SkeletonScreen({
  label,
  className,
  children,
}: {
  label: string;
  /** Layout classes for the wrapper — inside the app chrome it is the flex
      child standing in for the page's <main>. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
