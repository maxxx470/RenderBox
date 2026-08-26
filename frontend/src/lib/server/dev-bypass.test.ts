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

  it('is true only when both NODE_ENV=development AND DEV_BYPASS_AUTH=true', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_BYPASS_AUTH', 'true');
    expect(isDevBypassActive()).toBe(true);
  });

  it('exposes a fixed, stable fake user id/email', () => {
    expect(DEV_FAKE_USER_ID).toBe('dev-bypass-fake-user');
    expect(DEV_FAKE_USER_EMAIL).toBe('dev-bypass@localhost');
  });
});
