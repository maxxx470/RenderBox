'use client';

// Rotating "for <audience>" line above the hero H1. Erases the current
// phrase letter by letter, pauses, types the next one in — a blinking caret
// follows the text throughout. The spec only pins the erase/type/pause
// timings; the ~1.8s hold after a phrase finishes typing is our own call so
// each phrase is actually readable before it starts erasing again.
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

const ERASE_MS_PER_LETTER = 25;
const TYPE_MS_PER_LETTER = 45;
const PAUSE_BETWEEN_MS = 300;
const HOLD_AFTER_TYPE_MS = 1800;

export function Kicker({
  phrases,
  reducedMotionLabel,
}: {
  phrases: string[];
  reducedMotionLabel: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [text, setText] = useState(phrases[0] ?? '');
  const phraseIndexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (reducedMotion || phrases.length < 2) return;

    function schedule(fn: () => void, ms: number) {
      timeoutRef.current = setTimeout(fn, ms);
    }

    function typePhrase(phrase: string, pos: number) {
      setText(phrase.slice(0, pos));
      if (pos < phrase.length) {
        schedule(() => typePhrase(phrase, pos + 1), TYPE_MS_PER_LETTER);
      } else {
        schedule(() => erasePhrase(phrase, phrase.length), HOLD_AFTER_TYPE_MS);
      }
    }

    function erasePhrase(phrase: string, pos: number) {
      setText(phrase.slice(0, pos));
      if (pos > 0) {
        schedule(() => erasePhrase(phrase, pos - 1), ERASE_MS_PER_LETTER);
      } else {
        schedule(() => {
          phraseIndexRef.current = (phraseIndexRef.current + 1) % phrases.length;
          const next = phrases[phraseIndexRef.current] ?? '';
          typePhrase(next, 0);
        }, PAUSE_BETWEEN_MS);
      }
    }

    schedule(() => erasePhrase(phrases[0] ?? '', (phrases[0] ?? '').length), HOLD_AFTER_TYPE_MS);

    return () => clearTimeout(timeoutRef.current);
  }, [phrases, reducedMotion]);

  if (reducedMotion) {
    return <span>{reducedMotionLabel}</span>;
  }

  return (
    <span>
      {text}
      <span aria-hidden className="rb-caret text-[#716FFF]">
        |
      </span>
    </span>
  );
}
