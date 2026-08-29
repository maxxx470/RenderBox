import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDevBypassActive, DEV_FAKE_USER_ID, DEV_FAKE_USER_EMAIL } from './dev-bypass';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isDevBypassActive', () => {
  it('is false when neither NODE_ENV=development nor DEV_BYPASS_AUTH=true are set', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_BYPASS_AUTH', '');
    expect(isDevBypassActive()).toBe(false);
  });

  it('is false when DEV_BYPASS_AUTH=true but NODE_ENV is not development (e.g. a stray prod/preview var)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');
    expect(isDevBypassActive()).toBe(false);
  });

  it('is false when NODE_ENV=development but DEV_BYPASS_AUTH is unset', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_BYPASS_AUTH', '');
    expect(isDevBypassActive()).toBe(false);
  });

  it('is true when NODE_ENV=development AND DEV_BYPASS_AUTH=true', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');
    expect(isDevBypassActive()).toBe(true);
  });

  it('is false outside development when DEV_BYPASS_AUTH=true but AUTH_BYPASS_ALLOW_PROD is unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');
    vi.stubEnv('AUTH_BYPASS_ALLOW_PROD', '');
    expect(isDevBypassActive()).toBe(false);
  });

  it('is true outside development when BOTH DEV_BYPASS_AUTH=true AND AUTH_BYPASS_ALLOW_PROD=true (explicit prod override)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');
    vi.stubEnv('AUTH_BYPASS_ALLOW_PROD', 'true');
    expect(isDevBypassActive()).toBe(true);
  });

  it('is false when AUTH_BYPASS_ALLOW_PROD=true but DEV_BYPASS_AUTH is unset (still requires the base flag)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_BYPASS_AUTH', '');
    vi.stubEnv('AUTH_BYPASS_ALLOW_PROD', 'true');
    expect(isDevBypassActive()).toBe(false);
  });

  it('exposes a fixed, stable fake user id/email', () => {
    expect(DEV_FAKE_USER_ID).toBe('dev-bypass-fake-user');
    expect(DEV_FAKE_USER_EMAIL).toBe('dev-bypass@localhost');
  });
});
