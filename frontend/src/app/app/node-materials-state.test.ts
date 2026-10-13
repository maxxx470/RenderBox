// The per-image materials panel's state (étape 3C.4), without React: loads
// per image, stale answers dropped, mutations tied to the image they were
// started on, nothing shown before the server confirms it, one action at a
// time per face. The client is a fake whose answers the tests release by hand.
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  NodeMaterialsController,
  checkNewFace,
  checkValue,
  mergeFace,
  viewFor,
  type MaterialsClient,
  type NodeMaterialsState,
} from './node-materials-state';
import type { NodeFaceListItem, NodeFaceMaterial } from './node-materials-client';

const PROJECT = 'project-1';
const A = 'node-a';
const B = 'node-b';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const detected = (face: string, valeur: string, confidence = 80): NodeFaceListItem => ({
  face,
  faceLabel: null,
  valeur,
  origin: 'detection',
  confidence,
  correction: 'none',
  correctionOrigin: null,
  detected: { valeur, confidence },
});
const corrected = (
  face: string,
  valeur: string,
  opts: { label?: string | null; under?: NodeFaceListItem['detected'] } = {},
): NodeFaceListItem => ({
  face,
  faceLabel: opts.label ?? null,
  valeur,
  origin: 'correction',
  confidence: null,
  correction: 'value',
  correctionOrigin: 'user',
  detected: opts.under ?? null,
});
/** What a correction route answers: the face without the detection under it. */
const material = (m: NodeFaceListItem): NodeFaceMaterial => ({
  face: m.face,
  faceLabel: m.faceLabel,
  valeur: m.valeur,
  origin: m.origin,
  confidence: m.confidence,
  correction: m.correction,
  correctionOrigin: m.correctionOrigin,
});

