// The buttons of the materials panel and of the old sheet under it, one look
// for both (étapes 3C.4-S and 3C.5.4). Touch targets: 44px high below 900px,
// where the column is a drawer on a touch screen; the denser desktop sizes
// from 900px. Only the hit area grows — the text and the icons keep their
// size. Whole class strings, so Tailwind's scanner sees them.
export const PRIMARY_BTN =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60 min-[900px]:min-h-7';
export const SECONDARY_BTN =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-[#F2F2F5] px-3 py-1.5 text-[11px] font-semibold text-[#6B6878] hover:bg-[#E9E9EE] disabled:opacity-60 min-[900px]:min-h-7';
