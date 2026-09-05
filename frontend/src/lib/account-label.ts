// What to print where an account's email goes, while AUTH_DISABLED is on.
//
// With the kill-switch on (see lib/server/auth-disabled.ts) every visitor —
// on the live deployment, not just locally — resolves to one seeded User row
// whose address is `demo@localhost`. Printing that in the sidebar and in the
// settings page told a paying visitor two false things at once: that they are
// signed in as somebody, and that the somebody is a machine-local test
// account. It is the single most explicit "this is a dev build" string the
// product shows.
//
// The row itself is left alone: its id is what the app keys off, it is what
// every IDOR check resolves against, and renaming it would mean a production
// data migration to change a label. So the fix is at the point of display —
// where there is no account, say so, rather than name one.
//
// When AUTH_DISABLED is removed, real users have real addresses, this returns
// null for all of them, and every call site prints the email as before.
import { AUTH_DISABLED_USER_EMAIL } from './server/auth-disabled';

/**
 * True when `email` is the shared no-account placeholder rather than a real
 * person's address.
 *
 * Compared against the constant rather than sniffed for "localhost": the
 * address is seeded FROM this constant, so the two cannot drift, and a real
 * user could legitimately hold an address this heuristic would misjudge.
 */
export function isPlaceholderAccount(email: string | null | undefined): boolean {
  return email === AUTH_DISABLED_USER_EMAIL;
}
