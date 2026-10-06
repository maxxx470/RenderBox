'use client';

// A muted, looping motion-design film for a landing section. It plays only
// while at least 45 % of it is on screen (saves battery, and the visitor never
// lands in the middle of the loop), and with reduced motion nothing starts on
// its own: the poster shows, with the native controls.
//
// The films are rendered outside the app with HyperFrames (the owner's
// motion-design workspace, ~/motion-design-claude-code/<film>/), then encoded
// for the web into public/motion/: H.264, faststart, no audio track, one file
// per language (commenter-fr.mp4 / commenter-en.mp4) plus a poster each.
import { useEffect } from 'react';
import { useInView } from './hooks/useInView';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

export function MotionFilm({
  src,
  poster,
  label,
  className = '',
}: {
  src: string;
  poster: string;
  /** What the film shows, for screen readers. */
  label: string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLVideoElement>({ threshold: 0.45, once: false });
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video || reducedMotion) return;
    if (inView) video.play().catch(() => {});
    else video.pause();
  }, [inView, reducedMotion, ref]);

  return (
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
}
