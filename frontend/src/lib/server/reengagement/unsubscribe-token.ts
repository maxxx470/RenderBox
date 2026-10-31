/**
 * The unsubscribe link every relance carries (2026-10-31).
 *
 * It has to work with ONE click, from an e-mail client, with no session —
 * Gmail and Outlook both weigh the presence of a working one-click
 * unsubscribe when they decide whether a sender is spam, and RenderPro's
 * sign-in codes leave from the same domain.
 *
 * So the link carries its own proof: `<userId>.<HMAC-SHA256(userId)>`,
 * keyed on JWT_SECRET. It is unguessable, it needs no database lookup to be
 * refused, and it grants exactly one power — stopping the relances for that
 * one account. It is NOT a session: it cannot sign in, read or change
 * anything else. Compared in constant time, so the signature cannot be
 * recovered byte by byte.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SITE_URL } from '@/lib/seo';
import type { Locale } from '@/lib/i18n/dictionaries';

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${userId}`).digest('base64url');
}

export function unsubscribeToken(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/** The user id the token proves, or null when it proves nothing. */
export function readUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(userId, secret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return userId;
}

export function unsubscribeUrl(userId: string, secret: string, locale: Locale): string {
  const token = unsubscribeToken(userId, secret);
  return `${SITE_URL}/api/emails/unsubscribe?token=${encodeURIComponent(token)}&lang=${locale}`;
}
