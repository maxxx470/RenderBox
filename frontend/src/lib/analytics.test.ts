// What may be measured, and what the visitor's answer does (2026-10-26).
//
// The suite runs in plain Node (vitest.config.ts), so the browser storage
// these helpers read is stood up here — which also lets a refusing storage be
// played exactly as a private window would.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CONSENT_KEY, isMeasurablePath, readConsent, writeConsent } from './analytics';

function fakeStorage(mode: 'works' | 'throws' = 'works') {
  const held = new Map<string, string>();
  return {
    getItem(k: string) {
      if (mode === 'throws') throw new Error('site data blocked');
      return held.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      if (mode === 'throws') throw new Error('site data blocked');
      held.set(k, v);
    },
  };
}

const give = (storage: ReturnType<typeof fakeStorage>) => {
  (globalThis as { window?: unknown }).window = { localStorage: storage };
};

beforeEach(() => give(fakeStorage()));
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('what may be measured', () => {
  it('the public pages', () => {
    for (const p of ['/', '/info', '/legal', '/exemple', '/connexion', '/paiement/retour']) {
      expect(isMeasurablePath(p), p).toBe(true);
    }
  });

  it('never the signed-in app, the back-office or the account', () => {
    // Their addresses carry image and project ids, and an address is content.
    for (const p of [
      '/app',
      '/app/generer',
      '/app/images',
      '/admin',
      '/admin/utilisateurs/u1',
      '/parametres',
      '/bienvenue',
    ]) {
      expect(isMeasurablePath(p), p).toBe(false);
    }
  });

  it('a page whose name merely starts with a private one is still public', () => {
    expect(isMeasurablePath('/application')).toBe(true);
    expect(isMeasurablePath('/apprendre')).toBe(true);
  });
});

describe('the visitor’s answer', () => {
  it('is remembered, whichever it is: the question is asked once', () => {
    expect(readConsent()).toBeNull();
    writeConsent('denied');
    expect(readConsent()).toBe('denied');
    writeConsent('granted');
    expect(readConsent()).toBe('granted');
  });

  it('is read as « no answer » when the browser holds anything else', () => {
    const s = fakeStorage();
    s.setItem(CONSENT_KEY, 'oui');
    give(s);
    expect(readConsent()).toBeNull();
  });

  it('never throws when storage is refused: no answer, so nothing measured', () => {
    give(fakeStorage('throws'));
    expect(readConsent()).toBeNull();
    expect(() => writeConsent('granted')).not.toThrow();
  });
});
