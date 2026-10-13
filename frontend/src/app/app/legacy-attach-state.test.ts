// Attaching rows of the old sheet to the selected image (étape 3C.5.4), the
// state without React: what each row may do, ticking, the 50-row limit, the
// summary, the exact request, one request at a time, every answer the route
// gives, a selection never carried to another image, and no request on mere
// display or selection. The client is a fake whose answers the tests release
// by hand; ApiError is the real one.
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { MaterialRow } from './MaterialsPanel';
import {
  ATTACH_MAX_ROWS,
  LegacyAttachController,
  attachViewFor,
  availabilityOf,
  selectedRows,
  type AttachClient,
} from './legacy-attach-state';
import type { AttachResult, NodeFaceListItem } from './node-materials-client';

const PROJECT = 'project-1';
const A = 'node-a';
const B = 'node-b';

const row = (id: string, face: string, extra: Partial<MaterialRow> = {}): MaterialRow => ({
  id,
  face,
  valeur: `valeur ${id}`,
  source: 'auto',
  confidence: 80,
  attached: false,
  attachedNodeId: null,
  attachedAt: null,
  ...extra,
});
const attachedTo = (nodeId: string | null) => ({
  attached: true,
  attachedNodeId: nodeId,
  attachedAt: nodeId ? '2026-10-12T09:00:00.000Z' : null,
});

