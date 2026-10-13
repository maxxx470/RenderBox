// The badge of a face of the materials panel (étape 3C.5.5): decided by the
// server's answer for that face — its stored correction origin — never by
// the old project sheet.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { faceBadge, holdsLegacyRow } from './face-origin-badge';
import type { NodeFaceListItem } from './node-materials-client';

const face = (over: Partial<NodeFaceListItem>): NodeFaceListItem => ({
  face: 'toiture',
  faceLabel: null,
  valeur: 'Tuile',
  origin: 'detection',
  confidence: 80,
  correction: 'none',
  correctionOrigin: null,
  detected: { valeur: 'Tuile', confidence: 80 },
  ...over,
});

const attached = face({
  valeur: 'Ardoise',
  origin: 'correction',
  confidence: null,
  correction: 'value',
  correctionOrigin: 'legacy_attach',
});

describe('faceBadge — what a face’s badge says (3C.5.5)', () => {
  it('a row of the old sheet attached and untouched: "Ancienne fiche"', () => {
    expect(faceBadge(attached)).toBe('legacy');
  });

  it('the same row once the user changed it (the server now says "user"): a correction, no longer the old sheet’s', () => {
    const changed: NodeFaceListItem = { ...attached, valeur: 'Zinc', correctionOrigin: 'user' };
    expect(faceBadge(changed)).toBe('correction');
  });

  it('an attached correction cancelled: the detection under it, or nothing', () => {
    expect(faceBadge(face({}))).toBe('detection');
    expect(
      faceBadge(face({ valeur: null, origin: null, confidence: null, detected: null })),
    ).toBeNull();
  });

  it('a correction the user typed: a correction', () => {
    expect(
      faceBadge(
        face({
          origin: 'correction',
          correction: 'value',
          correctionOrigin: 'user',
          detected: null,
        }),
      ),
    ).toBe('correction');
  });

  it('a detected value without correction: the detection', () => {
    expect(faceBadge(face({}))).toBe('detection');
  });

  it('a masked face: masked, whoever masked it', () => {
    const masked = face({ valeur: null, origin: null, confidence: null, correction: 'removed' });
    expect(faceBadge({ ...masked, correctionOrigin: 'user' })).toBe('hidden');
    expect(faceBadge({ ...masked, correctionOrigin: 'legacy_attach' })).toBe('hidden');
  });
});

describe('holdsLegacyRow — the old sheet must be read again after acting on it', () => {
  it('only while the server says the correction still comes from the old sheet', () => {
    expect(holdsLegacyRow(attached)).toBe(true);
    expect(holdsLegacyRow({ ...attached, correctionOrigin: 'user' })).toBe(false);
    expect(holdsLegacyRow(face({}))).toBe(false);
    expect(holdsLegacyRow(undefined)).toBe(false);
  });
});

describe('the panel takes its badge from the server, not from the old sheet', () => {
  const panel = readFileSync(join(process.cwd(), 'src/app/app/NodeMaterialsPanel.tsx'), 'utf8');
  const badge = panel.slice(
    panel.indexOf('function OriginBadge('),
    panel.indexOf('\n}\n', panel.indexOf('function OriginBadge(')),
  );

  it('the badge reads one face, through faceBadge', () => {
    expect(badge).toContain('function OriginBadge({ item }: { item: NodeFaceListItem })');
    expect(badge).toContain('faceBadge(item)');
  });

  it('nothing in the panel matches faces against the old sheet’s attach marks', () => {
    expect(panel).not.toMatch(/attachedFacesOf|attachedNodeId|fromLegacy/);
    // A top-level component given one face: no row of the old sheet reaches it.
    expect(badge).not.toMatch(/MaterialRow|legacyFaces|materials=/);
  });
});
