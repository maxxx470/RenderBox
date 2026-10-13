// The per-image materials client (étape 3C.4): paths and their encoding, the
// face put in the path (typed label kept, never a display name), the bodies
// sent, and failures passed on untouched. api() is mocked; ApiError is real.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockApi } = vi.hoisted(() => ({ mockApi: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: mockApi };
});

import { ApiError } from '@/lib/api';
import {
  attachBlockedLines,
  attachLegacyMaterials,
  legacyAttachPath,
  cancelCorrection,
  faceRef,
  listNodeMaterials,
  materialsErrorKind,
  nodeMaterialsPath,
  removeFace,
  setFaceValue,
} from './node-materials-client';

const MATERIAL = {
  face: 'toiture',
  faceLabel: 'Toiture',
  valeur: 'Ardoise',
  origin: 'correction',
  confidence: null,
  correction: 'value',
};

beforeEach(() => {
  mockApi.mockReset();
});

describe('nodeMaterialsPath', () => {
  it('builds the list path and the face path', () => {
    expect(nodeMaterialsPath('p1', 'n1')).toBe('/api/projects/p1/nodes/n1/materials');
    expect(nodeMaterialsPath('p1', 'n1', 'toiture')).toBe(
      '/api/projects/p1/nodes/n1/materials/toiture',
    );
  });

  it('encodes every segment once: spaces, accents, %, slashes', () => {
    expect(nodeMaterialsPath('p 1', 'n/1', 'Façade principale')).toBe(
      '/api/projects/p%201/nodes/n%2F1/materials/Fa%C3%A7ade%20principale',
    );
    // A label holding "%20" literally reaches the server as "%20" once decoded.
    expect(nodeMaterialsPath('p', 'n', 'Mur%20A')).toBe(
      '/api/projects/p/nodes/n/materials/Mur%2520A',
    );
  });
});

describe('faceRef — the face put in the path', () => {
  it('keeps the label the user typed, so a correction keeps its name', () => {
    expect(faceRef({ face: 'facade_principale', faceLabel: 'Façade principale' })).toBe(
      'Façade principale',
    );
  });

  it('uses the canonical key when there is no label (a detected face)', () => {
    expect(faceRef({ face: 'toiture', faceLabel: null })).toBe('toiture');
    expect(faceRef({ face: 'toiture', faceLabel: '   ' })).toBe('toiture');
  });

  it('never sends a label that would name another face', () => {
    expect(faceRef({ face: 'toiture', faceLabel: 'Façade' })).toBe('toiture');
  });
});