const FACE: NodeFaceListItem = {
  face: 'toiture',
  faceLabel: null,
  valeur: 'valeur m1',
  origin: 'correction',
  confidence: null,
  correction: 'value',
  correctionOrigin: 'legacy_attach',
  detected: null,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeClient() {
  const calls: { args: unknown[]; d: ReturnType<typeof deferred<AttachResult>> }[] = [];
  const client = {
    attach: vi.fn((...args: unknown[]) => {
      const d = deferred<AttachResult>();
      calls.push({ args, d });
      return d.promise;
    }),
  } as unknown as AttachClient;
  return { client, calls, last: () => calls[calls.length - 1]! };
}

/** A controller on image A, rows m1 and m2 ticked, at the summary. */
function confirming(rows = [row('m1', 'toiture'), row('m2', 'sol')]) {
  const fake = fakeClient();
  const ctl = new LegacyAttachController(PROJECT, fake.client);
  ctl.setTarget(A);
  ctl.start();
  for (const r of rows) ctl.toggle(r);
  ctl.review();
  return { ctl, fake };
}

describe('availabilityOf — where a row stands for the selected image', () => {
  it('free, here, elsewhere (named or not), or not known', () => {
    expect(availabilityOf(row('m1', 'toiture'), A)).toBe('available');
    expect(availabilityOf(row('m1', 'toiture', attachedTo(A)), A)).toBe('here');
    expect(availabilityOf(row('m1', 'toiture', attachedTo(B)), A)).toBe('elsewhere');
    // Attached to an image this project does not name (gone, another project).
    expect(availabilityOf(row('m1', 'toiture', attachedTo(null)), A)).toBe('elsewhere');
    // A row read without its mark is never offered.
    const bare: MaterialRow = {
      id: 'm1',
      face: 'toiture',
      valeur: 'v',
      source: 'auto',
      confidence: null,
    };
    expect(availabilityOf(bare, A)).toBe('unknown');
  });

  it('with no image selected, an attached row is elsewhere, a free one free', () => {
    expect(availabilityOf(row('m1', 'toiture', attachedTo(A)), null)).toBe('elsewhere');
    expect(availabilityOf(row('m1', 'toiture'), null)).toBe('available');
  });
});

describe('ticking rows', () => {
  it('starts only with an image selected, from idle', () => {
    const ctl = new LegacyAttachController(PROJECT, fakeClient().client);
    expect(ctl.start()).toBe(false);
    ctl.setTarget(A);
    expect(ctl.start()).toBe(true);
    expect(ctl.getState()).toMatchObject({ phase: 'selecting', selected: [], targetNodeId: A });
    expect(ctl.start()).toBe(false);
  });

  it('ticks and unticks free rows, in the order ticked', () => {
    const ctl = new LegacyAttachController(PROJECT, fakeClient().client);
    ctl.setTarget(A);
    ctl.start();
    expect(ctl.toggle(row('m2', 'sol'))).toBe('ticked');
    expect(ctl.toggle(row('m1', 'toiture'))).toBe('ticked');
    expect(ctl.getState().selected).toEqual(['m2', 'm1']);
    expect(ctl.toggle(row('m2', 'sol'))).toBe('unticked');
    expect(ctl.getState().selected).toEqual(['m1']);
  });

  it('a row attached here or elsewhere, or read without its mark, cannot be ticked', () => {
    const ctl = new LegacyAttachController(PROJECT, fakeClient().client);
    ctl.setTarget(A);
    ctl.start();
    expect(ctl.toggle(row('m1', 'toiture', attachedTo(A)))).toBe('unavailable');
    expect(ctl.toggle(row('m2', 'sol', attachedTo(B)))).toBe('unavailable');
    expect(ctl.toggle(row('m3', 'sol', attachedTo(null)))).toBe('unavailable');
    expect(ctl.toggle({ id: 'm4', face: 'x', valeur: 'y', source: 'auto', confidence: null })).toBe(
      'unavailable',
    );
    expect(ctl.getState().selected).toEqual([]);
  });

  it('ticking does nothing outside the selection', () => {
    const ctl = new LegacyAttachController(PROJECT, fakeClient().client);
    ctl.setTarget(A);
    expect(ctl.toggle(row('m1', 'toiture'))).toBe('ignored');
    expect(ctl.getState().selected).toEqual([]);
  });

  it('at most 50 rows: the 51st is refused, the 50 kept', () => {
    const ctl = new LegacyAttachController(PROJECT, fakeClient().client);
    ctl.setTarget(A);
    ctl.start();
    for (let i = 0; i < ATTACH_MAX_ROWS; i++) {
      expect(ctl.toggle(row(`m${i}`, `face ${i}`))).toBe('ticked');
    }
    expect(ATTACH_MAX_ROWS).toBe(50);
    expect(ctl.toggle(row('m50', 'face 50'))).toBe('limit');
    expect(ctl.getState().selected).toHaveLength(50);
    expect(ctl.review()).toBe(true);
  });

  it('nothing ticked: no summary', () => {
    const ctl = new LegacyAttachController(PROJECT, fakeClient().client);
    ctl.setTarget(A);
    ctl.start();
    expect(ctl.review()).toBe(false);
    expect(ctl.getState().phase).toBe('selecting');
  });

  it('back from the summary keeps the ticked rows; cancel drops them', () => {
    const { ctl } = confirming();
    ctl.back();
    expect(ctl.getState()).toMatchObject({ phase: 'selecting', selected: ['m1', 'm2'] });
    ctl.cancel();
    expect(ctl.getState()).toMatchObject({ phase: 'idle', selected: [] });
  });

  it('selectedRows lists the ticked rows in the sheet’s order', () => {
    const rows = [row('m1', 'toiture'), row('m2', 'sol'), row('m3', 'menuiseries')];
    expect(selectedRows(rows, ['m3', 'm1']).map((r) => r.id)).toEqual(['m1', 'm3']);
  });
});

describe('the image', () => {
  it('another image selected drops the selection, whatever the phase', () => {
    for (const phase of ['selecting', 'confirming'] as const) {
      const { ctl } = confirming();
      if (phase === 'selecting') ctl.back();
      ctl.setTarget(B);
      expect(ctl.getState()).toEqual({
        targetNodeId: B,
        phase: 'idle',
        selected: [],
        blocked: {},
        error: null,
      });
    }
  });

  it('the view never shows a selection made for another image', () => {
    const { ctl } = confirming();
    const state = ctl.getState();
    expect(attachViewFor(state, A)).toBe(state);
    expect(attachViewFor(state, B)).toEqual({
      targetNodeId: B,
      phase: 'idle',
      selected: [],
      blocked: {},
      error: null,
    });
    expect(attachViewFor(state, null)).toMatchObject({ targetNodeId: null, selected: [] });
  });

  it('the sheet read again unticks a row that is no longer free; the others stay', () => {
    const { ctl } = confirming();
    ctl.reconcile([row('m1', 'toiture', attachedTo(B)), row('m2', 'sol')]);
    expect(ctl.getState()).toMatchObject({ phase: 'confirming', selected: ['m2'] });
    ctl.reconcile([row('m2', 'sol', attachedTo(B))]);
    expect(ctl.getState()).toMatchObject({ phase: 'selecting', selected: [] });
  });
});

describe('sending', () => {
  it('sends once, for the selected image, the ticked ids — and only from the summary', async () => {
    const fake = fakeClient();
    const ctl = new LegacyAttachController(PROJECT, fake.client);
    ctl.setTarget(A);
    ctl.start();
    ctl.toggle(row('m1', 'toiture'));
    // Not confirmed yet: nothing is sent.
    await expect(ctl.submit()).resolves.toEqual({ kind: 'ignored' });
    expect(fake.client.attach).not.toHaveBeenCalled();
    ctl.review();
    void ctl.submit();
    expect(fake.client.attach).toHaveBeenCalledWith(PROJECT, A, ['m1']);
    expect(ctl.getState().phase).toBe('submitting');
  });

  it('a second confirm while the first runs sends nothing', async () => {
    const { ctl, fake } = confirming();
    const first = ctl.submit();
    await expect(ctl.submit()).resolves.toEqual({ kind: 'ignored' });
    expect(fake.client.attach).toHaveBeenCalledTimes(1);
    // Nor can the selection change meanwhile.
    expect(ctl.toggle(row('m3', 'menuiseries'))).toBe('ignored');
    ctl.cancel();
    expect(ctl.getState().phase).toBe('submitting');
    fake.last().d.resolve({ attached: ['m1', 'm2'], alreadyAttached: [], materials: [FACE] });
    await first;
  });

  it('success with several rows: the server’s answer, the selection cleared', async () => {
    const { ctl, fake } = confirming();
    const sending = ctl.submit();
    fake.last().d.resolve({ attached: ['m1', 'm2'], alreadyAttached: [], materials: [FACE] });
    await expect(sending).resolves.toEqual({
      kind: 'success',
      nodeId: A,
      stale: false,
      attached: ['m1', 'm2'],
      alreadyAttached: [],
      materials: [FACE],
    });
    expect(ctl.getState()).toEqual({
      targetNodeId: A,
      phase: 'idle',
      selected: [],
      blocked: {},
      error: null,
    });
  });

  it('success with rows already attached: both counts passed on as the server gave them', async () => {
    const { ctl, fake } = confirming();
    const sending = ctl.submit();
    fake.last().d.resolve({ attached: ['m2'], alreadyAttached: ['m1'], materials: [FACE] });
    await expect(sending).resolves.toMatchObject({
      kind: 'success',
      attached: ['m2'],
      alreadyAttached: ['m1'],
    });
  });

  it('ATTACH_BLOCKED: every reason kept by row, the selection kept, nothing retried', async () => {
    const { ctl, fake } = confirming([row('m1', 'toiture'), row('m2', 'sol'), row('m3', 'mur')]);
    const sending = ctl.submit();
    fake.last().d.reject(
      new ApiError(409, 'blocked', {
        error: 'ATTACH_BLOCKED',
        lines: [
          { materialId: 'm1', status: 'blocked', reason: 'face_corrected', correction: 'value' },
          { materialId: 'm2', status: 'blocked', reason: 'face_corrected', correction: 'removed' },
          { materialId: 'm3', status: 'blocked', reason: 'attached_elsewhere' },
          { materialId: 'm4', status: 'attach', face: 'sol' },
        ],
      }),
    );
    await expect(sending).resolves.toEqual({
      kind: 'failure',
      nodeId: A,
      stale: false,
      error: 'blocked',
    });
    expect(ctl.getState()).toEqual({
      targetNodeId: A,
      phase: 'selecting',
      selected: ['m1', 'm2', 'm3'],
      blocked: { m1: 'face_corrected', m2: 'face_masked', m3: 'attached_elsewhere' },
      error: 'blocked',
    });
    expect(fake.client.attach).toHaveBeenCalledTimes(1);
  });

  it('unticking a blocked row clears its reason; confirming again sends the rest', async () => {
    const { ctl, fake } = confirming();
    const sending = ctl.submit();
    fake.last().d.reject(
      new ApiError(409, 'blocked', {
        error: 'ATTACH_BLOCKED',
        lines: [{ materialId: 'm1', status: 'blocked', reason: 'duplicate_face' }],
      }),
    );
    await sending;
    ctl.toggle(row('m1', 'toiture'));
    expect(ctl.getState().blocked).toEqual({});
    ctl.review();
    void ctl.submit();
    expect(fake.last().args).toEqual([PROJECT, A, ['m2']]);
  });

  it('CONFLICT: told as such, the selection kept, nothing retried', async () => {
    const { ctl, fake } = confirming();
    const sending = ctl.submit();
    fake.last().d.reject(new ApiError(409, 'conflict', { error: 'CONFLICT' }));
    await expect(sending).resolves.toMatchObject({ kind: 'failure', error: 'conflict' });
    expect(ctl.getState()).toMatchObject({
      phase: 'selecting',
      selected: ['m1', 'm2'],
      error: 'conflict',
      blocked: {},
    });
    expect(fake.client.attach).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new ApiError(401, 'x', {}), 'session'],
    [new ApiError(403, 'x', { error: 'CSRF_INVALID' }), 'session'],
    [new ApiError(404, 'x', { error: 'NODE_NOT_FOUND' }), 'not_found'],
    [new ApiError(503, 'x', { error: 'MATERIALS_UNAVAILABLE' }), 'unavailable'],
    [new ApiError(400, 'x', { error: 'VALIDATION_FAILED' }), 'validation'],
    [new ApiError(0, 'Network error'), 'network'],
    [new ApiError(500, 'x', {}), 'unknown'],
    [new Error('boom'), 'unknown'],
  ])(
    '%#: a failure is never a success; the selection is kept for another try',
    async (err, kind) => {
      const { ctl, fake } = confirming();
      const sending = ctl.submit();
      fake.last().d.reject(err);
      await expect(sending).resolves.toMatchObject({ kind: 'failure', error: kind, stale: false });
      expect(ctl.getState()).toMatchObject({
        phase: 'selecting',
        selected: ['m1', 'm2'],
        error: kind,
      });
    },
  );

  it('another image selected while sending: the answer changes nothing here (stale)', async () => {
    const { ctl, fake } = confirming();
    const sending = ctl.submit();
    ctl.setTarget(B);
    fake.last().d.resolve({ attached: ['m1', 'm2'], alreadyAttached: [], materials: [FACE] });
    await expect(sending).resolves.toMatchObject({ kind: 'success', nodeId: A, stale: true });
    expect(ctl.getState()).toEqual({
      targetNodeId: B,
      phase: 'idle',
      selected: [],
      blocked: {},
      error: null,
    });
  });

  it('a refusal arriving after the user moved on changes nothing either', async () => {
    const { ctl, fake } = confirming();
    const sending = ctl.submit();
    ctl.setTarget(B);
    ctl.start();
    ctl.toggle(row('m9', 'mur'));
    fake.last().d.reject(new ApiError(409, 'conflict', { error: 'CONFLICT' }));
    await expect(sending).resolves.toMatchObject({ kind: 'failure', stale: true });
    expect(ctl.getState()).toMatchObject({
      targetNodeId: B,
      phase: 'selecting',
      selected: ['m9'],
      error: null,
    });
  });
});

describe('no request without a confirmation', () => {
  it('displaying, ticking, changing image, the summary and going back send nothing', () => {
    const fake = fakeClient();
    const ctl = new LegacyAttachController(PROJECT, fake.client);
    ctl.setTarget(A);
    ctl.start();
    ctl.toggle(row('m1', 'toiture'));
    ctl.review();
    ctl.back();
    ctl.reconcile([row('m1', 'toiture')]);
    ctl.setTarget(B);
    ctl.setTarget(A);
    ctl.cancel();
    expect(fake.client.attach).not.toHaveBeenCalled();
  });
});
