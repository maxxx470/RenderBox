'use client';

// Instant feedback on a rail link, for the gap between the click and the new
// page arriving.
//
// Why this is needed at all: /app and /app/generer both call requireAuth(),
// which reads cookies(), which makes the whole route dynamic. A dynamic route
// has no static shell for the router to prefetch, so `loading.tsx` never gets
// a chance to appear — the App Router keeps the CURRENT page mounted, frozen,
// until the server's response lands. Measured on production: click Dashboard
// from /app/generer and the URL is still /app/generer 1.4s later, with
// nothing on screen having changed. The click reads as broken.
//
// useLinkStatus reports the enclosing <Link>'s own transition, so the row the
// user actually clicked can say so immediately — independently of prefetch,
// of Suspense boundaries, and of how long the server takes.
//
// Must be rendered INSIDE a <Link>; that is how the hook finds its
// navigation. Outside one it always reports not-pending.
import type { ReactNode } from 'react';
import { useLinkStatus } from 'next/link';

/**
 * Renders `children` normally, and a spinner in their place while the
 * enclosing link's navigation is in flight.
 *
 * Sized to the 18px rail icons it replaces so the row does not reflow on
 * click — a row that jumps as you click it is worse than one that waits.
 */
export function NavPendingIcon({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  if (!pending) return <>{children}</>;
  return (
    <span
      role="status"
      aria-live="polite"
      className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center"
    >
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-[#DEDEE8] border-t-[#716FFF]" />
    </span>
  );
}
