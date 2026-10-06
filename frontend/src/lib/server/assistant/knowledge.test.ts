import { describe, it, expect } from 'vitest';
import { buildRenderBoxDoc, buildSystemPrompt } from './knowledge';
import { fallbackReply } from './fallback';
import { PRICING_TIERS } from '@/lib/pricing-tiers';

describe('assistant knowledge', () => {
  const doc = buildRenderBoxDoc();

  it('covers every feature shipped so far', () => {
    for (const section of [
      'NAVIGATION',
      'IMAGE',
      'LES DEUX MOTEURS',
      'COMMENTER',
      'ENHANCE',
      'ABONNEMENTS',
      'Arbre du projet',
    ]) {
      expect(doc).toContain(section);
    }
  });

  it('reads the plans from pricing-tiers, not from a copy', () => {
    for (const tier of PRICING_TIERS)
      expect(doc).toContain(`${tier.generationsPerMonth} générations`);
  });

  it('never names an AI vendor', () => {
    const all = doc + buildSystemPrompt('renderbox', 'fr') + buildSystemPrompt('search', 'en');
    expect(all).not.toMatch(/gemini|openai|chatgpt|nano ?banana|gpt-image/i);
  });

  it('asks for the user language', () => {
    expect(buildSystemPrompt('renderbox', 'en')).toContain('Answer in English');
  });
});

describe('assistant fallback', () => {
  it('does not mistake a French « Comment … ? » for the Commenter mode', () => {
    expect(fallbackReply("Comment fonctionne l'abonnement ?", 'fr')).toContain('Découverte');
  });

  it('routes an edit question to the Commenter mode', () => {
    expect(fallbackReply("Comment modifier une partie d'un rendu ?", 'fr')).toContain('Commenter');
  });

  it('answers in English', () => {
    expect(fallbackReply('Which engine should I pick?', 'en')).toContain('Engine 2');
  });

  it('has a default answer', () => {
    expect(fallbackReply('xyz', 'fr')).toContain('assistant RenderBox');
  });
});
