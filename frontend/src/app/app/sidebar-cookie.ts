// The rail's folded state, in a cookie rather than localStorage so the server
// renders the rail already folded — no unfold-then-fold flash on load.
// A plain module: a constant exported from a 'use client' file would reach a
// server component as a client reference, not as the string.
export const SIDEBAR_COOKIE = 'rb-sidebar';
