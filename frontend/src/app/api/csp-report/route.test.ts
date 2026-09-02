import { describe, it, expect } from 'vitest';
import { summarizeReport } from './route';

describe('summarizeReport', () => {
  it('keeps only the fields worth logging', () => {
    const summary = summarizeReport({
      'csp-report': {
        'document-uri': 'https://renderbox.app/app',
        'violated-directive': 'script-src',
        'blocked-uri': 'https://evil.example/x.js',
        'script-sample': 'secret page contents',
        referrer: 'https://renderbox.app/',
      },
    });
    expect(summary).toEqual({
      'document-uri': 'https://renderbox.app/app',
      'violated-directive': 'script-src',
      'blocked-uri': 'https://evil.example/x.js',
    });
  });

  it('truncates long attacker-controlled values', () => {
    const summary = summarizeReport({
      'csp-report': { 'blocked-uri': 'x'.repeat(5000), 'violated-directive': 'img-src' },
    });
    expect(summary?.['blocked-uri']).toHaveLength(300);
  });

  it('ignores non-string fields rather than logging objects', () => {
    const summary = summarizeReport({
      'csp-report': { 'blocked-uri': { nested: true }, 'violated-directive': 'img-src' },
    });
    expect(summary).toEqual({ 'violated-directive': 'img-src' });
  });

  it('returns null for anything that is not a violation report', () => {
    expect(summarizeReport(null)).toBeNull();
    expect(summarizeReport('a string')).toBeNull();
    expect(summarizeReport({})).toBeNull();
    expect(summarizeReport({ 'csp-report': {} })).toBeNull();
  });
});
