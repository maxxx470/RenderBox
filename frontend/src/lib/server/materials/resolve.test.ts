import { describe, it, expect } from 'vitest';
import {
  resolveMaterials,
  type NodeMaterialCorrection,
  type NodeMaterialDetection,
  type ResolveMaterialsInput,
} from './resolve';

const A = 'node-a';
const B = 'node-b';

const det = (
  face: string,
  valeur: string,
  position: number,
  overrides: Partial<NodeMaterialDetection> = {},
): NodeMaterialDetection => ({ nodeId: A, face, valeur, confidence: 80, position, ...overrides });

let seq = 0;
const cor = (
  face: string,
  valeur: string | null,
  overrides: Partial<NodeMaterialCorrection> = {},
): NodeMaterialCorrection => ({
  id: `c-${String(++seq).padStart(3, '0')}`,
  nodeId: A,
  face,
  valeur,
  createdAt: new Date('2026-10-10T10:00:00Z'),
  ...overrides,
});

const at = (iso: string) => new Date(iso);

function resolve(partial: Partial<ResolveMaterialsInput>) {
  return resolveMaterials({
    nodeId: A,
    detections: [],
    corrections: [],
    includeDetections: true,
    ...partial,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe('resolveMaterials — isolation by image', () => {
  it('1. returns a detection of the active node, with its confidence and origin', () => {
    expect(resolve({ detections: [det('toiture', 'Zinc', 0, { confidence: 91 })] })).toEqual([
      { face: 'toiture', valeur: 'Zinc', origin: 'detection', nodeId: A, confidence: 91 },
    ]);
  });

  it('2. ignores the detections of any other node', () => {
    expect(
      resolve({
        detections: [
          det('facade_principale', 'Bardage bois', 0, { nodeId: B }),
          det('toiture', 'Zinc', 1),
        ],
      }),
    ).toEqual([
      { face: 'toiture', valeur: 'Zinc', origin: 'detection', nodeId: A, confidence: 80 },
    ]);
  });

  it('3. ignores the corrections of any other node, even for a face detected here', () => {
    expect(
      resolve({
        detections: [det('facade_principale', 'Enduit blanc', 0)],
        corrections: [
          cor('facade_principale', 'Pierre', { nodeId: B }),
          cor('toiture', 'Ardoise', { nodeId: B }),
        ],
      }),
    ).toEqual([
      {
        face: 'facade_principale',
        valeur: 'Enduit blanc',
        origin: 'detection',
        nodeId: A,
        confidence: 80,
      },
    ]);
  });

  it('never borrows from another node, even when the active node has nothing', () => {
    expect(
      resolve({
        detections: [det('toiture', 'Zinc', 0, { nodeId: B })],
        corrections: [cor('sol', 'Béton', { nodeId: B })],
      }),
    ).toEqual([]);
  });

  it('throws when no active node is given', () => {
    expect(() => resolve({ nodeId: '' })).toThrow('nodeId is required');
    expect(() => resolve({ nodeId: '   ' })).toThrow('nodeId is required');
  });
});

describe('resolveMaterials — corrections win', () => {
  it('4. a correction replaces the detection of the same face, whatever its confidence', () => {
    expect(
      resolve({
        detections: [det('facade_principale', 'Enduit blanc', 0, { confidence: 100 })],
        corrections: [cor('facade_principale', 'Bardage bois')],
      }),
    ).toEqual([
      { face: 'facade_principale', valeur: 'Bardage bois', origin: 'correction', nodeId: A },
    ]);
  });

  it('a correction carries no confidence score', () => {
    const [only] = resolve({
      detections: [det('toiture', 'Zinc', 0)],
      corrections: [cor('toiture', 'Ardoise')],
    });
    expect(only).not.toHaveProperty('confidence');
  });

  it('5. a removal (null) excludes the face, and the detection cannot bring it back', () => {
    expect(
      resolve({
        detections: [det('facade_principale', 'Enduit blanc', 0), det('toiture', 'Zinc', 1)],
        corrections: [cor('facade_principale', null)],
      }),
    ).toEqual([
      { face: 'toiture', valeur: 'Zinc', origin: 'detection', nodeId: A, confidence: 80 },
    ]);
  });

  it('6. a correction for a face that was not detected adds that face', () => {
    expect(
      resolve({
        detections: [det('toiture', 'Zinc', 0)],
        corrections: [cor('garde_corps', 'Verre feuilleté')],
      }),
    ).toEqual([
      { face: 'toiture', valeur: 'Zinc', origin: 'detection', nodeId: A, confidence: 80 },
      { face: 'garde_corps', valeur: 'Verre feuilleté', origin: 'correction', nodeId: A },
    ]);
  });

  it('a removal for a face that was never detected adds nothing', () => {
    expect(resolve({ corrections: [cor('garde_corps', null)] })).toEqual([]);
  });

  it.each([[''], ['   '], ['\n\t']])(
    '13. a blank correction (%j) is a removal: it never lets the detection reappear',
    (blank) => {
      expect(
        resolve({
          detections: [det('facade_principale', 'Enduit blanc', 0)],
          corrections: [cor('facade_principale', blank)],
        }),
      ).toEqual([]);
    },
  );

  it('matches faces trimmed and case-insensitively, and keeps the spelling of the row used', () => {
    expect(
      resolve({
        detections: [det(' Toiture ', 'Zinc', 0), det('Sol', 'Béton', 1)],
        corrections: [cor('toiture', '  Ardoise  ')],
      }),
    ).toEqual([
      { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: A },
      { face: 'Sol', valeur: 'Béton', origin: 'detection', nodeId: A, confidence: 80 },
    ]);
  });
});

describe('resolveMaterials — detection policy', () => {
  const detections = [det('facade_principale', 'Enduit blanc', 0), det('toiture', 'Zinc', 1)];
  const corrections = [
    cor('toiture', 'Ardoise', { createdAt: at('2026-10-10T12:00:00Z') }),
    cor('menuiseries', 'Aluminium noir', { createdAt: at('2026-10-10T11:00:00Z') }),
    cor('sol', null),
  ];

  it('9. keeps a detection that no correction touches when detections are allowed', () => {
    expect(resolve({ detections, corrections, includeDetections: true })).toEqual([
      {
        face: 'facade_principale',
        valeur: 'Enduit blanc',
        origin: 'detection',
        nodeId: A,
        confidence: 80,
      },
      { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: A },
      { face: 'menuiseries', valeur: 'Aluminium noir', origin: 'correction', nodeId: A },
    ]);
  });

  it('7. includeDetections: false drops every detection but keeps valid corrections, oldest first', () => {
    expect(resolve({ detections, corrections, includeDetections: false })).toEqual([
      { face: 'menuiseries', valeur: 'Aluminium noir', origin: 'correction', nodeId: A },
      { face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: A },
    ]);
  });

  it('ignores a detection whose value is blank', () => {
    expect(resolve({ detections: [det('toiture', '  ', 0), det('sol', 'Béton', 1)] })).toEqual([
      { face: 'sol', valeur: 'Béton', origin: 'detection', nodeId: A, confidence: 80 },
    ]);
  });

  it('8. returns an empty list for empty input', () => {
    expect(resolve({})).toEqual([]);
    expect(resolve({ includeDetections: false })).toEqual([]);
  });
});

describe('resolveMaterials — deterministic order', () => {
  it('10. orders detected faces by position, whatever order they were read in', () => {
    const faces = resolve({
      detections: [
        det('sol', 'Béton', 2),
        det('facade_principale', 'Enduit', 0),
        det('toiture', 'Zinc', 1),
      ],
    }).map((m) => m.face);
    expect(faces).toEqual(['facade_principale', 'toiture', 'sol']);
  });

  it('a correction keeps the place of the face it replaces', () => {
    const faces = resolve({
      detections: [
        det('facade_principale', 'Enduit', 0),
        det('toiture', 'Zinc', 1),
        det('sol', 'Béton', 2),
      ],
      corrections: [cor('toiture', 'Ardoise')],
    }).map((m) => `${m.face}:${m.origin}`);
    expect(faces).toEqual(['facade_principale:detection', 'toiture:correction', 'sol:detection']);
  });

  it('orders added faces by creation date, then by id when dates are equal', () => {
    const same = at('2026-10-10T09:00:00Z');
    const faces = resolve({
      corrections: [
        cor('c', 'C', { id: 'c-2', createdAt: same }),
        cor('a', 'A', { id: 'c-9', createdAt: at('2026-10-10T10:00:00Z') }),
        cor('b', 'B', { id: 'c-1', createdAt: same }),
      ],
    }).map((m) => m.face);
    expect(faces).toEqual(['b', 'c', 'a']);
  });

  it('breaks equal positions by face name, never by input order', () => {
    const input = [det('toiture', 'Zinc', 0), det('facade', 'Enduit', 0)];
    expect(resolve({ detections: input }).map((m) => m.face)).toEqual(['facade', 'toiture']);
    expect(resolve({ detections: [...input].reverse() }).map((m) => m.face)).toEqual([
      'facade',
      'toiture',
    ]);
  });

  it('sorts a correction with an invalid date last, without breaking the order', () => {
    const faces = resolve({
      corrections: [
        cor('x', 'X', { createdAt: new Date('not a date') }),
        cor('y', 'Y', { createdAt: at('2026-10-10T08:00:00Z') }),
      ],
    }).map((m) => m.face);
    expect(faces).toEqual(['y', 'x']);
  });

  it('11. gives the same result twice, and the same result for any input order', () => {
    const detections = [det('toiture', 'Zinc', 1), det('facade_principale', 'Enduit', 0)];
    const corrections = [
      cor('menuiseries', 'Alu', { createdAt: at('2026-10-10T08:00:00Z') }),
      cor('toiture', 'Ardoise'),
    ];
    const first = resolve({ detections, corrections });
    expect(resolve({ detections, corrections })).toEqual(first);
    expect(
      resolve({ detections: [...detections].reverse(), corrections: [...corrections].reverse() }),
    ).toEqual(first);
  });
});

describe('resolveMaterials — duplicates (not expected by contract, resolved deterministically)', () => {
  it('14. two detections of one face: the lowest position wins', () => {
    expect(
      resolve({ detections: [det('toiture', 'Tuile', 3), det('Toiture', 'Zinc', 1)] }),
    ).toEqual([
      { face: 'Toiture', valeur: 'Zinc', origin: 'detection', nodeId: A, confidence: 80 },
    ]);
  });

  it('14. two detections of one face at the same position: the smallest value wins', () => {
    const input = [det('toiture', 'Zinc', 0), det('toiture', 'Ardoise', 0)];
    expect(resolve({ detections: input })[0]?.valeur).toBe('Ardoise');
    expect(resolve({ detections: [...input].reverse() })[0]?.valeur).toBe('Ardoise');
  });

  it('14. two corrections of one face: the latest wins, even over an earlier removal', () => {
    expect(
      resolve({
        detections: [det('toiture', 'Zinc', 0)],
        corrections: [
          cor('toiture', null, { createdAt: at('2026-10-10T08:00:00Z') }),
          cor('toiture', 'Ardoise', { createdAt: at('2026-10-10T09:00:00Z') }),
        ],
      }),
    ).toEqual([{ face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: A }]);
  });

  it('14. two corrections of one face: a later removal wins over an earlier value', () => {
    expect(
      resolve({
        detections: [det('toiture', 'Zinc', 0)],
        corrections: [
          cor('toiture', 'Ardoise', { createdAt: at('2026-10-10T08:00:00Z') }),
          cor('toiture', null, { createdAt: at('2026-10-10T09:00:00Z') }),
        ],
      }),
    ).toEqual([]);
  });

  it('14. two corrections of one face with the same date: the greatest id wins, whatever the input order', () => {
    const same = at('2026-10-10T08:00:00Z');
    const input = [
      cor('toiture', 'Ardoise', { id: 'c-a', createdAt: same }),
      cor('toiture', 'Zinc', { id: 'c-b', createdAt: same }),
    ];
    expect(resolve({ corrections: input })[0]?.valeur).toBe('Zinc');
    expect(resolve({ corrections: [...input].reverse() })[0]?.valeur).toBe('Zinc');
  });
});

describe('resolveMaterials — purity', () => {
  it('12. does not modify its inputs (frozen inputs, unchanged afterwards)', () => {
    const input: ResolveMaterialsInput = {
      nodeId: A,
      detections: [det('toiture', ' Zinc ', 1), det('facade_principale', 'Enduit', 0)],
      corrections: [cor('toiture', 'Ardoise'), cor('sol', null)],
      includeDetections: true,
    };
    const before = structuredClone(input);
    deepFreeze(input);
    expect(() => resolveMaterials(input)).not.toThrow();
    expect(input).toEqual(before);
  });

  it('returns new objects, never the input rows', () => {
    const detection = det('toiture', 'Zinc', 0);
    const [out] = resolve({ detections: [detection] });
    expect(out).not.toBe(detection);
  });
});

describe('resolveMaterials — canonical face keys (étape 3A.1)', () => {
  it('matches accents, case, spaces and separators under one key', () => {
    expect(
      resolve({
        detections: [det('facade_principale', 'Enduit', 0), det('toiture', 'Zinc', 1)],
        corrections: [cor('  FAÇADE - Principale ', 'Bardage bois'), cor('Toiture', null)],
      }),
    ).toEqual([
      { face: 'FAÇADE - Principale', valeur: 'Bardage bois', origin: 'correction', nodeId: A },
    ]);
  });

  it('two spellings of one face are one face: the lowest position wins', () => {
    expect(
      resolve({
        detections: [det('Façade principale', 'Brique', 1), det('facade_principale', 'Enduit', 0)],
      }),
    ).toEqual([
      {
        face: 'facade_principale',
        valeur: 'Enduit',
        origin: 'detection',
        nodeId: A,
        confidence: 80,
      },
    ]);
  });

  it('two spellings of one corrected face: the latest correction wins', () => {
    expect(
      resolve({
        corrections: [
          cor('Toiture', 'Tuiles', { createdAt: at('2026-10-10T10:00:00Z') }),
          cor('toiture ', 'Ardoise', { createdAt: at('2026-10-10T11:00:00Z') }),
        ],
      }),
    ).toEqual([{ face: 'toiture', valeur: 'Ardoise', origin: 'correction', nodeId: A }]);
  });

  it('ignores rows whose face has no canonical key, and never truncates a long one', () => {
    const long = 'x'.repeat(65);
    expect(
      resolve({
        detections: [det('***', 'Rien', 0), det(long, 'Trop long', 1), det('sol', 'Béton', 2)],
        corrections: [cor('   ', 'Vide'), cor(long, 'Trop long')],
      }),
    ).toEqual([{ face: 'sol', valeur: 'Béton', origin: 'detection', nodeId: A, confidence: 80 }]);
    // 64 characters once normalised is still a face.
    expect(resolve({ detections: [det('y'.repeat(64), 'Ok', 0)] })).toHaveLength(1);
  });

  it('a removal written under another spelling still blocks the detection', () => {
    expect(
      resolve({
        detections: [det('menuiseries', 'Alu', 0)],
        corrections: [cor('Menuiseries ', '')],
      }),
    ).toEqual([]);
  });

  it('a canonical match never crosses nodes', () => {
    expect(
      resolve({
        detections: [det('toiture', 'Zinc', 0)],
        corrections: [cor('Toiture', 'Ardoise', { nodeId: B })],
      }),
    ).toEqual([
      { face: 'toiture', valeur: 'Zinc', origin: 'detection', nodeId: A, confidence: 80 },
    ]);
  });

  it('breaks an equal position by canonical key, whatever the spelling or input order', () => {
    const input = [det('Toiture', 'Zinc', 0), det('Façade', 'Enduit', 0)];
    expect(resolve({ detections: input }).map((m) => m.face)).toEqual(['Façade', 'Toiture']);
    expect(resolve({ detections: [...input].reverse() }).map((m) => m.face)).toEqual([
      'Façade',
      'Toiture',
    ]);
  });

  it('does not modify its inputs while normalising', () => {
    const detections = deepFreeze([det(' Façade ', 'Enduit', 0)]);
    const corrections = deepFreeze([cor('FAÇADE', 'Brique')]);
    expect(() => resolve({ detections, corrections })).not.toThrow();
    expect(detections[0]!.face).toBe(' Façade ');
    expect(corrections[0]!.face).toBe('FAÇADE');
  });
});
