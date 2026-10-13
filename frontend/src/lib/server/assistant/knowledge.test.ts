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
      expect(doc).toContain(`${tier.creditsPerMonth.toLocaleString('fr-FR')} crédits`);
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
    expect(fallbackReply('Which engine should I pick?', 'en')).toContain('Pixel AI');
  });

  it('has a default answer', () => {
    expect(fallbackReply('xyz', 'fr')).toContain('assistant RenderPro');
  });
});

describe('assistant help on materials (3C.5.5)', () => {
  const doc = buildRenderBoxDoc();

  it('says materials are per image and the old sheet is no longer sent on its own', () => {
    expect(doc).toContain('chaque image a ses propres matériaux');
    expect(doc).toContain("n'est plus transmise automatiquement au moteur, pour aucune image");
  });

  it('says a row of the old sheet must be attached explicitly, to one image only', () => {
    expect(doc).toContain('il faut la rattacher explicitement à une image');
    expect(doc).toContain('Rattacher des lignes à cette image');
    expect(doc).toContain("Une ligne ne s'applique qu'à une seule image");
  });

  it('says changing, hiding or cancelling an attached face frees the row', () => {
    expect(doc).toMatch(
      /Modifier, masquer ou annuler la correction d'une face rattachée[^.]*libère la ligne/,
    );
  });

  it('never says the old sheet still feeds the renders, nor that it is read only', () => {
    expect(doc).not.toMatch(/détecte les matériaux du projet|en lecture seule/);
  });

  it('the keyword answer about materials tells the same, in both languages', () => {
    const fr = fallbackReply('Comment marchent les matériaux ?', 'fr');
    expect(fr).toContain('Chaque image a ses propres matériaux');
    expect(fr).toContain('rattachez-la explicitement à une image');
    expect(fr).not.toMatch(/matériaux de votre projet/);
    const en = fallbackReply('How do materials work?', 'en');
    expect(en).toContain('Each image has its own materials');
    expect(en).toContain('attach it explicitly to an image');
  });
});
