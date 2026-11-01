// /admin/relances — the page where the nine relances are READ (2026-11-01).
//
// Two things must stay true, and both are cheap to check at the source:
//
//  1. The preview can never write to a user. Its recipient is the signed-in
//     admin's own address, never anything from the request, and it writes no
//     ReengagementEmail row — so a preview cannot spend somebody's place in
//     the sequence.
//  2. The automatic pass stays behind one switch, so the first real send
//     happens when the owner says so and not when the keys happen to land.
//
// And every relance needs its label in BOTH dictionaries, or the page shows
// a raw key like « admin.relances.name.winback » to the owner.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fr from '@/lib/i18n/dictionaries/fr';
import en from '@/lib/i18n/dictionaries/en';
import { REENGAGEMENT_KINDS } from '@/lib/server/reengagement/schedule';

const SRC = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const PREVIEW = read('app/api/admin/reengagement/preview/route.ts');
const CRON = read('app/api/cron/reengagement/route.ts');
const NAV = read('app/admin/AdminNav.tsx');

describe('the preview cannot reach a user', () => {
  it('sends to the signed-in admin’s own address', () => {
    expect(PREVIEW).toContain('to: auth.admin.email');
  });

  it('never takes the recipient from the request', () => {
    // No `to` read out of the query string or a JSON body.
    expect(PREVIEW).not.toMatch(/searchParams\.get\(\s*['"]to['"]/);
    expect(PREVIEW).not.toMatch(/to\s*[:=]\s*(body|json|params)\./);
  });

  it('writes no row, so it spends nobody’s place in the sequence', () => {
    expect(PREVIEW).not.toContain('reengagementEmail');
  });

  it('is admin-only, CSRF-checked on the send, and audited', () => {
    expect(PREVIEW).toContain("requireAdmin('ADMIN')");
    expect(PREVIEW).toContain('verifyCsrf(req)');
    expect(PREVIEW).toContain("action: 'reengagement.preview_send'");
  });

  it('refuses a kind it does not know', () => {
    expect(PREVIEW).toContain('UNKNOWN_KIND');
    expect(PREVIEW).toContain('REENGAGEMENT_KINDS.includes');
  });
});

describe('the automatic pass stays behind one switch', () => {
  it('the cron reads REENGAGEMENT_ENABLED and stops when it is not set', () => {
    expect(CRON).toContain('REENGAGEMENT_ENABLED');
    expect(CRON).toContain("skipped: 'disabled'");
  });

  it('and the switch is read BEFORE anything is sent', () => {
    expect(CRON.indexOf('REENGAGEMENT_ENABLED')).toBeLessThan(CRON.indexOf('runReengagement('));
  });
});

describe('every relance is named in both languages', () => {
  for (const kind of REENGAGEMENT_KINDS) {
    it(kind, () => {
      const key = `admin.relances.name.${kind}`;
      expect(Object.keys(fr), `fr: ${key}`).toContain(key);
      expect(Object.keys(en), `en: ${key}`).toContain(key);
    });
  }

  it('and the page is reachable from the admin navigation', () => {
    expect(NAV).toContain("href: '/admin/relances'");
    expect(Object.keys(fr)).toContain('admin.navRelances');
    expect(Object.keys(en)).toContain('admin.navRelances');
  });
});
