// Addresses a relance must never be sent to, because they cannot receive
// mail at all (2026-11-04).
//
// Why this exists. Belt and braces, NOT a rescue: the candidate query
// in run.ts already filters on `deletedAt: null`, and the five seed
// accounts in production (dev-bypass@localhost, demo@localhost,
// admin@example.com, user@example.com, unverified@example.com) all
// carry a `deletedAt` from October, so they were never candidates. A
// dry run against the real base reports `undeliverable: 0`.
//
// (An earlier version of this comment claimed those five would have
// been five hard bounces on the first pass. That was wrong — it was
// written before `deletedAt` was read — and it is corrected here
// rather than quietly deleted, because the wrong reason is the kind of
// thing that gets copied into the next guard.)
//
// What the guard is really for: nothing guarantees a future
// undeliverable address will also be soft-deleted, and `emailBouncedAt`
// is still set by nothing (it waits on a Resend webhook), so a bounce
// would not even stop the next relance. The sign-in codes leave from
// the SAME domain as the relances, so a reputation burnt by them takes
// the login flow down with it — CLAUDE.md's own reason for making the
// schedule so conservative. Cheap insurance on the one failure this
// feature cannot afford.
//
// The list is NOT a blocklist of addresses we dislike. It is the set IANA
// reserves for documentation and testing, which by definition can never
// receive mail: RFC 2606 (.test, .example, .invalid, .localhost and the
// example.com/net/org second-level names) and RFC 6761 (localhost). It
// therefore needs no maintenance and can never wrongly exclude a real
// customer. Disposable or throwaway providers are deliberately NOT here:
// they do accept mail, excluding them is a judgement call rather than a
// fact, and such lists drift.
import 'server-only';

/** Reserved TLDs that can never receive mail (RFC 2606 §2, RFC 6761). */
const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost'] as const;

/** Second-level names reserved for documentation (RFC 2606 §3). */
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'] as const;

/**
 * Can this address receive mail at all?
 *
 * Deliberately conservative in BOTH directions: an address we cannot
 * parse is treated as undeliverable (we will not send into something we
 * do not understand), and anything outside the reserved set is treated as
 * deliverable (this function is not a spam filter).
 */
export function isDeliverableAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;

  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (domain.length === 0 || domain.includes('@') || domain.includes(' ')) return false;

  // A bare host with no dot — `localhost` and anything like it — has no
  // public MX and cannot be delivered to from a third-party sender.
  if (!domain.includes('.')) return false;

  if (RESERVED_DOMAINS.includes(domain as (typeof RESERVED_DOMAINS)[number])) return false;
  for (const tld of RESERVED_TLDS) {
    if (domain === tld || domain.endsWith(`.${tld}`)) return false;
  }
  return true;
}