/** A client whose every call waits until the test settles it. */
function fakeClient() {
  const calls: { op: string; args: unknown[]; d: ReturnType<typeof deferred<unknown>> }[] = [];
  const make =
    (op: string) =>
    (...args: unknown[]) => {
      const d = deferred<unknown>();
      calls.push({ op, args, d });
      return d.promise;
    };
  const client = {
    list: vi.fn(make('list')),
    setValue: vi.fn(make('setValue')),
    remove: vi.fn(make('remove')),
    cancel: vi.fn(make('cancel')),
  } as unknown as MaterialsClient;
  return { client, calls, last: () => calls[calls.length - 1]! };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function ready(items: NodeFaceListItem[], nodeId = A) {
  const fake = fakeClient();
  const ctl = new NodeMaterialsController(PROJECT, fake.client);
  ctl.select(nodeId);
  fake.last().d.resolve(items);
  await tick();
  return { ctl, fake };
}

describe('checkValue / checkNewFace — the server’s own limits, before sending', () => {
  it('normalises the value as the server stores it, refuses empty and over 500', () => {
    expect(checkValue('  Bardage\n bois  ')).toEqual({ ok: true, valeur: 'Bardage bois' });
    expect(checkValue(' \n ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkValue('a'.repeat(500))).toMatchObject({ ok: true });
    expect(checkValue('a'.repeat(501))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('keeps the typed label, derives the canonical key, enforces 200 / 64', () => {
    expect(checkNewFace(' Façade  principale ')).toEqual({
      ok: true,
      label: 'Façade principale',
      face: 'facade_principale',
    });
    expect(checkNewFace('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkNewFace('東')).toEqual({ ok: false, reason: 'empty' });
    expect(checkNewFace('a'.repeat(65))).toEqual({ ok: false, reason: 'key_too_long' });
    expect(checkNewFace(`a ${'-'.repeat(200)}`)).toEqual({ ok: false, reason: 'label_too_long' });
  });
});

describe('mergeFace — the list after the server answered for one face', () => {
  it('replaces the face and keeps the detection under it', () => {
    const before = [detected('toiture', 'Tuile'), detected('sol', 'Parquet')];
    const { items } = mergeFace(before, material(corrected('toiture', 'Ardoise')));
    expect(items[0]).toEqual(
      corrected('toiture', 'Ardoise', { under: { valeur: 'Tuile', confidence: 80 } }),
    );
    expect(items[1]).toBe(before[1]);
  });

  it('adds a new face last, as a correction with no detection', () => {
    const { items, item } = mergeFace(
      [detected('sol', 'Parquet')],
      material(corrected('toiture', 'Zinc')),
    );
    expect(items.map((i) => i.face)).toEqual(['sol', 'toiture']);
    expect(item?.detected).toBeNull();
  });

  it('takes out a face left with nothing (a cancelled correction without detection)', () => {
    const gone: NodeFaceMaterial = {
      face: 'toiture',
      faceLabel: null,
      valeur: null,
      origin: null,
      confidence: null,
      correction: 'none',
      correctionOrigin: null,
    };
    const { items, item } = mergeFace([corrected('toiture', 'Zinc')], gone);
    expect(items).toEqual([]);
    expect(item).toBeNull();
  });
});

describe('NodeMaterialsController — loading one image', () => {
  it('loads the selected image: loading, then its list', async () => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    expect(ctl.getState()).toMatchObject({ nodeId: A, status: 'loading', items: [] });
    expect(fake.client.list).toHaveBeenCalledWith(PROJECT, A);
    fake.last().d.resolve([detected('toiture', 'Tuile')]);
    await tick();
    expect(ctl.getState()).toMatchObject({
      status: 'ready',
      items: [detected('toiture', 'Tuile')],
    });
  });

  it('an image with nothing is ready and empty — not an error', async () => {
    const { ctl } = await ready([]);
    expect(ctl.getState()).toMatchObject({ status: 'ready', items: [], error: null });
  });

  it('a read error is an error state with its kind, never an empty list; reload retries', async () => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    fake.last().d.reject(new ApiError(503, 'x', { error: 'MATERIALS_UNAVAILABLE' }));
    await tick();
    expect(ctl.getState()).toMatchObject({ status: 'error', error: 'unavailable', items: [] });

    void ctl.reload();
    expect(ctl.getState().status).toBe('loading');
    fake.last().d.resolve([detected('sol', 'Parquet')]);
    await tick();
    expect(ctl.getState()).toMatchObject({ status: 'ready', error: null });
  });

  it.each([
    [new ApiError(404, 'x', { error: 'NODE_NOT_FOUND' }), 'not_found'],
    [new ApiError(401, 'x', {}), 'session'],
    [new ApiError(0, 'Network error'), 'network'],
  ])('%#: tells why the list could not be read', async (err, kind) => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    fake.last().d.reject(err);
    await tick();
    expect(ctl.getState().error).toBe(kind);
  });

  it('selecting the same image again does not reload it', () => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    ctl.select(A);
    expect(fake.client.list).toHaveBeenCalledTimes(1);
  });
});

describe('NodeMaterialsController — moving to another image', () => {
  it('a late answer for image A never replaces image B’s list', async () => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    const loadA = fake.last();
    ctl.select(B);
    const loadB = fake.last();
    loadB.d.resolve([detected('sol', 'Parquet B')]);
    await tick();
    loadA.d.resolve([detected('toiture', 'Tuile A')]);
    await tick();
    expect(ctl.getState()).toMatchObject({ nodeId: B, status: 'ready' });
    expect(ctl.getState().items).toEqual([detected('sol', 'Parquet B')]);
  });

  it('a late error for image A never shows on image B', async () => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    const loadA = fake.last();
    ctl.select(B);
    fake.last().d.resolve([]);
    await tick();
    loadA.d.reject(new ApiError(503, 'x', { error: 'MATERIALS_UNAVAILABLE' }));
    await tick();
    expect(ctl.getState()).toMatchObject({ nodeId: B, status: 'ready', error: null });
  });

  it('a save started on A that answers after the move to B leaves B alone, and says it was stale', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile A')], A);
    const saving = ctl.saveValue('toiture', 'Ardoise');
    const put = fake.last();
    expect(put.args).toEqual([PROJECT, A, 'toiture', 'Ardoise']);

    ctl.select(B);
    fake.last().d.resolve([detected('toiture', 'Tuile B')]);
    await tick();
    put.d.resolve(material(corrected('toiture', 'Ardoise')));
    await expect(saving).resolves.toEqual({ ok: true, item: null, stale: true });
    expect(ctl.getState().items).toEqual([detected('toiture', 'Tuile B')]);
    expect(ctl.getState().pending).toEqual({});
  });

  it('a failure on A after the move to B shows nothing on B', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile A')], A);
    const hiding = ctl.hide('toiture');
    const put = fake.last();
    ctl.select(B);
    fake.last().d.resolve([]);
    await tick();
    put.d.reject(new ApiError(409, 'x', { error: 'CONFLICT' }));
    await expect(hiding).resolves.toEqual({ ok: false, error: 'conflict', stale: true });
    expect(ctl.getState()).toMatchObject({ nodeId: B, status: 'ready', error: null, items: [] });
  });

  it('two images of one project are read and written each with its own id', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')], A);
    void ctl.saveValue('toiture', 'Ardoise');
    fake.last().d.resolve(material(corrected('toiture', 'Ardoise')));
    await tick();
    ctl.select(B);
    fake.last().d.resolve([detected('toiture', 'Zinc')]);
    await tick();
    void ctl.hide('toiture');
    const ids = fake.calls.map((c) => [c.op, c.args[1]]);
    expect(ids).toEqual([
      ['list', A],
      ['setValue', A],
      ['list', B],
      ['remove', B],
    ]);
    // B shows its own detection, untouched by A's correction.
    expect(ctl.getState().items[0]).toMatchObject({ valeur: 'Zinc', origin: 'detection' });
  });

  it('coming back to A reads it again: the correction saved there shows', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')], A);
    ctl.select(B);
    fake.last().d.resolve([]);
    await tick();
    ctl.select(A);
    expect(fake.last().op).toBe('list');
    fake
      .last()
      .d.resolve([corrected('toiture', 'Ardoise', { under: { valeur: 'Tuile', confidence: 80 } })]);
    await tick();
    expect(ctl.getState().items[0]).toMatchObject({ valeur: 'Ardoise', origin: 'correction' });
  });
});

