// planLegacyAttach (étape 3C.5.1): which rows of the old project sheet can be
// attached to ONE image on the user's request, and what that would write.
// Pure — the attach route (3C.5.2) writes the plan in one transaction.
import { describe, it, expect } from 'vitest';
import {
  MAX_LABEL_LENGTH as PANEL_MAX_LABEL_LENGTH,
  MAX_VALUE_LENGTH as PANEL_MAX_VALUE_LENGTH,
} from '@/app/app/node-materials-state';
import {
  LEGACY_ATTACH_MAX_LABEL_LENGTH,
  LEGACY_ATTACH_MAX_ROWS,
  LEGACY_ATTACH_MAX_VALUE_LENGTH,
  planLegacyAttach,
  type LegacyAttachInput,
  type LegacyMaterialRow,
  type TargetCorrection,
} from './legacy-attach';
import type { NodeMaterialDetection } from './resolve';

const P = 'project-1';
const OTHER_P = 'project-2';
const N = 'node-a';
const OTHER_N = 'node-b';

const row = (id: string, face: string, valeur: string, extra: Partial<LegacyMaterialRow> = {}) =>
  ({ id, projectId: P, face, valeur, attachedNodeId: null, ...extra }) satisfies LegacyMaterialRow;

const detection = (
  face: string,
  valeur: string,
  extra: Partial<NodeMaterialDetection> = {},
): NodeMaterialDetection => ({ nodeId: N, face, valeur, confidence: 80, position: 0, ...extra });

const correction = (
  face: string,
  valeur: string | null,
  extra: Partial<TargetCorrection> = {},
): TargetCorrection => ({
  id: `c-${face}`,
  nodeId: N,
  face,
  valeur,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  legacyMaterialId: null,
  ...extra,
});

function plan(over: Partial<LegacyAttachInput>) {
  return planLegacyAttach({
    projectId: P,
    nodeId: N,
    requestedIds: [],
    legacy: [],
    detections: [],
    corrections: [],
    ...over,
  });
}

describe('planLegacyAttach — rows that can be attached', () => {
  it('a canonical old row becomes a correction of the image: the value copied, no label', () => {
    const result = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'toiture', 'Ardoise naturelle')],
    });
    expect(result).toEqual({
      ok: true,
      batchError: null,
      lines: [
        {
          materialId: 'm1',
          status: 'attach',
          face: 'toiture',
          faceLabel: null,
          valeur: 'Ardoise naturelle',
          replaces: null,
          reattach: false,
        },
      ],
      writes: [result.lines[0]],
    });
  });

  it('an old face written in words keeps its words as the label, under its canonical key', () => {
    const [line] = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', '  Façade   principale ', 'Enduit blanc')],
    }).lines;
    expect(line).toMatchObject({
      status: 'attach',
      face: 'facade_principale',
      faceLabel: 'Façade principale',
    });
  });

  it('the value is normalised as a typed correction is: line breaks and spaces collapsed', () => {
    const [line] = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'sol', '  Béton\nciré \r\n poli ')],
    }).lines;
    expect(line).toMatchObject({ status: 'attach', valeur: 'Béton ciré poli' });
  });

  it('says which detection of the image it will replace (a correction beats a detection)', () => {
    const [line] = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'toiture', 'Ardoise')],
      detections: [
        detection('toiture', 'Tuile', { position: 2, confidence: 91 }),
        detection('Toiture', 'Zinc', { position: 1, confidence: 60 }),
        detection('toiture', '   ', { position: 0 }),
        detection('toiture', 'Bac acier', { nodeId: OTHER_N, position: 0 }),
      ],
    }).lines;
    expect(line).toMatchObject({ status: 'attach', replaces: { valeur: 'Zinc', confidence: 60 } });
  });

  it('keeps the request order, each id once', () => {
    const result = plan({
      requestedIds: ['m2', 'm1', 'm2'],
      legacy: [row('m1', 'toiture', 'Ardoise'), row('m2', 'sol', 'Béton')],
    });
    expect(result.lines.map((l) => l.materialId)).toEqual(['m2', 'm1']);
    expect(result.writes.map((l) => l.materialId)).toEqual(['m2', 'm1']);
  });

  it('a value of exactly 500 characters fits', () => {
    const [line] = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'sol', 'a'.repeat(500))],
    }).lines;
    expect(line).toMatchObject({ status: 'attach' });
  });

  it('a row still marked as attached here, with no correction left, may be attached again', () => {
    const [line] = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'toiture', 'Ardoise', { attachedNodeId: N })],
    }).lines;
    expect(line).toMatchObject({ status: 'attach', reattach: true });
  });
});

