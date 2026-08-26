// Magic-link token helpers — RenderBox's sole password-less email sign-in
// path (alongside Google OAuth). Reuses the existing VerificationCode
// table with type = 'MAGIC_LINK' (see prisma/schema.prisma comment on that
// model) rather than a dedicated table, since the single-use + expiry +
// TOCTOU-safe-consume shape is identical to what verify-email used to do.
//
// The raw token only ever exists in the emailed URL and briefly in the
// request handler's memory — only its SHA-256 hash is persisted, so a DB
// read (backup leak, read-replica compromise) can't be replayed into a
// session.
import 'server-only';
import { randomBytes, createHash } from 'node:crypto';

export function generateMagicLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashMagicLinkToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
