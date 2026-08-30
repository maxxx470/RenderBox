import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isAuthDisabled,
  getAuthCta,
  AUTH_DISABLED_USER_ID,
  AUTH_DISABLED_USER_EMAIL,
} from './auth-disabled';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAuthDisabled', () => {
  it('is false when AUTH_DISABLED is unset', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    expect(isAuthDisabled()).toBe(false);
  });

  it('is true when AUTH_DISABLED=true, regardless of NODE_ENV (production included)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_DISABLED', 'true');
    expect(isAuthDisabled()).toBe(true);
  });

  it('is false for any value other than the exact string "true"', () => {
    vi.stubEnv('AUTH_DISABLED', '1');
    expect(isAuthDisabled()).toBe(false);
  });

  it('exposes a fixed, stable demo user id/email', () => {
    expect(AUTH_DISABLED_USER_ID).toBe('auth-disabled-demo-user');
    expect(AUTH_DISABLED_USER_EMAIL).toBe('demo@localhost');
  });
});

describe('getAuthCta', () => {
  it('returns /connexion when auth is not disabled', () => {
    vi.stubEnv('AUTH_DISABLED', '');
    expect(getAuthCta()).toBe('/connexion');
  });

  it('returns /app when auth is disabled', () => {
    vi.stubEnv('AUTH_DISABLED', 'true');
    expect(getAuthCta()).toBe('/app');
  });
});
