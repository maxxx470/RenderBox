// The messages of the per-image materials panel after a failed action
// (étape 3C.4-S): a classified failure keeps its own message, an unclassified
// one is named after the action, "what you typed is kept" only where
// something was typed, and nothing at all for a success, a stale answer or
// input refused before sending. Every key exists in both languages.
import { describe, it, expect } from 'vitest';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { MaterialsErrorKind, NodeFaceListItem } from './node-materials-client';
import {
  actionMessage,
  knownErrorKey,
  materialsErrorKey,
  type MaterialsAction,
} from './node-materials-messages';

const ACTIONS: MaterialsAction[] = ['read', 'add', 'save', 'hide', 'restore', 'cancel', 'attach'];
const KINDS: MaterialsErrorKind[] = [
  'validation',
  'session',
  'not_found',
  'conflict',
  'unavailable',
  'network',
  'unknown',
];

const ITEM: NodeFaceListItem = {
  face: 'toiture',
  faceLabel: 'Toiture',
  valeur: 'Tuile',
  origin: 'detection',
  confidence: 80,
  correction: 'none',
  correctionOrigin: null,
  detected: { valeur: 'Tuile', confidence: 80 },
};

describe('materialsErrorKey', () => {
  it('every action and every failure has a message in French and in English', () => {
    for (const action of ACTIONS) {
      for (const kind of KINDS) {
        const key = materialsErrorKey(action, kind);
        expect(dictionaries.fr[key], `${action}/${kind}`).toBeTruthy();
        expect(dictionaries.en[key], `${action}/${kind}`).toBeTruthy();
      }
    }
  });

  it('a classified failure keeps its own message, whatever the action', () => {
    for (const kind of KINDS.filter((k) => k !== 'unknown')) {
      const keys = new Set(ACTIONS.map((a) => materialsErrorKey(a, kind)));
      expect(keys.size, kind).toBe(1);
      expect(knownErrorKey(kind)).toBe([...keys][0]);
    }
    expect(materialsErrorKey('hide', 'conflict')).toBe('app.nodeMaterialsErrorConflict');
    expect(materialsErrorKey('add', 'network')).toBe('app.nodeMaterialsErrorNetwork');
  });

  it('an unclassified failure is named after the action, one message per action', () => {
    const keys = ACTIONS.map((a) => materialsErrorKey(a, 'unknown'));
    expect(new Set(keys).size).toBe(ACTIONS.length);
    expect(knownErrorKey('unknown')).toBeNull();
  });

  it('"what you typed is kept" only after adding or editing, never after the other actions', () => {
    for (const action of ['read', 'hide', 'restore', 'cancel'] as const) {
      const key = materialsErrorKey(action, 'unknown');
      expect(dictionaries.fr[key], action).not.toMatch(/saisie/i);
      expect(dictionaries.en[key], action).not.toMatch(/typed/i);
    }
    for (const action of ['add', 'save'] as const) {
      const key = materialsErrorKey(action, 'unknown');
      expect(dictionaries.fr[key], action).toMatch(/saisie est conservée/);
      expect(dictionaries.en[key], action).toMatch(/typed is kept/);
    }
  });

  it('the restore and cancel messages say which of the two failed', () => {
    expect(dictionaries.fr[materialsErrorKey('restore', 'unknown')]).toMatch(/détection/);
    expect(dictionaries.fr[materialsErrorKey('cancel', 'unknown')]).toMatch(
      /annuler la correction/,
    );
    expect(dictionaries.fr[materialsErrorKey('hide', 'unknown')]).toMatch(/masquer/);
  });
});

describe('actionMessage', () => {
  it('nothing on a success, a stale answer or input refused before sending', () => {
    expect(actionMessage('save', { ok: true, item: ITEM, stale: false })).toBeNull();
    expect(actionMessage('hide', { ok: true, item: null, stale: true })).toBeNull();
    expect(actionMessage('hide', { ok: false, error: 'unknown', stale: true })).toBeNull();
    expect(actionMessage('add', { ok: false, error: 'invalid', stale: false })).toBeNull();
  });

  it('a failure is told with the message of its action, and its kind kept', () => {
    expect(actionMessage('hide', { ok: false, error: 'unknown', stale: false })).toEqual({
      key: 'app.nodeMaterialsErrorHide',
      error: 'unknown',
    });
    expect(actionMessage('save', { ok: false, error: 'conflict', stale: false })).toEqual({
      key: 'app.nodeMaterialsErrorConflict',
      error: 'conflict',
    });
  });

  it('an action already running on the face: "try again in a moment"', () => {
    expect(actionMessage('add', { ok: false, error: 'busy', stale: false })).toEqual({
      key: 'app.nodeMaterialsErrorBusy',
      error: 'busy',
    });
  });

  it('a face already listed: points to its Modifier, naming the face', () => {
    const message = actionMessage('add', {
      ok: false,
      error: 'exists',
      stale: false,
      existing: ITEM,
    });
    expect(message).toEqual({
      key: 'app.nodeMaterialsErrorExists',
      error: 'exists',
      face: 'toiture',
    });
    expect(dictionaries.fr['app.nodeMaterialsErrorExists']).toMatch(/\{face\}.*« Modifier »/);
    expect(dictionaries.en['app.nodeMaterialsErrorExists']).toMatch(/\{face\}.*"Edit"/);
  });
});

describe('texts without an image (défaut 8)', () => {
  it('the empty context no longer says where the panel is', () => {
    expect(dictionaries.fr['app.contextEmpty']).not.toMatch(/droite/);
    expect(dictionaries.en['app.contextEmpty']).not.toMatch(/right/);
  });

  it('a project with no image is not asked to select one', () => {
    expect(dictionaries.fr['app.nodeMaterialsNoImageYet']).not.toMatch(/Sélectionnez/);
    expect(dictionaries.en['app.nodeMaterialsNoImageYet']).not.toMatch(/Select/);
  });
});

describe('attaching rows of the old sheet (3C.5.4)', () => {
  it('an unclassified failure keeps the selection, and says so — never "typed"', () => {
    const key = materialsErrorKey('attach', 'unknown');
    expect(key).toBe('app.legacyAttachErrorUnknown');
    expect(dictionaries.fr[key]).toMatch(/sélection est conservée/);
    expect(dictionaries.en[key]).toMatch(/selection is kept/);
  });

  it('every reason the server gives has its words in both languages', () => {
    for (const key of [
      'app.legacyAttachReasonNotFound',
      'app.legacyAttachReasonElsewhere',
      'app.legacyAttachReasonInvalidFace',
      'app.legacyAttachReasonInvalidValue',
      'app.legacyAttachReasonFaceCorrected',
      'app.legacyAttachReasonFaceMasked',
      'app.legacyAttachReasonDuplicate',
      'app.legacyAttachBlocked',
      'app.legacyAttachConflict',
    ] as const) {
      expect(dictionaries.fr[key], key).toBeTruthy();
      expect(dictionaries.en[key], key).toBeTruthy();
    }
  });

  it('nothing in the texts says a row of the old sheet applies to every image', () => {
    for (const lang of ['fr', 'en'] as const) {
      for (const [key, text] of Object.entries(dictionaries[lang])) {
        if (!key.startsWith('app.legacyAttach')) continue;
        expect(text, key).not.toMatch(/toutes les images|every image|all images/i);
      }
    }
  });
});
