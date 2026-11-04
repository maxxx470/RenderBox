import { describe, it, expect } from 'vitest';
import { isDeliverableAddress } from './deliverable';

describe('isDeliverableAddress', () => {
  it('refuses the five seed accounts that are really in the production base', () => {
    // Read out of production on 2026-11-04, before the first pass ever
    // ran. Each one would have been a hard bounce on the first send.
    for (const email of [
      'dev-bypass@localhost',
      'demo@localhost',
      'admin@example.com',
      'user@example.com',
      'unverified@example.com',
    ]) {
      expect(isDeliverableAddress(email), email).toBe(false);
    }
  });

  it('accepts the real sign-ups, including the ones that are not Togolese', () => {
    for (const email of [
      'biledamax@gmail.com',
      'aungbhoneminconstructionkobhon@gmail.com',
      'mario.pienz@hotmail.com',
      'thetnyi.sketch@gmail.com',
    ]) {
      expect(isDeliverableAddress(email), email).toBe(true);
    }
  });

  it('refuses every TLD reserved by RFC 2606 / 6761, at any depth', () => {
    for (const email of [
      'a@foo.test',
      'a@foo.example',
      'a@foo.invalid',
      'a@foo.localhost',
      'a@deep.sub.test',
      'a@localhost',
      'a@test',
    ]) {
      expect(isDeliverableAddress(email), email).toBe(false);
    }
  });

  it('is case- and trailing-dot-insensitive, so neither can slip past it', () => {
    expect(isDeliverableAddress('A@Example.COM')).toBe(false);
    expect(isDeliverableAddress('a@example.com.')).toBe(false);
    expect(isDeliverableAddress('a@LOCALHOST')).toBe(false);
  });

  it('treats anything unparseable as undeliverable rather than guessing', () => {
    for (const email of [
      null,
      undefined,
      '',
      'no-at-sign',
      '@nolocal.com',
      'trailing@',
      'a@b c.com',
    ]) {
      expect(isDeliverableAddress(email as string | null)).toBe(false);
    }
  });

  it('is not a spam filter: a throwaway provider that does accept mail passes', () => {
    // Two such addresses are in production. Excluding them would be a
    // judgement call, not a fact, and such lists drift — so the guard
    // deliberately lets them through.
    expect(isDeliverableAddress('marcusjreed@uberip.com')).toBe(true);
    expect(isDeliverableAddress('wodwalnl@guerrillamailblock.com')).toBe(true);
  });
});
