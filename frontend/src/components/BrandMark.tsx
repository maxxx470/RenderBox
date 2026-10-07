'use client';

// The RenderBox logo mark: green gradient tile with a white building glyph.
// The charter forbids a bare gradient square (it reads as a missing icon), and
// every header/footer/sidebar used to inline exactly that — this is now the
// single source for the mark.
import { Home } from 'react-iconly';

const SIZES = {
  sm: { box: 'h-6.5 w-6.5 rounded-full', icon: 15 },
  md: { box: 'h-7 w-7 rounded-full', icon: 16 },
} as const;

export function BrandMark({
  size = 'sm',
  inverse = false,
}: {
  size?: keyof typeof SIZES;
  /** White disc, green glyph — for the mark sitting on a green ground. */
  inverse?: boolean;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={`inline-flex flex-shrink-0 items-center justify-center ${
        inverse ? 'bg-white' : 'bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534]'
      } ${s.box}`}
    >
      <Home set="curved" size={s.icon} primaryColor={inverse ? '#15803D' : '#ffffff'} />
    </span>
  );
}
