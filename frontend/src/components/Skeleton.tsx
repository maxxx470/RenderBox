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
  return <div aria-hidden className={`rb-skeleton rounded-lg bg-[#F1F0F6] ${className}`} />;
}

/**
 * Wraps a screen's skeleton. `aria-busy` plus a polite live region tells a
 * screen reader that content is on its way, instead of announcing a page made
 * of empty boxes.
 */
export function SkeletonScreen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** The sidebar shape, so the rail does not pop in after the page body. */
export function SkeletonSidebar() {
  return (
    <div className="m-2.5 hidden h-[calc(100vh-20px)] w-[240px] flex-shrink-0 flex-col rounded-2xl border border-[#DEDEE8] bg-[#F7F7FA] px-3.5 py-4.5 min-[900px]:flex">
      <SkeletonBlock className="mb-4 h-6.5 w-[130px]" />
      <SkeletonBlock className="mb-4.5 h-9 w-full rounded-xl" />
      <SkeletonBlock className="mb-2 h-3 w-[60px]" />
      <SkeletonBlock className="mb-1.5 h-9 w-full rounded-xl" />
      <SkeletonBlock className="mb-4.5 h-9 w-full rounded-xl" />
      <SkeletonBlock className="mb-2 h-3 w-[60px]" />
      <SkeletonBlock className="mb-1.5 h-9 w-full rounded-xl" />
      <SkeletonBlock className="h-9 w-full rounded-xl" />
      <div className="mt-auto">
        <SkeletonBlock className="h-11 w-full rounded-2xl" />
      </div>
    </div>
  );
}