describe('NodeMaterialsController — changing a face', () => {
  it('Modifier: nothing changes before the server answers, then the server’s face shows', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    const saving = ctl.saveValue('toiture', '  Ardoise  naturelle ');
    expect(ctl.getState().pending).toEqual({ toiture: 'save' });
    expect(ctl.getState().items[0]).toEqual(detected('toiture', 'Tuile'));
    expect(fake.last().args).toEqual([PROJECT, A, 'toiture', 'Ardoise naturelle']);

    fake.last().d.resolve(material(corrected('toiture', 'Ardoise naturelle')));
    await expect(saving).resolves.toMatchObject({ ok: true, stale: false });
    expect(ctl.getState().items[0]).toEqual(
      corrected('toiture', 'Ardoise naturelle', { under: { valeur: 'Tuile', confidence: 80 } }),
    );
    expect(ctl.getState().pending).toEqual({});
  });

  it('keeps the typed label in the path of a correction that has one', async () => {
    // The server keeps a label only as typed for this very face, so it
    // always comes back to the face's key.
    const { ctl, fake } = await ready([
      corrected('facade_principale', 'Enduit', { label: 'Façade Principale' }),
    ]);
    void ctl.saveValue('facade_principale', 'Bardage');
    expect(fake.last().args).toEqual([PROJECT, A, 'Façade Principale', 'Bardage']);
  });

  it('a save error leaves the face as it was and says why', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    const saving = ctl.saveValue('toiture', 'Ardoise');
    fake.last().d.reject(new ApiError(503, 'x', { error: 'MATERIALS_UNAVAILABLE' }));
    await expect(saving).resolves.toEqual({ ok: false, error: 'unavailable', stale: false });
    expect(ctl.getState().items[0]).toEqual(detected('toiture', 'Tuile'));
    expect(ctl.getState().pending).toEqual({});
  });

  it('a conflict (409) is told as such, nothing changed', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    const saving = ctl.saveValue('toiture', 'Ardoise');
    fake.last().d.reject(new ApiError(409, 'x', { error: 'CONFLICT' }));
    await expect(saving).resolves.toMatchObject({ ok: false, error: 'conflict' });
    expect(ctl.getState().items[0]).toEqual(detected('toiture', 'Tuile'));
  });

  it('a second click while the face is saving is refused: one request only', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    void ctl.saveValue('toiture', 'Ardoise');
    await expect(ctl.saveValue('toiture', 'Ardoise')).resolves.toEqual({
      ok: false,
      error: 'busy',
      stale: false,
    });
    await expect(ctl.hide('toiture')).resolves.toMatchObject({ error: 'busy' });
    expect(fake.client.setValue).toHaveBeenCalledTimes(1);
    expect(fake.client.remove).not.toHaveBeenCalled();
  });

  it('an empty or too long value is never sent', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    await expect(ctl.saveValue('toiture', '   ')).resolves.toMatchObject({ error: 'invalid' });
    await expect(ctl.saveValue('toiture', 'a'.repeat(501))).resolves.toMatchObject({
      error: 'invalid',
    });
    expect(fake.client.setValue).not.toHaveBeenCalled();
  });
});

