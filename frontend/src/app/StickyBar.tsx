'use client';

// Sticky conversion bar (§10 of the animation spec) — slides up from
// underneath the viewport once the hero has scrolled out of view, slides
// back down if the visitor scrolls back above it. Purely presentational:
// LandingClient owns the IntersectionObserver on the hero sentinel and
// passes the resulting boolean down, so this component has no scroll logic
// of its own to keep in sync with anything else on the page.
import Link from 'next/link';

export function StickyBar({
  visible,
  href,
  label,
}: {
  visible: boolean;
  href: string;
  label: string;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-center border-t border-[#ECECF2] bg-white/95 shadow-[0_-8px_24px_-12px_rgba(23,22,31,0.15)] backdrop-blur transition-transform duration-300 ease-out"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
      aria-hidden={!visible}
    >
      <Link
        href={href}
        tabIndex={visible ? 0 : -1}
        className="rb-pulse inline-flex items-center gap-2 rounded-full bg-[#17161F] px-6 py-2.5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
      >
        {label}
      </Link>
    </div>
  );
}
