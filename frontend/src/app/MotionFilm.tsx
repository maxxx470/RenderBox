'use client';

// A muted, looping motion-design film for a landing section. It plays only
// while at least 45 % of it is on screen (saves battery, and the visitor never
// lands in the middle of the loop), and with reduced motion nothing starts on
// its own: the poster shows, with the native controls.
//
// The films are rendered outside the app with HyperFrames (the owner's
// motion-design workspace, ~/motion-design-claude-code/<film>/), then encoded
// for the web: H.264, faststart, no audio track, one file per language
// (commenter-fr.mp4 / commenter-en.mp4) plus a poster each. They are served
// from Cloudflare R2, not from the site: see motion-media.ts.
import { useEffect } from 'react';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

export function MotionFilm({
  src,
  poster,
  label,
  className = '',
  expandLabel,
}: {
  src: string;
  poster: string;
  /** What the film shows, for screen readers. */
  label: string;
  className?: string;
  /** Below 900px, a tap opens the film full screen (sideways when the phone
   *  allows it): the films show a computer's screen, unreadable at phone
   *  width (owner, 2026-10-15). The label of that button (« Agrandir »);
   *  absent, the film is not expandable. */
  expandLabel?: string;
}) {
  const [ref, inView] = useInView<HTMLVideoElement>({ threshold: 0.45, once: false });
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video || reducedMotion) return;
    if (inView) video.play().catch(() => {});
    else video.pause();
  }, [inView, reducedMotion, ref]);

  const expand = () => {
    const video = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!video) return;
    video.play().catch(() => {});
    const landscape = () =>
      (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })
        .lock?.('landscape')
        .catch(() => {});
    // iPhone Safari has no element full screen, only the video's own.
    if (video.requestFullscreen) {
      video
        .requestFullscreen()
        .then(landscape)
        .catch(() => video.webkitEnterFullscreen?.());
    } else video.webkitEnterFullscreen?.();
  };

  const film = (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      controls={reducedMotion}
      aria-label={label}
      className={`block aspect-video w-full bg-[#F7F7FA] object-cover ${className}`}
    />
  );
  if (!expandLabel) return film;
  return (
    <div className="relative">
      {film}
      <button
        type="button"
        onClick={expand}
        aria-label={`${expandLabel} : ${label}`}
        className="absolute inset-0 flex items-end justify-end p-2.5 min-[900px]:hidden"
      >
        <span className="rounded-lg bg-[#17161F]/75 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-sm">
          {expandLabel}
        </span>
      </button>
    </div>
  );
}