describe('NodeMaterialsController — masking and cancelling', () => {
  it('Masquer: the face shows as removed once the server says so, its detection still told', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    const hiding = ctl.hide('toiture');
    expect(fake.client.remove).toHaveBeenCalledWith(PROJECT, A, 'toiture');
    fake.last().d.resolve({
      face: 'toiture',
      faceLabel: 'toiture',
      valeur: null,
      origin: null,
      confidence: null,
      correction: 'removed',
    });
    await hiding;
    expect(ctl.getState().items[0]).toMatchObject({
      correction: 'removed',
      valeur: null,
      detected: { valeur: 'Tuile', confidence: 80 },
    });
  });

  it('Revenir à la détection: the DELETE answer brings the detection back', async () => {
    const { ctl, fake } = await ready([
      corrected('toiture', 'Ardoise', { under: { valeur: 'Tuile', confidence: 75 } }),
    ]);
    const cancelling = ctl.cancel('toiture');
    expect(fake.client.cancel).toHaveBeenCalledWith(PROJECT, A, 'toiture');
    fake.last().d.resolve({ deleted: true, material: material(detected('toiture', 'Tuile', 75)) });
    await expect(cancelling).resolves.toMatchObject({ ok: true });
    expect(ctl.getState().items[0]).toEqual(detected('toiture', 'Tuile', 75));
  });

  it('without a detection, cancelling takes the face out — no detection is claimed', async () => {
    const { ctl, fake } = await ready([corrected('toiture', 'Zinc'), detected('sol', 'Parquet')]);
    const cancelling = ctl.cancel('toiture');
    fake.last().d.resolve({
      deleted: true,
      material: {
        face: 'toiture',
        faceLabel: null,
        valeur: null,
        origin: null,
        confidence: null,
        correction: 'none',
      },
    });
    await expect(cancelling).resolves.toEqual({ ok: true, item: null, stale: false });
    expect(ctl.getState().items.map((i) => i.face)).toEqual(['sol']);
  });

  it('there is nothing to cancel on a face without a correction', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    await expect(ctl.cancel('toiture')).resolves.toMatchObject({ error: 'invalid' });
    expect(fake.client.cancel).not.toHaveBeenCalled();
  });
});

describe('NodeMaterialsController — adding a face', () => {
  it('sends the typed label and the value, and shows the server’s face as a correction', async () => {
    const { ctl, fake } = await ready([]);
    const adding = ctl.add(' Façade  principale ', 'Bardage bois');
    expect(ctl.getState().pending).toEqual({ facade_principale: 'add' });
    expect(fake.last().args).toEqual([PROJECT, A, 'Façade principale', 'Bardage bois']);
    fake
      .last()
      .d.resolve(
        material(corrected('facade_principale', 'Bardage bois', { label: 'Façade principale' })),
      );
    await expect(adding).resolves.toMatchObject({ ok: true });
    expect(ctl.getState().items).toEqual([
      corrected('facade_principale', 'Bardage bois', { label: 'Façade principale' }),
    ]);
  });

  it('refuses a name or a value the server would refuse, without sending', async () => {
    const { ctl, fake } = await ready([]);
    await expect(ctl.add('東', 'Zinc')).resolves.toMatchObject({ error: 'invalid' });
    await expect(ctl.add('Toiture', '')).resolves.toMatchObject({ error: 'invalid' });
    expect(fake.client.setValue).not.toHaveBeenCalled();
  });

  it('a validation error from the server is told and nothing is added', async () => {
    const { ctl, fake } = await ready([]);
    const adding = ctl.add('Toiture', 'Zinc');
    fake.last().d.reject(new ApiError(400, 'x', { error: 'VALIDATION_FAILED' }));
    await expect(adding).resolves.toMatchObject({ ok: false, error: 'validation' });
    expect(ctl.getState().items).toEqual([]);
  });
});

