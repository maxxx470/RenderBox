import { describe, it, expect } from 'vitest';
import { magicLinkEmail } from './email-templates';

describe('magicLinkEmail', () => {
  it('returns { subject, html, text } all non-empty', () => {
    const t = magicLinkEmail({ url: 'https://app.renderbox.test/connexion/verifier?token=abc' });
    expect(t.subject).toBeTruthy();
    expect(t.html).toBeTruthy();
    expect(t.text).toBeTruthy();
  });

  it('embeds the url in both html and text', () => {
    const t = magicLinkEmail({ url: 'https://app.renderbox.test/connexion/verifier?token=abc' });
    expect(t.html).toContain('https://app.renderbox.test/connexion/verifier?token=abc');
    expect(t.text).toContain('https://app.renderbox.test/connexion/verifier?token=abc');
  });

  it('html-escapes the url', () => {
    const t = magicLinkEmail({ url: 'https://x.test/?a=1&b=2' });
    expect(t.html).toContain('https://x.test/?a=1&amp;b=2');
  });

  it('renders "dans N minutes" when expiresAt is provided', () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const t = magicLinkEmail({ url: 'https://x.test', expiresAt });
    expect(t.text).toMatch(/dans 1[45] minutes/);
  });

  it('falls back to "bientôt" when expiresAt is omitted', () => {
    const t = magicLinkEmail({ url: 'https://x.test' });
    expect(t.text).toContain('expire bientôt');
  });

  it('falls back to "bientôt" when expiresAt is already in the past', () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const t = magicLinkEmail({ url: 'https://x.test', expiresAt });
    expect(t.text).toContain('expire bientôt');
  });
});
