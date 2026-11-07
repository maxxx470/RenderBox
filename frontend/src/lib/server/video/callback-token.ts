// The token on the callback URL we hand Kie (2026-11-07).
//
// Kie's video endpoints publish NO webhook signature — there is nothing to
// verify the body against. So the proof is the URL itself: we give Kie a
// `callBackUrl` carrying an HMAC of the job id, and the route refuses any
// call whose token does not match the job it claims to be about. An attacker
// who guesses a job id still cannot forge its token without JWT_SECRET.
//
// This stands in for a signature; it does not stand in for the truth. The
// body is only a TRIGGER — the route re-asks Kie what really happened before
// moving a single credit, exactly as the Moneriz webhook re-asks Moneriz. A
// correctly tokened body settles nothing by itself.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Same scope rule as the unsubscribe token: one secret, one power. */
const PURPOSE = 'kie-video-callback';

function secret(): string {
  const value = process.env.JWT_SECRET ?? '';
  if (!value) throw new Error('JWT_SECRET is required to sign video callbacks');
  return value;
}

export function videoCallbackToken(jobId: string): string {
  return createHmac('sha256', secret()).update(`${PURPOSE}:${jobId}`).digest('hex');
}

/** Constant-time, and false rather than throwing on a malformed token. */
export function isValidVideoCallbackToken(jobId: string, token: string): boolean {
  if (typeof token !== 'string' || token.length === 0) return false;
  let expected: string;
  try {
    expected = videoCallbackToken(jobId);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The absolute URL Kie calls back. Relative URLs are refused by Kie, and a
 *  wrong origin is a callback that silently never arrives. */
export function videoCallbackUrl(jobId: string, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, '');
  return `${base}/api/webhooks/kie-video?job=${encodeURIComponent(jobId)}&token=${videoCallbackToken(jobId)}`;
}
