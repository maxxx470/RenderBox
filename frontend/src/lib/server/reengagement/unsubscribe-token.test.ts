// The unsubscribe link stands in for a session, so it is the one thing in
// this feature with an attacker (2026-10-31). What it may do is stop the
// relances for one account; what it must never do is anything else.
import { describe, expect, it } from 'vitest';
import { readUnsubscribeToken, unsubscribeToken, unsubscribeUrl } from './unsubscribe-token';

const SECRET = 'a-secret-long-enough-to-be-a-jwt-secret-0123456789';

describe('the unsubscribe token', () => {
  it('reads back the account it was made for', () => {
    const token = unsubscribeToken('user_42', SECRET);
    expect(readUnsubscribeToken(token, SECRET)).toBe('user_42');
  });

  it('refuses a token signed with another secret', () => {
    const token = unsubscribeToken('user_42', SECRET);
    expect(readUnsubscribeToken(token, 'another-secret-entirely-0123456789')).toBeNull();
  });

  it('refuses a token whose account was swapped for someone else’s', () => {
    const token = unsubscribeToken('user_42', SECRET);
    const forged = token.replace('user_42', 'user_43');
    expect(readUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it('refuses a truncated or empty signature', () => {
    const token = unsubscribeToken('user_42', SECRET);
    expect(readUnsubscribeToken(token.slice(0, -4), SECRET)).toBeNull();
    expect(readUnsubscribeToken('user_42.', SECRET)).toBeNull();
    expect(readUnsubscribeToken('user_42', SECRET)).toBeNull();
    expect(readUnsubscribeToken('', SECRET)).toBeNull();
    expect(readUnsubscribeToken('.abc', SECRET)).toBeNull();
  });

  it('gives each account its own signature', () => {
    expect(unsubscribeToken('user_1', SECRET)).not.toBe(unsubscribeToken('user_2', SECRET));
  });

  it('is URL-safe — it travels in a query string', () => {
    const token = unsubscribeToken('user_42', SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe('the link', () => {
  it('is absolute, hits our own route, and keeps the reader’s language', () => {
    const url = unsubscribeUrl('user_42', SECRET, 'fr');
    expect(url.startsWith('https://www.renderpro.app/api/emails/unsubscribe?token=')).toBe(true);
    expect(url).toContain('lang=fr');
    const token = decodeURIComponent(new URL(url).searchParams.get('token') ?? '');
    expect(readUnsubscribeToken(token, SECRET)).toBe('user_42');
  });
});