describe('requests', () => {
  it('lists with a GET on the image path and returns the list', async () => {
    mockApi.mockResolvedValue({ materials: [{ ...MATERIAL, detected: null }] });
    await expect(listNodeMaterials('p1', 'n1')).resolves.toEqual([{ ...MATERIAL, detected: null }]);
    expect(mockApi).toHaveBeenCalledWith('/api/projects/p1/nodes/n1/materials');
  });

  it('a 200 without a list is a failure, never "nothing known"', async () => {
    mockApi.mockResolvedValue({});
    const err = await listNodeMaterials('p1', 'n1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(materialsErrorKind(err)).toBe('unavailable');
  });

  it('sets a value with a PUT { valeur } and returns the server’s face', async () => {
    mockApi.mockResolvedValue({ material: MATERIAL });
    await expect(setFaceValue('p1', 'n1', 'Toiture', 'Ardoise')).resolves.toEqual(MATERIAL);
    expect(mockApi).toHaveBeenCalledWith('/api/projects/p1/nodes/n1/materials/Toiture', {
      method: 'PUT',
      body: { valeur: 'Ardoise' },
    });
  });

  it('removes a face with a PUT { valeur: null }', async () => {
    mockApi.mockResolvedValue({ material: { ...MATERIAL, valeur: null, correction: 'removed' } });
    await removeFace('p1', 'n1', 'toiture');
    expect(mockApi).toHaveBeenCalledWith('/api/projects/p1/nodes/n1/materials/toiture', {
      method: 'PUT',
      body: { valeur: null },
    });
  });

  it('cancels a correction with a DELETE and returns { deleted, material }', async () => {
    mockApi.mockResolvedValue({ deleted: true, material: MATERIAL });
    await expect(cancelCorrection('p1', 'n1', 'toiture')).resolves.toEqual({
      deleted: true,
      material: MATERIAL,
    });
    expect(mockApi).toHaveBeenCalledWith('/api/projects/p1/nodes/n1/materials/toiture', {
      method: 'DELETE',
    });
  });

  it('never touches the old project sheet route', async () => {
    mockApi.mockResolvedValue({ material: MATERIAL, materials: [], deleted: false });
    await listNodeMaterials('p1', 'n1');
    await setFaceValue('p1', 'n1', 'toiture', 'Zinc');
    await removeFace('p1', 'n1', 'toiture');
    await cancelCorrection('p1', 'n1', 'toiture');
    for (const [path, opts] of mockApi.mock.calls as [string, { method?: string }?][]) {
      expect(path).toMatch(/^\/api\/projects\/p1\/nodes\/n1\/materials/);
      expect(opts?.method).not.toBe('PATCH');
    }
  });

  it('passes a failure on as it came, with its code', async () => {
    const conflict = new ApiError(409, 'CONFLICT', { error: 'CONFLICT', message: 'x' });
    mockApi.mockRejectedValue(conflict);
    await expect(setFaceValue('p1', 'n1', 'toiture', 'Zinc')).rejects.toBe(conflict);
    await expect(cancelCorrection('p1', 'n1', 'toiture')).rejects.toBe(conflict);
  });
});

describe('materialsErrorKind', () => {
  it.each([
    [new ApiError(400, 'x', { error: 'VALIDATION_FAILED' }), 'validation'],
    [new ApiError(401, 'x', {}), 'session'],
    [new ApiError(403, 'x', { error: 'CSRF_INVALID' }), 'session'],
    [new ApiError(404, 'x', { error: 'NODE_NOT_FOUND' }), 'not_found'],
    [new ApiError(404, 'x', { error: 'PROJECT_NOT_FOUND' }), 'not_found'],
    [new ApiError(409, 'x', { error: 'CONFLICT' }), 'conflict'],
    [new ApiError(503, 'x', { error: 'MATERIALS_UNAVAILABLE' }), 'unavailable'],
    [new ApiError(0, 'Network error'), 'network'],
    [new ApiError(500, 'x', {}), 'unknown'],
    [new Error('boom'), 'unknown'],
  ])('%#: classifies the failure', (err, kind) => {
    expect(materialsErrorKind(err)).toBe(kind);
  });
});

describe('attachLegacyMaterials (3C.5.4)', () => {
  it('its route sits beside materials/, never under it, where it would take a face named "attach" (3C.5.5)', () => {
    expect(legacyAttachPath('p', 'n')).toBe('/api/projects/p/nodes/n/legacy-attach');
    expect(legacyAttachPath('p', 'n').startsWith(nodeMaterialsPath('p', 'n'))).toBe(false);
  });

  it('POSTs the ids to the image’s attach route, and returns the server’s answer', async () => {
    const answer = { attached: ['m1'], alreadyAttached: ['m2'], materials: [] };
    mockApi.mockResolvedValue(answer);
    await expect(attachLegacyMaterials('p 1', 'n/1', ['m1', 'm2'])).resolves.toEqual(answer);
    expect(mockApi).toHaveBeenCalledWith('/api/projects/p%201/nodes/n%2F1/legacy-attach', {
      method: 'POST',
      body: { materialIds: ['m1', 'm2'] },
    });
  });

  it('a 200 it cannot read is a failure, never a success to announce', async () => {
    mockApi.mockResolvedValue({ attached: ['m1'] });
    const err = await attachLegacyMaterials('p', 'n', ['m1']).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(materialsErrorKind(err)).toBe('unavailable');
  });

  it('passes a refusal on as it came', async () => {
    const blocked = new ApiError(409, 'x', { error: 'ATTACH_BLOCKED', lines: [] });
    mockApi.mockRejectedValue(blocked);
    await expect(attachLegacyMaterials('p', 'n', ['m1'])).rejects.toBe(blocked);
  });
});

describe('attachBlockedLines', () => {
  it('the reason of each blocked row; a masked face told apart from a corrected one', () => {
    const err = new ApiError(409, 'x', {
      error: 'ATTACH_BLOCKED',
      lines: [
        { materialId: 'm1', status: 'blocked', reason: 'face_corrected', correction: 'value' },
        { materialId: 'm2', status: 'blocked', reason: 'face_corrected', correction: 'removed' },
        { materialId: 'm3', status: 'blocked', reason: 'not_found', face: null },
        { materialId: 'm4', status: 'attach', face: 'sol' },
        { materialId: 'm5', status: 'already_here', face: 'mur' },
        { materialId: 'm6', status: 'blocked', reason: 'something new' },
        'garbage',
        null,
      ],
    });
    expect(attachBlockedLines(err)).toEqual({
      m1: 'face_corrected',
      m2: 'face_masked',
      m3: 'not_found',
    });
  });

  it('null for any other failure — a CONFLICT is not a list of blocked rows', () => {
    expect(attachBlockedLines(new ApiError(409, 'x', { error: 'CONFLICT' }))).toBeNull();
    expect(attachBlockedLines(new ApiError(400, 'x', { error: 'ATTACH_BLOCKED' }))).toBeNull();
    expect(attachBlockedLines(new Error('x'))).toBeNull();
  });

  it('an ATTACH_BLOCKED without readable lines is still a refusal, with no row named', () => {
    expect(attachBlockedLines(new ApiError(409, 'x', { error: 'ATTACH_BLOCKED' }))).toEqual({});
  });
});