describe('planLegacyAttach — never overwrite, never borrow', () => {
  it('a face the image already corrects with a value is blocked', () => {
    const result = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'toiture', 'Ardoise')],
      corrections: [correction('toiture', 'Zinc')],
    });
    expect(result.lines[0]).toEqual({
      materialId: 'm1',
      status: 'blocked',
      reason: 'face_corrected',
      face: 'toiture',
      correction: 'value',
    });
    expect(result).toMatchObject({ ok: false, writes: [] });
  });

  it('a face the image masked (Masquer) is blocked: the removal keeps its meaning', () => {
    for (const valeur of [null, '  ']) {
      expect(
        plan({
          requestedIds: ['m1'],
          legacy: [row('m1', 'Toiture', 'Ardoise')],
          corrections: [correction('toiture', valeur)],
        }).lines[0],
      ).toMatchObject({ status: 'blocked', reason: 'face_corrected', correction: 'removed' });
    }
  });

  it('another image’s corrections and detections do not count', () => {
    const [line] = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'toiture', 'Ardoise')],
      corrections: [correction('toiture', 'Zinc', { nodeId: OTHER_N })],
      detections: [detection('toiture', 'Tuile', { nodeId: OTHER_N })],
    }).lines;
    expect(line).toMatchObject({ status: 'attach', replaces: null });
  });

  it('a row attached to another image is blocked, naming it (one image per row)', () => {
    expect(
      plan({
        requestedIds: ['m1'],
        legacy: [row('m1', 'toiture', 'Ardoise', { attachedNodeId: OTHER_N })],
      }).lines[0],
    ).toEqual({
      materialId: 'm1',
      status: 'blocked',
      reason: 'attached_elsewhere',
      face: 'toiture',
      attachedNodeId: OTHER_N,
    });
  });

  it('an unknown row, or a row of another project, is not found', () => {
    const result = plan({
      requestedIds: ['nope', 'm9'],
      legacy: [{ ...row('m9', 'toiture', 'Ardoise'), projectId: OTHER_P }],
    });
    expect(result.lines).toEqual([
      { materialId: 'nope', status: 'blocked', reason: 'not_found', face: null },
      { materialId: 'm9', status: 'blocked', reason: 'not_found', face: null },
    ]);
    expect(result.ok).toBe(false);
  });

  it('a face with no canonical key is refused, never truncated', () => {
    const result = plan({
      requestedIds: ['m1', 'm2'],
      legacy: [row('m1', '東', 'Bois'), row('m2', 'a'.repeat(65), 'Bois')],
    });
    expect(result.lines).toEqual([
      { materialId: 'm1', status: 'blocked', reason: 'invalid_face', face: null, detail: 'empty' },
      {
        materialId: 'm2',
        status: 'blocked',
        reason: 'invalid_face',
        face: null,
        detail: 'too_long',
      },
    ]);
  });

  it('an empty value, or one longer than 500 characters, is refused, never truncated', () => {
    const result = plan({
      requestedIds: ['m1', 'm2'],
      legacy: [row('m1', 'sol', ' \n '), row('m2', 'toiture', 'a'.repeat(501))],
    });
    expect(result.lines).toEqual([
      {
        materialId: 'm1',
        status: 'blocked',
        reason: 'invalid_value',
        face: 'sol',
        detail: 'empty',
      },
      {
        materialId: 'm2',
        status: 'blocked',
        reason: 'invalid_value',
        face: 'toiture',
        detail: 'too_long',
      },
    ]);
  });

  it('two rows landing on one face are both blocked, each naming the other — none is chosen', () => {
    const result = plan({
      requestedIds: ['m1', 'm2', 'm3'],
      legacy: [
        row('m1', 'facade principale', 'Enduit'),
        row('m2', 'facade_principale', 'Brique'),
        row('m3', 'sol', 'Béton'),
      ],
    });
    expect(result.lines).toEqual([
      {
        materialId: 'm1',
        status: 'blocked',
        reason: 'duplicate_face',
        face: 'facade_principale',
        withIds: ['m2'],
      },
      {
        materialId: 'm2',
        status: 'blocked',
        reason: 'duplicate_face',
        face: 'facade_principale',
        withIds: ['m1'],
      },
      expect.objectContaining({ materialId: 'm3', status: 'attach' }),
    ]);
    expect(result).toMatchObject({ ok: false, writes: [] });
  });
});