describe('NodeMaterialsController — adding a face this image already lists (3C.4-S)', () => {
  const hidden = (face: string, under: string): NodeFaceListItem => ({
    face,
    faceLabel: null,
    valeur: null,
    origin: null,
    confidence: null,
    correction: 'removed',
    correctionOrigin: 'user',
    detected: { valeur: under, confidence: 70 },
  });

  it.each([
    ['the same case', 'toiture'],
    ['another case', 'TOITURE'],
    ['spaces around and inside', '  Toiture  '],
  ])('a detected face, typed with %s, is not overwritten', async (_how, typed) => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    const result = await ctl.add(typed, 'Zinc');
    expect(result).toMatchObject({ ok: false, error: 'exists', stale: false });
    expect(result.ok === false && result.error === 'exists' && result.existing.face).toBe(
      'toiture',
    );
    expect(fake.client.setValue).not.toHaveBeenCalled();
    expect(ctl.getState().items).toEqual([detected('toiture', 'Tuile')]);
    expect(ctl.getState().pending).toEqual({});
  });

  it.each([
    ['accents and case', 'FAÇADE PRINCIPALE'],
    ['a hyphen', 'facade-principale'],
    ['an underscore', 'facade_principale'],
    ['several spaces', ' Façade   principale '],
  ])('a corrected face is recognised through %s', async (_how, typed) => {
    const existing = corrected('facade_principale', 'Enduit', { label: 'Façade principale' });
    const { ctl, fake } = await ready([existing]);
    await expect(ctl.add(typed, 'Bardage bois')).resolves.toMatchObject({
      ok: false,
      error: 'exists',
      existing,
    });
    expect(fake.client.setValue).not.toHaveBeenCalled();
    expect(ctl.getState().items).toEqual([existing]);
  });

  it('a masked face is listed too: it is changed with its own Modifier', async () => {
    const face = hidden('toiture', 'Tuile');
    const { ctl, fake } = await ready([face]);
    await expect(ctl.add('Toiture', 'Zinc')).resolves.toMatchObject({
      error: 'exists',
      existing: face,
    });
    expect(fake.client.setValue).not.toHaveBeenCalled();
    expect(ctl.getState().items).toEqual([face]);
  });

  it('while an action runs on that face, the answer is "busy", not "exists"', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    void ctl.saveValue('toiture', 'Ardoise');
    expect(fake.client.setValue).toHaveBeenCalledTimes(1);
    await expect(ctl.add('TOITURE', 'Zinc')).resolves.toMatchObject({
      ok: false,
      error: 'busy',
      stale: false,
    });
    expect(fake.client.setValue).toHaveBeenCalledTimes(1);
    expect(ctl.getState().pending).toEqual({ toiture: 'save' });
  });

  it('a second add of the same new face while the first runs is "busy"', async () => {
    const { ctl, fake } = await ready([]);
    void ctl.add('Toiture', 'Zinc');
    await expect(ctl.add(' toiture ', 'Ardoise')).resolves.toMatchObject({ error: 'busy' });
    expect(fake.client.setValue).toHaveBeenCalledTimes(1);
  });

  it('a new face is still added beside the listed ones', async () => {
    const { ctl, fake } = await ready([detected('toiture', 'Tuile')]);
    const adding = ctl.add('Menuiseries', 'Aluminium');
    expect(fake.last().args).toEqual([PROJECT, A, 'Menuiseries', 'Aluminium']);
    fake
      .last()
      .d.resolve(material(corrected('menuiseries', 'Aluminium', { label: 'Menuiseries' })));
    await expect(adding).resolves.toMatchObject({ ok: true, stale: false });
    expect(ctl.getState().items.map((i) => i.face)).toEqual(['toiture', 'menuiseries']);
    expect(ctl.getState().items[0]).toEqual(detected('toiture', 'Tuile'));
  });

  it('a face listed only on the image left behind is no duplicate on the image shown', async () => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    fake.last().d.resolve([detected('toiture', 'Tuile')]);
    await tick();
    ctl.select(B);
    fake.last().d.resolve([]);
    await tick();
    const adding = ctl.add('Toiture', 'Zinc');
    expect(fake.client.setValue).toHaveBeenCalledWith(PROJECT, B, 'Toiture', 'Zinc');
    fake.last().d.resolve(material(corrected('toiture', 'Zinc', { label: 'Toiture' })));
    await expect(adding).resolves.toMatchObject({ ok: true });
  });
});

