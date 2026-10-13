// The RenderPro logo (owner, 2026-10-13): their four-piece mark — each piece
// one charter colour, cut out of the owner's generated image in
// public/brand/ — and the « RenderPro » wordmark, set in the title font.
// The single source for the logo:
// every header, footer, sidebar and sign-in screen uses these.
//
// The wordmark's colours are one of four proposals (WORDMARK_STYLE); the
// owner picks one, the constant changes, nothing else does.

const SIZES = {
  sm: 'h-6.5 w-6.5',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
} as const;

/** The mark alone: the folded rail, the phone header, the favicon's twin. */
export function BrandMark({
  size = 'sm',
  inverse = false,
}: {
  size?: keyof typeof SIZES;
  /** On a blue band: the mark sits on a white tile, or its blues would vanish. */
  inverse?: boolean;
}) {
  const img = (
    <img
      src="/brand/mark.webp"
      alt=""
      width={256}
      height={256}
      className={`${SIZES[size]} flex-shrink-0`}
    />
  );
  if (!inverse)
    return (
      <span aria-hidden className="inline-flex flex-shrink-0">
        {img}
      </span>
    );
  return (
    <span aria-hidden className="inline-flex flex-shrink-0 rounded-lg bg-white p-1">
      {img}
    </span>
  );
}

type WordmarkStyle = 'A' | 'B' | 'C' | 'D';

/** A: ink + blue « Pro » · B: all deep blue · C: blue gradient · D: ink +
 *  red « Pro ». */
export const WORDMARK_STYLE: WordmarkStyle = 'A';

const STYLES: Record<WordmarkStyle, { render: string; pro: string }> = {
  A: { render: 'text-[#17161F]', pro: 'text-[#2948FC]' },
  B: { render: 'text-[#1E36D6]', pro: 'text-[#1E36D6]' },
  C: {
    render:
      'bg-gradient-to-r from-[#435CFE] via-[#2948FC] to-[#1E36D6] bg-clip-text text-transparent',
    pro: 'bg-gradient-to-r from-[#2948FC] to-[#1E36D6] bg-clip-text text-transparent',
  },
  D: { render: 'text-[#17161F]', pro: 'text-[#F34857]' },
};

/** « RenderPro », in the parent's font size — plain letters (owner,
 *  2026-10-13: a professional site, no iris in the « o » any more). */
export function Wordmark({
  inverse = false,
  style = WORDMARK_STYLE,
  className = '',
}: {
  /** White, for a blue band. */
  inverse?: boolean;
  style?: WordmarkStyle;
  className?: string;
}) {
  const s = STYLES[style];
  return (
    <span
      className={`inline-flex items-baseline whitespace-nowrap font-[family-name:var(--font-display)] font-bold tracking-[-0.015em] ${className}`}
    >
      <span className="sr-only">RenderPro</span>
      <span aria-hidden className={inverse ? 'text-white' : s.render}>
        Render
      </span>
      <span aria-hidden className={inverse ? 'text-white' : s.pro}>
        Pro
      </span>
    </span>
  );
}