describe('planLegacyAttach — all or nothing (D2), asked twice (D6)', () => {
  it('one blocked row and nothing is written, though the other rows are fine', () => {
    const result = plan({
      requestedIds: ['m1', 'm2'],
      legacy: [row('m1', 'sol', 'Béton'), row('m2', 'toiture', 'Ardoise')],
      corrections: [correction('toiture', 'Zinc')],
    });
    expect(result.ok).toBe(false);
    expect(result.writes).toEqual([]);
    expect(result.lines[0]).toMatchObject({ materialId: 'm1', status: 'attach' });
  });

  it('a row already attached to this image is "already here": not an error, nothing to write', () => {
    const result = plan({
      requestedIds: ['m1'],
      legacy: [row('m1', 'toiture', 'Ardoise', { attachedNodeId: N })],
      corrections: [correction('toiture', 'Ardoise', { legacyMaterialId: 'm1' })],
    });
    expect(result).toEqual({
      ok: true,
      batchError: null,
      lines: [{ materialId: 'm1', status: 'already_here', face: 'toiture' }],
      writes: [],
    });
  });

  it('still "already here" once the user changed or masked the attached correction', () => {
    for (const valeur of ['Zinc', null]) {
      expect(
        plan({
          requestedIds: ['m1'],
          legacy: [row('m1', 'toiture', 'Ardoise', { attachedNodeId: N })],
          corrections: [correction('toiture', valeur, { legacyMaterialId: 'm1' })],
        }).lines[0],
      ).toMatchObject({ status: 'already_here' });
    }
  });

  it('already here beside new rows: only the new ones are written', () => {
    const result = plan({
      requestedIds: ['m1', 'm2'],
      legacy: [row('m1', 'toiture', 'Ardoise', { attachedNodeId: N }), row('m2', 'sol', 'Béton')],
      corrections: [correction('toiture', 'Ardoise', { legacyMaterialId: 'm1' })],
    });
    expect(result.ok).toBe(true);
    expect(result.writes.map((w) => w.materialId)).toEqual(['m2']);
  });

  it('an empty request, or one over the limit, is refused as a whole', () => {
    expect(plan({ requestedIds: [] })).toEqual({
      ok: false,
      batchError: 'empty',
      lines: [],
      writes: [],
    });
    const ids = Array.from({ length: LEGACY_ATTACH_MAX_ROWS + 1 }, (_, i) => `m${i}`);
    expect(plan({ requestedIds: ids })).toMatchObject({ ok: false, batchError: 'too_many' });
    const max = ids.slice(0, LEGACY_ATTACH_MAX_ROWS);
    expect(
      plan({ requestedIds: max, legacy: max.map((id) => row(id, `face ${id}`, 'Bois')) }),
    ).toMatchObject({ ok: true, batchError: null });
  });
});

describe('planLegacyAttach — contract', () => {
  it('never mutates its inputs', () => {
    const input: LegacyAttachInput = {
      projectId: P,
      nodeId: N,
      requestedIds: Object.freeze(['m2', 'm1']),
      legacy: Object.freeze([
        Object.freeze(row('m1', 'Toiture', 'Ardoise')),
        Object.freeze(row('m2', 'sol', 'Béton')),
      ]),
      detections: Object.freeze([Object.freeze(detection('toiture', 'Tuile'))]),
      corrections: Object.freeze([Object.freeze(correction('menuiseries', 'Alu'))]),
    };
    const copy = structuredClone(input);
    planLegacyAttach(input);
    expect(input).toEqual(copy);
  });

  it('uses the same bounds as the per-face corrections and the panel', () => {
    expect(LEGACY_ATTACH_MAX_VALUE_LENGTH).toBe(PANEL_MAX_VALUE_LENGTH);
    expect(LEGACY_ATTACH_MAX_LABEL_LENGTH).toBe(PANEL_MAX_LABEL_LENGTH);
  });
});
