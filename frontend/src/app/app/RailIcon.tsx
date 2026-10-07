// The rail's icons — and the command bar's, through `Glyph`.
//
// 2026-10-07: Iconly's Curved set, like every other icon on the site (owner:
// "les icônes de la sidebar n'ont pas changé" — these were hand-drawn SVGs
// until then, so the site-wide swap to `set="curved"` had missed them).
//
// The one exception is the paperclip: Iconly has no attach glyph, and the
// paperclip is the convention for "attach a file" in a composer. It is drawn
// on the same 24px grid with a stroke close to Curved's, so it sits with them.
import type { ComponentType, ReactNode } from 'react';
import {
  Category,
  Chat,
  Folder,
  Image as ImageIcon,
  InfoSquare,
  Plus,
  Setting,
  Star,
  Wallet,
} from 'react-iconly';

export type RailIconName =
  | 'dashboard'
  | 'projects'
  | 'image'
  | 'enhance'
  | 'pricing'
  | 'settings'
  | 'info'
  | 'comment'
  | 'add'
  | 'clip';

type IconlyIcon = ComponentType<{
  set?: 'curved';
  size?: number;
  primaryColor?: string;
}>;

const ICON: Record<Exclude<RailIconName, 'clip'>, IconlyIcon> = {
  dashboard: Category,
  projects: Folder,
  image: ImageIcon,
  // Iconly has no sparkle; the star is the closest "make it shine".
  enhance: Star,
  pricing: Wallet,
  settings: Setting,
  info: InfoSquare,
  comment: Chat,
  add: Plus,
};

function Paperclip({ size, color }: { size: number; color: string }): ReactNode {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <path d="m19.6 11.4-7.3 7.3a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3.1 3.1 0 0 1 4.4 4.4l-7.5 7.5a1.55 1.55 0 0 1-2.2-2.2l6.8-6.8" />
    </svg>
  );
}

/** A glyph from the set at any size and colour, outside the rail. */
export function Glyph({
  name,
  color = 'currentColor',
  size = 16,
}: {
  name: RailIconName;
  color?: string;
  size?: number;
}) {
  if (name === 'clip') return <Paperclip size={size} color={color} />;
  const Icon = ICON[name];
  return <Icon set="curved" size={size} primaryColor={color} />;
}

/**
 * Bare glyph (2026-10-05, after the Metrio reference): no tile. Idle glyphs
 * are brand green (#15803D, 5.0:1), as Metrio draws its idle icons in its
 * blue (owner, 2026-10-07); the active row is a filled green pill, so there
 * the glyph turns white.
 */
export function RailIcon({
  name,
  active = false,
  color = '#15803D',
}: {
  name: RailIconName;
  active?: boolean;
  color?: string;
}) {
  return (
    <span aria-hidden className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
      <Glyph name={name} size={20} color={active ? '#ffffff' : color} />
    </span>
  );
}
