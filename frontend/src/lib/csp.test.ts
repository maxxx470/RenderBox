import { describe, it, expect } from 'vitest';
import { buildCsp } from './csp';

const base = { nonce: 'test-nonce', isProduction: true, enforce: false } as const;

describe('buildCsp', () => {
  it('reports without enforcing by default, so a wrong policy cannot break the site', () => {
    expect(buildCsp({ ...base }).headerName).toBe('Content-Security-Policy-Report-Only');
  });

  it('enforces only when explicitly asked', () => {
    expect(buildCsp({ ...base, enforce: true }).headerName).toBe('Content-Security-Policy');
  });

  it("carries the request's nonce into script-src", () => {
    expect(buildCsp({ ...base }).policy).toContain("'nonce-test-nonce'");
  });

  it('allows blob: images — the reference preview is an object URL', () => {
    expect(buildCsp({ ...base }).policy).toContain('img-src');
    expect(buildCsp({ ...base }).policy).toMatch(/img-src[^;]*blob:/);
  });

  it('keeps inline styles allowed — style attributes cannot take a nonce', () => {
    expect(buildCsp({ ...base }).policy).toMatch(/style-src[^;]*'unsafe-inline'/);
  });

  it('names no Sentry host when no DSN is configured', () => {
    const policy = buildCsp({ ...base }).policy;
    expect(policy).toMatch(/connect-src 'self'(;|$)/);
    expect(policy).not.toContain('sentry.io');
  });

  it('allows the Sentry ingest hosts once a DSN is set', () => {
    const policy = buildCsp({ ...base, sentryDsn: 'https://x@y.ingest.sentry.io/1' }).policy;
    expect(policy).toContain('https://*.ingest.sentry.io');
  });

  it('relaxes script-src in development, where Next injects eval-based tooling', () => {
    const policy = buildCsp({ ...base, isProduction: false }).policy;
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('points violations at the collector route', () => {
    expect(buildCsp({ ...base }).policy).toContain('report-uri /api/csp-report');
  });
});
