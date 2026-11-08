'use client';

// The landing's « Animation vidéo » row (2026-11-08): three 16:9 cards on one
// line, each a muted loop of a render in movement, with its title in HTML over
// the picture.
//
// Why the title is NOT burnt into the clip: the site speaks two languages on
// one URL (geo-locale.ts), so a word inside the video would be wrong for half
// the visitors and could never be fixed without re-rendering. The clips carry
// no text at all; this component writes it.
//
// Three deliberate differences from MotionFilm, which this does not reuse:
//   · two sources (WebM then MP4) — MotionFilm takes one `src`, and the saving
//     on VP9 is worth the branch here where three clips autoplay at once;
//   · the sources are attached only once the row has come NEAR the viewport
//     (`rootMargin`), so a visitor who never scrolls this far downloads
//     nothing. `preload="metadata"` alone still fetches three headers;
//   · the card is its own frame (dark ground, scrim, title), because the clip
//     is product output and not a screen recording of the interface.
//
// Reduced motion: nothing plays on its own and the native controls appear, the
// same contract as MotionFilm.
import Link from 'next/link';
import { useEffect } from 'react';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { landingVideo } from './motion-media';

export interface ShowcaseClip {
  /** The file's base name on R2, without edition or extension. */
  name: string;
  title: string;
  /** What the clip shows, for a screen reader. */
  alt: string;
}

function Card({ clip }: { clip: ShowcaseClip }) {
  // Two observers, two jobs: `near` decides whether to download at all (once,
  // 320px early so the first frame is there by the time the card arrives),
  // `onScreen` decides whether it plays (repeating, so a clip scrolled past
  // stops costing battery).
  const [nearRef, near] = useInView<HTMLDivElement>({ rootMargin: '320px', once: true });
  const [videoRef, onScreen] = useInView<HTMLVideoElement>({ threshold: 0.4, once: false });
  const reducedMotion = usePrefersReducedMotion();
  const { webm, mp4, poster } = landingVideo(clip.name);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion || !near) return;
    if (onScreen) video.play().catch(() => {});
    else video.pause();
  }, [onScreen, near, reducedMotion, videoRef]);

  return (
    <div
      ref={nearRef}
      className="relative w-[82vw] max-w-[420px] flex-none snap-center overflow-hidden rounded-2xl bg-[#17161F] min-[768px]:w-auto min-[768px]:max-w-none"
    >
      <video
        ref={videoRef}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        controls={reducedMotion}
        aria-label={clip.alt}
        className="block aspect-video w-full object-cover"
      >
        {/* Attached only once the card is near: an empty <video> downloads
            nothing, and adding the sources later starts the fetch. */}
        {near && <source src={webm} type="video/webm" />}
        {near && <source src={mp4} type="video/mp4" />}
      </video>

      {/* The scrim exists for the title's contrast, not for looks: the clips
          end on bright façades and white text alone would disappear.

          Under reduced motion the title moves to the TOP: nothing plays on
          its own then, so the browser draws its own control bar along the
          bottom edge and the title sat right on top of it — unreadable, and
          the controls unclickable under a `pointer-events-none` label. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 h-[46%] ${
          reducedMotion
            ? 'top-0 bg-gradient-to-b from-[#17161F]/85 via-[#17161F]/35 to-transparent'
            : 'bottom-0 bg-gradient-to-t from-[#17161F]/85 via-[#17161F]/35 to-transparent'
        }`}
      />
      <p
        className={`pointer-events-none absolute left-4 right-4 font-[family-name:var(--font-display)] text-[17px] font-bold leading-tight text-white min-[768px]:text-[18px] ${
          reducedMotion ? 'top-3.5' : 'bottom-3.5'
        }`}
      >
        {clip.title}
      </p>
    </div>
  );
}

export function VideoShowcase({
  clips,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
}: {
  clips: readonly ShowcaseClip[];
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}) {
  return (
    <>
      {/* Three on a line from 768px. Below it they scroll sideways with
          scroll-snap rather than stacking: stacked, three 16:9 cards are a
          screen and a half of scrolling for one section. The negative margin
          lets the row bleed to the screen edge while the page keeps its
          gutter, and the padding gives the first and last card that gutter
          back. */}
      <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] min-[768px]:mx-0 min-[768px]:grid min-[768px]:grid-cols-3 min-[768px]:gap-4 min-[768px]:overflow-visible min-[768px]:px-0 min-[768px]:pb-0">
        {clips.map((clip) => (
          <Card key={clip.name} clip={clip} />
        ))}
      </div>

      <div className="mt-9 flex flex-col items-center justify-center gap-3 min-[560px]:flex-row min-[560px]:gap-5">
        <Link
          href={ctaHref}
          className="inline-flex items-center rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-6 py-3.5 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
        >
          {ctaLabel}
        </Link>
        <Link
          href={secondaryHref}
          className="text-sm font-semibold text-[#2948FC] underline decoration-[#D5DCFF] decoration-2 underline-offset-4 transition-colors hover:decoration-[#2948FC]"
        >
          {secondaryLabel}
        </Link>
      </div>
    </>
  );
}