describe('viewFor — never the materials of one image under another one’s name (3C.4-S)', () => {
  const readyA: NodeMaterialsState = {
    nodeId: A,
    status: 'ready',
    error: null,
    items: [detected('toiture', 'Tuile')],
    pending: { toiture: 'save' },
  };

  it('the state itself, untouched, when it is about the selected image', () => {
    expect(viewFor(readyA, A)).toBe(readyA);
    const idle = new NodeMaterialsController(PROJECT, fakeClient().client).getState();
    expect(viewFor(idle, null)).toBe(idle);
  });

  it('another image selected, not yet told to the controller: loading, nothing of the old one', () => {
    expect(viewFor(readyA, B)).toEqual({
      nodeId: B,
      status: 'loading',
      error: null,
      items: [],
      pending: {},
    });
    const failedA: NodeMaterialsState = { ...readyA, status: 'error', error: 'unavailable' };
    expect(viewFor(failedA, B)).toMatchObject({ nodeId: B, status: 'loading', error: null });
  });

  it('a project opening: the first image reads as loading, not as "no image"', () => {
    const idle = new NodeMaterialsController(PROJECT, fakeClient().client).getState();
    expect(viewFor(idle, A)).toMatchObject({ nodeId: A, status: 'loading', items: [] });
  });

  it('no image selected any more: none, whatever the controller still holds', () => {
    expect(viewFor(readyA, null)).toEqual({
      nodeId: null,
      status: 'idle',
      error: null,
      items: [],
      pending: {},
    });
  });

  it('follows the controller through a switch, a late answer about A still dropped', async () => {
    const fake = fakeClient();
    const ctl = new NodeMaterialsController(PROJECT, fake.client);
    ctl.select(A);
    const loadA = fake.last();
    // B is selected on screen before the controller hears of it.
    expect(viewFor(ctl.getState(), B)).toMatchObject({ nodeId: B, status: 'loading' });
    ctl.select(B);
    const loadB = fake.last();
    loadA.d.resolve([detected('toiture', 'Tuile')]);
    await tick();
    expect(viewFor(ctl.getState(), B)).toMatchObject({ nodeId: B, status: 'loading', items: [] });
    loadB.d.resolve([detected('sol', 'Béton')]);
    await tick();
    expect(viewFor(ctl.getState(), B)).toMatchObject({
      nodeId: B,
      status: 'ready',
      items: [detected('sol', 'Béton')],
    });
    expect(fake.client.list).toHaveBeenCalledTimes(2);
  });
});

describe('replaceItems — the image’s faces as an attach committed them (3C.5.4)', () => {
  it('shows the given list when it is about the image shown', async () => {
    const { ctl } = await ready([detected('toiture', 'Tuile')]);
    const next = [corrected('sol', 'Béton')];
    expect(ctl.replaceItems(A, next)).toBe(true);
    expect(ctl.getState()).toMatchObject({ nodeId: A, status: 'ready', items: next, error: null });
  });

  it('changes nothing when another image is shown', async () => {
    const { ctl } = await ready([detected('toiture', 'Tuile')], B);
    expect(ctl.replaceItems(A, [corrected('sol', 'Béton')])).toBe(false);
    expect(ctl.getState()).toMatchObject({ nodeId: B, items: [detected('toiture', 'Tuile')] });
  });

  it('a load still running for that image is dropped: the given list is newer', async () => {
    const { ctl, fake } = await ready([]);
    void ctl.reload();
    const loading = fake.last();
    ctl.replaceItems(A, [corrected('sol', 'Béton')]);
    loading.d.resolve([detected('toiture', 'Tuile')]);
    await tick();
    expect(ctl.getState().items).toEqual([corrected('sol', 'Béton')]);
  });
});
